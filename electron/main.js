const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron')
const path = require('path')
const https = require('https')
const http = require('http')
const fs = require('fs')
const store = require('./store')
const { autoUpdater } = require('electron-updater')

const isDev = process.env.ELECTRON === 'true'

// El log NO puede ir junto al código: empaquetado vive dentro de app.asar (solo lectura).
// Se escribe en la carpeta de datos del usuario; si algo falla, se usa la carpeta temporal.
// Todo va protegido para que el arranque del log nunca pueda tumbar la app.
let logPath = null
try {
  const logDir = app.getPath('userData')
  fs.mkdirSync(logDir, { recursive: true })
  logPath = path.join(logDir, 'app.log')
  fs.writeFileSync(logPath, `[${new Date().toISOString()}] Starting app...\n`)
} catch (e) {
  try {
    logPath = path.join(require('os').tmpdir(), 'aeroreport-app.log')
    fs.writeFileSync(logPath, `[${new Date().toISOString()}] Starting app (fallback tmp)...\n`)
  } catch (e2) { logPath = null }
}
function safeLog(msg) {
  if (!logPath) return
  try { fs.appendFileSync(logPath, msg) } catch (e) {}
}

process.on('uncaughtException', (err) => {
  safeLog(`[${new Date().toISOString()}] UNCAUGHT: ${err.message}\n${err.stack}\n`)
  app.exit(1)
})

// La API key YA NO se guarda en el código (se filtraba dentro del .exe).
// Orden de búsqueda:
//   1. payload.apiKey  -> enviada desde la app (panel de Settings)
//   2. process.env.ANTHROPIC_API_KEY
//   3. config.json (campo "anthropicApiKey") en la carpeta de datos del usuario
function getAnthropicKey(payloadKey) {
  if (payloadKey && payloadKey.trim()) return payloadKey.trim()
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim()
  try {
    const cfgPath = path.join(app.getPath('userData'), 'config.json')
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
      if (cfg.anthropicApiKey) return String(cfg.anthropicApiKey).trim()
    }
  } catch (e) {
    safeLog(`[${new Date().toISOString()}] Error leyendo config.json: ${e.message}\n`)
  }
  return null
}

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1024,
    minHeight: 680,
    title: 'AeroReport Pro',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#080c18',
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      devTools: true
    }
  })

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    safeLog(`[${new Date().toISOString()}] [${level}] ${message}\n`)
  })
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    safeLog(`[${new Date().toISOString()}] RENDER GONE: ${details.reason}\n`)
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    const htmlPath = path.join(__dirname, '../dist/index.html')
    safeLog(`Loading: ${htmlPath}\n`)
    mainWindow.loadFile(htmlPath)
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.on('closed', () => { mainWindow = null })
  buildMenu()
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nueva Novedad', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('navigate', 'incidents') },
        { label: 'Scanner de Documentos', accelerator: 'CmdOrCtrl+D', click: () => mainWindow?.webContents.send('navigate', 'scanner') },
        { label: 'Mapa de Personas', accelerator: 'CmdOrCtrl+M', click: () => mainWindow?.webContents.send('navigate', 'networkMap') },
        { label: 'Generar Informe', accelerator: 'CmdOrCtrl+P', click: () => mainWindow?.webContents.send('navigate', 'reports') },
        { type: 'separator' },
        { label: 'Salir', accelerator: isMac ? 'Cmd+Q' : 'Alt+F4', click: () => app.quit() }
      ]
    },
    {
      label: 'Vista',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: () => mainWindow?.webContents.send('navigate', 'dashboard') },
        { label: 'Novedades', accelerator: 'CmdOrCtrl+2', click: () => mainWindow?.webContents.send('navigate', 'incidents') },
        { label: 'Mapa de Personas', accelerator: 'CmdOrCtrl+3', click: () => mainWindow?.webContents.send('navigate', 'networkMap') },
        { label: 'Scanner', accelerator: 'CmdOrCtrl+4', click: () => mainWindow?.webContents.send('navigate', 'scanner') },
        { label: 'Informes', accelerator: 'CmdOrCtrl+5', click: () => mainWindow?.webContents.send('navigate', 'reports') },
        { type: 'separator' },
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { label: 'Pantalla Completa', accelerator: 'F11', click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
        { label: 'Herramientas Dev', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [{
        label: 'Acerca de AeroReport Pro',
        click: () => dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'AeroReport Pro',
          message: 'AeroReport Pro v1.0.0',
          detail: 'Sistema de Novedades Aeroportuarias\nAeropuerto Internacional de Punta Cana (PUJ)\n\n© 2025 AeroReport Pro',
          buttons: ['OK']
        })
      }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle('anthropic-request', async (_, { model, max_tokens, messages, apiKey }) => {
  safeLog(`[${new Date().toISOString()}] Anthropic request: model=${model}\n`)
  const ANTHROPIC_KEY = getAnthropicKey(apiKey)
  if (!ANTHROPIC_KEY) {
    safeLog(`[${new Date().toISOString()}] ERROR: falta API key de Anthropic\n`)
    return {
      ok: false,
      status: 401,
      data: { error: { message: 'No hay API key de Anthropic configurada. Defínela en Ajustes, en la variable de entorno ANTHROPIC_API_KEY, o en config.json.' } }
    }
  }
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, max_tokens, messages })
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      }
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        safeLog(`[${new Date().toISOString()}] Anthropic response: status=${res.statusCode}, data=${data.substring(0,500)}\n`)
        try {
          const parsed = JSON.parse(data)
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: parsed })
        } catch (e) {
          reject(new Error('Error parseando respuesta: ' + e.message))
        }
      })
    })
    req.on('error', (e) => reject(new Error('Error de red: ' + e.message)))
    req.write(body)
    req.end()
  })
})

