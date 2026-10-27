// Feriados de ley de Venezuela (Art. 184 LOTTT). Puros: no tocan el estado.
// Los fijos son los de siempre; Carnaval y Semana Santa se calculan a partir de
// la Pascua de cada año. Lo que decrete el Ejecutivo (días no laborables, puentes)
// se agrega a mano en Configuración → Calendario.

function pascua(y) {
  const a = y % 19; const b = Math.floor(y / 100); const c = y % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia);
}

export const isoFecha = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sumarDias = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

/** Feriados de ley del año: [{ id, fecha, nombre, tipo: 'ley' }]. */
export function feriadosDeLey(y) {
  const E = pascua(y);
  const lista = [
    [`${y}-01-01`, 'Año Nuevo'],
    [isoFecha(sumarDias(E, -48)), 'Lunes de Carnaval'],
    [isoFecha(sumarDias(E, -47)), 'Martes de Carnaval'],
    [isoFecha(sumarDias(E, -3)), 'Jueves Santo'],
    [isoFecha(sumarDias(E, -2)), 'Viernes Santo'],
    [`${y}-04-19`, 'Declaración de la Independencia'],
    [`${y}-05-01`, 'Día del Trabajador'],
    [`${y}-06-24`, 'Batalla de Carabobo'],
    [`${y}-07-05`, 'Día de la Independencia'],
    [`${y}-07-24`, 'Natalicio del Libertador'],
    [`${y}-10-12`, 'Día de la Resistencia Indígena'],
    [`${y}-12-24`, 'Nochebuena'],
    [`${y}-12-25`, 'Navidad'],
    [`${y}-12-31`, 'Fin de año']
  ];
  return lista.map(([fecha, nombre]) => ({ id: 'f-' + fecha, fecha, nombre, tipo: 'ley' }));
}

export const TIPOS_FERIADO = {
  ley: 'Feriado de ley',
  decreto: 'No laborable decretado',
  empresa: 'Día de la empresa'
};
