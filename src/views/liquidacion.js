import { state, persistAll, empresaConRif } from '../state/store.js';
import { logoHeaderHTML } from '../lib/logo.js';
import { calcularLiquidacion } from '../lib/calculos.js';
import { fmt } from '../lib/moneda.js';
import { fmtDate, fmtNum, todayStr, uid } from '../lib/formato.js';
import { resultadoConAcciones } from '../components/resultado.js';
import { confirmDialog } from '../components/confirm.js';
import { toast } from '../components/toast.js';

const MODULOS = [
  { id: 'calcular', label: 'Calcular' },
  { id: 'historial', label: 'Historial' }
];
let MODULO_ACTIVO = 'calcular';

const CAUSA_LABELS = {
  renuncia: 'Renuncia voluntaria',
  despido_justificado: 'Despido justificado',
  despido_injustificado: 'Despido injustificado',
  mutuo_acuerdo: 'Mutuo acuerdo'
};

export function render(root, rerender) {
  const pillsHtml = MODULOS.map((m) => `<button data-modulo="${m.id}" class="${MODULO_ACTIVO === m.id ? 'active' : ''}">${m.label}</button>`).join('');
  root.innerHTML = `
  <div class="pill-toggle" id="liqPillToggle" style="margin-bottom:18px;">${pillsHtml}</div>
  <div id="liqModuloArea">${MODULO_ACTIVO === 'calcular' ? calcularHTML() : historialHTML()}</div>`;

  root.querySelector('#liqPillToggle').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      MODULO_ACTIVO = b.dataset.modulo;
      render(root, rerender);
    });
  });

  wire(root, rerender);
}

function calcularHTML() {
  const opciones = state.EMPLEADOS.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join('');
  return `
  <div class="card">
    <h2>Simulador de liquidación final</h2>
    <div class="desc">Incluye prestaciones sociales (con intereses), vacaciones vencidas y fraccionadas, bono vacacional fraccionado, utilidades fraccionadas y, si aplica, la indemnización por despido injustificado (Art. 92 LOTTT, monto igual a las prestaciones sociales).</div>
    <div class="grid cols-3">
      <div class="field"><label>Empleado</label><select id="liqEmp">${opciones || '<option value="">— registre empleados —</option>'}</select></div>
      <div class="field"><label>Fecha de egreso</label><input type="date" id="liqFecha" value="${todayStr()}"></div>
      <div class="field"><label>Causa de terminación</label>
        <select id="liqCausa">
          <option value="renuncia">Renuncia voluntaria</option>
          <option value="despido_justificado">Despido justificado</option>
          <option value="despido_injustificado">Despido injustificado</option>
          <option value="mutuo_acuerdo">Mutuo acuerdo</option>
        </select>
      </div>
    </div>
    <button class="btn" id="btnCalcularLiq" style="margin-top:10px;">Calcular liquidación</button>
    <div id="liqResultado"></div>
  </div>`;
}

function historialHTML() {
  const rows = state.LIQUIDACIONES.slice().reverse().slice(0, 30).map((l) => {
    const emp = state.EMPLEADOS.find((e) => e.id === l.empId);
    return `<tr>
      <td>${emp ? emp.nombre : '—'}</td><td>${fmtDate(l.fecha)}</td><td>${CAUSA_LABELS[l.causa] || l.causa}</td><td><b>${fmt(l.resultado.totalGeneral, l.fecha)}</b></td>
      <td class="row-actions">
        <button class="btn ghost small" data-descargar-liq="${l.id}">PDF</button>
        <button class="btn danger ghost small" data-eliminar-liq="${l.id}">Quitar</button>
      </td>
    </tr>`;
  }).join('');
  return `
  <div class="card">
    <h2>Historial de liquidaciones guardadas</h2>
    <div class="desc">Liquidaciones calculadas y guardadas desde el segmento "Calcular". Descargue de nuevo el PDF de cualquiera de ellas cuando lo necesite.</div>
    <div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Fecha de egreso</th><th>Causa</th><th>Total liquidación</th><th></th></tr></thead>
    <tbody>${rows || '<tr class="empty-row"><td colspan="5">Sin liquidaciones guardadas aún.</td></tr>'}</tbody></table></div>
  </div>`;
}

