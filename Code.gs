/**
 * BACKEND - GESTIÓN DE DEDICACIÓN NO LECTIVA
 * ------------------------------------------
 * Este script se incrusta en la Google Sheet.
 */

// --- CONFIGURACIÓN DE TABLAS (PESTAÑAS) ---
const SHEET_NAMES = {
  TEACHERS: "Resumen HS",
  CLASSES: "Clases (importado)",
  SETTINGS: "Ajustes",
  RECORDS: "Horario no lectivo"
};

// --- DEBUG CONFIGURATION ---
const DEBUG_CONFIG = {
  debug: false,
  email: "pablo.felip@example.com" // Email para simular cuando debug = true
};

// --- SERVING WEBAPP ---
function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Gestión Dedicación No Lectiva')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- HELPER DE USUARIO (DEBUG AWARE) ---
function getCurrentUserEmail() {
  if (DEBUG_CONFIG.debug) {
    return DEBUG_CONFIG.email;
  }
  return Session.getActiveUser().getEmail();
}

// --- API PÚBLICA (LLAMADA DESDE FRONTEND) ---

/**
 * Carga inicial de toda la información necesaria para la App.
 * 1. Perfil del Usuario (si es docente).
 * 2. Configuración (Tipos de sesión, Grupos).
 * 3. Estructura del Horario (Slots derivados de 'Clases').
 * 4. Calendario Global (Ocupación de todos).
 */
function getInitialData() {
  const userEmail = getCurrentUserEmail();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Identificar Usuario
  const teacherProfile = getTeacherProfile(ss, userEmail);
  const isAdmin = checkAdmin(ss, userEmail);
  const isReader = checkReader(ss, userEmail);

  // Allow access if Teacher OR Admin OR Reader
  if (!teacherProfile && !isAdmin && !isReader) {
    throw new Error("No tienes permisos de acceso o no estás registrado como docente.");
  }

  // 2. Configuración
  const config = getAppConfig(ss);

  // 3. Estructura Horaria (Slots únicos extraídos de Clases)
  const scheduleSlots = extractScheduleSlots(ss);

  // 4. Mis Registros (Si es docente)
  let myRecords = [];
  if (teacherProfile) {
    myRecords = getTeacherRecords(ss, userEmail);
  }

  // 5. Clases Lectivas (Para validación y visualización)
  const myTeachingClasses = teacherProfile ? getTeachingClasses(ss, teacherProfile.code) : [];

  return {
    user: {
      email: userEmail,
      isAdmin: isAdmin,
      isReader: isReader,
      profile: teacherProfile // null si es solo admin o reader
    },
    config: config,
    schedule: scheduleSlots, // Restored
    myRecords: myRecords,
    myClasses: myTeachingClasses,
    // Admin: Lista de docentes para el selector
    teachersList: getAllTeachers(ss), // Visible para todos para el selector global
    allRecords: getAllNonTeachingRecords(ss), // Data for Global View
    lastUpdate: getLastUpdateForUser(ss, userEmail)
  };
}

/**
 * Endpoint para cambiar de docente (Solo Admin)
 */
function getTeacherData(targetEmail) {
  const userEmail = getCurrentUserEmail();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!checkAdmin(ss, userEmail)) {
    throw new Error("Acceso denegado: No eres administrador.");
  }

  const profile = getTeacherProfile(ss, targetEmail);
  if (!profile) {
    throw new Error("Docente no encontrado.");
  }

  return {
    user: {
      email: targetEmail,
      profile: profile
    },
    myRecords: getTeacherRecords(ss, targetEmail),
    myClasses: getTeachingClasses(ss, profile.code),
    lastUpdate: getLastUpdateForUser(ss, targetEmail)
  };
}

// --- HELPER: AUDIT SYSTEM ---

function ensureAuditSheet(ss) {
  let auditSheet = ss.getSheetByName("Auditoría");
  if (!auditSheet) {
    auditSheet = ss.insertSheet("Auditoría");
    // Headers: Timestamp, Actor, Rol, Objetivo, Acción, Slot, Tipo, Grupo
    auditSheet.appendRow(["Timestamp", "Actor", "Rol", "Objetivo", "Acción", "Slot", "Tipo", "Grupo"]);
    auditSheet.setFrozenRows(1);
  }
  return auditSheet;
}

