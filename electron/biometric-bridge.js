// Puente entre el main de Electron y el servicio facial Python (InsightFace).
// Habla con el sidecar SOLO por loopback (127.0.0.1). El renderer NUNCA ve este
// módulo ni HTTP: accede a través de los canales IPC `biometric:*`.
// Nunca rechaza: ante error/timeout devuelve { ok:false } para permitir el fallback.
const http = require('http')

// Configuración mutable: Electron la fija (puerto/token) tras lanzar el sidecar.
const cfg = {
  host: process.env.AERO_FACE_HOST || '127.0.0.1',
  port: parseInt(process.env.AERO_FACE_PORT || '8765', 10),
  token: process.env.AERO_FACE_TOKEN || '',
}
function configure(opts) {
  if (!opts) return
  if (opts.host) cfg.host = opts.host
  if (opts.port) cfg.port = parseInt(opts.port, 10)
  if (typeof opts.token === 'string') cfg.token = opts.token
}

function request(method, pathName, body, timeoutMs) {
  return new Promise((resolve) => {
    let data = null
    const headers = {}
    if (body != null) {
      data = JSON.stringify(body)
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(data)
    }
    if (cfg.token) headers['X-Auth-Token'] = cfg.token

    const req = http.request(
      { host: cfg.host, port: cfg.port, path: pathName, method, headers, timeout: timeoutMs || 15000 },
      (res) => {
        let chunks = ''
        res.on('data', (c) => { chunks += c })
        res.on('end', () => {
          let json = {}
          try { json = chunks ? JSON.parse(chunks) : {} } catch (e) { return resolve({ ok: false, status: res.statusCode, data: { error: 'respuesta no válida' } }) }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json })
        })
      }
    )
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', (e) => resolve({ ok: false, status: 0, data: { error: e.message } }))
    if (data) req.write(data)
    req.end()
  })
}

// Timeout amplio en las operaciones faciales: la 1ª llamada puede cargar/descargar
// el modelo buffalo_l (~300 MB). health es rápido para la detección.
const OP_TIMEOUT = 60000

module.exports = {
  configure,
  health: () => request('GET', '/health', null, 1500),
  extract: (image) => request('POST', '/extract-face', { image }, OP_TIMEOUT),
  compare: (image1, image2) => request('POST', '/compare-faces', { image1, image2 }, OP_TIMEOUT),
  search: (image, topK) => request('POST', '/search-watchlist', { image, top_k: topK || 5 }, OP_TIMEOUT),
  // Índice FAISS (watchlist) del servicio
  watchlistList: () => request('GET', '/watchlist', null, 5000),
  watchlistAdd: (payload) => request('POST', '/watchlist', payload || {}, OP_TIMEOUT),
  watchlistRemove: (id) => request('DELETE', '/watchlist/' + encodeURIComponent(id), null, 5000),
}

