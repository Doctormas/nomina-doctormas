import { state, persistAll, tipoNominaCfg, tomarNumeroRecibo } from '../state/store.js';
import { generarCorridaNomina, TIPOS_NOMINA_ESPECIALES, departamentosEmpleados } from '../lib/calculos.js';
import { construirResumenCorridaHTML, construirRecibosCorridaHTML } from '../lib/plantillasPdf.js';
import { construirInformeNominaHTML, construirInformeUtilidadesHTML, informeConAcciones } from '../lib/informes.js';
import { fmt } from '../lib/moneda.js';
import { fmtDate, todayStr, uid } from '../lib/formato.js';
import { resultadoConAcciones } from '../components/resultado.js';
import { confirmDialog } from '../components/confirm.js';
import { toast } from '../components/toast.js';

const MODULOS = [
  { id: 'corridas', label: 'Corridas' },
  { id: 'informes', label: 'Informes' }
];
let MODULO_ACTIVO = 'corridas';

// Utilidades y bono vacacional son, para efectos de una corrida, otro tipo de
// nómina más — se guardan agrupadas por fecha igual que quincenas/mensual,
// leyendo de sus propios historiales (UTILIDADES_PAGADAS, BONO_VAC_PAGADO).
function corridasGuardadas() {
  const map = new Map();
  state.PERIODOS.forEach((p) => {
    const key = 'nomina|' + p.tipoPeriodo + '|' + p.fecha;
    if (!map.has(key)) map.set(key, { kind: 'nomina', tipoPeriodo: p.tipoPeriodo, fecha: p.fecha, filas: [] });
    const emp = state.EMPLEADOS.find((e) => e.id === p.empId);
    map.get(key).filas.push({ emp, r: p.resultado, numeroRecibo: p.numeroRecibo });
  });
  state.UTILIDADES_PAGADAS.forEach((u) => {
    const key = 'utilidades|utilidades|' + u.fecha;
    if (!map.has(key)) map.set(key, { kind: 'utilidades', tipoPeriodo: 'utilidades', fecha: u.fecha, filas: [] });
    const emp = state.EMPLEADOS.find((e) => e.id === u.empId);
    map.get(key).filas.push({ emp, r: u.resultado, numeroRecibo: u.numeroRecibo });
  });
  state.BONO_VAC_PAGADO.forEach((b) => {
    const key = 'bonovacacional|bonovacacional|' + b.fecha;
    if (!map.has(key)) map.set(key, { kind: 'bonovacacional', tipoPeriodo: 'bonovacacional', fecha: b.fecha, filas: [] });
    const emp = state.EMPLEADOS.find((e) => e.id === b.empId);
    map.get(key).filas.push({ emp, anoServicio: b.anoServicio, r: { dias: b.dias, salarioDiario: b.dias ? b.monto / b.dias : 0, monto: b.monto }, numeroRecibo: b.numeroRecibo });
  });
  return Array.from(map.values()).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

function tipoLabelDe(kind, tipoPeriodo) {
  if (kind === 'utilidades') return 'Utilidades (fin de año)';
  if (kind === 'bonovacacional') return 'Bono vacacional';
  return tipoNominaCfg(tipoPeriodo).label;
}

function totalNetoDe(kind, r) {
  if (kind === 'utilidades') return r.montoNeto;
  if (kind === 'bonovacacional') return r.monto;
  return r.neto;
}

export function render(root, rerender) {
  const pillsHtml = MODULOS.map((m) => `<button data-modulo="${m.id}" class="${MODULO_ACTIVO === m.id ? 'active' : ''}">${m.label}</button>`).join('');
  root.innerHTML = `
  <div class="pill-toggle" id="nomPillToggle" style="margin-bottom:18px;">${pillsHtml}</div>
  <div id="nomModuloArea">${MODULO_ACTIVO === 'corridas' ? corridasHTML() : informesHTML()}</div>`;

  root.querySelector('#nomPillToggle').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      MODULO_ACTIVO = b.dataset.modulo;
      render(root, rerender);
    });
  });

  wire(root, rerender);
}

