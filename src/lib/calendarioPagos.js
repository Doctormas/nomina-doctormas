// Calendario de pagos de la nómina: 1ª quincena el día 15 y 2ª quincena el
// último día del mes; si cae sábado, domingo o feriado, se paga el día hábil
// anterior. Los feriados nacionales fijos son los de siempre; Carnaval y
// Semana Santa se calculan a partir de la Pascua de cada año.

import { state } from '../state/store.js';
import { feriadosDeLey, isoFecha } from './feriados.js';

const iso = isoFecha;
const sumarDias = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

/**
 * Feriados y días no laborables de un año: { 'AAAA-MM-DD': nombre }.
 * Salen de Configuración → Calendario (que el sistema siembra con los feriados
 * de ley y el usuario completa con lo que se decrete). Si ese año aún no está
 * cargado en la configuración, se usan los de ley.
 */
export function feriadosDelAno(y) {
  const cfg = state.CONFIG || {};
  const cargado = Array.isArray(cfg.feriadosAnos) && cfg.feriadosAnos.includes(y);
  const lista = cargado
    ? (cfg.feriados || []).filter((f) => f.fecha && f.fecha.slice(0, 4) === String(y))
    : feriadosDeLey(y);
  const mapa = {};
  lista.forEach((f) => { mapa[f.fecha] = f.nombre; });
  return mapa;
}

export function esDiaHabil(d) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !feriadosDelAno(d.getFullYear())[iso(d)];
}

/** Fecha de pago de la quincena q (1 o 2) del mes (1-12) del año. */
export function fechaPagoQuincena(ano, mes, q) {
  let d = q === 1 ? new Date(ano, mes - 1, 15) : new Date(ano, mes, 0);
  while (!esDiaHabil(d)) d = sumarDias(d, -1);
  return iso(d);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Pagos del calendario en torno a hoy: los ya vencidos en los últimos
 * `diasAtras` días y los próximos hasta cubrir `cuantos` eventos futuros.
 * Cada uno: { fecha, ano, mes, q, tipoPeriodo, titulo, corta }.
 */
export function pagosAlrededor(hoyISO, cuantos, diasAtras) {
  const hoy = new Date(hoyISO + 'T00:00:00');
  const desde = sumarDias(hoy, -(diasAtras || 20));
  const lista = [];
  for (let k = -1; k <= 4; k++) {
    const base = new Date(hoy.getFullYear(), hoy.getMonth() + k, 1);
    const a = base.getFullYear(); const m = base.getMonth() + 1;
    [1, 2].forEach((q) => {
      const fecha = fechaPagoQuincena(a, m, q);
      lista.push({
        fecha, ano: a, mes: m, q, tipoPeriodo: q === 1 ? 'primera' : 'segunda',
        titulo: `${q === 1 ? '1ª' : '2ª'} quincena de ${MESES[m - 1]}`,
        corta: `${q === 1 ? '1ª' : '2ª'} quincena`
      });
    });
    if (m === 12) {
      lista.push({
        fecha: fechaPagoQuincena(a, 12, 1), ano: a, mes: 12, q: 0, tipoPeriodo: 'utilidades',
        titulo: 'Utilidades y bono vacacional', corta: 'Utilidades'
      });
    }
  }
  const dEsde = iso(desde);
  const vistos = new Set();
  const ordenada = lista.filter((p) => p.fecha >= dEsde).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.q - b.q));
  const out = [];
  let futuros = 0;
  for (const p of ordenada) {
    const clave = p.fecha + p.tipoPeriodo;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    if (p.fecha >= hoyISO) { if (futuros >= cuantos) break; futuros += 1; }
    out.push(p);
  }
  return out;
}

export { MESES };
