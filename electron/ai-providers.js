// ─────────────────────────────────────────────────────────────────────────────
// Adaptadores multi-proveedor de IA con visión.
// Entrada: mensajes en formato Anthropic (imagen como { type:'image', source:{ type:'base64', media_type, data } }).
// Salida normalizada: { ok, status, data: { content: [{ type:'text', text }] } }
// Proveedores: anthropic | openai | openrouter | compatible | ollama | gemini
// ─────────────────────────────────────────────────────────────────────────────
const https = require('https')
const http = require('http')
const { URL } = require('url')

// POST genérico de JSON. Devuelve { status, text }.
function postJSON(urlStr, headers, bodyStr) {
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(urlStr) } catch (e) { return reject(new Error('URL inválida: ' + urlStr)) }
    const lib = u.protocol === 'http:' ? http : https
    const options = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
    }
    const req = lib.request(options, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => resolve({ status: res.statusCode, text: data }))
    })
    req.on('error', (e) => reject(new Error('Error de red: ' + e.message)))
    req.write(bodyStr)
    req.end()
  })
}

// Anthropic -> OpenAI (content con image_url y text)
function toOpenAIMessages(messages) {
  return messages.map((m) => {
    if (Array.isArray(m.content)) {
      const parts = []
      for (const c of m.content) {
        if (c.type === 'image' && c.source && c.source.type === 'base64') {
          parts.push({ type: 'image_url', image_url: { url: `data:${c.source.media_type};base64,${c.source.data}` } })
        } else if (c.type === 'image_url') {
          parts.push(c)
        } else if (c.type === 'text') {
          parts.push({ type: 'text', text: c.text })
        }
      }
      return { role: m.role, content: parts }
    }
    return { role: m.role, content: m.content }
  })
}

// Anthropic -> Gemini (contents con parts: text / inlineData)
function toGeminiContents(messages) {
  return messages.map((m) => {
    const parts = []
    const content = Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }]
    for (const c of content) {
      if (c.type === 'image' && c.source && c.source.type === 'base64') {
        parts.push({ inlineData: { mimeType: c.source.media_type, data: c.source.data } })
      } else if (c.type === 'image_url' && c.image_url && c.image_url.url) {
        const mt = (c.image_url.url.match(/^data:([^;]+);base64,/) || [])[1] || 'image/jpeg'
        const b64 = c.image_url.url.split(',')[1] || ''
        parts.push({ inlineData: { mimeType: mt, data: b64 } })
      } else if (c.type === 'text') {
        parts.push({ text: c.text })
      }
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts }
  })
}

// Base URL por defecto de cada proveedor compatible con OpenAI
function openAIBase(cfg) {
  if (cfg.baseUrl && cfg.baseUrl.trim()) return cfg.baseUrl.trim().replace(/\/+$/, '')
  switch (cfg.provider) {
    case 'openai': return 'https://api.openai.com/v1'
    case 'openrouter': return 'https://openrouter.ai/api/v1'
    case 'ollama': return 'http://localhost:11434/v1'
    default: return 'https://api.openai.com/v1'
  }
}

async function callAI(cfg, { messages, max_tokens }) {
  const provider = cfg.provider || 'anthropic'
  const maxTok = max_tokens || 1200

  // ── Anthropic ──────────────────────────────────────────────────────────────
  if (provider === 'anthropic') {
    if (!cfg.apiKey) return { ok: false, status: 401, data: { error: { message: 'Falta la API key de Anthropic.' } } }
    const body = JSON.stringify({ model: cfg.model || 'claude-sonnet-4-6', max_tokens: maxTok, messages })
    const r = await postJSON('https://api.anthropic.com/v1/messages', {
      'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01',
    }, body)
    const parsed = JSON.parse(r.text)
    if (r.status < 200 || r.status >= 300) return { ok: false, status: r.status, data: parsed }
    return { ok: true, status: r.status, data: { content: parsed.content } }
  }

  // ── Google Gemini ────────────────────────────────────────────────────────
  if (provider === 'gemini') {
    if (!cfg.apiKey) return { ok: false, status: 401, data: { error: { message: 'Falta la API key de Gemini.' } } }
    const model = cfg.model || 'gemini-1.5-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`
    const body = JSON.stringify({ contents: toGeminiContents(messages), generationConfig: { maxOutputTokens: maxTok } })
    const r = await postJSON(url, {}, body)
    const parsed = JSON.parse(r.text)
    if (r.status < 200 || r.status >= 300) return { ok: false, status: r.status, data: parsed }
    const text = ((parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts) || [])
      .map((p) => p.text || '').join('')
    return { ok: true, status: r.status, data: { content: [{ type: 'text', text }] } }
  }

  // ── OpenAI / OpenRouter / compatible / Ollama (formato OpenAI) ─────────────
  const base = openAIBase(cfg)
  const headers = {}
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`
  if (provider === 'openrouter') headers['HTTP-Referer'] = 'https://aeroreport.local'
  const model = cfg.model || (provider === 'ollama' ? 'llama3.2-vision' : 'gpt-4o')
  const body = JSON.stringify({ model, messages: toOpenAIMessages(messages), max_tokens: maxTok, temperature: 0.1 })
  const r = await postJSON(`${base}/chat/completions`, headers, body)
  let parsed
  try { parsed = JSON.parse(r.text) } catch (e) { return { ok: false, status: r.status, data: { error: { message: 'Respuesta no válida: ' + r.text.substring(0, 200) } } } }
  if (r.status < 200 || r.status >= 300) return { ok: false, status: r.status, data: parsed }
  const text = (parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) || ''
  return { ok: true, status: r.status, data: { content: [{ type: 'text', text }] } }
}

module.exports = { callAI }
