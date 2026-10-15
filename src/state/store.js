// Estado central de la app (equivalente a las variables globales CONFIG/EMPLEADOS/…
// del archivo original) + persistencia vía IPC en vez de localStorage.

import { descifrarParalela, combinarParalela } from '../lib/paralelaCrypto.js';

function defaultConfig() {
  return {
    salarioMinimo: 130,          // Bs./mes — salario mínimo legal vigente (Art. 129 LOTTT)
    cestaticket: 0,               // monto mensual del bono de alimentación, NO salarial (Ley Cestaticket)
    cestaticketMoneda: 'USD',     // 'VES' o 'USD' — moneda en que se fija el bono de alimentación
    historialCestaticket: [],     // [{ id, fecha, monto, moneda }] — qué bono general regía desde cada fecha
    ivssTrabajador: 4,            // % fijo, Art. 66 Ley del Seguro Social
    ivssPatrono: 10,                // % según riesgo: 9 mínimo / 10 medio / 11 máximo (LOPCYMAT) —
                                    // Doctormás está clasificado "RIESGO: 2" (medio) en su factura IVSS
    ivssTopeSalariosMinimos: 5,   // tope de cotización = 5 salarios mínimos
    faovTrabajador: 1,            // % sobre salario normal del período (criterio de la empresa; Ley Régimen Prestacional de Vivienda y Hábitat)
    faovPatrono: 2,
    incesTrabajador: 0.5,         // % sobre utilidades únicamente
    incesPatrono: 2,              // % trimestral sobre nómina total (no se descuenta al trabajador salvo utilidades)
    rpeTrabajador: 0.5,           // % Régimen Prestacional de Empleo — RPE, Pérdida Involuntaria del Empleo
    rpePatrono: 2,
    rpeTopeSalariosMinimos: 10,    // límite superior de la base de cotización del RPE — Art. 46 Ley del
                                    // Régimen Prestacional de Empleo. Es el DOBLE del tope del IVSS (5):
                                    // son dos leyes distintas, no comparten el mismo tope.
    rpePisoSalariosMinimos: 1,     // límite inferior (Art. 46 misma ley): si el salario real es menor a
                                    // 1 salario mínimo, el RPE igual se calcula sobre ese mínimo.
    dppPatrono: 9,                 // % Ley de Protección de las Pensiones de la Seguridad Social (Gaceta
                                    // Extraordinaria 6.806, 08-05-2024) — "DPP", recaudada por el SENIAT.
                                    // 100% patronal, hasta 15% permitido por ley (SENIAT la fijó en 9%).
                                    // Base: total de pagos de nómina del mes (salario + bono de
                                    // alimentación y demás bonificaciones no salariales). Verifique la
                                    // alícuota vigente en el portal del SENIAT antes de declarar.
    dppBaseMinima: 0,               // Base mínima de cálculo POR TRABAJADOR (Art. 7 Ley DPP): si lo que
                                    // gana un empleado en el mes es menor a esto, el aporte de ESE
                                    // empleado igual se calcula sobre este mínimo, no sobre lo real. Cifra
                                    // vigente ~USD 240 (USD 40 Cestaticket + USD 200 "Bono de Guerra
                                    // Económica") — cambia con frecuencia, verifique antes de declarar.
    dppBaseMinimaMoneda: 'USD',    // 'VES' o 'USD' — moneda en que se fija esa base mínima
    diasUtilidadesAnual: 30,      // mínimo legal Art. 131 LOTTT (Doctormás puede pagar más)
    diasUtilidadesTopeMax: 120,   // tope legal 4 meses (Art. 131 LOTTT)
    diasVacacionesBase: 15,       // Art. 190 LOTTT
    diasVacacionesTope: 30,       // 15 + 15 adicionales máx.
    diasBonoVacBase: 15,          // Art. 192 LOTTT
    diasBonoVacTope: 30,
    diasGarantiaTrimestral: 15,   // Art. 142 lit. a LOTTT
    diasAdicionalAnualPorAno: 2,  // Art. 142 lit. b LOTTT (a partir del 2do año)
    diasAdicionalTope: 30,
    diasRetroactivoPorAno: 30,    // Art. 142 lit. c LOTTT (cálculo de garantía retroactiva al término)
    tasaInteresAnual: 47.5,       // % anual — BCV promedio activa/pasiva (jun-2026: 47,56%) — editable por el usuario
    nombreEmpresa: 'Centro de Atención Médica Inmediata de Salud CAMIS, C.A.',
    rif: 'J-502185640',
    repLegalNombre: 'José Ángel Báez Bello',  // nombre del representante legal de la empresa, para firmar contratos
    repLegalCedula: '21131072',
    repLegalCargo: 'Presidente',    // cargo de quien firma contratos y constancias de trabajo
    domicilioLegal: '',            // domicilio de la empresa — para el encabezado del contrato de trabajo
    tiposNomina: {
      primera: {
        label: 'Primera quincena (1–15)',
        diasSueldo: 15,
        incluyeCestaticket: false,
        incluyeDeducciones: true
      },
      segunda: {
        label: 'Segunda quincena (16–30)',
        diasSueldo: 15,
        incluyeCestaticket: true,
        incluyeDeducciones: true
      },
      mensual: {
        label: 'Pago mensual completo',
        diasSueldo: 30,
        incluyeCestaticket: true,
        incluyeDeducciones: true
      }
    }
  };
}

