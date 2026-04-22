# Panel de Gestión de Dedicación No Lectiva 📅

Aplicación web desarrollada con **Google Apps Script** diseñada para centros educativos. Permite al profesorado gestionar sus franjas horarias no lectivas (guardias, tutorías, gestión) de forma integrada con el horario lectivo importado, garantizando trazabilidad y cumplimiento de objetivos horarios.

## 🎯 Objetivo del Proyecto
Optimizar la planificación del horario no lectivo del profesorado, proporcionando una interfaz intuitiva que evite conflictos horarios, facilite la supervisión por parte de Jefatura de Estudios y asegure que se cumplen las horas de dedicación ajustadas a cada docente.

## 🛠️ Detalles Técnicos
*   **Backend**: Google Apps Script (GAS) vinculado a Google Sheets.
*   **Frontend**: HTML5, JavaScript (ES6+), **Tailwind CSS** para el diseño responsivo y **Phosphor Icons**.
*   **Base de Datos**: Google Sheets (4 pestañas principales):
    *   `Resumen HS`: Perfiles docentes, códigos y metas horarias.
    *   `Horario no lectivo`: Repositorio de todas las sesiones registradas.
    *   `Clases (importado)`: Horario lectivo oficial del centro.
    *   `Ajustes`: Configuración de tipos de actividad y grupos.
    *   `Auditoría`: Registro histórico de todas las operaciones (logs).

## ✨ Funcionalidades Principales

### 1. Planificador Semanal Interactivo
*   Visualización clara de celdas lectivas (azul) y no lectivas (púrpura/naranja/verde).
*   Gestión de sesiones mediante clics: añadir, editar y eliminar con actualizaciones optimistas en la UI.
*   Indicadores de estado (PENDIENTE/COMPLETO) y cálculo de metas en tiempo real.

### 2. Gestión de Roles y Permisos
*   **Docente**: Acceso a su propio horario y estadísticas personales.
*   **Administrador**: Capacidad para ver y modificar el horario de cualquier docente mediante un selector dinámico.
*   **Lector**: Acceso exclusivo a la Vista Global para supervisión.

### 3. Solapamientos Excepcionales (Admin Only) ⚠️
*   Permite a los administradores registrar sesiones no lectivas sobre franjas lectivas en periodos especiales (FCT, prácticas en empresa).
*   Visualización mediante **pastillas divididas** que muestran ambas actividades simultáneamente.
*   Confirmación de seguridad mediante modal dinámico antes de realizar la acción.

### 4. Vista Global (Dashboard)
*   Rejilla comparativa de todo el centro.
*   Filtros avanzados por docente, búsqueda por nombre y tipo de actividad (Guardias, Tutorías, Gestión).
*   Tooltips informativos con notas adicionales de cada sesión.

### 5. Trazabilidad Total
*   Muestra la **fecha, hora y autor de la última modificación** en cada ficha horaria.
*   Sistema de auditoría automático que registra cada cambio en el backend.

## 🚀 Desarrollo Local con Clasp
Este proyecto está configurado para usarse con [clasp](https://github.com/google/clasp).

1.  Clonar el repositorio.
2.  Instalar dependencias y configurar scriptId en `.clasp.json`.
3.  Sincronizar cambios:
    ```bash
    clasp push
    ```

---
*Desarrollado para la gestión eficiente de centros educativos.*
