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

// --- VERSIÓN DE LA APP ---
// Se muestra en el panel lateral. Actualizar al publicar cambios.
const APP_VERSION = "1.0.0";

// Logo por defecto si Ajustes!E2 está vacío o no contiene una URL válida.
const APP_LOGO_FALLBACK = "https://drive.google.com/thumbnail?id=1L1bN-w8xzyqWul07ePiEuBvxP7Z83a30";

// --- DEBUG CONFIGURATION ---
const DEBUG_CONFIG = {
  debug: false,
  email: "pablo.felip@example.com" // Email para simular cuando debug = true
};

// --- SERVING WEBAPP ---
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');

  // Canal de ejecución (dev/prod) para el indicador de versión.
  // Se puede forzar con ?canal=dev o ?canal=prod en la URL.
  const rawCanal = e && e.parameter ? e.parameter.canal : "";
  const canal = ["dev", "prod", "exec"].includes(String(rawCanal).toLowerCase())
    ? String(rawCanal).toLowerCase()
    : "";
  template.canal = canal;
  template.canalLabel = canal || '—';
  template.appVersion = APP_VERSION;

  // Logo configurable desde Ajustes!E2; si falta, se usa el de por defecto.
  let logoUrl = APP_LOGO_FALLBACK;
  try {
    logoUrl = getLogoUrl(SpreadsheetApp.getActiveSpreadsheet()) || APP_LOGO_FALLBACK;
  } catch (err) {
    console.error("No se pudo leer el logo de Ajustes:", err);
  }
  template.logoUrl = logoUrl;

  // ALLOWALL permite embeber la webapp en otra página (p. ej. la intranet del
  // centro). Se mantiene de forma consciente porque el uso previsto puede
  // requerir el embebido. Si deja de necesitarse, usar XFrameOptionsMode.DEFAULT
  // para evitar clickjacking.
  return template
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

/**
 * Comprueba que el usuario tiene acceso a la app.
 * Perfiles válidos: docente registrado, administrador o lector.
 * Devuelve el contexto para no repetir lecturas de las hojas.
 */