function logAudit(actorEmail, targetEmail, action, sessionData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const auditSheet = ensureAuditSheet(ss);

    // Simplificar slot format
    const startStr = typeof sessionData.start === 'object' ? formatTime(sessionData.start) : sessionData.start;
    const slot = `${sessionData.day} ${startStr}-${sessionData.end}`;

    const timestamp = new Date();
    const role = (actorEmail === targetEmail) ? "Propietario" : "Admin";

    auditSheet.appendRow([
      timestamp,
      actorEmail,
      role,
      targetEmail,
      action,
      slot,
      sessionData.type || "",
      sessionData.group || ""
    ]);
  } catch (e) {
    console.error("Error logging audit:", e);
  }
}

/**
 * Guarda una nueva sesión no lectiva
 */
function saveSession(sessionData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.RECORDS);
  const userEmail = getCurrentUserEmail();

  // Validaciones básicas de seguridad
  const requesterEmail = userEmail;
  const isAdmin = checkAdmin(ss, requesterEmail);

  // Si intenta guardar para otro, verificamos si es admin
  if (sessionData.email !== requesterEmail) {
    if (!isAdmin) {
      throw new Error("No tienes permisos para guardar sesiones de otro usuario.");
    }
  }

  // VALIDACIÓN DE SOLAPAMIENTO CON CLASE LECTIVA
  // Solo los administradores pueden guardar sesiones que solapen con lectivas
  const teacherProfile = getTeacherProfile(ss, sessionData.email);
  if (teacherProfile) {
    const teachingClasses = getTeachingClasses(ss, teacherProfile.code);
    const hasOverlap = teachingClasses.some(c => c.day === sessionData.day && c.start === sessionData.start);
    
    if (hasOverlap && !isAdmin) {
      throw new Error("No tienes permisos para registrar sesiones no lectivas superpuestas a clases regulares. Esta acción requiere autorización de administración.");
    }
  }

  // Validar solapamientos (Lógica de negocio robusta necesaria aquí o en front)
  // De momento guardamos appendRow
  // De momento guardamos appendRow -> CAMBIO: Verificar si la fila 2 está vacía para reusarla
  const lastRow = sheet.getLastRow();
  const rangeFirst = sheet.getRange(2, 1, 1, 6); // Rango de la primera fila de datos (asumiendo 6 cols)

  const valuesToSave = [
    sessionData.email,
    sessionData.day,
    sessionData.start,
    sessionData.end,
    sessionData.type,
    sessionData.group || "",
    sessionData.notes || ""
  ];

  // UPGRADE: Upsert Logic (Buscar si ya existe para actualizar)
  // Clave única: Email + Día + Hora Inicio
  const data = sheet.getDataRange().getValues();
  let rowIndexToUpdate = -1;

  // Empezamos en i=1 para saltar cabecera
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // row[0]=email, row[1]=day, row[2]=start
    if (row[0] === sessionData.email && row[1] === sessionData.day && formatTime(row[2]) === sessionData.start) {
      rowIndexToUpdate = i + 1; // 1-based index for getRange
      break;
    }
  }

  let auditAction = "CREAR";

  if (rowIndexToUpdate > 0) {
    // Actualizar existente
    sheet.getRange(rowIndexToUpdate, 1, 1, 7).setValues([valuesToSave]);
    auditAction = "ACTUALIZAR";
  } else {
    // Insertar nuevo (Append)
    // Verificar si la fila 2 está vacía (caso inicial) para reusarla
    if (lastRow === 2) {
      const firstCellVal = sheet.getRange(2, 1).getValue();
      if (!firstCellVal || firstCellVal === "") {
        sheet.getRange(2, 1, 1, 7).setValues([valuesToSave]);
        // Log audit for initial insert too
        logAudit(userEmail, sessionData.email, "CREAR", sessionData);
        return { success: true };
      }
    }
    sheet.appendRow(valuesToSave);
    auditAction = "CREAR";
  }

  // AUDIT LOG
  logAudit(userEmail, sessionData.email, auditAction, sessionData);

  return { 
    success: true,
    lastUpdate: getLastUpdateForUser(ss, sessionData.email)
  };
}

/**
 * Elimina una sesión no lectiva
 */