function construirLiquidacionHTML(emp, fecha, causa, L) {
  return `
    <div>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Liquidación de ${emp.nombre}</h3>
      <div class="legal">Fecha de egreso: ${fmtDate(fecha)} · Causa: ${(CAUSA_LABELS[causa] || causa).toLowerCase()}</div>
      <table style="margin-top:8px;">
        <tbody>
          <tr><td>Prestaciones sociales (mayor entre acumulado y retroactivo + intereses)</td><td>${fmt(L.prest.montoAPagar, fecha)}</td></tr>
          <tr><td>Vacaciones vencidas no disfrutadas (${L.vac.pendientesTotal} días)</td><td>${fmt(L.vacacionesPendientesMonto, fecha)}</td></tr>
          <tr><td>Vacaciones fraccionadas del año en curso (${fmtNum(L.vac.fraccionVac, 1)} días)</td><td>${fmt(L.vacacionesFraccionadasMonto, fecha)}</td></tr>
          <tr><td>Bono vacacional fraccionado (${fmtNum(L.vac.fraccionBono, 1)} días)</td><td>${fmt(L.bonoVacFraccionadoMonto, fecha)}</td></tr>
          <tr><td>Utilidades fraccionadas (${fmtNum(L.util.diasProporcion, 1)} días)</td><td>${fmt(L.utilidadesFraccionadasMonto, fecha)}</td></tr>
          ${causa === 'despido_injustificado' ? `<tr><td>Indemnización por despido injustificado (Art. 92 LOTTT)</td><td>${fmt(L.indemnizacionDespidoInjustificado, fecha)}</td></tr>` : ''}
        </tbody>
      </table>
      <div class="totals"><div class="item"><div class="lbl">Total liquidación</div><div class="val">${fmt(L.totalGeneral, fecha)}</div></div></div>
    </div>`;
}

function wire(root, rerender) {
  const btnCalcularLiq = root.querySelector('#btnCalcularLiq');
  if (btnCalcularLiq) btnCalcularLiq.addEventListener('click', () => {
    const empId = root.querySelector('#liqEmp').value;
    const emp = state.EMPLEADOS.find((e) => e.id === empId);
    if (!emp) { toast('Registre al menos un empleado.', 'error'); return; }
    const fecha = root.querySelector('#liqFecha').value;
    const causa = root.querySelector('#liqCausa').value;
    const L = calcularLiquidacion(emp, fecha, causa);
    const contenidoHtml = construirLiquidacionHTML(emp, fecha, causa, L);
    const cont = root.querySelector('#liqResultado');
    cont.innerHTML = '';
    cont.appendChild(resultadoConAcciones({
      contenidoHtml, filename: `liquidacion-${(emp.nombre || 'empleado').replace(/\s+/g, '-')}-${fecha}.pdf`, pdfTitle: 'Liquidación',
      guardarLabel: 'Guardar liquidación',
      onGuardar: async () => {
        state.LIQUIDACIONES.push({ id: uid(), empId, fecha, causa, resultado: L });
        await persistAll();
        toast('Liquidación guardada.', 'success');
        rerender();
      }
    }));
  });

  root.querySelectorAll('[data-descargar-liq]').forEach((b) => {
    b.addEventListener('click', async () => {
      const l = state.LIQUIDACIONES.find((x) => x.id === b.dataset.descargarLiq);
      if (!l) return;
      const emp = state.EMPLEADOS.find((e) => e.id === l.empId);
      if (!emp) { toast('El empleado de esta liquidación ya no existe en el registro.', 'error'); return; }
      const html = construirLiquidacionHTML(emp, l.fecha, l.causa, l.resultado);
      const res = await window.api.pdf.export(html, 'Liquidación', `liquidacion-${emp.nombre.replace(/\s+/g, '-')}-${l.fecha}.pdf`);
      if (!res.canceled) toast('PDF guardado: ' + res.filePath, 'success');
    });
  });
  root.querySelectorAll('[data-eliminar-liq]').forEach((b) => {
    b.addEventListener('click', async () => {
      const l = state.LIQUIDACIONES.find((x) => x.id === b.dataset.eliminarLiq);
      const emp = l && state.EMPLEADOS.find((e) => e.id === l.empId);
      const ok = await confirmDialog({ title: 'Eliminar liquidación', message: `¿Eliminar esta liquidación${emp ? ' de ' + emp.nombre : ''}? Esta acción no se puede deshacer.`, confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      state.LIQUIDACIONES = state.LIQUIDACIONES.filter((x) => x.id !== b.dataset.eliminarLiq);
      await persistAll();
      rerender();
    });
  });
}
