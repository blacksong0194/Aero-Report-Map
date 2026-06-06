"""Índice de watchlist con FAISS (similitud coseno sobre embeddings normalizados).

Esquema de registro: { id, name, metadata, embedding, createdAt, updatedAt }.
El índice plano (IndexFlatIP) se reconstruye en cada mutación: es O(N) pero trivial
para miles de registros, y da add/remove/update limpios y correctos."""
import os
import json
import threading
import uuid
import datetime

import numpy as np

from config import settings

DIM = 512


def _now():
    return datetime.datetime.utcnow().isoformat() + "Z"


class WatchlistIndex:
    def __init__(self):
        self._lock = threading.Lock()
        self._faiss = None
        self._index = None
        self._vectors = np.zeros((0, DIM), dtype="float32")
        self._ids = []          # fila -> id (paralelo a _vectors)
        self._meta = {}         # id -> { id, name, metadata, createdAt, updatedAt }
        os.makedirs(settings.DATA_DIR, exist_ok=True)
        self._vec_path = os.path.join(settings.DATA_DIR, "watchlist_vectors.npy")
        self._meta_path = os.path.join(settings.DATA_DIR, "watchlist_meta.json")
        if settings.PERSIST:
            self._load()
        else:
            self._rebuild_index()  # solo en RAM

    def _faiss_mod(self):
        if self._faiss is None:
            import faiss
            self._faiss = faiss
        return self._faiss

    def _rebuild_index(self):
        faiss = self._faiss_mod()
        idx = faiss.IndexFlatIP(DIM)  # producto interno sobre vectores normalizados = coseno
        if len(self._ids) > 0:
            idx.add(self._normalized(self._vectors))
        self._index = idx

    @staticmethod
    def _normalized(mat):
        mat = np.ascontiguousarray(mat, dtype="float32")
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return mat / norms

    def _load(self):
        if os.path.exists(self._vec_path) and os.path.exists(self._meta_path):
            try:
                self._vectors = np.load(self._vec_path).astype("float32")
                data = json.load(open(self._meta_path, "r", encoding="utf-8"))
                self._ids = data.get("ids", [])
                self._meta = data.get("meta", {})
            except Exception:
                self._vectors = np.zeros((0, DIM), dtype="float32")
                self._ids = []
                self._meta = {}
        self._rebuild_index()

    def _persist(self):
        if not settings.PERSIST:
            return  # modo RAM: no escribir embeddings en disco
        np.save(self._vec_path, self._vectors)
        with open(self._meta_path, "w", encoding="utf-8") as f:
            json.dump({"ids": self._ids, "meta": self._meta}, f, ensure_ascii=False)

    def count(self):
        return len(self._ids)

    def list(self):
        return [self._meta[i] for i in self._ids if i in self._meta]

    def add(self, embedding, name="", metadata=None, rec_id=None):
        emb = np.asarray(embedding, dtype="float32").reshape(-1)
        if emb.shape[0] != DIM:
            raise ValueError("El embedding debe tener %d dimensiones" % DIM)
        with self._lock:
            rec_id = rec_id or str(uuid.uuid4())
            now = _now()
            if rec_id in self._meta:  # actualización in situ del vector
                row = self._ids.index(rec_id)
                self._vectors[row] = emb
                self._meta[rec_id].update({"name": name, "metadata": metadata or {}, "updatedAt": now})
            else:
                self._vectors = np.vstack([self._vectors, emb[None, :]]) if self._vectors.size else emb[None, :]
                self._ids.append(rec_id)
                self._meta[rec_id] = {"id": rec_id, "name": name, "metadata": metadata or {}, "createdAt": now, "updatedAt": now}
            self._rebuild_index()
            self._persist()
            return self._meta[rec_id]

    def update(self, rec_id, name=None, metadata=None, embedding=None):
        with self._lock:
            if rec_id not in self._meta:
                return None
            rec = self._meta[rec_id]
            if name is not None:
                rec["name"] = name
            if metadata is not None:
                rec["metadata"] = metadata
            if embedding is not None:
                emb = np.asarray(embedding, dtype="float32").reshape(-1)
                if emb.shape[0] != DIM:
                    raise ValueError("El embedding debe tener %d dimensiones" % DIM)
                self._vectors[self._ids.index(rec_id)] = emb
                self._rebuild_index()
            rec["updatedAt"] = _now()
            self._persist()
            return rec

    def remove(self, rec_id):
        with self._lock:
            if rec_id not in self._meta:
                return False
            row = self._ids.index(rec_id)
            self._vectors = np.delete(self._vectors, row, axis=0)
            self._ids.pop(row)
            self._meta.pop(rec_id, None)
            self._rebuild_index()
            self._persist()
            return True

    def search(self, embedding, top_k=5, threshold=None):
        if threshold is None:
            threshold = settings.MATCH_SIM_THRESHOLD
        if self.count() == 0:
            return []
        q = self._normalized(np.asarray(embedding, dtype="float32").reshape(1, -1))
        k = min(top_k, self.count())
        sims, idxs = self._index.search(q, k)
        out = []
        for sim, row in zip(sims[0].tolist(), idxs[0].tolist()):
            if row < 0 or row >= len(self._ids):
                continue
            if sim < threshold:
                continue
            rid = self._ids[row]
            rec = dict(self._meta.get(rid, {"id": rid}))
            rec["similarity"] = float(sim)
            out.append(rec)
        return out
