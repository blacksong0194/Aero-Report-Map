"""Modelos de entrada/salida (pydantic)."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ImageRequest(BaseModel):
    image: str = Field(..., description="Imagen en base64 o dataURL")


class CompareRequest(BaseModel):
    image1: str
    image2: str


class SearchRequest(BaseModel):
    image: str
    top_k: int = Field(5, ge=1, le=50)


class WatchlistAddRequest(BaseModel):
    name: str
    image: Optional[str] = None
    embedding: Optional[List[float]] = None
    metadata: Optional[Dict[str, Any]] = None
    id: Optional[str] = None


class WatchlistUpdateRequest(BaseModel):
    name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    image: Optional[str] = None
    embedding: Optional[List[float]] = None
