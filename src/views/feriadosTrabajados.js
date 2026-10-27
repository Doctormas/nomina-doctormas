// Nómina → Feriados trabajados: días en que un trabajador laboró en feriado, en
// día de descanso o en un día decretado no laborable (Art. 119-120 LOTTT). Cada
// día se paga ADEMÁS del sueldo, con recargo, en la nómina de su quincena.
import { state, persistAll } from '../state/store.js';
import { salarioVigente, factorFeriadoTrabajado } from '../lib/calculos.js';
import { feriadosDelAno } from '../lib/calendarioPagos.js';
import { diasLaborablesSemana } from '../lib/diasHabiles.js';
import { fmt } from '../lib/moneda.js';
import { fmtDate, todayStr, uid } from '../lib/formato.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/confirm.js';
import { estadoDe } from './empleados.js';

const esc = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TIPOS = { feriado: 'Feriado', descanso: 'Día de descanso', decreto: 'No laborable decretado' };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
let MES = todayStr().slice(0, 7);

/** ¿Qué día es esa fecha para este trabajador? { tipo, texto } o null si es un día hábil normal. */
export function clasificarDia(emp, fechaISO) {
  if (!fechaISO) return null;
  const d = new Date(fechaISO + 'T00:00:00');
  const fer = feriadosDelAno(d.getFullYear())[fechaISO];
  if (fer) {
    const f = (state.CONFIG.feriados || []).find((x) => x.fecha === fechaISO);
    return { tipo: f && f.tipo !== 'ley' ? 'decreto' : 'feriado', texto: fer };
  }
  const lab = diasLaborablesSemana(emp && emp.diasLaborables);
  if (!lab.has(d.getDay())) return { tipo: 'descanso', texto: `${DIAS[d.getDay()]} (día de descanso de este trabajador)` };
  return null;
}

function periodoGuardado(emp, fecha) {
  return state.PERIODOS.some((p) => p.empId === emp.id && p.resultado && p.resultado.periodoDesde && fecha >= p.resultado.periodoDesde && fecha <= p.resultado.periodoHasta);
}

export function feriadosTrabajadosHTML() {
  const activos = state.EMPLEADOS.filter((e) => estadoDe(e) === 'activo');
  const factor = factorFeriadoTrabajado();
  const filas = (state.FERIADOS_TRABAJADOS || [])
    .filter((r) => r.fecha.slice(0, 7) === MES)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map((r) => {
      const emp = state.EMPLEADOS.find((e) => e.id === r.empId);
      const monto = emp ? (salarioVigente(emp, r.fecha) / 30) * factor : 0;
      const guardada = emp && periodoGuardado(emp, r.fecha);
      return `<tr>
        <td>${esc(emp ? emp.nombre : '—')}</td>
        <td>${fmtDate(r.fecha)}</td>
        <td>${esc(TIPOS[r.tipo] || r.tipo)}${r.nota ? `<div class="legal">${esc(r.nota)}</div>` : ''}</td>
        <td>${fmt(monto, r.fecha)}</td>
        <td>${guardada ? '<span class="tag warn">La quincena ya está guardada: regenérela</span>' : '<span class="tag ok">Va en la próxima nómina</span>'}</td>
        <td><button type="button" class="btn ghost small danger" data-fer-trab-del="${esc(r.id)}">Quitar</button></td>
      </tr>`;
    }).join('');

  return `
  <div class="card">
    <h2>Feriados y descansos trabajados</h2>
    <div class="desc">Registre aquí los días que un trabajador laboró en un <b>feriado</b>, en su <b>día de descanso</b> o en un día <b>decretado no laborable</b> (Art. 119-120 LOTTT). Cada día se paga <b>además del sueldo</b> — que ya cubre esos días — con su salario normal del día × <b>${String(factor).replace('.', ',')}</b> (recargo de ${Number(state.CONFIG.feriadoTrabajadoRecargoPct ?? 50)}%${state.CONFIG.feriadoTrabajadoPagaDia === false ? ', sin pagar el día base' : ' más el día trabajado'}), y entra en la nómina de la quincena que contiene esa fecha. Es salarial: suma a las deducciones. El factor se ajusta en Configuración → Parámetros.</div>
    <div class="grid cols-4" style="align-items:end;">
      <div class="field"><label>Empleado</label><select id="ferTrabEmp">${activos.map((e) => `<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('')}</select></div>
      <div class="field"><label>Fecha trabajada</label><input type="date" id="ferTrabFecha" value="${todayStr()}"></div>
      <div class="field"><label>Tipo de día</label>
        <select id="ferTrabTipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Nota (opcional)</label><input type="text" id="ferTrabNota" placeholder="Ej. guardia de emergencia"></div>
    </div>
    <div class="note" id="ferTrabAviso" style="margin-top:10px;"></div>
    <div class="btn-row" style="margin-top:10px;"><button class="btn" id="btnFerTrabAgregar">Registrar día trabajado</button></div>
  </div>

  <div class="card">
    <h2>Registrados</h2>
    <div class="field" style="max-width:220px;margin-bottom:10px;"><label>Mes</label><input type="month" id="ferTrabMes" value="${MES}"></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Trabajador</th><th>Fecha</th><th>Tipo</th><th>Monto a pagar</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filas || '<tr class="empty-row"><td colspan="6">Sin días registrados en este mes.</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

