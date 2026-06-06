// Fachada biométrica: ÚNICO punto de entrada para el cotejo de rostros desde la UI.
// En Fase 1 solo existe el backend 'local' (face-api). La Fase 3 añadirá el backend
// 'insightface' (servicio Python) con detección automática y fallback a 'local'.
import { localBackend } from "./localBackend.js";
import { insightfaceBackend } from "./insightfaceBackend.js";

// Backend activo. Por defecto 'local' (face-api). Se conmuta a InsightFace si el
// servicio Python está vivo (detección por health-check), con fallback automático.
let _backend = localBackend;

export function getBackendInfo() {
  return { id: _backend.id, label: _backend.label };
}

// Detecta una sola vez si el sidecar InsightFace está disponible y, si lo está,
// lo activa. Si no, se mantiene face-api. Nunca lanza.
let _resolved = false;
let _resolving = null;
function ensureBackend() {
  if (_resolved) return Promise.resolve();
  if (_resolving) return _resolving;
  _resolving = (async () => {
    try {
      if (window.electronAPI && window.electronAPI.biometric && window.electronAPI.biometric.health) {
        const h = await window.electronAPI.biometric.health();
        if (h && h.ok) setBackend(insightfaceBackend);
      }
    } catch (e) { /* se queda en local */ }
    _resolved = true;
  })();
  return _resolving;
}

// Para la UI de estado (Fase 5): fuerza la detección y devuelve el backend activo.
export async function getStatus() {
  await ensureBackend();
  return getBackendInfo();
}

// Vuelve a detectar desde cero (p. ej. si el usuario arrancó el servicio después,
// o si se cayó). Resetea al local y re-comprueba el sidecar.
export async function refreshStatus() {
  _resolved = false;
  _resolving = null;
  _backend = localBackend;
  await ensureBackend();
  return getBackendInfo();
}

// (Reservado para Fase 3) — permite registrar/seleccionar otro backend.
export function setBackend(backend) {
  if (backend && typeof backend.extract === "function" && typeof backend.search === "function") {
    _backend = backend;
  }
}

// Orquesta el cotejo completo: extrae el rostro escaneado y lo compara contra los
// rostros conocidos. knownFaces: [{ name, docNumber, photo, source }].
// Devuelve { matches, checked, backend } o { error }.
export async function verifyFace(scannedPhoto, knownFaces, opts = {}) {
  if (!scannedPhoto) return { error: "No hay foto para verificar." };
  await ensureBackend();

  // Camino FAISS (InsightFace): sincroniza el índice del servidor y hace UNA búsqueda.
  if (typeof _backend.searchByImage === "function") {
    try {
      if (typeof _backend.syncWatchlist === "function") await _backend.syncWatchlist(knownFaces);
      const matches = await _backend.searchByImage(scannedPhoto);
      if (matches === null) return { error: "No se detectó un rostro en la foto escaneada." };
      return { matches, checked: (knownFaces || []).length, backend: _backend.id };
    } catch (e) {
      return { error: "Error en el cotejo facial: " + e.message };
    }
  }

  // Camino local (face-api): extrae el rostro y compara contra los conocidos.
  let scanned;
  try {
    scanned = await _backend.extract(scannedPhoto);
  } catch (e) {
    return { error: 'No se pudo iniciar el motor facial: ' + e.message + '. ¿Copiaste los modelos con "npm run setup:face"?' };
  }
  if (!scanned) return { error: "No se detectó un rostro en la foto escaneada." };

  const candidates = [];
  for (const kf of (knownFaces || [])) {
    if (!kf || !kf.photo) continue;
    try {
      const d = await _backend.extract(kf.photo);
      if (d) candidates.push({ ...kf, descriptor: d });
    } catch (e) { /* rostro no detectable en ese registro: se omite */ }
  }

  const matches = await _backend.search(scanned, candidates, opts.threshold);
  return { matches, checked: candidates.length, backend: _backend.id };
}
