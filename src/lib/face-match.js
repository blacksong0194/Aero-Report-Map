// Comparación de descriptores faciales (lógica pura, sin dependencias).
// Un descriptor es un vector de 128 números (Float32Array o array). Dos rostros
// son la misma persona si la distancia euclídea entre sus descriptores es baja.

export const FACE_MATCH_THRESHOLD = 0.5; // < 0.5 = muy probable misma persona

export function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

// candidates: [{ ...ref, descriptor }]. Devuelve los que están bajo el umbral,
// ordenados por cercanía, con la distancia añadida.
export function bestFaceMatches(descriptor, candidates, threshold = FACE_MATCH_THRESHOLD) {
  if (!descriptor) return [];
  return (candidates || [])
    .filter((c) => c && c.descriptor)
    .map((c) => ({ ...c, distance: euclideanDistance(descriptor, c.descriptor) }))
    .filter((c) => c.distance <= threshold)
    .sort((a, b) => a.distance - b.distance);
}

// Nivel de confianza legible a partir de la distancia.
export function matchConfidence(distance) {
  if (distance <= 0.35) return "muy alta";
  if (distance <= 0.45) return "alta";
  if (distance <= 0.5) return "media";
  return "baja";
}
