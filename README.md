# Panel de gestión de dedicación no lectiva 📅

Aplicación web desarrollada con **Google Apps Script** diseñada para centros educativos. Permite al profesorado gestionar sus franjas horarias no lectivas (guardias, tutorías, gestión) de forma integrada con el horario lectivo importado, garantizando trazabilidad y cumplimiento de objetivos horarios.

## 🎯 Objetivo del proyecto
Optimizar la planificación del horario no lectivo del profesorado, proporcionando una interfaz intuitiva que evite conflictos horarios, facilite la supervisión por parte de jefatura de estudios y asegure que se cumplen las sesiones de dedicación ajustadas a cada docente.

## 🛠️ Detalles técnicos
*   **Backend**: Google Apps Script (GAS) vinculado a Google Sheets.
*   **Despliegue**: Webapp restringida a los usuarios del dominio del centro (`access: DOMAIN`).
*   **Validación**: el servidor comprueba tipo, día, franja y grupo; `LockService` evita escrituras concurrentes.
*   **Unidad de medida**: todas las metas y contadores se expresan en **sesiones semanales**. Cada franja cuenta como 1 sesión, aunque su duración real sea de 55 minutos. El tiempo solo se usa para colocar las sesiones en la rejilla y detectar solapamientos, no para contabilizar.
*   **Frontend**: HTML5, JavaScript (ES6+), **Tailwind CSS** para el diseño responsivo y **Phosphor Icons**.
*   **Base de datos**: Google Sheets (5 pestañas principales):
    *   `Resumen HS`: Perfiles docentes, códigos y metas en sesiones semanales.
    *   `Horario no lectivo`: Repositorio de todas las sesiones registradas.
    *   `Clases (importado)`: Horario lectivo oficial del centro.
    *   `Ajustes`: Configuración de tipos de actividad y grupos.
    *   `Auditoría`: Registro histórico de todas las operaciones (logs).

## ✨ Funcionalidades principales

### 1. Planificador semanal interactivo
*   Visualización clara de celdas lectivas (azul) y no lectivas (púrpura/naranja/verde).
*   Gestión de sesiones mediante clics: añadir, editar y eliminar con actualizaciones optimistas en la UI.
*   Indicadores de estado (PENDIENTE/COMPLETO) y cálculo de metas en tiempo real.

### 2. Gestión de roles y permisos
*   **Docente**: Acceso a su propio horario y estadísticas personales, además de la vista global del claustro.
*   **Administrador**: Capacidad para ver y modificar el horario de cualquier docente, acceso a herramientas de supervisión y configuración.
*   **Lector**: Acceso en solo lectura a la vista global.

> La vista global es visible para **todo el profesorado autorizado**: su objetivo es que el claustro sepa quién tiene guardias, tutorías o está en horario de gestión. Por ello, las observaciones de cada sesión también son visibles para el resto de docentes en los tooltips.

### 3. Supervisión de incidencias (solo administración) 🔍
*   Panel avanzado que escanea en tiempo real a toda la plantilla para detectar horarios incompletos.
*   Muestra de forma compacta las 5 tarjetas de estadísticas de cada docente con validación pendiente.
*   Acceso directo desde el informe al horario del docente para agilizar las correcciones.

### 4. Solapamientos excepcionales (solo administración) ⚠️
*   Permite a los administradores registrar sesiones no lectivas sobre franjas lectivas en periodos especiales (FCT, prácticas en empresa).
*   Visualización mediante **pastillas divididas** que muestran ambas actividades simultáneamente.
*   Confirmación de seguridad mediante modal dinámico antes de realizar la acción.

### 5. Vista global (dashboard)
*   Rejilla comparativa de todo el centro para el control de coberturas.
*   Filtros avanzados por docente, búsqueda por nombre y tipo de actividad (guardias, tutorías, gestión).
*   Tooltips informativos con notas adicionales de cada sesión.

### 6. Trazabilidad total
*   Muestra la **fecha, hora y autor de la última modificación** en cada ficha horaria.
*   Sistema de auditoría automático que registra cada cambio en el backend.

## 💻 Desarrollo y despliegue

El proyecto se gestiona con [clasp](https://github.com/google/clasp).

### Preparar un equipo nuevo
1. Instalar Node.js 20.19+ (o 22.13+/24+).
2. Clonar el repositorio e instalar las dependencias: `npm ci` (o `npm install` la primera vez).
3. Autenticarse con una cuenta con permisos de edición sobre el proyecto de Apps Script: `npm run login`.

Las versiones de `clasp` y ESLint quedan fijadas por `package.json` + `package-lock.json`, así que todos los equipos usan las mismas herramientas.

El archivo `.clasp.json` está versionado: solo contiene el `scriptId` del proyecto y el directorio raíz, **no credenciales**. Gracias a ello, `npm run push` funciona desde cualquier equipo tras hacer `npm run login`.

### Comandos habituales
```bash
npm run status       # muestra qué archivos se subirán
npm run push         # sube Code.gs, index.html, css.html, javascript.html y appsscript.json
npm run deployments  # lista los despliegues y sus IDs
npm run deploy -- -i <deploymentId> -d "descripción"  # publica el código actual en un despliegue existente
npm run open         # abre el proyecto en el editor de Apps Script
npm run lint         # analiza Code.gs y el JS de javascript.html con ESLint
```

> `npm run push` actualiza el código del proyecto, pero la URL `/exec` sigue sirviendo la última versión desplegada. Después de cada push hay que publicar una nueva versión (con `npm run deploy -- -i <deploymentId>` o desde *Implementar → Gestionar implementaciones*).

### Lint
`npm run lint` copia `Code.gs` a `.tmp/`, extrae el bloque `<script>` de `javascript.html` y ejecuta ESLint con los globals de navegador y de Apps Script. No modifica el código ni se sube a Apps Script; `.tmp/` está en `.gitignore`.

### Indicador de versión
El panel lateral muestra, en la parte inferior, la versión del código (`APP_VERSION` en `Code.gs`) y el canal de ejecución. Como `/dev` sirve siempre el último push y `/exec` sirve la última versión publicada, el indicador permite saber de un vistazo qué código estás probando.

Para que el canal sea inequívoco, añade el parámetro a tus marcadores:

- Desarrollo: `.../dev?canal=dev`
- Producción: `.../exec?canal=prod`

Si no se indica el parámetro, se intenta deducir del referrer. Recuerda subir `APP_VERSION` cada vez que publiques cambios.

### Embebido y X-Frame-Options
La webapp se sirve con `XFrameOptionsMode.ALLOWALL` (`Code.gs`) para permitir incrustarla en otra página, por ejemplo la intranet del centro. Esto también permite que cualquier web la embeba, con el consiguiente riesgo de clickjacking; se asume de forma consciente porque el uso previsto puede requerir el embebido. Si en el futuro deja de ser necesario, cambiar a `HtmlService.XFrameOptionsMode.DEFAULT`.

### Credenciales
`clasp login` guarda el token en `~/.clasprc.json`, fuera del repositorio. No lo copies ni lo subas: cada equipo debe autenticarse por separado (`.clasprc.json` está en `.gitignore`).

## ✒️ Autor
**Pablo Felip Monferrer**

---
*Desarrollado para la gestión eficiente de centros educativos.*
