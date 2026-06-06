// Backend biométrico LOCAL: envuelve el motor facial actual (face-api.js vía
// face-service.js) y la lógica pura de matching (face-match.js). NO reescribe nada,
// solo lo expone con la interfaz común que usa biometricService.
import { getFaceDescriptor } from "../../face-service.js";
import { bestFaceMatches, matchConfidence } from "../../lib/face-match.js";

export const localBackend = {
  id: "local",
  label: "face-api (local)",

  // Devuelve el descriptor facial (array de 128) de una imagen dataURL, o null.
  async extract(dataUrl) {
    return getFaceDescriptor(dataUrl);
  },

  // candidates: [{ ...ref, descriptor }]. Devuelve coincidencias bajo umbral,
  // ordenadas, con distancia y nivel de confianza.
  async search(descriptor, candidates, threshold) {
    return bestFaceMatches(descriptor, candidates, threshold).map((m) => ({
      ...m,
      confidence: matchConfidence(m.distance),
    }));
  },
};