export function wireFeriadosTrabajados(root, rerender) {
  const q = (s) => root.querySelector(s);
  const emp = () => state.EMPLEADOS.find((e) => e.id === q('#ferTrabEmp').value);

  const actualizarAviso = () => {
    const e = emp(); const fecha = q('#ferTrabFecha').value;
    const aviso = q('#ferTrabAviso');
    if (!e || !fecha) { aviso.innerHTML = ''; return; }
    const c = clasificarDia(e, fecha);
    const monto = (salarioVigente(e, fecha) / 30) * factorFeriadoTrabajado();
    if (c) {
      q('#ferTrabTipo').value = c.tipo;
      aviso.innerHTML = `<b>${esc(c.texto)}</b> — se pagarán <b>${fmt(monto, fecha)}</b> adicionales por ese día.`;
    } else {
      aviso.innerHTML = `Ese día es <b>hábil</b> para ${esc(e.nombre)} (ni feriado ni descanso): no corresponde recargo. Si fue un día decretado no laborable, agréguelo antes en Configuración → Calendario.`;
    }
  };
  ['#ferTrabEmp', '#ferTrabFecha'].forEach((s) => { const el = q(s); if (el) { el.addEventListener('change', actualizarAviso); } });
  actualizarAviso();

  q('#ferTrabMes').addEventListener('change', (e) => { MES = e.target.value || MES; rerender(); });

  q('#btnFerTrabAgregar').addEventListener('click', async () => {
    const e = emp(); const fecha = q('#ferTrabFecha').value;
    if (!e || !fecha) { toast('Elija el empleado y la fecha.', 'error'); return; }
    if (fecha < e.fechaIngreso) { toast('Esa fecha es anterior al ingreso del trabajador.', 'error'); return; }
    if ((state.FERIADOS_TRABAJADOS || []).some((r) => r.empId === e.id && r.fecha === fecha)) { toast('Ese día ya está registrado para este trabajador.', 'error'); return; }
    if (!clasificarDia(e, fecha)) {
      const ok = await confirmDialog({
        title: 'Es un día hábil normal',
        message: `El ${fmtDate(fecha)} no es feriado ni día de descanso de ${esc(e.nombre)}. ¿Registrarlo igual como día con recargo?`,
        confirmLabel: 'Registrar igual'
      });
      if (!ok) return;
    }
    state.FERIADOS_TRABAJADOS.push({ id: uid(), empId: e.id, fecha, tipo: q('#ferTrabTipo').value, nota: q('#ferTrabNota').value.trim() });
    MES = fecha.slice(0, 7);
    await persistAll(`Feriado trabajado registrado: ${e.nombre} (${fecha})`);
    toast('Día registrado: se pagará en la nómina de esa quincena.', 'success');
    rerender();
  });

  root.querySelectorAll('[data-fer-trab-del]').forEach((b) => b.addEventListener('click', async () => {
    const r = state.FERIADOS_TRABAJADOS.find((x) => x.id === b.dataset.ferTrabDel);
    if (!r) return;
    const ok = await confirmDialog({ title: 'Quitar el día', message: `Se quitará el ${fmtDate(r.fecha)} de la lista. Si esa quincena ya está guardada, hay que regenerarla.`, confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    state.FERIADOS_TRABAJADOS = state.FERIADOS_TRABAJADOS.filter((x) => x.id !== r.id);
    await persistAll(`Feriado trabajado quitado (${r.fecha})`);
    rerender();
  }));
}
