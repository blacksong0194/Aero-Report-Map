// Servicio de reconocimiento facial. Carga perezosa de @vladmandic/face-api y de
// sus modelos (desde ./models, copiados con `npm run setup:face`), para no inflar
// el bundle principal y solo cargarlos cuando el usuario verifica un rostro.

let _faceapi = null;
let _loaded = false;
let _loading = null;

async function ensureLoaded() {
  if (_loaded) return _faceapi;
  if (_loading) return _loading;
  _loading = (async () => {
    const faceapi = await import("@vladmandic/face-api");
    const url = "./models";
    await faceapi.nets.ssdMobilenetv1.loadFromUri(url);
    await faceapi.nets.faceLandmark68Net.loadFromUri(url);
    await faceapi.nets.faceRecognitionNet.loadFromUri(url);
    _faceapi = faceapi;
    _loaded = true;
    return faceapi;
  })();
  return _loading;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = dataUrl;
  });
}

// Descriptor facial (array de 128 números) de la imagen (dataURL), o null si no hay rostro.
export async function getFaceDescriptor(dataUrl) {
  if (!dataUrl) return null;
  const faceapi = await ensureLoaded();
  const img = await loadImage(dataUrl);
  const det = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
  return det && det.descriptor ? Array.from(det.descriptor) : null;
}

// Precarga de modelos (para mostrar estado). Lanza si los modelos no están disponibles.
export async function preloadFaceModels() {
  await ensureLoaded();
  return true;
}