ipcMain.handle('lm-studio-request', async (_, { model, messages, max_tokens }) => {
  safeLog(`[${new Date().toISOString()}] LM Studio REQUEST received\n`)
  safeLog(`[${new Date().toISOString()}] LM Studio model param: ${model}\n`)
  safeLog(`[${new Date().toISOString()}] LM Studio messages raw: ${JSON.stringify(messages).substring(0,800)}\n`)
  
  if (!messages || !messages[0]?.content) {
    safeLog(`[${new Date().toISOString()}] ERROR: No messages content\n`)
    throw new Error('No messages provided');
  }
  
  const firstContent = messages[0].content;
  safeLog(`[${new Date().toISOString()}] LM Studio first content type: ${Array.isArray(firstContent) ? 'array' : typeof firstContent}\n`)
  
  if (Array.isArray(firstContent)) {
    safeLog(`[${new Date().toISOString()}] LM Studio content array length: ${firstContent.length}\n`)
    firstContent.forEach((c, i) => {
      safeLog(`[${new Date().toISOString()}] LM Studio content[${i}]: type=${c.type}, keys=${Object.keys(c).join(',')}\n`)
    })
  }
  
  // Build messages in proper format for Qwen2.5-VL
  const lmMessages = messages.map(msg => {
    if (Array.isArray(msg.content)) {
      const parts = [];
      for (const c of msg.content) {
        if (c.type === 'image' && c.source?.type === 'base64') {
          // Anthropic format -> Qwen format
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${c.source.media_type};base64,${c.source.data}` }
          });
        } else if (c.type === 'image_url') {
          parts.push(c);
        } else if (c.type === 'text') {
          parts.push({ type: 'text', text: c.text });
        }
      }
      return { role: msg.role, content: parts };
    }
    return msg;
  });
  
  safeLog(`[${new Date().toISOString()}] LM Studio transformed: ${JSON.stringify(lmMessages).substring(0,800)}\n`)
  
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, messages: lmMessages, max_tokens, temperature: 0.1 })
    const options = {
      hostname: '127.0.0.1',
      port: 1234,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        safeLog(`[${new Date().toISOString()}] LM Studio response: status=${res.statusCode}, data=${data.substring(0,300)}\n`)
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) {
            reject(new Error('LM Studio error: ' + parsed.error.message));
          } else {
            resolve({ content: parsed.choices[0].message.content });
          }
        } catch (e) {
          reject(new Error('Error parseando respuesta LM Studio: ' + e.message + ' | data: ' + data.substring(0,200)))
        }
      })
    })
    req.on('error', (e) => reject(new Error('Error de red LM Studio: ' + e.message)))
    req.write(body)
    req.end()
  })
})
ipcMain.handle('show-open-dialog', async (_, opts) => dialog.showOpenDialog(mainWindow, opts))
ipcMain.handle('get-version', () => app.getVersion())
ipcMain.handle('get-platform', () => process.platform)

// ── Exportar HTML a PDF (printToPDF, alta calidad vectorial) ─────────────────
ipcMain.handle('export-pdf', async (_, { html, defaultName }) => {
  let pdfWin = null
  let tmpFile = null
  try {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar PDF',
      defaultPath: defaultName || 'informe.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }

    const tmpDir = path.join(app.getPath('userData'), 'tmp')
    fs.mkdirSync(tmpDir, { recursive: true })
    tmpFile = path.join(tmpDir, `report-${Date.now()}.html`)
    fs.writeFileSync(tmpFile, html, 'utf8')

    pdfWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    await pdfWin.loadFile(tmpFile)
    const data = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'default' }
    })
    fs.writeFileSync(res.filePath, data)
    return { ok: true, path: res.filePath }
  } catch (e) {
    safeLog(`[${new Date().toISOString()}] export-pdf error: ${e.message}\n`)
    return { ok: false, error: e.message }
  } finally {
    try { if (pdfWin) pdfWin.destroy() } catch (e) {}
    try { if (tmpFile) fs.unlinkSync(tmpFile) } catch (e) {}
  }
})

// ── Store cifrado en disco ───────────────────────────────────────────────────
ipcMain.handle('store-load-all', () => {
  try { return { ok: true, data: store.loadAll() } }
  catch (e) { safeLog(`[${new Date().toISOString()}] store-load-all error: ${e.message}\n`); return { ok: false, error: e.message } }
})
ipcMain.handle('store-save', (_, { key, value }) => {
  try { store.writeKey(key, value); return { ok: true } }
  catch (e) { safeLog(`[${new Date().toISOString()}] store-save(${key}) error: ${e.message}\n`); return { ok: false, error: e.message } }
})

// Exporta un respaldo cifrado con contraseña (abre diálogo de guardar)
ipcMain.handle('store-backup', async (_, { passphrase }) => {
  try {
    if (!passphrase || passphrase.length < 6) return { ok: false, error: 'La contraseña del respaldo debe tener al menos 6 caracteres.' }
    const def = `aeroreport-backup-${new Date().toISOString().slice(0,10)}.aerobak`
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar respaldo cifrado',
      defaultPath: def,
      filters: [{ name: 'Respaldo AeroReport', extensions: ['aerobak'] }]
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    const obj = store.buildBackupObject()
    const content = store.encryptBackup(obj, passphrase)
    fs.writeFileSync(res.filePath, content, 'utf8')
    return { ok: true, path: res.filePath }
  } catch (e) {
    safeLog(`[${new Date().toISOString()}] store-backup error: ${e.message}\n`)
    return { ok: false, error: e.message }
  }
})

// Restaura desde un respaldo cifrado (abre diálogo de abrir)
ipcMain.handle('store-restore', async (_, { passphrase }) => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar respaldo a restaurar',
      properties: ['openFile'],
      filters: [{ name: 'Respaldo AeroReport', extensions: ['aerobak', 'json'] }]
    })
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return { ok: false, canceled: true }
    const content = fs.readFileSync(res.filePaths[0], 'utf8')
    const obj = store.decryptBackup(content, passphrase)
    store.restoreFromObject(obj)
    return { ok: true, data: store.loadAll() }
  } catch (e) {
    safeLog(`[${new Date().toISOString()}] store-restore error: ${e.message}\n`)
    return { ok: false, error: e.message }
  }
})

// ── Auto-actualización (GitHub Releases) ─────────────────────────────────────
function setupAutoUpdate() {
  if (isDev) return // no buscar updates en desarrollo
  autoUpdater.autoDownload = true
  autoUpdater.on('error', (e) => safeLog(`[${new Date().toISOString()}] updater error: ${e == null ? 'desconocido' : (e.message || e)}\n`))
  autoUpdater.on('update-available', (info) => safeLog(`[${new Date().toISOString()}] update-available: ${info && info.version}\n`))
  autoUpdater.on('update-not-available', () => safeLog(`[${new Date().toISOString()}] update-not-available\n`))
  autoUpdater.on('update-downloaded', (info) => {
    safeLog(`[${new Date().toISOString()}] update-downloaded: ${info && info.version}\n`)
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Reiniciar ahora', 'Más tarde'],
      defaultId: 0,
      title: 'Actualización disponible',
      message: `Nueva versión ${info && info.version ? info.version : ''} de AeroReport Map`,
      detail: 'La actualización se descargó. Se instalará al reiniciar la aplicación.'
    }).then(r => { if (r.response === 0) autoUpdater.quitAndInstall() }).catch(() => {})
  })
  try { autoUpdater.checkForUpdates() } catch (e) { safeLog(`[${new Date().toISOString()}] checkForUpdates error: ${e.message}\n`) }
}

app.whenReady().then(() => {
  createWindow()
  setupAutoUpdate()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})