// Corrige el nombre de la empresa si quedó guardado con el nombre viejo
// (antes de que se corrigiera el orden correcto de "CAMIS, C.A.").
function corregirNombreEmpresa() {
  if (state.CONFIG.nombreEmpresa === 'Centro de Atención Médica Inmediata de Salud, C.A. (CAMIS)') {
    state.CONFIG.nombreEmpresa = 'Centro de Atención Médica Inmediata de Salud CAMIS, C.A.';
  }
}

export function tipoNominaCfg(tipoKey) {
  return (state.CONFIG.tiposNomina && state.CONFIG.tiposNomina[tipoKey]) ||
    { label: tipoKey, diasSueldo: 15, incluyeCestaticket: true, incluyeDeducciones: true };
}

// Nombre de la empresa + RIF, para encabezados y firmas de todo documento
// generado (recibos, informes, comprobantes) — el RIF siempre debe salir.
export function empresaConRif() {
  return state.CONFIG.rif ? `${state.CONFIG.nombreEmpresa} (RIF ${state.CONFIG.rif})` : state.CONFIG.nombreEmpresa;
}

export const state = {
  CONFIG: defaultConfig(),
  EMPLEADOS: [],
  PERIODOS: [],
  VAC_DISFRUTE: [],
  PERMISOS_REMUNERADOS: [],
  UTILIDADES_PAGADAS: [],
  LIQUIDACIONES: [],
  HISTORICO_TASAS: [],
  BONO_VAC_PAGADO: [],
  BONO_ALIM_PAGADO: [],
  // Historial de modificaciones (quién, cuándo, qué sección) — ver
  // registrarCambio() más abajo. Se comparte igual que el resto de los datos
  // al sincronizar, así cada equipo ve también lo que hizo el otro.
  HISTORIAL_CAMBIOS: [],
  // Copias completas de los datos justo después de cada guardado importante
  // (ver registrarCambio()), para poder "Restaurar a este punto" desde
  // Configuración → Historial. A diferencia de HISTORIAL_CAMBIOS, esto SÍ
  // pesa (son los datos completos, no solo el renglón del log) — por eso se
  // guardan solo las últimas MAX_RESPALDOS_AUTO y NO se comparten al
  // sincronizar con el equipo (quedan solo en este computador).
  RESPALDOS_AUTO: [],
  // Nómina paralela (bonos propios de la dirección): pagos. Vive SOLO en
  // este computador — no entra a la sincronización con el equipo, ni al
  // historial compartido, ni a los respaldos automáticos.
  PARALELA: { pinHash: '', salt: '', pagos: [] },
  // Cómo estaba todo la última vez que este equipo sincronizó (para combinar por
  // registro con la nube). Solo local: nunca viaja.
  SYNC_BASE: null,
  // Clave con la que se cifra la paralela para la nube. Solo local: nunca viaja.
  PARALELA_CLAVE: '',
  // 'clave' si la nube trae una paralela que esta clave no abre; 'sin-clave' si falta la clave.
  PARALELA_ESTADO: '',
  // Usuarios y tipos de usuario (permisos por módulo). Se comparten al
  // sincronizar para que las mismas cuentas sirvan en todos los equipos.
  USUARIOS: [],
  ROLES: [],
  // Usuario con sesión iniciada — solo en memoria, se pide al abrir la app.
  SESION: null,
  // "Recordarme en este equipo": { id, marca }. Solo local (nunca se sincroniza).
  SESION_RECORDADA: null,
  // Correlativo único para el "N° de recibo" de todo recibo de pago que se
  // guarda en el historial (nómina, utilidades, bono vacacional) — nunca se
  // reutiliza ni se reinicia, aunque se borre un registro después.
  PROXIMO_NUMERO_RECIBO: 1,
  TASA: { valor: null, fuente: null, fechaActualizacion: null, manual: false, timestampCache: 0, fuentes: [] },
  SYNC: { url: '', pin: '', actor: '', lastSyncedAt: null, lastUpdatedBy: null, status: 'sin-configurar' },
  DISPLAY_CURRENCY: 'VES',
  // Preferencia puramente cosmética de este computador (barra lateral
  // contraída o no) — no se comparte al sincronizar con el equipo.
  SIDEBAR_COLLAPSED: false,
  CAMBIOS_SIN_SINCRONIZAR: false,
  APPLYING_REMOTE: false,
  // Estado de la búsqueda de actualizaciones (electron-updater) — solo en
  // memoria, no se guarda ni se sincroniza; lo llena app.js al recibir
  // eventos del proceso principal.
  UPDATER_STATUS: { status: 'idle' },
  loaded: false
};

