# AeroReport — Servicio facial (InsightFace)

Microservicio **independiente** de reconocimiento facial profesional para AeroReport.
Está **desacoplado** de Electron: se ejecuta y se prueba por separado. La integración
con la app (IPC) es una fase posterior; por ahora esto NO toca el build ni Electron.

```
Documento → (foto) → /extract-face → embedding 512-d → FAISS → /search-watchlist → alertas
```

## Requisitos

- **Python 3.11** (importante). insightface/faiss/onnxruntime tienen wheels maduros en 3.11;
  en 3.13 fallan o compilan. Descarga: https://www.python.org/downloads/release/python-3119/
- ~2 GB de espacio (modelo `buffalo_l` + dependencias).
- Windows: `insightface` se **compila desde el código fuente**. Si falla, instala las
  **Microsoft C++ Build Tools** (gratis): https://visualstudio.microsoft.com/visual-cpp-build-tools/
  (onnxruntime, faiss y opencv vienen como wheels, no compilan.)

## Instalación

```bash
cd ai-service
# Crea el entorno CON Python 3.11 (usa el lanzador 'py' en Windows):
py -3.11 -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
# (Linux/Mac: python3.11 -m venv .venv && source .venv/bin/activate)
```

La primera ejecución descarga el modelo `buffalo_l` (~300 MB) a `~/.insightface`.
(En la fase de empaquetado lo dejaremos offline; por ahora requiere internet una vez.)

## Ejecutar

```bash
python run.py
# o:  uvicorn main:app --host 127.0.0.1 --port 8765
```

Solo escucha en `127.0.0.1`. Para exigir token, define `AERO_FACE_TOKEN`.

## Variables de entorno

| Variable | Defecto | Descripción |
|---|---|---|
| `AERO_FACE_HOST` | `127.0.0.1` | Host (mantener loopback) |
| `AERO_FACE_PORT` | `8765` | Puerto |
| `AERO_FACE_TOKEN` | (vacío) | Si se define, exige cabecera `X-Auth-Token` |
| `AERO_FACE_MODEL` | `buffalo_l` | Modelo InsightFace |
| `AERO_FACE_THRESHOLD` | `0.40` | Umbral de coincidencia (similitud coseno) |
| `AERO_FACE_MAX_BYTES` | `8388608` | Tamaño máx. de imagen (8 MB) |
| `AERO_FACE_DATA` | `./data` | Carpeta del índice FAISS |

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado, modelo, nº de watchlist |
| POST | `/extract-face` | `{image}` → rostros con bbox + embedding (multi-rostro) |
| POST | `/compare-faces` | `{image1,image2}` → similitud coseno + match |
| POST | `/search-watchlist` | `{image, top_k}` → coincidencias en el índice |
| GET | `/watchlist` | Lista registros |
| POST | `/watchlist` | Alta `{name, image|embedding, metadata}` |
| PUT | `/watchlist/{id}` | Actualiza |
| DELETE | `/watchlist/{id}` | Elimina |

Las imágenes van en **base64** (o dataURL), igual que las guarda la app.

## Probar rápido

```bash
curl http://127.0.0.1:8765/health
```

## Tests

```bash
cd ai-service
pip install -r requirements.txt
pytest -q
```

Las pruebas cubren validación de imagen, similitud coseno y el índice FAISS (CRUD +
búsqueda) sin requerir el modelo. La extracción real se valida ejecutando el servicio
y enviando una foto a `/extract-face`.

## Empaquetar a .exe (offline, para distribuir con la app)

Genera un binario autónomo del servicio **con el modelo incluido** (sin descarga en el
primer uso). Hazlo dentro del mismo entorno virtual donde ya funciona el servicio.

```bash
# 1) Asegúrate de haber ejecutado el servicio al menos una vez (descarga buffalo_l).
# 2) Instala PyInstaller:
pip install -r requirements-build.txt
# 3) Empaqueta:
pyinstaller aero-face-service.spec
```

Resultado: `dist/aero-face-service/aero-face-service.exe` (una carpeta con el exe + sus
dependencias y el modelo). Pruébalo:

```bash
dist\aero-face-service\aero-face-service.exe
```

Debe arrancar el servicio en `127.0.0.1:8765` **sin necesidad de Python instalado** y
**sin descargar nada** (el modelo va dentro). Luego: `curl http://127.0.0.1:8765/health`.

> PyInstaller con onnxruntime/faiss/insightface a veces requiere ajustes. Si el exe falla
> al arrancar, ejecútalo desde una terminal para ver el error y compártelo.

## Seguridad

- Solo loopback (`127.0.0.1`).
- Token opcional por cabecera.
- Límites de tamaño/dimensión de imagen; validación de formato.
- Errores sin trazas hacia el cliente.
- No persiste imágenes; solo embeddings + metadatos.
