# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec del servicio facial AeroReport.
# Build en carpeta (--onedir): más fiable con onnxruntime/faiss/insightface que --onefile.
# Uso:  pyinstaller aero-face-service.spec
# Salida:  dist/aero-face-service/aero-face-service.exe
import os
from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = ['main', 'config', 'schemas', 'face_engine', 'watchlist_index']

# Paquetes con datos / DLLs / imports dinámicos que PyInstaller no detecta solo.
for pkg in [
    'insightface', 'onnxruntime', 'faiss', 'cv2', 'skimage', 'scipy', 'sklearn',
    'uvicorn', 'fastapi', 'starlette', 'pydantic', 'pydantic_core', 'anyio',
    'h11', 'httptools', 'websockets', 'multipart', 'onnx', 'PIL',
]:
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception as e:
        print('collect_all fallo para', pkg, e)

# Archivos de datos internos de insightface (meanshape_68.pkl, etc.). insightface los
# busca en <raíz>/objects/ cuando está congelado, así que los copiamos ahí (y a su ruta
# de paquete por si acaso). Sin esto: 'NoneType has no attribute shape' al procesar rostros.
try:
    import insightface as _if
    _objects = os.path.join(os.path.dirname(_if.__file__), 'data', 'objects')
    if os.path.isdir(_objects):
        for _f in os.listdir(_objects):
            _fp = os.path.join(_objects, _f)
            if os.path.isfile(_fp):
                datas.append((_fp, 'objects'))
                datas.append((_fp, os.path.join('insightface', 'data', 'objects')))
        print('Datos de insightface (objects/) incluidos desde', _objects)
    else:
        print('AVISO: no se encontró', _objects)
except Exception as e:
    print('No se pudieron incluir los objects de insightface:', e)

# Modelo buffalo_l offline. Debe existir en ~/.insightface tras ejecutar el servicio una vez.
_model_dir = os.path.join(os.path.expanduser('~'), '.insightface', 'models', 'buffalo_l')
if os.path.isdir(_model_dir):
    for f in os.listdir(_model_dir):
        fp = os.path.join(_model_dir, f)
        if os.path.isfile(fp):
            datas.append((fp, os.path.join('insightface_models', 'models', 'buffalo_l')))
    print('Modelo buffalo_l incluido desde', _model_dir)
else:
    print('AVISO: no se encontró', _model_dir)
    print('Ejecuta el servicio una vez (python run.py) para descargar buffalo_l antes de empaquetar.')

block_cipher = None

a = Analysis(
    ['run.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='aero-face-service',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='aero-face-service',
)
