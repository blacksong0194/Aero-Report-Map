"""Hace importables los módulos del servicio (face_engine, main, etc.) desde tests/."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
