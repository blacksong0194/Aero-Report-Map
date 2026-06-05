// ─────────────────────────────────────────────────────────────────────────────
// Store cifrado en disco (proceso principal de Electron)
//  - Datos en reposo: cifrados con safeStorage (DPAPI en Windows), atados al usuario.
//  - Respaldos: cifrados con AES-256-GCM derivando clave de una contraseña (portables).
//  - Sin dependencias nativas: solo módulos integrados de Node/Electron.
// ─────────────────────────────────────────────────────────────────────────────
const { app, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const DATA_DIR = path.join(app.getPath('userData'), 'data')

// Claves de datos permitidas (evita escribir archivos arbitrarios desde el renderer)
const KEYS = ['incidents', 'users', 'persons', 'counter', 'watchlist', 'savedMaps', 'audit', 'aiconfig']

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }) } catch (e) {}
}

function fileFor(key) {
  return path.join(DATA_DIR, `${key}.dat`)
}

function canEncrypt() {
  try { return safeStorage.isEncryptionAvailable() } catch (e) { return false }
}

// ── Lectura / escritura de una clave ─────────────────────────────────────────
function readKey(key) {
  if (!KEYS.includes(key)) throw new Error('Clave no permitida: ' + key)
  const file = fileFor(key)
  if (!fs.existsSync(file)) return null
  const buf = fs.readFileSync(file)
  // Formato: primer byte 0x01 = cifrado safeStorage, 0x00 = JSON plano (fallback)
  const flag = buf[0]
  const payload = buf.subarray(1)
  let json
  if (flag === 1) {
    json = safeStorage.decryptString(payload)
  } else {
    json = payload.toString('utf8')
  }
  return JSON.parse(json)
}

function writeKey(key, value) {
  if (!KEYS.includes(key)) throw new Error('Clave no permitida: ' + key)
  ensureDir()
  const json = JSON.stringify(value)
  let out
  if (canEncrypt()) {
    const enc = safeStorage.encryptString(json)
    out = Buffer.concat([Buffer.from([1]), enc])
  } else {
    out = Buffer.concat([Buffer.from([0]), Buffer.from(json, 'utf8')])
  }
  // Escritura atómica: escribe a tmp y renombra
  const file = fileFor(key)
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, out)
  fs.renameSync(tmp, file)
  return true
}

function loadAll() {
  const out = {}
  for (const k of KEYS) {
    try { out[k] = readKey(k) } catch (e) { out[k] = null }
  }
  return out
}

// ── Respaldo / restauración con contraseña (AES-256-GCM) ─────────────────────
function encryptBackup(obj, passphrase) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 })
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8')
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = {
    format: 'aeroreport-backup-v1',
    createdAt: new Date().toISOString(),
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  }
  return JSON.stringify(payload, null, 2)
}

function decryptBackup(fileContent, passphrase) {
  const payload = JSON.parse(fileContent)
  if (!payload.format || !payload.format.startsWith('aeroreport-backup')) {
    throw new Error('El archivo no es un respaldo válido de AeroReport.')
  }
  const salt = Buffer.from(payload.salt, 'base64')
  const iv = Buffer.from(payload.iv, 'base64')
  const tag = Buffer.from(payload.tag, 'base64')
  const enc = Buffer.from(payload.data, 'base64')
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 })
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  let dec
  try {
    dec = Buffer.concat([decipher.update(enc), decipher.final()])
  } catch (e) {
    throw new Error('Contraseña incorrecta o respaldo dañado.')
  }
  return JSON.parse(dec.toString('utf8'))
}

// Crea el objeto de respaldo a partir del estado actual del store
function buildBackupObject() {
  const all = loadAll()
  return { ...all }
}

// Restaura cada clave del objeto de respaldo al store
function restoreFromObject(obj) {
  for (const k of KEYS) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) {
      writeKey(k, obj[k])
    }
  }
  return true
}

module.exports = {
  KEYS,
  DATA_DIR,
  readKey,
  writeKey,
  loadAll,
  encryptBackup,
  decryptBackup,
  buildBackupObject,
  restoreFromObject,
  canEncrypt,
}
