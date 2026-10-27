// Días hábiles de un trabajador para contar vacaciones (Art. 190 LOTTT: 15 días
// HÁBILES). Un día es hábil si cae en un día laborable de SU semana (ficha →
// "Días laborables", por defecto lunes a viernes) y no es feriado ni día no
// laborable decretado (Configuración → Calendario).
import { feriadosDelAno } from './calendarioPagos.js';
import { isoFecha } from './feriados.js';

const NOMBRES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const LEGIBLE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const sinAcentos = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** "lunes a viernes", "lunes a sábado", "lunes, martes y jueves" → conjunto de días (0=domingo). */
export function diasLaborablesSemana(texto) {
  const t = sinAcentos(texto);
  const idx = (n) => NOMBRES.indexOf(n);
  const set = new Set();
  const rango = t.match(/(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\s+(?:a|al|hasta)\s+(domingo|lunes|martes|miercoles|jueves|viernes|sabado)/);
  if (rango) {
    let i = idx(rango[1]); const fin = idx(rango[2]);
    for (let k = 0; k < 7; k++) { set.add(i); if (i === fin) break; i = (i + 1) % 7; }
  } else {
    NOMBRES.forEach((n, i) => { if (t.includes(n)) set.add(i); });
  }
  if (!set.size) [1, 2, 3, 4, 5].forEach((i) => set.add(i));
  return set;
}

function motivoNoHabil(emp, d, laborables) {
  if (!laborables.has(d.getDay())) return { tipo: 'descanso', motivo: LEGIBLE[d.getDay()] };
  const f = feriadosDelAno(d.getFullYear())[isoFecha(d)];
  if (f) return { tipo: 'feriado', motivo: f };
  return null;
}

export function esDiaHabilEmp(emp, fechaISO) {
  const d = new Date(fechaISO + 'T00:00:00');
  return !motivoNoHabil(emp, d, diasLaborablesSemana(emp.diasLaborables));
}

/**
 * Cuenta `dias` días hábiles a partir de `inicioISO` (el día de inicio cuenta si
 * es hábil). Devuelve el último día de disfrute, la fecha de reincorporación
 * (siguiente día hábil) y los días no hábiles que quedaron dentro del período.
 */
export function calcularDisfrute(emp, inicioISO, dias) {
  const laborables = diasLaborablesSemana(emp.diasLaborables);
  const d = new Date(inicioISO + 'T00:00:00');
  const omitidos = [];
  let contados = 0; let ultimo = null;
  let guarda = 0;
  while (contados < dias && guarda++ < 800) {
    const m = motivoNoHabil(emp, d, laborables);
    if (m) omitidos.push({ fecha: isoFecha(d), ...m });
    else { contados += 1; ultimo = isoFecha(d); }
    if (contados < dias) d.setDate(d.getDate() + 1);
  }
  // Reintegro: siguiente día hábil después del último día de disfrute.
  const r = new Date((ultimo || inicioISO) + 'T00:00:00');
  r.setDate(r.getDate() + 1);
  let g2 = 0;
  while (motivoNoHabil(emp, r, laborables) && g2++ < 60) r.setDate(r.getDate() + 1);
  return { inicio: inicioISO, fin: ultimo, reintegro: isoFecha(r), omitidos, laborables: Array.from(laborables).sort() };
}
