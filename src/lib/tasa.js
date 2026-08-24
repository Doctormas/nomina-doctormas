// Tasa de cambio (fuente oficial BCV vía ve.dolarapi.com) — misma lógica y
// mismos endpoints del archivo original, adaptados al store nuevo.
import { state, registrarTasaHistorica, mergeHistoricoBulk, persistAll } from '../state/store.js';
import { todayStr } from './formato.js';

const TASA_CACHE_MS = 15 * 60 * 1000; // 15 minutos

export async function fetchTasaActualDeFuente(fuenteId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://ve.dolarapi.com/v1/dolares?_=' + Date.now(), { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data.find((d) => d.fuente === fuenteId);
    if (!f) return null;
    const valor = f.venta || f.promedio;
    return valor ? { valor, fuente: f.nombre || fuenteId } : null;
  } catch (err) { return null; }
}

export async function fetchTasaPorFecha(fechaISO, fuenteId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const fechaApi = fechaISO.replace(/-/g, '/');
    const res = await fetch(`https://ve.dolarapi.com/v1/historicos/dolares/${fechaApi}?_=${Date.now()}`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    const d = data.find((x) => x.fuente === fuenteId);
    if (!d) return null;
    const valor = d.venta || d.promedio;
    return valor ? { fecha: fechaISO, valor, fuente: d.fuente || fuenteId } : null;
  } catch (err) { return null; }
}

export async function importarHistoricoCompleto(fuenteId, nombreFuente, desde, hasta) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const res = await fetch(`https://ve.dolarapi.com/v1/historicos/dolares/${fuenteId}?_=${Date.now()}`, { signal: controller.signal, cache: 'no-store' });
  clearTimeout(timeout);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  let entradas = data.map((d) => ({ fecha: (d.fecha || '').slice(0, 10), valor: d.venta || d.promedio, fuente: nombreFuente }));
  if (desde) entradas = entradas.filter((e) => e.fecha >= desde);
  if (hasta) entradas = entradas.filter((e) => e.fecha <= hasta);

  const hoy = todayStr();
  const topeSuperior = (hasta && hasta < hoy) ? hasta : hoy;
  const fechasConDato = new Set(entradas.map((e) => e.fecha));
  const faltantes = [];
  let cursor = new Date(topeSuperior + 'T00:00:00');
  for (let i = 0; i < 30; i++) {
    const fISO = cursor.toISOString().slice(0, 10);
    if (desde && fISO < desde) break;
    if (!fechasConDato.has(fISO)) faltantes.push(fISO);
    cursor.setDate(cursor.getDate() - 1);
  }

  if (faltantes.includes(hoy)) {
    const actual = await fetchTasaActualDeFuente(fuenteId);
    if (actual) { entradas.push({ fecha: hoy, valor: actual.valor, fuente: nombreFuente }); fechasConDato.add(hoy); }
  }
  const otrosFaltantes = faltantes.filter((f) => f !== hoy && !fechasConDato.has(f));
  if (otrosFaltantes.length) {
    const resultados = await Promise.all(otrosFaltantes.map((f) => fetchTasaPorFecha(f, fuenteId)));
    resultados.forEach((r, i) => { if (r) { entradas.push({ ...r, fuente: nombreFuente }); fechasConDato.add(otrosFaltantes[i]); } });
  }

  const total = await mergeHistoricoBulk(entradas);
  const sinCompletar = faltantes.filter((f) => !fechasConDato.has(f));
  return { total, sinCompletar };
}

/**
 * Trae las tasas del día desde todas las fuentes y actualiza state.TASA.
 * @param {boolean} force - ignora la caché de 15 minutos.
 * @param {(status:string)=>void} onStatus - callback opcional para reflejar el estado en la UI.
 */
export async function fetchTasaBCV(force, onStatus) {
  const now = Date.now();
  if (!force && state.TASA.timestampCache && (now - state.TASA.timestampCache) < TASA_CACHE_MS && state.TASA.fuentes && state.TASA.fuentes.length) {
    if (onStatus) onStatus('cache');
    return state.TASA;
  }
  if (onStatus) onStatus('loading');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://ve.dolarapi.com/v1/dolares?_=' + Date.now(), { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.TASA.fuentes = data.map((d) => ({
      fuente: d.fuente, nombre: d.nombre || d.fuente, compra: d.compra, venta: d.venta,
      promedio: d.promedio, fechaActualizacion: d.fechaActualizacion
    })).filter((f) => f.fuente !== 'paralelo');
    state.TASA.timestampCache = now;
    if (!state.TASA.manual) {
      const oficial = state.TASA.fuentes.find((f) => f.fuente === 'oficial') || state.TASA.fuentes[0];
      if (oficial) {
        state.TASA.valor = oficial.venta || oficial.promedio;
        state.TASA.fuente = oficial.nombre;
        state.TASA.fechaActualizacion = oficial.fechaActualizacion;
      }
    }
    await persistAll();
    if (onStatus) onStatus('online');
    await registrarTasaHistorica(todayStr(), state.TASA.valor, state.TASA.fuente);
  } catch (err) {
    if (onStatus) onStatus(state.TASA.valor ? 'cache-fail' : 'offline');
  }
  return state.TASA;
}