function assertAuthorized(ss, email) {
  // Sin email no hay identidad: evita que una cuenta no identificada
  // pudiera casar con filas vacías de la hoja.
  if (!email) {
    throw new Error("No se ha podido identificar tu cuenta de usuario.");
  }

  const profile = getTeacherProfile(ss, email);
  const isAdmin = checkAdmin(ss, email);
  const isReader = checkReader(ss, email);

  if (!profile && !isAdmin && !isReader) {
    throw new Error("No tienes permisos de acceso o no estás registrado como docente.");
  }

  return { profile, isAdmin, isReader };
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

  // 1. Identificar Usuario y validar acceso (docente OR admin OR reader)
  const access = assertAuthorized(ss, userEmail);
  const teacherProfile = access.profile;
  const isAdmin = access.isAdmin;
  const isReader = access.isReader;

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
    // Lista de docentes para el selector. Las metas solo se envían a administración.
    teachersList: getAllTeachers(ss, isAdmin),
    allRecords: readAllNonTeachingRecords(ss), // Vista global: visible para todo el profesorado autorizado
    allClassesCount: isAdmin ? getAllClassesCount(ss) : {}, // Solo supervisión (admin)
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
 * Valida y normaliza los datos de una sesión no lectiva.
 * Devuelve { day, start, end, type, group } o lanza un error.
 */
function validateSessionData(ss, sessionData, teacherProfile, isAdmin) {
  const config = getAppConfig(ss);

  // Tipo de actividad: debe existir en Ajustes!A
  const typeInput = String(sessionData.type || "").trim().toLowerCase();
  const canonicalType = config.sessionTypes.find(t =>
    String(t).trim().toLowerCase() === typeInput
  );
  if (!canonicalType) {
    throw new Error("Tipo de actividad no válido.");
  }

  // Día: debe ser uno de los días lectivos
  const canonicalDay = normalizeDay(sessionData.day);
  const validDays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  if (!validDays.includes(canonicalDay)) {
    throw new Error("Día no válido.");
  }

  // Franja horaria
  const startMin = timeToMinutes(sessionData.start);
  const endMin = timeToMinutes(sessionData.end);
  if (startMin === null || endMin === null || startMin >= endMin) {
    throw new Error("Franja horaria no válida.");
  }

  // Grupo: obligatorio y restringido para tutorías
  const isTutoria = canonicalType.toLowerCase().includes("tutoría");
  const groupInput = String(sessionData.group || "").trim();
  let canonicalGroup = "";

  if (isTutoria) {
    if (!groupInput) {
      throw new Error("Selecciona un grupo para la tutoría.");
    }

    const allowedGroups = teacherProfile
      ? String(teacherProfile.metas.tutoria || "")
          .split(/[\s,;]+/)
          .map(g => g.trim())
          .filter(g => g && g.toLowerCase() !== "no")
      : [];

    if (allowedGroups.length === 0) {
      if (!isAdmin) {
        throw new Error("No tienes grupos de tutoría asignados.");
      }
      canonicalGroup = groupInput;
    } else {
      const match = allowedGroups.find(g => g.toLowerCase() === groupInput.toLowerCase());
      if (!match) {
        throw new Error("El grupo seleccionado no está asignado a este docente.");
      }
      canonicalGroup = match;
    }
  }

  return {
    day: canonicalDay,
    start: minutesToTime(startMin),
    end: minutesToTime(endMin),
    type: canonicalType,
    group: canonicalGroup
  };
}

/**
 * Guarda una nueva sesión no lectiva
 */
function saveSession(sessionData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.RECORDS);
  const requesterEmail = getCurrentUserEmail();

  // Validaciones básicas de seguridad
  const access = assertAuthorized(ss, requesterEmail);
  const isAdmin = access.isAdmin;

  // Los lectores (sin perfil docente) son de solo lectura
  if (access.isReader && !access.profile && !isAdmin) {
    throw new Error("Tu perfil es de solo lectura.");
  }

  // Si intenta guardar para otro, verificamos si es admin
  if (sessionData.email !== requesterEmail) {
    if (!isAdmin) {
      throw new Error("No tienes permisos para guardar sesiones de otro usuario.");
    }
  }

  const teacherProfile = (sessionData.email === requesterEmail)
    ? access.profile
    : getTeacherProfile(ss, sessionData.email);

  if (!teacherProfile) {
    throw new Error("Docente no encontrado.");
  }

  // Validar y normalizar tipo, día, franja y grupo
  const validated = validateSessionData(ss, sessionData, teacherProfile, isAdmin);
  sessionData.day = validated.day;
  sessionData.start = validated.start;
  sessionData.end = validated.end;
  sessionData.type = validated.type;
  sessionData.group = validated.group;

  const newStart = timeToMinutes(sessionData.start);
  const newEnd = timeToMinutes(sessionData.end);

  // VALIDACIÓN DE SOLAPAMIENTO CON CLASE LECTIVA (por rango)
  // Solo los administradores pueden guardar sesiones que solapen con lectivas
  const teachingClasses = getTeachingClasses(ss, teacherProfile.code);
  const hasClassOverlap = teachingClasses.some(c => {
    if (c.day !== sessionData.day) return false;

    const classStart = timeToMinutes(c.start);
    const classEnd = timeToMinutes(c.end);

    // Fallback a comparación exacta si alguna hora no es parseable
    if (newStart === null || newEnd === null || classStart === null || classEnd === null) {
      return c.start === sessionData.start;
    }

    return newStart < classEnd && newEnd > classStart;
  });

  if (hasClassOverlap && !isAdmin) {
    throw new Error("No tienes permisos para registrar sesiones no lectivas superpuestas a clases regulares. Esta acción requiere autorización de administración.");
  }

  // Sección crítica: lectura + escritura de la hoja de registros
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const lastRow = sheet.getLastRow();

    const valuesToSave = [
      sessionData.email,
      sessionData.day,
      sessionData.start,
      sessionData.end,
      sessionData.type,
      sessionData.group || "",
      sessionData.notes || ""
    ];

    // Upsert: clave única Email + Día + Hora Inicio
    const data = sheet.getDataRange().getValues();

    // Solapamiento con otras sesiones no lectivas del mismo docente
    const hasRecordOverlap = data.slice(1).some(row => {
      if (!row[0] || row[0] !== sessionData.email) return false;
      if (normalizeDay(row[1]) !== sessionData.day) return false;
      if (formatTime(row[2]) === sessionData.start) return false; // fila que se actualizará

      const rowStart = timeToMinutes(row[2]);
      const rowEnd = timeToMinutes(row[3]);
      if (rowStart === null || rowEnd === null) return false;

      return newStart < rowEnd && newEnd > rowStart;
    });

    if (hasRecordOverlap) {
      throw new Error("Ya existe otra sesión no lectiva que se solapa con esta franja.");
    }

    let rowIndexToUpdate = -1;

    // Empezamos en i=1 para saltar cabecera
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] === sessionData.email && normalizeDay(row[1]) === sessionData.day && formatTime(row[2]) === sessionData.start) {
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
      // Insertar nuevo. Si la hoja solo tiene cabecera y una fila vacía, reutilizarla.
      if (lastRow === 2) {
        const firstCellVal = sheet.getRange(2, 1).getValue();
        if (!firstCellVal || firstCellVal === "") {
          sheet.getRange(2, 1, 1, 7).setValues([valuesToSave]);
          logAudit(requesterEmail, sessionData.email, "CREAR", sessionData);
          return { success: true, lastUpdate: getLastUpdateForUser(ss, sessionData.email) };
        }
      }
      sheet.appendRow(valuesToSave);
      auditAction = "CREAR";
    }

    // AUDIT LOG
    logAudit(requesterEmail, sessionData.email, auditAction, sessionData);

    return {
      success: true,
      lastUpdate: getLastUpdateForUser(ss, sessionData.email)
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Elimina una sesión no lectiva
 */
function deleteSession(sessionData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.RECORDS);
  const requesterEmail = getCurrentUserEmail();

  // 1. Validar Permisos
  const access = assertAuthorized(ss, requesterEmail);
  const isAdmin = access.isAdmin;

  // Los lectores (sin perfil docente) son de solo lectura
  if (access.isReader && !access.profile && !isAdmin) {
    throw new Error("Tu perfil es de solo lectura.");
  }

  if (sessionData.email !== requesterEmail && !isAdmin) {
    throw new Error("No puedes eliminar sesiones de otro usuario.");
  }

  // 2. Buscar fila a eliminar (con bloqueo para evitar carreras)
  const targetStartStr = formatTime(sessionData.start);
  const targetDay = normalizeDay(sessionData.day);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const data = sheet.getDataRange().getValues();

    // Empezamos búsqueda desde fila 2 (índice 1) -> Row Index = i + 1
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowEmail = row[0];
      const rowDay = normalizeDay(row[1]);
      const rowStart = formatTime(row[2]);

      if (rowEmail === sessionData.email && rowDay === targetDay && rowStart === targetStartStr) {
        // Upgrade: Audit Log
        logAudit(requesterEmail, sessionData.email, "ELIMINAR", sessionData);

        const lastRow = sheet.getLastRow();
        const rowIndex = i + 1; // 1-indexed

        // Si es la fila 2 y es la ÚNICA fila de datos, no borrar fila, borrar contenido
        if (rowIndex === 2 && lastRow === 2) {
          sheet.getRange(2, 1, 1, 7).clearContent(); // 7 columnas (incluye notas)
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
  } finally {
    lock.releaseLock();
  }
}


// --- FUNCIONES PRIVADAS / HELPERS ---

function getTeacherProfile(ss, email) {
  if (!email) return null;
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

/**
 * Devuelve la URL del logo configurada en Ajustes!E2.
 * Solo acepta http(s); en cualquier otro caso devuelve "".
 */
function getLogoUrl(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  const raw = String(sheet.getRange("E2").getValue() || "").trim();
  return /^https?:\/\//i.test(raw) ? raw : "";
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

  // Una franja es descanso solo si NINGÚN grupo tiene clase en ella.
  // Las filas con módulo/docente vacío solo indican que ese grupo no tiene
  // clase en esa franja, no que la franja completa sea un descanso.
  // Key: "HH:mm-HH:mm"
  const slotsMap = new Map();

  rows.forEach(row => {
    const start = formatTime(row[5]); // F (Objeto Date o String HH:mm)
    const end = formatTime(row[6]);   // G
    const hasModule = row[2] && row[2] !== ""; // C
    const hasTeacher = row[3] && row[3] !== ""; // D

    if (!start || !end) return;

    const key = `${start}-${end}`;

    // Si NO tiene módulo ni docente, es descanso/hueco.
    // Si alguna fila de la misma franja tiene clase, prevalece CLASS.
    const isBreak = !hasModule && !hasTeacher;

    if (!slotsMap.has(key)) {
      slotsMap.set(key, {
        start: start,
        end: end,
        type: isBreak ? 'BREAK' : 'CLASS'
      });
    } else if (slotsMap.get(key).type === 'BREAK' && !isBreak) {
      slotsMap.get(key).type = 'CLASS';
    }
  });

  // Convertir a array y ordenar por hora
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
      day: normalizeDay(row[1]), // Día
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
      day: normalizeDay(row[1]),
      start: formatTime(row[2]),
      end: formatTime(row[3]),
      type: row[4],
      group: row[5],
      notes: row[6] || ""
    }));
}

