# Panel de gestión de dedicación no lectiva 📅

Aplicación web desarrollada con **Google Apps Script** diseñada para centros educativos. Permite al profesorado gestionar sus franjas horarias no lectivas (guardias, tutorías, gestión) de forma integrada con el horario lectivo importado, garantizando trazabilidad y cumplimiento de objetivos horarios.

## 🎯 Objetivo del proyecto
Optimizar la planificación del horario no lectivo del profesorado, proporcionando una interfaz intuitiva que evite conflictos horarios, facilite la supervisión por parte de jefatura de estudios y asegure que se cumplen las horas de dedicación ajustadas a cada docente.

## 🛠️ Detalles técnicos
*   **Backend**: Google Apps Script (GAS) vinculado a Google Sheets.
*   **Despliegue**: Webapp restringida a los usuarios del dominio del centro (`access: DOMAIN`).
*   **Frontend**: HTML5, JavaScript (ES6+), **Tailwind CSS** para el diseño responsivo y **Phosphor Icons**.
*   **Base de datos**: Google Sheets (5 pestañas principales):
    *   `Resumen HS`: Perfiles docentes, códigos y metas horarias.
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

## ✒️ Autor
**Pablo Felip Monferrer**

---
*Desarrollado para la gestión eficiente de centros educativos.*