// La DPP se calcula con la fórmula de ley (9% sobre lo realmente pagado), sin
// base mínima por trabajador: el 240 USD viejo por defecto se pasa a 0.
function corregirDPPBaseMinima() {
  if (Number(state.CONFIG.dppBaseMinima) === 240) state.CONFIG.dppBaseMinima = 0;
}

// La tasa de interés de prestaciones venía con 20% por defecto, muy por debajo
// de la real del BCV (~47,5%). Quien nunca la tocó se quedó con 20% guardado:
// ese valor exacto se sube a 47,5% (en lo cargado y en lo que llegue de la nube).
function corregirTasaInteres() {
  if (Number(state.CONFIG.tasaInteresAnual) === 20) state.CONFIG.tasaInteresAnual = 47.5;
}

// Las deducciones (IVSS, RPE, FAOV, ISLR) ahora se calculan en cada quincena
// sobre sus 15 días — antes la primera quincena era "anticipo sin
// deducciones" y todo el mes se retenía en la segunda. Se corrige lo ya
// guardado en Configuración (y lo que llegue de la nube) una sola vez.
function corregirTiposNomina() {
  const t = state.CONFIG.tiposNomina;
  if (t && t.primera && t.primera.incluyeDeducciones === false) {
    t.primera.incluyeDeducciones = true;
    if (t.primera.label === 'Primera quincena (1–15) — Anticipo') t.primera.label = 'Primera quincena (1–15)';
  }
  if (t && t.segunda && t.segunda.label === 'Segunda quincena (16–30) — Cierre de mes') t.segunda.label = 'Segunda quincena (16–30)';
}

