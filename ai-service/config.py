"""Configuración del servicio facial (variables de entorno con valores seguros por defecto)."""
import os


def _int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _float(name, default):
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


class Settings:
    # Solo loopback por defecto: nunca expuesto a la red.
    HOST = os.environ.get("AERO_FACE_HOST", "127.0.0.1")
    PORT = _int("AERO_FACE_PORT", 8765)

    # Si está definido, todas las rutas (salvo /health) exigen la cabecera X-Auth-Token.
    AUTH_TOKEN = os.environ.get("AERO_FACE_TOKEN", "")

    MODEL_NAME = os.environ.get("AERO_FACE_MODEL", "buffalo_l")

    # Límites de imagen (anti-DoS / entradas maliciosas)
    MAX_IMAGE_BYTES = _int("AERO_FACE_MAX_BYTES", 8 * 1024 * 1024)  # 8 MB
    MAX_DIMENSION = _int("AERO_FACE_MAX_DIM", 4000)  # px por lado

    # Umbral de coincidencia por similitud coseno (buffalo_l). >= => misma persona.
    MATCH_SIM_THRESHOLD = _float("AERO_FACE_THRESHOLD", 0.40)

    DATA_DIR = os.environ.get(
        "AERO_FACE_DATA", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    )

    # Persistir el índice FAISS en disco. Electron lo pone a "0" → solo en RAM
    # (embeddings nunca en texto plano en disco; se re-sincronizan al conectar).
    PERSIST = os.environ.get("AERO_FACE_PERSIST", "1") == "1"


settings = Settings()
