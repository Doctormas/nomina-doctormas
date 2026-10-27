// Configuración → Calendario: feriados de ley y días no laborables decretados.
// De aquí salen las fechas de pago de la nómina (si el 15 o el fin de mes cae
// en fin de semana o en uno de estos días, se paga el día hábil anterior), el
// calendario del Resumen y los avisos de cierre de quincena.
import { state, persistAll } from '../state/store.js';
import { feriadosDeLey, TIPOS_FERIADO } from '../lib/feriados.js';
import { fechaPagoQuincena, MESES } from '../lib/calendarioPagos.js';
import { fmtDate, uid } from '../lib/formato.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/confirm.js';

const esc = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

let ANO = new Date().getFullYear();

function diaSemana(fechaISO) {
  return DIAS[new Date(fechaISO + 'T00:00:00').getDay()];
}

function lista(ano) {
  return (state.CONFIG.feriados || [])
    .filter((f) => f.fecha && f.fecha.slice(0, 4) === String(ano))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

export function calendarioHTML() {
  const actual = new Date().getFullYear();
  const anos = Array.from(new Set([actual - 1, actual, actual + 1, actual + 2, ANO])).sort();
  const filas = lista(ANO).map((f) => `<tr>
    <td>${fmtDate(f.fecha)}</td>
    <td style="text-transform:capitalize;">${diaSemana(f.fecha)}</td>
    <td>${esc(f.nombre)}</td>
    <td><span class="tag ${f.tipo === 'ley' ? 'ok' : 'warn'}">${esc(TIPOS_FERIADO[f.tipo] || 'Otro')}</span></td>
    <td><button type="button" class="btn ghost small danger" data-fer-del="${esc(f.id)}">Quitar</button></td>
  </tr>`).join('');

  // Fechas de pago resultantes del año, para ver el efecto del calendario.
  const pagos = [];
  for (let m = 1; m <= 12; m++) {
    pagos.push(`<tr><td style="text-transform:capitalize;">${MESES[m - 1]}</td>
      <td>${fmtDate(fechaPagoQuincena(ANO, m, 1))}</td><td>${fmtDate(fechaPagoQuincena(ANO, m, 2))}</td></tr>`);
  }

  return `
  <div class="card">
    <h2>Calendario laboral</h2>
    <div class="desc">Feriados de ley y días no laborables. El sistema carga solo los feriados de ley del año actual y del siguiente; usted agrega aquí cualquier día que se decrete no laborable, o uno propio de la empresa. <b>De aquí salen las fechas de pago:</b> si el 15 o el fin de mes cae en fin de semana o en uno de estos días, la nómina se paga el día hábil anterior (se ve en el Resumen y en los avisos de cierre). El cálculo del sueldo en sí no cambia: el mes siempre es de 30 días.</div>
    <div class="grid cols-4" style="align-items:end;">
      <div class="field"><label>Año</label>
        <select id="calAno">${anos.map((a) => `<option value="${a}" ${a === ANO ? 'selected' : ''}>${a}</option>`).join('')}</select>
      </div>
      <div class="field"><button type="button" class="btn ghost" id="btnCalRestaurar">Cargar los feriados de ley de ${ANO}</button></div>
    </div>
    <div class="table-wrap" style="margin-top:12px;">
      <table>
        <thead><tr><th>Fecha</th><th>Día</th><th>Descripción</th><th>Tipo</th><th></th></tr></thead>
        <tbody>${filas || `<tr class="empty-row"><td colspan="5">No hay días cargados en ${ANO}.</td></tr>`}</tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <h2>Agregar un día</h2>
    <div class="grid cols-4" style="align-items:end;">
      <div class="field"><label>Fecha</label><input type="date" id="calFecha" value="${ANO}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01"></div>
      <div class="field"><label>Descripción</label><input type="text" id="calNombre" placeholder="Ej. Día no laborable decretado"></div>
      <div class="field"><label>Tipo</label>
        <select id="calTipo">
          <option value="decreto">${TIPOS_FERIADO.decreto}</option>
          <option value="empresa">${TIPOS_FERIADO.empresa}</option>
          <option value="ley">${TIPOS_FERIADO.ley}</option>
        </select>
      </div>
      <div class="field"><button type="button" class="btn" id="btnCalAgregar">+ Agregar al calendario</button></div>
    </div>
  </div>

  <div class="card">
    <h2>Fechas de pago de ${ANO}</h2>
    <div class="desc">Resultado del calendario: 1ª quincena (el 15) y 2ª quincena (fin de mes), ya ajustadas por fines de semana y por los días de arriba.</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Mes</th><th>1ª quincena</th><th>2ª quincena</th></tr></thead>
      <tbody>${pagos.join('')}</tbody>
    </table></div>
  </div>`;
}

export function wireCalendario(root, rerender) {
  const q = (s) => root.querySelector(s);

  q('#calAno').addEventListener('change', (e) => { ANO = Number(e.target.value); rerender(); });

  q('#btnCalRestaurar').addEventListener('click', async () => {
    const c = state.CONFIG;
    const existentes = new Set((c.feriados || []).map((f) => f.fecha));
    let n = 0;
    feriadosDeLey(ANO).forEach((f) => { if (!existentes.has(f.fecha)) { c.feriados.push(f); n += 1; } });
    if (!c.feriadosAnos.includes(ANO)) c.feriadosAnos.push(ANO);
    await persistAll(`Calendario laboral: feriados de ley de ${ANO}`);
    toast(n ? `Se cargaron ${n} feriado(s) de ley de ${ANO}.` : `Ya estaban todos los feriados de ley de ${ANO}.`, 'success');
    rerender();
  });

  q('#btnCalAgregar').addEventListener('click', async () => {
    const fecha = q('#calFecha').value;
    const nombre = q('#calNombre').value.trim();
    const tipo = q('#calTipo').value;
    if (!fecha || !nombre) { toast('Indique la fecha y la descripción.', 'error'); return; }
    const c = state.CONFIG;
    if ((c.feriados || []).some((f) => f.fecha === fecha)) { toast('Ese día ya está en el calendario.', 'error'); return; }
    const ano = Number(fecha.slice(0, 4));
    c.feriados.push({ id: 'u-' + uid(), fecha, nombre, tipo });
    // Al agregar un día de un año aún no sembrado, ese año pasa a usar la lista configurada.
    if (!c.feriadosAnos.includes(ano)) {
      feriadosDeLey(ano).forEach((f) => { if (!c.feriados.some((x) => x.fecha === f.fecha)) c.feriados.push(f); });
      c.feriadosAnos.push(ano);
    }
    ANO = ano;
    await persistAll(`Calendario laboral: se agregó ${fecha} (${nombre})`);
    toast('Día agregado al calendario.', 'success');
    rerender();
  });

  root.querySelectorAll('[data-fer-del]').forEach((b) => b.addEventListener('click', async () => {
    const c = state.CONFIG;
    const f = (c.feriados || []).find((x) => x.id === b.dataset.ferDel);
    if (!f) return;
    const ok = await confirmDialog({ title: 'Quitar del calendario', message: `Se quitará <b>${esc(f.nombre)}</b> (${fmtDate(f.fecha)}). Las fechas de pago se recalculan.`, confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    c.feriados = c.feriados.filter((x) => x.id !== f.id);
    await persistAll(`Calendario laboral: se quitó ${f.fecha} (${f.nombre})`);
    rerender();
  }));
}