export async function loadState() {
  const data = await window.api.store.load();
  state.CONFIG = Object.assign(defaultConfig(), data.CONFIG || {});
  corregirNombreEmpresa();
  corregirTasaInteres();
  corregirDPPBaseMinima();
  state.CONFIG.tiposNomina = data.CONFIG && data.CONFIG.tiposNomina
    ? Object.assign(defaultConfig().tiposNomina, data.CONFIG.tiposNomina)
    : defaultConfig().tiposNomina;
  corregirTiposNomina();
  state.EMPLEADOS = data.EMPLEADOS || [];
  state.PERIODOS = data.PERIODOS || [];
  state.VAC_DISFRUTE = data.VAC_DISFRUTE || [];
  state.PERMISOS_REMUNERADOS = data.PERMISOS_REMUNERADOS || [];
  state.UTILIDADES_PAGADAS = data.UTILIDADES_PAGADAS || [];
  state.LIQUIDACIONES = data.LIQUIDACIONES || [];
  state.HISTORICO_TASAS = data.HISTORICO_TASAS || [];
  state.BONO_VAC_PAGADO = data.BONO_VAC_PAGADO || [];
  state.BONO_ALIM_PAGADO = data.BONO_ALIM_PAGADO || [];
  state.HISTORIAL_CAMBIOS = data.HISTORIAL_CAMBIOS || [];
  state.RESPALDOS_AUTO = data.RESPALDOS_AUTO || [];
  state.PARALELA = Object.assign({ pinHash: '', salt: '', pagos: [] }, data.PARALELA || {});
  state.PARALELA_CLAVE = data.PARALELA_CLAVE || '';
  state.SESION_RECORDADA = data.SESION_RECORDADA || null;
  state.SYNC_BASE = data.SYNC_BASE || null;
  state.USUARIOS = data.USUARIOS || [];
  state.ROLES = (data.ROLES && data.ROLES.length) ? data.ROLES : rolesPorDefecto();
  state.PROXIMO_NUMERO_RECIBO = data.PROXIMO_NUMERO_RECIBO || 1;
  if (data.TASA) state.TASA = Object.assign(state.TASA, data.TASA);
  if (state.TASA.fuentes && state.TASA.fuentes.length) {
    state.TASA.fuentes = state.TASA.fuentes.filter((f) => f.fuente !== 'paralelo');
  }
  if (state.TASA.fuente === 'Paralelo') {
    state.TASA.fuente = null; state.TASA.valor = null; state.TASA.manual = false; state.TASA.timestampCache = 0;
  }
  if (data.SYNC) state.SYNC = Object.assign(state.SYNC, data.SYNC);
  state.DISPLAY_CURRENCY = data.DISPLAY_CURRENCY || 'VES';
  state.SIDEBAR_COLLAPSED = !!data.SIDEBAR_COLLAPSED;
  state.CAMBIOS_SIN_SINCRONIZAR = !!data.CAMBIOS_SIN_SINCRONIZAR;
  state.loaded = true;
}

function collectStorageDoc() {
  return {
    CONFIG: state.CONFIG, EMPLEADOS: state.EMPLEADOS, PERIODOS: state.PERIODOS,
    VAC_DISFRUTE: state.VAC_DISFRUTE, PERMISOS_REMUNERADOS: state.PERMISOS_REMUNERADOS,
    UTILIDADES_PAGADAS: state.UTILIDADES_PAGADAS,
    LIQUIDACIONES: state.LIQUIDACIONES, HISTORICO_TASAS: state.HISTORICO_TASAS,
    BONO_VAC_PAGADO: state.BONO_VAC_PAGADO, BONO_ALIM_PAGADO: state.BONO_ALIM_PAGADO,
    HISTORIAL_CAMBIOS: state.HISTORIAL_CAMBIOS, RESPALDOS_AUTO: state.RESPALDOS_AUTO,
    PARALELA: state.PARALELA, PARALELA_CLAVE: state.PARALELA_CLAVE, SESION_RECORDADA: state.SESION_RECORDADA,
    SYNC_BASE: state.SYNC_BASE,
    USUARIOS: state.USUARIOS, ROLES: state.ROLES,
    PROXIMO_NUMERO_RECIBO: state.PROXIMO_NUMERO_RECIBO,
    TASA: state.TASA, SYNC: state.SYNC, CAMBIOS_SIN_SINCRONIZAR: !!state.CAMBIOS_SIN_SINCRONIZAR,
    DISPLAY_CURRENCY: state.DISPLAY_CURRENCY, SIDEBAR_COLLAPSED: state.SIDEBAR_COLLAPSED
  };
}

// Tope simple para que el historial no crezca indefinidamente en el archivo
// guardado — con 300 movimientos sobra para meses de uso normal.
const MAX_HISTORIAL_CAMBIOS = 300;

// Los respaldos SÍ pesan (son los datos completos, no un renglón de texto),
// así que aquí el tope es mucho más chico — alcanza para volver atrás de un
// error reciente, sin que el archivo guardado crezca sin control.
// En el teléfono se guardan menos copias: cada una trae los datos completos y
// el espacio y la velocidad de guardado importan más allí.
export const MAX_RESPALDOS_AUTO = (typeof window !== 'undefined' && window.__esMovil) ? 5 : 25;

function idCorto() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Registra un renglón en el Historial de modificaciones (Configuración →
 * Historial): quién (el nombre puesto en Nube → "Tu nombre", o "Sin nombre"
 * si no se ha puesto), cuándo, y una descripción corta de qué se guardó —
 * y de paso guarda una copia completa de los datos en RESPALDOS_AUTO, para
 * poder "Restaurar a este punto" después. Se llama justo antes de guardar —
 * nunca desde acciones automáticas (tasa del día, sincronización en sí) para
 * no llenar esto de ruido ni de copias innecesarias. */
