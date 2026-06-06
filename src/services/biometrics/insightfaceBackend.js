// Backend biométrico INSIGHTFACE (= faceApiClient): habla con el sidecar Python
// SOLO a través de los canales IPC `window.electronAPI.biometric.*`. Nunca toca HTTP.
// Implementa la interfaz de localBackend (extract / search) Y ADEMÁS el camino FAISS
// del servidor (syncWatchlist + searchByImage) para no extraer cada rostro en cada cotejo.
import { normalizeDoc } from "../../lib/person-match.js";

const SIM_THRESHOLD = 0.40; // similitud coseno mínima para considerar coincidencia

// id estable por persona, para que la sincronización sea idempotente
function faceId(kf) {
  return "auto:" + (normalizeDoc(kf.docNumber) || (kf.name || "").toLowerCase().replace(/\s+/g, "_") || "x");
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function confidence(sim) {
  if (sim >= 0.6) return "muy alta";
  if (sim >= 0.5) return "alta";
  if (sim >= 0.4) return "media";
  return "baja";
}

export const insightfaceBackend = {
  id: "insightface",
  label: "InsightFace (servicio)",

  async extract(dataUrl) {
    if (!window.electronAPI || !window.electronAPI.biometric) return null;
    const r = await window.electronAPI.biometric.extract(dataUrl);
    if (!r || !r.ok || !r.data || !Array.isArray(r.data.faces) || r.data.faces.length === 0) return null;
    return r.data.faces[0].embedding; // 512-d (rostro principal)
  },

  // candidates: [{ ...ref, descriptor }]. Coseno en el renderer (ya tenemos los embeddings).
  // Devuelve la misma forma que localBackend: { ...ref, distance, confidence }.
  async search(descriptor, candidates, _threshold) {
    return (candidates || [])
      .filter((c) => c && c.descriptor)
      .map((c) => {
        const sim = cosine(descriptor, c.descriptor);
        return { ...c, similarity: sim, distance: 1 - sim, confidence: confidence(sim) };
      })
      .filter((c) => c.similarity >= SIM_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity);
  },

  // ── Camino FAISS del servidor (eficiente: una sola búsqueda) ────────────────
  // Sincroniza los rostros conocidos al índice del servicio (idempotente por id).
  // Solo añade los que faltan; los ya presentes no se re-extraen.
  async syncWatchlist(knownFaces) {
    const api = window.electronAPI && window.electronAPI.biometric;
    if (!api || !api.watchlistList) return;
    let existing = new Set();
    try {
      const r = await api.watchlistList();
      if (r && r.ok && r.data && Array.isArray(r.data.items)) existing = new Set(r.data.items.map((i) => i.id));
    } catch (e) { /* sigue */ }
    for (const kf of (knownFaces || [])) {
      if (!kf || !kf.photo) continue;
      const id = faceId(kf);
      if (existing.has(id)) continue;
      try {
        await api.watchlistAdd({ id, name: kf.name || "", image: kf.photo, metadata: { docNumber: kf.docNumber || "", source: kf.source || "informe" } });
        existing.add(id);
      } catch (e) { /* rostro no detectable en ese registro: se omite */ }
    }
  },

  // Busca el rostro de la imagen contra el índice FAISS. Devuelve matches con la
  // forma de la fachada, o null si no se detectó rostro / servicio no disponible.
  async searchByImage(photo, topK) {
    const api = window.electronAPI && window.electronAPI.biometric;
    if (!api || !api.search) return null;
    const r = await api.search(photo, topK || 10);
    if (!r || !r.ok) return null;
    const list = (r.data && r.data.matches) || [];
    return list.map((m) => {
      const sim = typeof m.similarity === "number" ? m.similarity : 0;
      const meta = m.metadata || {};
      return {
        name: m.name || "",
        docNumber: meta.docNumber || "",
        source: meta.source || "informe",
        similarity: sim,
        distance: 1 - sim,
        confidence: confidence(sim),
      };
    });
  },
};
