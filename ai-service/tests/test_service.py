"""Pruebas del servicio facial que NO requieren el modelo InsightFace.
Cubren: validación de imagen, similitud coseno, watchlist FAISS (CRUD + búsqueda)
y el endpoint /health. Las pruebas de extracción real (modelo) se hacen aparte."""
import os
import tempfile

# Aísla los datos del índice en una carpeta temporal ANTES de importar los módulos.
os.environ["AERO_FACE_DATA"] = tempfile.mkdtemp()

import numpy as np
import pytest
from fastapi.testclient import TestClient

import face_engine
from watchlist_index import WatchlistIndex
from main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "watchlist_count" in body


def test_cosine_similarity():
    assert face_engine.cosine_similarity([1, 0, 0], [1, 0, 0]) == 1.0
    assert abs(face_engine.cosine_similarity([1, 0], [0, 1])) < 1e-6
    assert face_engine.cosine_similarity([0, 0], [1, 1]) == 0.0


def test_decode_rejects_non_image():
    # base64 válido pero no es una imagen -> ValueError
    with pytest.raises(ValueError):
        face_engine.decode_image("aGVsbG8=")  # "hello"
    with pytest.raises(ValueError):
        face_engine.decode_image("")


def test_watchlist_crud_and_search():
    wl = WatchlistIndex()
    base = wl.count()
    v = np.random.rand(512).astype("float32").tolist()
    rec = wl.add(v, name="Juan", metadata={"doc": "X1"})
    assert wl.count() == base + 1

    # buscar con el mismo vector debe devolver el registro (similitud alta)
    res = wl.search(np.asarray(v, dtype="float32"), top_k=5, threshold=0.0)
    assert any(m["id"] == rec["id"] for m in res)
    assert res[0]["similarity"] > 0.99

    # actualizar
    upd = wl.update(rec["id"], name="Juan Perez")
    assert upd["name"] == "Juan Perez"

    # eliminar
    assert wl.remove(rec["id"]) is True
    assert wl.count() == base


def test_watchlist_dim_validation():
    wl = WatchlistIndex()
    with pytest.raises(ValueError):
        wl.add([0.0, 1.0, 2.0], name="malo")  # dimensión incorrecta


def test_watchlist_api_with_embedding():
    emb = np.random.rand(512).astype("float32").tolist()
    r = client.post("/watchlist", json={"name": "Ana", "embedding": emb, "metadata": {"doc": "Z9"}})
    assert r.status_code == 200
    rid = r.json()["item"]["id"]
    assert client.get("/watchlist").json()["count"] >= 1
    assert client.delete(f"/watchlist/{rid}").status_code == 200