function deleteSession(sessionData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.RECORDS);
  const requesterEmail = getCurrentUserEmail();

  // 1. Validar Permisos
  if (sessionData.email !== requesterEmail) {
    const isAdmin = checkAdmin(ss, requesterEmail);
    if (!isAdmin) {
      throw new Error("No puedes eliminar sesiones de otro usuario.");
    }
  }

  // 2. Buscar fila a eliminar
  // Asumimos que la combinación Email + Día + StartTime es única
  const data = sheet.getDataRange().getValues();
  // data[0] headers

  // Indices (Ajustar según appendRow: Email, Day, Start, End, Type, Group)
  // 0: Email, 1: Day, 2: Start, 3: End...

  // Importante: StartTime puede venir como string HH:mm o Date object.
  // En sheet.appendRow guardamos lo que llega.
  // En extractScheduleSlots (lectura de Clases) usaba formatTime.
  // En saveSession (lectura de Records) usaba formatTime.
  // Asegurar comparación robusta de tiempo.

  const targetStartStr = String(sessionData.start);

  // Empezamos búsqueda desde fila 2 (índice 1) -> Row Index = i + 1
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowEmail = row[0];
    const rowDay = row[1];
    const rowStart = formatTime(row[2]); // Helper para uniformizar

    if (rowEmail === sessionData.email && rowDay === sessionData.day && rowStart === targetStartStr) {
      // Encontrado -> Eliminar

      // Upgrade: Audit Log
      logAudit(requesterEmail, sessionData.email, "ELIMINAR", sessionData);

      const lastRow = sheet.getLastRow();
      const rowIndex = i + 1; // 1-indexed

      // Si es la fila 2 y es la ÚNICA fila de datos, no borrar fila, borrar contenido
      if (rowIndex === 2 && lastRow === 2) {
        sheet.getRange(2, 1, 1, 6).clearContent();
      } else {
        sheet.deleteRow(rowIndex);
      }

      return { 
        success: true,
        lastUpdate: getLastUpdateForUser(ss, sessionData.email)
      };
    }
  }

  throw new Error("Sesión no encontrada para eliminar.");
}


// --- FUNCIONES PRIVADAS / HELPERS ---

function getTeacherProfile(ss, email) {
  const sheet = ss.getSheetByName(SHEET_NAMES.TEACHERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[2]; // Encabezados en fila 3 (índice 2)

  // Mapeo columnas (Ajustar índices según estructura real o buscar por nombre)
  // Según requisitos: Col J es "HS no lectivas ajustadas"
  // Buscamos índice por nombre aproximado para ser robustos
  const idxEmail = headers.findIndex(h => {
    const s = String(h).toLowerCase();
    return s.includes("email") || s.includes("correo") || s.includes("mail");
  });

  let idxName = headers.findIndex(h => {
    const s = String(h).toLowerCase();
    return s.includes("docente") || s.includes("nombre") || s.includes("profesor");
  });
  if (idxName === -1) idxName = 0; // Fallback Col A
  const idxCode = headers.findIndex(h => h === "Código" || h === "Codigo");
  const idxMeta = 9; // Col J (índice 9) -> HS no lectivas ajustadas
  const idxGuardias = headers.findIndex(h => String(h).toLowerCase().includes("guardias sem"));
  const idxTutoria = headers.findIndex(h => String(h).toLowerCase().includes("tutoría grupo"));

  // Buscar fila del email (Empezamos datos en fila 4 -> índice 3)
  const teacherRow = data.slice(3).find(r => r[idxEmail] === email);

  if (!teacherRow) return null;

  return {
    name: teacherRow[idxName],
    code: teacherRow[idxCode], // Importante para cruzar con "Clases"
    metas: {
      totalNonTeaching: teacherRow[idxMeta], // Objetivo horas J
      guardias: teacherRow[idxGuardias],
      tutoria: teacherRow[idxTutoria]
    }
  };
}

function checkAdmin(ss, email) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  // Asumimos admins en Columna C
  const admins = sheet.getRange("C2:C").getValues().flat().filter(String);
  return admins.includes(email);
}

function checkReader(ss, email) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  // Asumimos lectores en Columna D
  const readers = sheet.getRange("D2:D").getValues().flat().filter(String);
  return readers.includes(email);
}

function getAppConfig(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  // Tipos sesión: col A, Grupos: col B
  const lastRow = sheet.getLastRow();

  const types = sheet.getRange(`A2:A${lastRow}`).getValues().flat().filter(String);
  const groups = sheet.getRange(`B2:B${lastRow}`).getValues().flat().filter(String);

  return {
    sessionTypes: types,
    groups: groups
  };
}

/**
 * Escanea "Clases (importado)" para deducir las franjas horarias válidas.
 * Se basa en que las filas vacías de módulo/docente son descansos.
 */