function corridasHTML() {
  const activosCount = state.EMPLEADOS.filter((e) => e.activo !== false).length;
  const tipoOptions = [
    ...Object.entries(state.CONFIG.tiposNomina).map(([k, v]) => `<option value="${k}">${v.label}</option>`),
    ...TIPOS_NOMINA_ESPECIALES.map((t) => `<option value="${t.id}">${t.label}</option>`)
  ].join('');
  const deptOptions = ['<option value="">Todos los departamentos</option>', ...departamentosEmpleados().map((d) => `<option value="${d}">${d}</option>`)].join('');
  const corridas = corridasGuardadas().slice(0, 30);
  const historicos = corridas.map((c) => {
    const totalNeto = c.filas.reduce((a, f) => a + totalNetoDe(c.kind, f.r), 0);
    return `<tr>
      <td>${tipoLabelDe(c.kind, c.tipoPeriodo)}</td><td>${fmtDate(c.fecha)}</td><td>${c.filas.length}</td><td><b>${fmt(totalNeto, c.fecha)}</b></td>
      <td class="row-actions">
        <button class="btn ghost small" data-descargar-resumen="${c.kind}|${c.tipoPeriodo}|${c.fecha}">Resumen (PDF)</button>
        <button class="btn ghost small" data-descargar-recibos="${c.kind}|${c.tipoPeriodo}|${c.fecha}">Recibos (PDF)</button>
        <button class="btn danger ghost small" data-eliminar-corrida="${c.kind}|${c.tipoPeriodo}|${c.fecha}">Eliminar</button>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="card">
    <h2>Corrida de nómina completa</h2>
    <div class="desc">Toma automáticamente los parámetros de <b>Configuración</b> (salario mínimo, tasas IVSS/FAOV/INCES/RPE, tasa de cambio) y calcula el pago de cada empleado activo para el período elegido, en una sola corrida. Utilidades y bono vacacional son un tipo de nómina más — se calculan y se guardan igual que una quincena, solo que con su propia fórmula (Art. 131 y Art. 192 LOTTT). Filtre por departamento si solo quiere correr nómina a un área de Doctormás.</div>
    <div class="grid cols-4">
      <div class="field"><label>Tipo de nómina</label><select id="corridaTipo">${tipoOptions}</select></div>
      <div class="field"><label>Departamento</label><select id="corridaDepto">${deptOptions}</select></div>
      <div class="field"><label>Fecha de corte</label><input type="date" id="corridaFecha" value="${todayStr()}"></div>
      <div class="field" style="align-self:end;"><button class="btn" id="btnGenerarCorrida">Generar corrida</button></div>
    </div>
    <div class="legal" style="margin-top:6px;">${activosCount} empleados activos en total.</div>
    <div id="corridaResultado"></div>
  </div>
  <div class="card">
    <h2>Historial de corridas</h2>
    <div class="desc">Nómina, utilidades y bono vacacional guardados, agrupados por fecha. Descargue un solo PDF con el resumen o los recibos individuales de cada corrida.</div>
    <div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Fecha</th><th>Empleados</th><th>Total neto</th><th></th></tr></thead>
    <tbody>${historicos || '<tr class="empty-row"><td colspan="5">Sin corridas guardadas aún.</td></tr>'}</tbody></table></div>
  </div>`;
}

function informesHTML() {
  const anoActual = new Date().getFullYear();
  const tipoOptions = '<option value="todos">Todos</option>' + Object.entries(state.CONFIG.tiposNomina).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  return `
  <div class="card">
    <h2>Resumen de nómina</h2>
    <div class="desc">Todos los recibos guardados en el rango de fechas elegido, con sus totales.</div>
    <div class="grid cols-4">
      <div class="field"><label>Desde</label><input type="date" id="nomInfDesde" value="${anoActual}-01-01"></div>
      <div class="field"><label>Hasta</label><input type="date" id="nomInfHasta" value="${todayStr()}"></div>
      <div class="field"><label>Tipo de período</label><select id="nomInfTipo">${tipoOptions}</select></div>
      <div class="field" style="align-self:end;"><button class="btn" id="btnGenerarInfNomina">Generar informe</button></div>
    </div>
    <div id="nomInfResumenResultado"></div>
    <div class="legal" style="margin-top:10px;">¿Buscas IVSS, FAOV, INCES, RPE o la Ley de Pensiones (DPP)? Eso está en la pestaña <b>Parafiscales</b>.</div>
  </div>
  <div class="card">
    <h2>Utilidades del año</h2>
    <div class="desc">Todos los pagos de utilidades guardados para un año, con su total bruto, INCES retenido y neto pagado.</div>
    <div class="grid cols-3">
      <div class="field"><label>Año</label><input type="number" id="nomInfUtilAno" value="${anoActual}"></div>
      <div class="field" style="align-self:end;"><button class="btn" id="btnGenerarInfUtil">Generar informe</button></div>
    </div>
    <div id="nomInfUtilResultado"></div>
  </div>`;
}

function wire(root, rerender) {
  const btnGenerarCorrida = root.querySelector('#btnGenerarCorrida');
  if (btnGenerarCorrida) btnGenerarCorrida.addEventListener('click', () => {
    const tipo = root.querySelector('#corridaTipo').value;
    const departamento = root.querySelector('#corridaDepto').value;
    const fecha = root.querySelector('#corridaFecha').value;
    const { filas, kind } = generarCorridaNomina(tipo, fecha, departamento);
    const cont = root.querySelector('#corridaResultado');
    if (!filas.length) {
      cont.innerHTML = `<div class="note" style="margin-top:12px;">No hay empleados activos${departamento ? ' en ese departamento' : ''} que ya hubieran ingresado para esta fecha.</div>`;
      return;
    }
    const contenidoHtml = construirResumenCorridaHTML(tipo, fecha, filas, kind);
    cont.innerHTML = '';
    cont.appendChild(resultadoConAcciones({
      contenidoHtml,
      filename: `resumen-${kind}-${tipo}-${fecha}.pdf`,
      pdfTitle: tipoLabelDe(kind, tipo),
      guardarLabel: 'Guardar toda la corrida en historial',
      onGuardar: async () => {
        if (kind === 'nomina') {
          filas.forEach(({ emp, r }) => {
            state.PERIODOS.push({ id: uid(), empId: emp.id, tipoPeriodo: tipo, fecha, resultado: r, numeroRecibo: tomarNumeroRecibo() });
          });
          await persistAll();
          toast(`Corrida guardada: ${filas.length} recibos agregados al historial.`, 'success');
        } else if (kind === 'utilidades') {
          const ano = Number(fecha.slice(0, 4));
          filas.forEach(({ emp, r }) => {
            state.UTILIDADES_PAGADAS.push({ id: uid(), empId: emp.id, ano, fecha, resultado: r, numeroRecibo: tomarNumeroRecibo() });
          });
          await persistAll();
          toast(`Utilidades guardadas: ${filas.length} pagos agregados al historial.`, 'success');
        } else if (kind === 'bonovacacional') {
          let omitidos = 0;
          filas.forEach(({ emp, anoServicio, r }) => {
            if (r.yaPagado) { omitidos++; return; }
            state.BONO_VAC_PAGADO.push({ id: uid(), empId: emp.id, anoServicio, dias: r.dias, fecha, monto: r.monto, numeroRecibo: tomarNumeroRecibo() });
          });
          await persistAll();
          toast(`Bono vacacional guardado: ${filas.length - omitidos} pagos agregados${omitidos ? ` (${omitidos} omitidos por ya estar pagados)` : ''}.`, 'success');
        }
        rerender();
      }
    }));
    // Botón adicional para descargar los recibos individuales (además del resumen)
    const btnRecibos = document.createElement('button');
    btnRecibos.className = 'btn secondary';
    btnRecibos.textContent = 'Descargar recibos individuales (PDF)';
    btnRecibos.addEventListener('click', async () => {
      const html = construirRecibosCorridaHTML(fecha, filas, kind);
      if (!html.trim()) { toast('No se pudo generar ningún recibo: los empleados ya no existen en el registro.', 'error'); return; }
      const res = await window.api.pdf.export(html, 'Recibos', `recibos-${kind}-${tipo}-${fecha}.pdf`);
      if (!res.canceled) toast('PDF guardado: ' + res.filePath, 'success');
    });
    cont.querySelector('.btn-row').appendChild(btnRecibos);
  });

  root.querySelectorAll('[data-descargar-resumen]').forEach((b) => {
    b.addEventListener('click', async () => {
      const [kind, tipoPeriodo, fecha] = b.dataset.descargarResumen.split('|');
      const corrida = corridasGuardadas().find((c) => c.kind === kind && c.tipoPeriodo === tipoPeriodo && c.fecha === fecha);
      if (!corrida) return;
      const html = construirResumenCorridaHTML(tipoPeriodo, fecha, corrida.filas, kind);
      const res = await window.api.pdf.export(html, tipoLabelDe(kind, tipoPeriodo), `resumen-${kind}-${tipoPeriodo}-${fecha}.pdf`);
      if (!res.canceled) toast('PDF guardado: ' + res.filePath, 'success');
    });
  });
  root.querySelectorAll('[data-descargar-recibos]').forEach((b) => {
    b.addEventListener('click', async () => {
      const [kind, tipoPeriodo, fecha] = b.dataset.descargarRecibos.split('|');
      const corrida = corridasGuardadas().find((c) => c.kind === kind && c.tipoPeriodo === tipoPeriodo && c.fecha === fecha);
      if (!corrida) return;
      const html = construirRecibosCorridaHTML(fecha, corrida.filas, kind);
      if (!html.trim()) { toast('No se pudo generar ningún recibo: los empleados ya no existen en el registro.', 'error'); return; }
      const res = await window.api.pdf.export(html, 'Recibos', `recibos-${kind}-${tipoPeriodo}-${fecha}.pdf`);
      if (!res.canceled) toast('PDF guardado: ' + res.filePath, 'success');
    });
  });
  root.querySelectorAll('[data-eliminar-corrida]').forEach((b) => {
    b.addEventListener('click', async () => {
      const [kind, tipoPeriodo, fecha] = b.dataset.eliminarCorrida.split('|');
      const corrida = corridasGuardadas().find((c) => c.kind === kind && c.tipoPeriodo === tipoPeriodo && c.fecha === fecha);
      if (!corrida) return;
      const ok = await confirmDialog({
        title: 'Eliminar corrida',
        message: `¿Eliminar la corrida de ${tipoLabelDe(kind, tipoPeriodo)} del ${fmtDate(fecha)}? Se borrarán los ${corrida.filas.length} registros de esa corrida del historial. Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar', danger: true
      });
      if (!ok) return;
      if (kind === 'nomina') state.PERIODOS = state.PERIODOS.filter((p) => !(p.tipoPeriodo === tipoPeriodo && p.fecha === fecha));
      else if (kind === 'utilidades') state.UTILIDADES_PAGADAS = state.UTILIDADES_PAGADAS.filter((u) => u.fecha !== fecha);
      else if (kind === 'bonovacacional') state.BONO_VAC_PAGADO = state.BONO_VAC_PAGADO.filter((b2) => b2.fecha !== fecha);
      await persistAll();
      rerender();
    });
  });

  const btnGenerarInfNomina = root.querySelector('#btnGenerarInfNomina');
  if (btnGenerarInfNomina) btnGenerarInfNomina.addEventListener('click', () => {
    const desde = root.querySelector('#nomInfDesde').value;
    const hasta = root.querySelector('#nomInfHasta').value;
    const tipoPeriodo = root.querySelector('#nomInfTipo').value;
    const { contenidoHtml, csvHeaders, csvRows } = construirInformeNominaHTML(desde, hasta, tipoPeriodo);
    const cont = root.querySelector('#nomInfResumenResultado');
    cont.innerHTML = '';
    cont.appendChild(informeConAcciones({ contenidoHtml, filename: `informe-nomina-${todayStr()}.pdf`, pdfTitle: 'Resumen de nómina', csvHeaders, csvRows }));
  });

  const btnGenerarInfUtil = root.querySelector('#btnGenerarInfUtil');
  if (btnGenerarInfUtil) btnGenerarInfUtil.addEventListener('click', () => {
    const ano = Number(root.querySelector('#nomInfUtilAno').value);
    const { contenidoHtml, csvHeaders, csvRows } = construirInformeUtilidadesHTML(ano);
    const cont = root.querySelector('#nomInfUtilResultado');
    cont.innerHTML = '';
    cont.appendChild(informeConAcciones({ contenidoHtml, filename: `informe-utilidades-${ano}.pdf`, pdfTitle: 'Utilidades del año', csvHeaders, csvRows }));
  });
}
