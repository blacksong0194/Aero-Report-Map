# Subir el proyecto a GitHub y publicar actualizaciones

Repositorio: `https://github.com/blacksong0194/Aero-Report-Map`

La app ya trae auto-actualización (`electron-updater`) apuntando a ese repo. Esta guía tiene dos partes: **(A)** subir el código una vez, y **(B)** publicar versiones para que la app se actualice sola.

---

## Requisitos previos

- **Git** instalado: https://git-scm.com/download/win (trae el gestor de credenciales que te pedirá iniciar sesión en GitHub la primera vez).
- Antes de compilar, instala la nueva dependencia:

  ```
  npm install
  ```

---

## ⚠️ Importante: repositorio público o privado

Para que la auto-actualización funcione en los equipos donde instales la app, **lo más simple es que el repositorio sea PÚBLICO**. Los archivos de actualización de una release en repo privado quedan detrás de autenticación y los equipos de los usuarios no podrían descargarlos sin un token incrustado (inseguro).

El código ya **no contiene claves ni secretos** (la API key se quita y se configura aparte), así que hacerlo público es seguro en ese sentido. Si necesitas mantener el código privado, dímelo y montamos las actualizaciones en un servidor propio en vez de GitHub.

---

## Parte A — Subir el código (una sola vez)

Abre una terminal en la carpeta del proyecto y ejecuta:

```
cd C:\Users\black\respaldo\aero-report-map
git init
git add .
git commit -m "AeroReport Pro - primer commit"
git branch -M main
git remote add origin https://github.com/blacksong0194/Aero-Report-Map.git
git push -u origin main
```

En el `git push`, se abrirá el navegador para que inicies sesión en GitHub (gestor de credenciales). Acepta y la subida continúa.

> El `.gitignore` ya excluye `node_modules`, `dist`, `install` y los logs, así que solo sube el código fuente.

---

## Parte B — Publicar una versión para auto-actualización

### 1. Crear un token de GitHub (una sola vez)

GitHub → tu foto (arriba derecha) → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**.

- Marca el permiso (scope) **`repo`**.
- Genera y **copia el token** (empieza con `ghp_...`). Guárdalo, no se vuelve a mostrar.

### 2. Compilar y publicar

En la terminal del proyecto, define el token y ejecuta la release:

**PowerShell:**
```
$env:GH_TOKEN="ghp_TU_TOKEN_AQUI"
npm run release
```

**CMD (símbolo del sistema):**
```
set GH_TOKEN=ghp_TU_TOKEN_AQUI
npm run release
```

Esto compila el instalador y lo sube a una **release en GitHub** (queda como borrador).

### 3. Publicar la release

Ve a `https://github.com/blacksong0194/Aero-Report-Map/releases`, abre el borrador que se creó (con el número de versión) y pulsa **Publish release**.

Listo: los equipos que ya tengan la app instalada detectarán la nueva versión al abrir, la descargarán y te ofrecerán reiniciar para instalarla.

---

## Cómo sacar futuras actualizaciones

Cada vez que quieras publicar una mejora:

1. Sube los cambios de código:
   ```
   git add .
   git commit -m "Descripción del cambio"
   git push
   ```
2. **Sube el número de versión** en `package.json` (campo `"version"`). Ej.: de `1.0.0` a `1.0.1`. Esto es obligatorio: la app compara versiones para saber si hay actualización.
3. Ejecuta `npm run release` (con `GH_TOKEN` definido) y publica la release en GitHub.

La app instalada en cada equipo se actualizará sola en el siguiente arranque.

---

## Notas

- La auto-actualización solo corre en la app instalada (no en modo desarrollo).
- Sin firma de código, Windows SmartScreen puede mostrar un aviso la primera vez; es normal en apps sin certificado.
- El primer instalable que repartas debe salir de `npm run release` (o `npm run build:win`) para que incluya el `latest.yml` que el updater necesita.
