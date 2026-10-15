// Calendario de pagos de la nómina: 1ª quincena el día 15 y 2ª quincena el
// último día del mes; si cae sábado, domingo o feriado, se paga el día hábil
// anterior. Los feriados nacionales fijos son los de siempre; Carnaval y
// Semana Santa se calculan a partir de la Pascua de cada año.

function pascua(y) {
  const a = y % 19; const b = Math.floor(y / 100); const c = y % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia);
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sumarDias = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

const CACHE = {};
export function feriadosDelAno(y) {
  if (CACHE[y]) return CACHE[y];
  const E = pascua(y);
  const mapa = {};
  const poner = (fecha, nombre) => { mapa[typeof fecha === 'string' ? fecha : iso(fecha)] = nombre; };
  poner(`${y}-01-01`, 'Año Nuevo');
  poner(sumarDias(E, -48), 'Lunes de Carnaval');
  poner(sumarDias(E, -47), 'Martes de Carnaval');
  poner(sumarDias(E, -3), 'Jueves Santo');
  poner(sumarDias(E, -2), 'Viernes Santo');
  poner(`${y}-04-19`, 'Declaración de la Independencia');
  poner(`${y}-05-01`, 'Día del Trabajador');
  poner(`${y}-06-24`, 'Batalla de Carabobo');
  poner(`${y}-07-05`, 'Día de la Independencia');
  poner(`${y}-07-24`, 'Natalicio del Libertador');
  poner(`${y}-10-12`, 'Día de la Resistencia Indígena');
  poner(`${y}-12-24`, 'Nochebuena');
  poner(`${y}-12-25`, 'Navidad');
  poner(`${y}-12-31`, 'Fin de año');
  CACHE[y] = mapa;
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
