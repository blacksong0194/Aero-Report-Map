"""Motor facial: InsightFace (buffalo_l). Carga perezosa para no bloquear el arranque.
Extrae embeddings normalizados (512-d) para comparación por similitud coseno."""
import base64
import io
import logging
import os
import sys

import numpy as np

from config import settings

log = logging.getLogger("aero-face.engine")

_app = None


def is_loaded() -> bool:
    return _app is not None


def _model_root():
    """Cuando está empaquetado con PyInstaller, usa los modelos incluidos (offline).
    InsightFace busca en <root>/models/<nombre>/. Devuelve None para usar ~/.insightface."""
    if getattr(sys, "frozen", False):
        base = os.path.join(getattr(sys, "_MEIPASS", os.path.dirname(sys.executable)), "insightface_models")
        if os.path.isdir(os.path.join(base, "models", settings.MODEL_NAME)):
            return base
    return None


def get_app():
    """Inicializa InsightFace una sola vez (CPU)."""
    global _app
    if _app is None:
        from insightface.app import FaceAnalysis
        log.info("Cargando modelo InsightFace '%s' (CPU)...", settings.MODEL_NAME)
        kwargs = {"name": settings.MODEL_NAME, "providers": ["CPUExecutionProvider"]}
        root = _model_root()
        if root:
            kwargs["root"] = root
            log.info("Usando modelos empaquetados en %s", root)
        a = FaceAnalysis(**kwargs)
        a.prepare(ctx_id=-1, det_size=(640, 640))
        _app = a
        log.info("Modelo cargado.")
    return _app


def decode_image(data: str) -> "np.ndarray":
    """Valida y decodifica una imagen base64/dataURL a un array BGR (para InsightFace)."""
    if not isinstance(data, str) or not data.strip():
        raise ValueError("Imagen vacía")
    if data.strip().startswith("data:") and "," in data:
        data = data.split(",", 1)[1]
    try:
        raw = base64.b64decode(data, validate=False)
    except Exception:
        raise ValueError("base64 inválido")
    if len(raw) == 0:
        raise ValueError("Imagen vacía")
    if len(raw) > settings.MAX_IMAGE_BYTES:
        raise ValueError("Imagen demasiado grande")

    from PIL import Image
    try:
        img = Image.open(io.BytesIO(raw))
        img.verify()  # comprueba que es una imagen válida
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise ValueError("Formato de imagen no válido")
    if max(img.size) > settings.MAX_DIMENSION:
        raise ValueError("Dimensiones excesivas")

    arr = np.asarray(img)  # RGB
    return arr[:, :, ::-1].copy()  # -> BGR


def extract_faces(data: str):
    """Devuelve la lista de rostros detectados con bbox, score y embedding (512-d normalizado).
    Ordenados por tamaño (rostro principal primero)."""
    img = decode_image(data)
    faces = get_app().get(img)
    out = []
    for f in faces:
        emb = np.asarray(f.normed_embedding, dtype="float32")
        bbox = [float(x) for x in np.asarray(f.bbox).tolist()]
        out.append({
            "bbox": bbox,
            "det_score": float(f.det_score),
            "embedding": emb.tolist(),
        })
    out.sort(key=lambda x: (x["bbox"][2] - x["bbox"][0]) * (x["bbox"][3] - x["bbox"][1]), reverse=True)
    return out


def primary_embedding(data: str):
    """Embedding del rostro principal (el más grande), o None si no hay rostro."""
    faces = extract_faces(data)
    if not faces:
        return None
    return np.asarray(faces[0]["embedding"], dtype="float32")


def cosine_similarity(a, b) -> float:
    a = np.asarray(a, dtype="float32")
    b = np.asarray(b, dtype="float32")
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))