function extractScheduleSlots(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
  const data = sheet.getDataRange().getValues();
  // Estructura: A:Grupo, B:Día, C:Modulo, D:Docente, E:Aula, F:Inicio, G:Fin

  // Ignorar cabecera
  const rows = data.slice(1);

  // Usamos un Map para unificar slots por hora inicio-fin
  // Key: "HH:mm-HH:mm"
  const slotsMap = new Map();

  rows.forEach(row => {
    const day = row[1]; // B
    const start = row[5]; // F (Objeto Date o String HH:mm)
    const end = row[6];   // G
    const hasModule = row[2] && row[2] !== ""; // C
    const hasTeacher = row[3] && row[3] !== ""; // D

    if (!day || !start || !end) return;

    // Formatear horas a HH:mm
    const timeStr = `${formatTime(start)}-${formatTime(end)}`;

    // Determinar si es slot lectivo o descanso
    // Según usuario: Si NO tiene módulo ni docente, es descanso/hueco
    const isBreak = !hasModule && !hasTeacher;

    // Guardamos la definición del slot. 
    // Si ya existe, priorizamos marcarlo como 'CLASS' si alguna vez aparece como clase.
    // (A veces un slot es clase para unos y libre para otros, pero el slot 'existe' como lectivo).
    if (!slotsMap.has(timeStr)) {
      slotsMap.set(timeStr, {
        start: formatTime(start),
        end: formatTime(end),
        type: isBreak ? 'BREAK' : 'CLASS'
      });
    } else {
      // Si ya existe y el que tenemos es BREAK pero ahora vemos que SÍ es clase en otra fila, actualizamos
      if (slotsMap.get(timeStr).type === 'BREAK' && !isBreak) {
        slotsMap.get(timeStr).type = 'CLASS';
      }
    }
  });

  // Convertir a array y ordenar
  return Array.from(slotsMap.values()).sort((a, b) => a.start.localeCompare(b.start));
}

function getTeachingClasses(ss, teacherCode) {
  const sheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1);

  // Filtrar donde Docente (Col D -> index 3) coincida
  return rows
    .filter(row => row[3] === teacherCode)
    .map(row => ({
      day: row[1], // Día
      start: formatTime(row[5]),
      end: formatTime(row[6]),
      group: row[0],
      module: row[2],
      classroom: row[4]
    }));
}

function getTeacherRecords(ss, email) {
  const sheet = ss.getSheetByName(SHEET_NAMES.RECORDS);
  const data = sheet.getDataRange().getValues().slice(1); // Skip header

  return data
    .filter(row => row[0] === email)
    .map(row => ({
      email: row[0],
      day: row[1],
      start: formatTime(row[2]),
      end: formatTime(row[3]),
      type: row[4],
      group: row[5],
      notes: row[6] || ""
    }));
}

// Helper simple para horas
function formatTime(dateObj) {
  if (dateObj instanceof Date) {
    const h = dateObj.getHours().toString().padStart(2, '0');
    const m = dateObj.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  return dateObj; // Asumimos string si no es Date
}

function getAllTeachers(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.TEACHERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[2]; // Encabezados en fila 3 (índice 2)

  // Buscar índices o usar fallbacks
  let idxName = headers.findIndex(h => {
    const s = String(h).toLowerCase();
    return s.includes("docente") || s.includes("nombre") || s.includes("profesor");
  });
  if (idxName === -1) idxName = 0; // Fallback: Primera columna

  const idxEmail = headers.findIndex(h => {
    const s = String(h).toLowerCase();
    return s.includes("email") || s.includes("correo") || s.includes("mail");
  });

  if (idxEmail === -1) {
    // Si no encuentra email, retornamos string vacío (o error)
    console.error("No se encontró columna Email en Resumen HS");
    return [];
  }

  // Filtramos filas válidas (que tengan email y nombre) y empezamos en fila 4
  return data.slice(3)
    .filter(r => r[idxEmail] && r[idxName])
    .map(r => ({
      name: r[idxName],
      email: r[idxEmail]
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
/**
 * Obtiene TODOS los registros no lectivos de TODOS los docentes
 * Ordenado por Día y Hora para facilitar renderizado
 */
function getAllNonTeachingRecords(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.RECORDS);
  const data = sheet.getDataRange().getValues().slice(1); // Skip header

  return data
    .map(row => ({
      email: row[0],
      day: row[1],
      start: formatTime(row[2]),
      end: formatTime(row[3]),
      type: row[4],
      group: row[5],
      notes: row[6] || ""
    }));
}

/**
 * Obtiene la última modificación registrada en la hoja de Auditoría para un docente.
 */
function getLastUpdateForUser(ss, targetEmail) {
  const sheet = ss.getSheetByName("Auditoría");
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null; // Solo cabecera

  // Buscamos de abajo hacia arriba (más reciente primero)
  // Estructura: A:Timestamp, B:Actor, C:Rol, D:Objetivo...
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (row[3] === targetEmail) {
      return {
        timestamp: row[0] instanceof Date ? row[0].toISOString() : row[0],
        actor: row[1]
      };
    }
  }

  return null;
}
