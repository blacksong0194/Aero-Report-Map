# AeroReport Map

Sistema avanzado de novedades aeroportuarias, análisis de personas, OCR documental y mapas de relaciones para entornos operativos y de investigación.

## Características

* Gestión de novedades aeroportuarias
* Dashboard operativo
* OCR de documentos (Tesseract + PaddleOCR)
* Escaneo MRZ
* Generación de informes PDF
* Mapa de relaciones entre personas
* Watchlist / lista de vigilancia
* Persistencia cifrada de datos
* Hash seguro de contraseñas
* Backup y restauración cifrada
* Aplicación de escritorio multiplataforma con Electron
* Sistema preparado para auto-actualizaciones

---

## Stack Tecnológico

### Frontend

* React 18
* Vite
* Recharts
* Lucide React

### Desktop

* Electron
* Electron Builder
* Electron Updater

### OCR / IA

* Tesseract.js
* PaddleOCR

### Exportación

* jsPDF
* html2canvas

### Testing

* Vitest

---

# Instalación

## Requisitos

* Node.js 18+
* npm
* Windows 10/11 recomendado

---

## Clonar repositorio

```bash
git clone https://github.com/blacksong0194/Aero-Report-Map.git
cd Aero-Report-Map
```

---

## Instalar dependencias

```bash
npm install
```

---

# Ejecutar en desarrollo

## Modo web

```bash
npm run dev
```

## Modo escritorio Electron

```bash
npm run dev:desktop
```

---

# Compilar

## Build web

```bash
npm run build
```

## Instalador Windows

```bash
npm run build:win
```

El instalador se genera en:

```bash
install/
```

---

# Publicar Releases

Crear un token de GitHub con scope `repo`.

Definir:

```bash
GH_TOKEN=tu_token
```

Luego ejecutar:

```bash
npm run release
```

---

# Seguridad

El sistema implementa:

* Cifrado de datos usando Electron safeStorage (DPAPI)
* Hash PBKDF2-SHA256 para contraseñas
* Backups cifrados AES-256-GCM
* Eliminación de API keys hardcodeadas
* Persistencia segura fuera de localStorage

---

# Arquitectura

```text
src/
 ├── components/
 ├── lib/
 ├── App.jsx
 └── main.jsx

electron/
 ├── main.js
 ├── preload.js
 ├── ai-providers.js
 └── store.js
```

---

# Testing

Ejecutar pruebas:

```bash
npm test
```

---

# Roadmap

* Registro de auditoría
* Auto-actualizaciones
* Optimización de bundles
* Búsqueda avanzada
* Analítica operativa
* Modularización de App.jsx
* Más pruebas automatizadas

---

# Variables de entorno

Ejemplo:

```env
ANTHROPIC_API_KEY=tu_api_key
```

---

# Licencia

MIT License

---

# Autor

AeroReport Pro

---

# Capturas

## Dashboard

*Agrega aquí screenshots*

## Mapa de relaciones

*Agrega aquí screenshots*

## OCR y vigilancia

*Agrega aquí screenshots*

---

# Estado del Proyecto

En desarrollo activo.
