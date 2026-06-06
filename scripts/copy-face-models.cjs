// Copia los modelos de reconocimiento facial de @vladmandic/face-api a public/models,
// para que se incluyan en el build y la app funcione sin conexión.
// Uso: npm run setup:face   (después de npm install, antes de compilar)
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', '@vladmandic', 'face-api', 'model');
const dest = path.join(__dirname, '..', 'public', 'models');

// Solo los modelos que usamos (detección + landmarks + reconocimiento)
const NEEDED = [
  'ssd_mobilenetv1',
  'face_landmark_68',
  'face_recognition',
];

function copyMatching() {
  if (!fs.existsSync(src)) {
    console.error('No se encontró', src);
    console.error('Ejecuta primero: npm install');
    process.exit(1);
  }
  fs.mkdirSync(dest, { recursive: true });
  const files = fs.readdirSync(src);
  let copied = 0;
  for (const f of files) {
    if (NEEDED.some((n) => f.startsWith(n))) {
      fs.copyFileSync(path.join(src, f), path.join(dest, f));
      copied++;
    }
  }
  console.log(`Copiados ${copied} archivos de modelos a public/models`);
  if (copied === 0) {
    console.error('No se copió ningún modelo. Revisa el contenido de', src);
    process.exit(1);
  }
}

copyMatching();
