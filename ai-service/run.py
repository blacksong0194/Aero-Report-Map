"""Lanzador del servicio facial. Uso: python run.py  (o el .exe empaquetado)."""
import uvicorn
from config import settings
from main import app

if __name__ == "__main__":
    uvicorn.run(app, host=settings.HOST, port=settings.PORT, log_level="info")
