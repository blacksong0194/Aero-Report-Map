# Cómo compilar el instalador de AeroReport Map (Windows)

Guía para generar el instalador `.exe` (NSIS Setup) de la aplicación.

## Qué se cambió y por qué

Antes el proyecto **no producía un instalador** por dos motivos:

1. **El target estaba en `portable`**, no en `nsis`. Un build `portable` genera un único `.exe` suelto (sin asistente de instalación), no un instalador. El bloque `nsis` estaba configurado pero no se usaba.
2. **La compilación se quedaba a medias**: se generaba la carpeta `win-unpacked` (la app desempaquetada) pero nunca el `.exe` final. Eso ocurre cuando electron-builder falla en el paso de empaquetado, casi siempre por el error de *symlink* al extraer `winCodeSign` en Windows.

Cambios aplicados:

- `package.json`: `win.target` ahora es **`nsis`** (instalador con asistente, accesos directos y desinstalador).
- Se añadió **icono propio** (`build/icon.ico`) y se referencia en `win.icon`.
- Carpeta de salida unificada en **`install/`** (`directories.output`).
- Se excluye `electron/app.log` del paquete.
- **API key removida del código**: ya no se guarda en `electron/main.js` (se filtraba dentro del `.exe`). Ahora se lee, en este orden:
  1. clave enviada desde la app (panel de Ajustes),
  2. variable de entorno `ANTHROPIC_API_KEY`,
  3. archivo `config.json` con el campo `anthropicApiKey` en la carpeta de datos del usuario.

## ⚠️ Importante: revoca la clave antigua

La API key que estaba en el código quedó expuesta. **Revócala** en https://console.anthropic.com/ (Settings → API Keys) y genera una nueva. Cualquiera que tuviera el `.exe` anterior podía extraerla.

## Pasos para compilar

### 1. Activar Modo Desarrollador en Windows (clave para evitar el fallo)

Configuración → Privacidad y seguridad → **Para programadores** → activar **Modo de desarrollador**.

Esto permite crear *symlinks* sin privilegios de administrador, que es lo que hace fallar la extracción de `winCodeSign`. Alternativa: abrir la terminal **como Administrador**.

### 2. (Opcional) Limpiar caché si hubo intentos fallidos

Borra esta carpeta para forzar una descarga limpia de las herramientas de build:

```
%LOCALAPPDATA%\electron-builder\Cache
```

Asegúrate también de tener conexión a internet la primera vez (descarga NSIS y winCodeSign desde GitHub).

### 3. Instalar dependencias (si aún no están)

```bash
npm install
```

### 4. Compilar el instalador

```bash
npm run build:win
```

Esto ejecuta `vite build` y luego `electron-builder --win --x64`.

### 5. Resultado

El instalador queda en:

```
install\AeroReport Map Setup 1.0.0.exe
```

Ese es el archivo que distribuyes a los usuarios.

## Configurar la API key tras instalar

Como la clave ya no viaja dentro del `.exe`, el usuario final debe configurarla por una de estas vías:

- **Variable de entorno**: crear `ANTHROPIC_API_KEY` con la clave.
- **Archivo de configuración**: crear `config.json` en
  `%APPDATA%\AeroReport Map\config.json` con el contenido:

  ```json
  { "anthropicApiKey": "sk-ant-..." }
  ```

- **Desde la app**: si el panel de Ajustes envía la clave en el payload (`apiKey`), funciona automáticamente.

Sin clave, las funciones de Claude muestran un aviso claro; el OCR local (Tesseract) y LM Studio siguen funcionando.

## Si el build aún falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Cannot create symbolic link ... El cliente no dispone de un privilegio requerido` | Falta Modo Desarrollador | Actívalo o ejecuta como Administrador |
| `cannot resolve ... winCodeSign / nsis` o timeout | Sin internet / proxy / antivirus | Conéctate a internet, desactiva el antivirus temporalmente, limpia la caché |
| Solo aparece `win-unpacked`, sin `.exe` | El paso final falló | Revisa el mensaje completo de la consola (las dos causas anteriores) |
| Aviso de icono | — | Ya resuelto con `build/icon.ico` |

## Verificación recomendada

1. Instala el `Setup.exe` en una máquina limpia (o VM).
2. Abre la app y confirma que carga el dashboard.
3. Configura la API key y prueba el escaneo con Claude.
4. Verifica el acceso directo en escritorio y menú inicio, y que el desinstalador aparezca en "Agregar o quitar programas".