function registrarCambio(seccion) {
  const id = idCorto();
  const fecha = new Date().toISOString();
  const actor = actorDeSesion() || state.SYNC.actor || 'Sin nombre';
  state.HISTORIAL_CAMBIOS.unshift({ id, fecha, actor, seccion });
  if (state.HISTORIAL_CAMBIOS.length > MAX_HISTORIAL_CAMBIOS) state.HISTORIAL_CAMBIOS.length = MAX_HISTORIAL_CAMBIOS;

  state.RESPALDOS_AUTO.unshift({ id, fecha, actor, seccion, datos: collectFullState() });
  if (state.RESPALDOS_AUTO.length > MAX_RESPALDOS_AUTO) state.RESPALDOS_AUTO.length = MAX_RESPALDOS_AUTO;
}

/** Restaura todos los datos a como estaban justo después de un guardado
 * anterior (un renglón de RESPALDOS_AUTO, identificado por su id). Devuelve
 * false si ese punto ya no está disponible (se venció el tope de copias). */
export async function restaurarRespaldoAuto(id) {
  const snap = state.RESPALDOS_AUTO.find((s) => s.id === id);
  if (!snap) return false;
  const dt = new Date(snap.fecha);
  const fechaTxt = dt.toLocaleDateString('es-VE') + ' ' + dt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

  // Antes de sobrescribir nada, se deja un punto de restauración con el
  // estado actual — así, si la restauración misma fue un error, se puede
  // volver a este mismo momento.
  registrarCambio(`Antes de restaurar a "${snap.seccion}" (${fechaTxt})`);

  const data = snap.datos;
  state.CONFIG = Object.assign(defaultConfig(), data.CONFIG || {});
  corregirNombreEmpresa();
  corregirTasaInteres();
  corregirDPPBaseMinima();
  state.CONFIG.tiposNomina = data.CONFIG && data.CONFIG.tiposNomina
    ? Object.assign(defaultConfig().tiposNomina, data.CONFIG.tiposNomina)
    : defaultConfig().tiposNomina;
  corregirTiposNomina();
  state.EMPLEADOS = data.EMPLEADOS || [];
  state.PERIODOS = data.PERIODOS || [];
  state.VAC_DISFRUTE = data.VAC_DISFRUTE || [];
  state.PERMISOS_REMUNERADOS = data.PERMISOS_REMUNERADOS || [];
  state.UTILIDADES_PAGADAS = data.UTILIDADES_PAGADAS || [];
  state.LIQUIDACIONES = data.LIQUIDACIONES || [];
  state.HISTORICO_TASAS = data.HISTORICO_TASAS || [];
  state.BONO_VAC_PAGADO = data.BONO_VAC_PAGADO || [];
  state.BONO_ALIM_PAGADO = data.BONO_ALIM_PAGADO || [];
  // Nunca hacia atrás — no se reutiliza un N° de recibo ya entregado.
  state.PROXIMO_NUMERO_RECIBO = Math.max(state.PROXIMO_NUMERO_RECIBO || 1, data.PROXIMO_NUMERO_RECIBO || 1);
  await persistAll(`Restaurado a un punto anterior: "${snap.seccion}" (${fechaTxt})`);
  return true;
}

/** Asigna y devuelve el siguiente N° de recibo: correlativo simple (1, 2, 3…),
 * creciente y nunca se repite. Se llama una sola vez por recibo, en el
 * momento de guardarlo en el historial — no al calcularlo/previsualizarlo,
 * para no gastar números con corridas que nunca se confirman. */
export function tomarNumeroRecibo() {
  const n = state.PROXIMO_NUMERO_RECIBO || 1;
  state.PROXIMO_NUMERO_RECIBO = n + 1;
  return String(n);
}

/** Cómo se firma lo que hace el usuario con sesión: su nombre de usuario corto
 * (ej. "Jbaez"), con la inicial en mayúscula. Vacío si no hay sesión. */
export function actorDeSesion() {
  const u = state.SESION && state.SESION.usuario;
  return u ? u.charAt(0).toUpperCase() + u.slice(1) : '';
}

