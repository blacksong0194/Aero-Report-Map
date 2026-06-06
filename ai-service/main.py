"""Servicio facial AeroReport — FastAPI + InsightFace + FAISS.
Solo loopback. Errores seguros (sin trazas al cliente). Carga de modelo perezosa.

Arranque:  cd ai-service && uvicorn main:app --host 127.0.0.1 --port 8765
"""
import logging

from fastapi import FastAPI, HTTPException, Header, Depends

from config import settings
from schemas import (
    ImageRequest, CompareRequest, SearchRequest,
    WatchlistAddRequest, WatchlistUpdateRequest,
)
import face_engine
from watchlist_index import WatchlistIndex

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
log = logging.getLogger("aero-face")

app = FastAPI(title="AeroReport Face Service", version="1.0.0")
wl = WatchlistIndex()


def auth(x_auth_token: str = Header(default="")):
    """Si hay token configurado, exígelo (salvo /health)."""
    if settings.AUTH_TOKEN and x_auth_token != settings.AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="No autorizado")


def _safe(fn, *args, **kwargs):
    """Ejecuta y traduce errores a respuestas seguras (sin filtrar trazas)."""
    try:
        return fn(*args, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        log.exception("Error interno")
        raise HTTPException(status_code=500, detail="Error procesando la solicitud")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": settings.MODEL_NAME,
        "model_loaded": face_engine.is_loaded(),
        "watchlist_count": wl.count(),
        "threshold": settings.MATCH_SIM_THRESHOLD,
    }


@app.post("/extract-face")
def extract_face(req: ImageRequest, _=Depends(auth)):
    faces = _safe(face_engine.extract_faces, req.image)
    return {"count": len(faces), "faces": faces}


@app.post("/compare-faces")
def compare_faces(req: CompareRequest, _=Depends(auth)):
    def run():
        e1 = face_engine.primary_embedding(req.image1)
        e2 = face_engine.primary_embedding(req.image2)
        if e1 is None or e2 is None:
            raise ValueError("No se detectó rostro en una de las imágenes")
        sim = face_engine.cosine_similarity(e1, e2)
        return {"similarity": sim, "match": sim >= settings.MATCH_SIM_THRESHOLD,
                "threshold": settings.MATCH_SIM_THRESHOLD}
    return _safe(run)


@app.post("/search-watchlist")
def search_watchlist(req: SearchRequest, _=Depends(auth)):
    def run():
        emb = face_engine.primary_embedding(req.image)
        if emb is None:
            raise ValueError("No se detectó rostro en la imagen")
        matches = wl.search(emb, top_k=req.top_k)
        return {"count": len(matches), "matches": matches}
    return _safe(run)


@app.get("/watchlist")
def watchlist_list(_=Depends(auth)):
    return {"count": wl.count(), "items": wl.list()}


@app.post("/watchlist")
def watchlist_add(req: WatchlistAddRequest, _=Depends(auth)):
    def run():
        emb = req.embedding
        if emb is None:
            if not req.image:
                raise ValueError("Se requiere 'image' o 'embedding'")
            emb = face_engine.primary_embedding(req.image)
            if emb is None:
                raise ValueError("No se detectó rostro en la imagen")
        rec = wl.add(emb, name=req.name or "", metadata=req.metadata, rec_id=req.id)
        return {"ok": True, "item": rec}
    return _safe(run)


@app.put("/watchlist/{rec_id}")
def watchlist_update(rec_id: str, req: WatchlistUpdateRequest, _=Depends(auth)):
    def run():
        emb = req.embedding
        if emb is None and req.image:
            emb = face_engine.primary_embedding(req.image)
        rec = wl.update(rec_id, name=req.name, metadata=req.metadata, embedding=emb)
        if rec is None:
            raise HTTPException(status_code=404, detail="No encontrado")
        return {"ok": True, "item": rec}
    return _safe(run)


@app.delete("/watchlist/{rec_id}")
def watchlist_remove(rec_id: str, _=Depends(auth)):
    ok = wl.remove(rec_id)
    if not ok:
        raise HTTPException(status_code=404, detail="No encontrado")
    return {"ok": True}
