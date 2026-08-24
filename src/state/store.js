// Estado central de la app (equivalente a las variables globales CONFIG/EMPLEADOS/…
// del archivo original) + persistencia vía IPC en vez de localStorage.

function defaultConfig() {
  return {
    salarioMinimo: 130,          // Bs./mes — salario mínimo legal vigente (Art. 129 LOTTT)
    cestaticket: 0,               // monto mensual del bono de alimentación, NO salarial (Ley Cestaticket)
    cestaticketMoneda: 'USD',     // 'VES' o 'USD' — moneda en que se fija el bono de alimentación
    ivssTrabajador: 4,            // % fijo, Art. 66 Ley del Seguro Social
    ivssPatrono: 9,                // % según riesgo: 9 mínimo / 10 medio / 11 máximo (LOPCYMAT)
    ivssTopeSalariosMinimos: 5,   // tope de cotización = 5 salarios mínimos
    faovTrabajador: 1,            // % sobre salario integral (Ley Régimen Prestacional de Vivienda y Hábitat)
    faovPatrono: 2,
    incesTrabajador: 0.5,         // % sobre utilidades únicamente
    incesPatrono: 2,              // % trimestral sobre nómina total (no se descuenta al trabajador salvo utilidades)
    rpeTrabajador: 0.5,           // % Régimen Prestacional de Empleo (paro forzoso)
    rpePatrono: 2,
    dppPatrono: 9,                 // % Ley de Protección de las Pensiones de la Seguridad Social (Gaceta
                                    // Extraordinaria 6.806, 08-05-2024) — "DPP", recaudada por el SENIAT.
                                    // 100% patronal, hasta 15% permitido por ley (SENIAT la fijó en 9%).
                                    // Base: total de pagos de nómina del mes (salario + bono de
                                    // alimentación y demás bonificaciones no salariales). Verifique la
                                    // alícuota vigente en el portal del SENIAT antes de declarar.
    dppBaseMinima: 240,             // Base mínima de cálculo POR TRABAJADOR (Art. 7 Ley DPP): si lo que
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
    tasaInteresAnual: 20,         // % anual estimado (BCV promedio activa/pasiva) — editable por el usuario
    nombreEmpresa: 'Centro de Atención Médica Inmediata de Salud, C.A. (CAMIS)',
    rif: 'J-502185640',
    tiposNomina: {
      primera: {
        label: 'Primera quincena (1–15) — Anticipo',
        diasSueldo: 15,
        incluyeCestaticket: false,
        incluyeDeducciones: false
      },
      segunda: {
        label: 'Segunda quincena (16–30) — Cierre de mes',
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
  TASA: { valor: null, fuente: null, fechaActualizacion: null, manual: false, timestampCache: 0, fuentes: [] },
  SYNC: { url: '', pin: '', actor: '', lastSyncedAt: null, lastUpdatedBy: null, status: 'sin-configurar' },
  DISPLAY_CURRENCY: 'VES',
  CAMBIOS_SIN_SINCRONIZAR: false,
  APPLYING_REMOTE: false,
  // Estado de la búsqueda de actualizaciones (electron-updater) — solo en
  // memoria, no se guarda ni se sincroniza; lo llena app.js al recibir
  // eventos del proceso principal.
  UPDATER_STATUS: { status: 'idle' },
  loaded: false
};

export async function loadState() {
  const data = await window.api.store.load();
  state.CONFIG = Object.assign(defaultConfig(), data.CONFIG || {});
  state.CONFIG.tiposNomina = data.CONFIG && data.CONFIG.tiposNomina
    ? Object.assign(defaultConfig().tiposNomina, data.CONFIG.tiposNomina)
    : defaultConfig().tiposNomina;
  state.EMPLEADOS = data.EMPLEADOS || [];
  state.PERIODOS = data.PERIODOS || [];
  state.VAC_DISFRUTE = data.VAC_DISFRUTE || [];
  state.PERMISOS_REMUNERADOS = data.PERMISOS_REMUNERADOS || [];
  state.UTILIDADES_PAGADAS = data.UTILIDADES_PAGADAS || [];
  state.LIQUIDACIONES = data.LIQUIDACIONES || [];
  state.HISTORICO_TASAS = data.HISTORICO_TASAS || [];
  state.BONO_VAC_PAGADO = data.BONO_VAC_PAGADO || [];
  if (data.TASA) state.TASA = Object.assign(state.TASA, data.TASA);
  if (state.TASA.fuentes && state.TASA.fuentes.length) {
    state.TASA.fuentes = state.TASA.fuentes.filter((f) => f.fuente !== 'paralelo');
  }
  if (state.TASA.fuente === 'Paralelo') {
    state.TASA.fuente = null; state.TASA.valor = null; state.TASA.manual = false; state.TASA.timestampCache = 0;
  }
  if (data.SYNC) state.SYNC = Object.assign(state.SYNC, data.SYNC);
  state.DISPLAY_CURRENCY = data.DISPLAY_CURRENCY || 'VES';
  state.loaded = true;
}

function collectStorageDoc() {
  return {
    CONFIG: state.CONFIG, EMPLEADOS: state.EMPLEADOS, PERIODOS: state.PERIODOS,
    VAC_DISFRUTE: state.VAC_DISFRUTE, PERMISOS_REMUNERADOS: state.PERMISOS_REMUNERADOS,
    UTILIDADES_PAGADAS: state.UTILIDADES_PAGADAS,
    LIQUIDACIONES: state.LIQUIDACIONES, HISTORICO_TASAS: state.HISTORICO_TASAS,
    BONO_VAC_PAGADO: state.BONO_VAC_PAGADO, TASA: state.TASA, SYNC: state.SYNC,
    DISPLAY_CURRENCY: state.DISPLAY_CURRENCY
  };
}

export async function persistAll() {
  await window.api.store.save(collectStorageDoc());
  if (syncConfigured() && !state.APPLYING_REMOTE) marcarCambiosSinSincronizar();
}

// Subconjunto que sí se comparte al sincronizar con el equipo (no incluye
// preferencias puramente locales como SYNC o la moneda de visualización).
export function collectFullState() {
  return {
    CONFIG: state.CONFIG, EMPLEADOS: state.EMPLEADOS, PERIODOS: state.PERIODOS,
    VAC_DISFRUTE: state.VAC_DISFRUTE, PERMISOS_REMUNERADOS: state.PERMISOS_REMUNERADOS,
    UTILIDADES_PAGADAS: state.UTILIDADES_PAGADAS,
    LIQUIDACIONES: state.LIQUIDACIONES, HISTORICO_TASAS: state.HISTORICO_TASAS,
    BONO_VAC_PAGADO: state.BONO_VAC_PAGADO
  };
}

export async function applyFullState(data) {
  if (!data) return;
  state.APPLYING_REMOTE = true;
  state.CONFIG = Object.assign(defaultConfig(), data.CONFIG || {});
  state.CONFIG.tiposNomina = data.CONFIG && data.CONFIG.tiposNomina
    ? Object.assign(defaultConfig().tiposNomina, data.CONFIG.tiposNomina)
    : defaultConfig().tiposNomina;
  state.EMPLEADOS = data.EMPLEADOS || [];
  state.PERIODOS = data.PERIODOS || [];
  state.VAC_DISFRUTE = data.VAC_DISFRUTE || [];
  state.PERMISOS_REMUNERADOS = data.PERMISOS_REMUNERADOS || [];
  state.UTILIDADES_PAGADAS = data.UTILIDADES_PAGADAS || [];
  state.LIQUIDACIONES = data.LIQUIDACIONES || [];
  state.HISTORICO_TASAS = data.HISTORICO_TASAS || [];
  state.BONO_VAC_PAGADO = data.BONO_VAC_PAGADO || [];
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