// Tipos de usuario que se crean la primera vez; el master los puede editar o borrar.
// (El tipo "master" es fijo y ve todo — no figura en esta lista.)
export function rolesPorDefecto() {
  return [
    { id: 'admin', nombre: 'Administrador', modulos: ['dashboard', 'empleados', 'nomina', 'parafiscales', 'vacaciones', 'prestaciones', 'liquidacion', 'config'] },
    { id: 'contabilidad', nombre: 'Contabilidad', modulos: ['dashboard', 'nomina', 'parafiscales', 'vacaciones', 'prestaciones', 'liquidacion'] },
    { id: 'consulta', nombre: 'Consulta', modulos: ['dashboard', 'empleados'] }
  ];
}

/** @param {string} [seccion] Descripción corta de qué se guardó (ej. "Ficha
 * editada: Juan Pérez") — si se pasa, queda en el Historial de
 * modificaciones. Se omite en guardados automáticos/internos (tasa del día,
 * la sincronización en sí) para que el historial solo muestre cambios reales. */
export async function persistAll(seccion) {
  if (seccion) registrarCambio(seccion);
  // Se marca ANTES de guardar: así el archivo local recuerda que hay cambios
  // sin subir a la nube, y al abrir la app no se pisan con lo del servidor.
  if (syncConfigured() && !state.APPLYING_REMOTE) marcarCambiosSinSincronizar();
  await window.api.store.save(collectStorageDoc());
  // Aviso para la sincronización automática: hay algo nuevo que subir.
  if (state.CAMBIOS_SIN_SINCRONIZAR && typeof alHaberCambiosFn === 'function') alHaberCambiosFn();
}

/** Marca "esto es lo último que se sincronizó con la nube" (base de la combinación). */
export function fijarBaseSync() {
  state.SYNC_BASE = JSON.parse(JSON.stringify(collectFullState()));
}

let alHaberCambiosFn = null;
/** La sincronización automática se engancha aquí para enterarse de cada cambio local. */
export function alHaberCambios(fn) { alHaberCambiosFn = fn; }

/** Deja una copia completa en "Restaurar a un punto anterior" (Configuración → Historial),
 * por ejemplo antes de sobrescribir algo al resolver un choque de sincronización. */
export function registrarCopia(seccion, datos) {
  const id = idCorto();
  const fecha = new Date().toISOString();
  const actor = actorDeSesion() || state.SYNC.actor || 'Sin nombre';
  state.RESPALDOS_AUTO.unshift({ id, fecha, actor, seccion, datos });
  if (state.RESPALDOS_AUTO.length > MAX_RESPALDOS_AUTO) state.RESPALDOS_AUTO.length = MAX_RESPALDOS_AUTO;
  state.HISTORIAL_CAMBIOS.unshift({ id, fecha, actor, seccion });
  if (state.HISTORIAL_CAMBIOS.length > MAX_HISTORIAL_CAMBIOS) state.HISTORIAL_CAMBIOS.length = MAX_HISTORIAL_CAMBIOS;
}

// Subconjunto que sí se comparte al sincronizar con el equipo (no incluye
// preferencias puramente locales como SYNC o la moneda de visualización).
export function collectFullState() {
  return {
    CONFIG: state.CONFIG, EMPLEADOS: state.EMPLEADOS, PERIODOS: state.PERIODOS,
    VAC_DISFRUTE: state.VAC_DISFRUTE, PERMISOS_REMUNERADOS: state.PERMISOS_REMUNERADOS,
    UTILIDADES_PAGADAS: state.UTILIDADES_PAGADAS,
    LIQUIDACIONES: state.LIQUIDACIONES, HISTORICO_TASAS: state.HISTORICO_TASAS,
    BONO_VAC_PAGADO: state.BONO_VAC_PAGADO, BONO_ALIM_PAGADO: state.BONO_ALIM_PAGADO,
    HISTORIAL_CAMBIOS: state.HISTORIAL_CAMBIOS, PROXIMO_NUMERO_RECIBO: state.PROXIMO_NUMERO_RECIBO,
    USUARIOS: state.USUARIOS, ROLES: state.ROLES
  };
}

