# AeroReport Pro — Hoja de ruta

Estado y orden recomendado de implementación tras la ronda de seguridad y datos (junio 2026).

## Lo que ya quedó implementado en esta ronda

- **Almacenamiento cifrado (mejora 1).** Los datos salieron de `localStorage` a archivos cifrados en disco (`%APPDATA%\AeroReport Map\data\`), cifrados con DPAPI de Windows (Electron `safeStorage`). Sin límite de cuota, persistente y seguro en reposo. Migración automática de los datos existentes la primera vez.
- **Contraseñas con hash (mejora 2).** Ya no se guarda texto plano: PBKDF2-SHA256 (120k iteraciones) con sal por usuario. Login, cambio de contraseña y creación de usuarios usan `passHash`. Se eliminó la API key hardcodeada (rondas anteriores).
- **Respaldo y restauración (mejora 4).** Exporta/importa un archivo `.aerobak` cifrado con AES-256-GCM y contraseña propia, restaurable en cualquier equipo. En Configuración → Respaldo.
- **Informes en PDF (función 5).** Botón "PDF" en cada nota individual y "Descargar Informe de Turno (PDF)". Usa `printToPDF` de Electron (vectorial, alta calidad).
- **Lista de vigilancia / watchlist (función 6).** Gestión en Configuración → Vigilancia. El scanner muestra una alerta roja si el documento o nombre escaneado coincide.

## Hueco conocido a cerrar primero

**0. Terminar la migración cifrada — mapas guardados del Mapa de Personas.**
La función "guardar mapa" del Mapa de Personas todavía usa `localStorage` (`aeromap_saved_maps`) y esos mapas contienen datos personales (nombres, vínculos, roles de sospecha). Hay que migrarlos al store cifrado igual que el resto. Es corto y cierra el último punto de PII sin cifrar.
_Esfuerzo: bajo · Prioridad: alta (seguridad)._

## Orden recomendado para lo siguiente

### Fase 1 — Cerrar seguridad y operación base

**1. Registro de auditoría (mejora 3).**
Quién creó/editó/borró cada novedad, usuario o entrada de vigilancia, con fecha y placa. Imprescindible en un contexto policial/legal. El store cifrado ya facilita añadir un archivo `audit` append-only.
_Esfuerzo: medio · Prioridad: alta._

**2. Auto-actualización de la app (función 10).**
Integrar `electron-updater` para publicar y distribuir nuevas versiones sin reinstalar manualmente. Conviene hacerlo pronto porque a partir de aquí simplifica entregar todo lo demás.
_Esfuerzo: medio · Prioridad: alta._

**3. Estabilidad y rendimiento (mejora 11).**
Arreglar el warning de `NetworkMap.jsx` (el `)}` de la línea ~1397) y dividir los bundles grandes (`index` 733 KB, `charts` 545 KB) con carga diferida (`React.lazy`/`import()`).
_Esfuerzo: bajo-medio · Prioridad: media._

### Fase 2 — Valor operativo

**4. Vincular personas ↔ novedades ↔ mapa (función 7).**
Ficha por persona con todas las novedades en las que aparece, conectada con el grafo de vínculos. Es la función que más diferencia aporta para investigación.
_Esfuerzo: medio-alto · Prioridad: alta._

**5. Filtros y búsqueda avanzada (función 8).**
Filtrar novedades por rango de fechas, área, severidad, estado, aerolínea y persona. Hoy la búsqueda es solo por nombre.
_Esfuerzo: medio · Prioridad: media._

**6. Analítica del Dashboard (función 9).**
Tendencias en el tiempo, por hora del día y por terminal/área; mapa de calor. Para detectar patrones.
_Esfuerzo: medio · Prioridad: media._

### Fase 3 — Mantenibilidad y calidad

**7. Modularizar `App.jsx` (mejora 12).**
El archivo pasa de 2.000 líneas con todo mezclado. Separar en módulos (componentes, lógica de IA, persistencia) reduce el riesgo de romper cosas en cada cambio.
_Esfuerzo: alto · Prioridad: media._

**8. Validación y manejo de errores (mejora 13).**
Mensajes claros cuando falla el scanner (Claude/LM Studio/OCR), validación de formularios y estados de error consistentes.
_Esfuerzo: continuo · Prioridad: media._

**9. Pruebas automatizadas.**
Tests de la capa de persistencia/cifrado, hash de contraseñas y parseo de MRZ. Da red de seguridad para todo lo anterior.
_Esfuerzo: continuo · Prioridad: media._

## Notas técnicas para el build

- Todo lo de esta ronda usa solo módulos integrados de Node/Electron: **sin dependencias nativas**, por lo que el instalador NSIS no debería verse afectado.
- Recompilar siempre limpio si algo no se refleja: cerrar la app, borrar `dist` e `install`, `npm run build:win`.
- Tras instalar: Configuración → IA/API para la clave de Claude; Configuración → Respaldo para tu primera copia de seguridad.