// Helper simple para horas. Normaliza Date y cadenas tipo "9:00" a "HH:mm".
function formatTime(value) {
  if (value instanceof Date) {
    const h = value.getHours().toString().padStart(2, '0');
    const m = value.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{1,2}):(\d{1,2})$/);
    if (match) {
      const h = match[1].padStart(2, '0');
      const m = match[2].padStart(2, '0');
      return `${h}:${m}`;
    }
    return value.trim();
  }
  return value; // números u otros: se devuelven tal cual
}

// Convierte "HH:mm" (o Date) a minutos desde medianoche. Devuelve null si no es válido.
function timeToMinutes(value) {
  const str = formatTime(value);
  if (typeof str !== 'string') return null;
  const parts = str.split(':');
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

// Convierte minutos desde medianoche a "HH:mm".
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Normaliza el nombre del día a la forma usada en la app.
function normalizeDay(value) {
  const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  const clean = s => String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const input = clean(value);
  return days.find(d => clean(d) === input) || String(value || "").trim();
}

function getAllTeachers(ss, includeMeta) {
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

  const idxCode = headers.findIndex(h => h === "Código" || h === "Codigo");
  const idxMeta = 9; // Col J (índice 9) -> HS no lectivas ajustadas
  const idxGuardias = headers.findIndex(h => String(h).toLowerCase().includes("guardias sem"));
  const idxTutoria = headers.findIndex(h => String(h).toLowerCase().includes("tutoría grupo"));

  if (idxEmail === -1) {
    // Si no encuentra email, retornamos string vacío (o error)
    console.error("No se encontró columna Email en Resumen HS");
    return [];
  }

  // Filtramos filas válidas (que tengan email y nombre) y empezamos en fila 4
  return data.slice(3)
    .filter(r => r[idxEmail] && r[idxName])
    .map(r => {
      const teacher = {
        name: r[idxName],
        email: r[idxEmail],
        code: r[idxCode]
      };
      // Las metas horarias solo las consume la administración (supervisión)
      if (includeMeta) {
        teacher.metas = {
          totalNonTeaching: r[idxMeta],
          guardias: r[idxGuardias],
          tutoria: r[idxTutoria]
        };
      }
      return teacher;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Cuenta las sesiones lectivas por cada docente
 * Retorna un objeto: { 'CODIGO_DOCENTE': count }
 */
function getAllClassesCount(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1);
  
  const summary = {};
  
  rows.forEach(row => {
    const teacherCode = row[3]; // Columna D
    if (teacherCode) {
      summary[teacherCode] = (summary[teacherCode] || 0) + 1;
    }
  });
  
  return summary;
}

/**
 * Endpoint público para la vista global (llamado desde el frontend).
 * La vista global es visible para todo el profesorado autorizado, pero exige
 * que el usuario esté registrado en la app (docente, admin o lector).
 */
function getAllNonTeachingRecords(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  assertAuthorized(ss, getCurrentUserEmail());
  return readAllNonTeachingRecords(ss);
}

/**
 * Lectura interna de todos los registros (sin comprobación de permisos).
 * Solo debe invocarse desde código que ya haya validado el acceso.
 */
function readAllNonTeachingRecords(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.RECORDS);
  const data = sheet.getDataRange().getValues().slice(1); // Skip header

  return data
    .filter(row => row[0]) // Ignorar filas vacías (p. ej. tras borrar el último registro)
    .map(row => ({
      email: row[0],
      day: normalizeDay(row[1]),
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