export async function applyFullState(data) {
  if (!data) return;
  state.APPLYING_REMOTE = true;
  state.CONFIG = Object.assign(defaultConfig(), data.CONFIG || {});
  corregirNombreEmpresa();
  corregirTasaInteres();
  corregirDPPBaseMinima();
  state.CONFIG.tiposNomina = data.CONFIG && data.CONFIG.tiposNomina
    ? Object.assign(defaultConfig().tiposNomina, data.CONFIG.tiposNomina)
    : defaultConfig().tiposNomina;
  corregirTiposNomina();
  state.EMPLEADOS = data.EMPLEADOS || [];
  state.PERIODOS = data.PERIODOS || [];
  state.VAC_DISFRUTE = data.VAC_DISFRUTE || [];
  state.PERMISOS_REMUNERADOS = data.PERMISOS_REMUNERADOS || [];
  state.UTILIDADES_PAGADAS = data.UTILIDADES_PAGADAS || [];
  state.LIQUIDACIONES = data.LIQUIDACIONES || [];
  state.HISTORICO_TASAS = data.HISTORICO_TASAS || [];
  state.BONO_VAC_PAGADO = data.BONO_VAC_PAGADO || [];
  state.BONO_ALIM_PAGADO = data.BONO_ALIM_PAGADO || [];
  state.HISTORIAL_CAMBIOS = data.HISTORIAL_CAMBIOS || [];
  // Nunca se pisan las cuentas locales con "nada": una versión anterior de la
  // app (o un respaldo viejo) sube el documento sin usuarios.
  if (Array.isArray(data.USUARIOS) && data.USUARIOS.length) state.USUARIOS = data.USUARIOS;
  if (Array.isArray(data.ROLES) && data.ROLES.length) state.ROLES = data.ROLES;
  // Nómina paralela: viene cifrada. Se abre con la clave de este equipo y se
  // combina con la local (nunca se pisa: los pagos se unen por id).
  state.PARALELA_ESTADO = '';
  if (data.PARALELA_CIFRADA) {
    if (!state.PARALELA_CLAVE) {
      state.PARALELA_ESTADO = 'sin-clave';
    } else {
      try {
        const remota = await descifrarParalela(data.PARALELA_CIFRADA, state.PARALELA_CLAVE);
        state.PARALELA = Object.assign(state.PARALELA || {}, combinarParalela(state.PARALELA, remota));
      } catch (e) {
        state.PARALELA_ESTADO = 'clave';
      }
    }
  }
  // El mayor entre lo local y lo remoto — nunca retrocede el correlativo,
  // aunque el otro equipo no lo haya subido en esta sincronización.
  state.PROXIMO_NUMERO_RECIBO = Math.max(state.PROXIMO_NUMERO_RECIBO || 1, data.PROXIMO_NUMERO_RECIBO || 1);
  await persistAll();
  state.APPLYING_REMOTE = false;
}

export function syncConfigured() { return !!(state.SYNC.url && state.SYNC.pin); }
export function marcarCambiosSinSincronizar() { state.CAMBIOS_SIN_SINCRONIZAR = true; }

/* ---------- Tasa de cambio ---------- */
export function getTasaActualValor() {
  return (state.TASA && state.TASA.valor) ? Number(state.TASA.valor) : 1;
}

export function tasaEnFecha(fechaISO) {
  const sorted = state.HISTORICO_TASAS.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  if (!sorted.length) return getTasaActualValor();
  let v = sorted[0].valor;
  for (const h of sorted) {
    if (h.fecha <= fechaISO) v = h.valor; else break;
  }
  return v;
}

export async function registrarTasaHistorica(fechaISO, valor, fuente) {
  if (!valor) return;
  const idx = state.HISTORICO_TASAS.findIndex((h) => h.fecha === fechaISO);
  if (idx >= 0) state.HISTORICO_TASAS[idx] = { fecha: fechaISO, valor, fuente };
  else state.HISTORICO_TASAS.push({ fecha: fechaISO, valor, fuente });
  await persistAll();
}

export async function mergeHistoricoBulk(entradas) {
  const map = new Map(state.HISTORICO_TASAS.map((h) => [h.fecha, h]));
  entradas.forEach((e) => { if (e.fecha && e.valor) map.set(e.fecha, { fecha: e.fecha, valor: e.valor, fuente: e.fuente }); });
  state.HISTORICO_TASAS = Array.from(map.values());
  await persistAll();
  return state.HISTORICO_TASAS.length;
}

export { defaultConfig };
