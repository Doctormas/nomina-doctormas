import { state, empresaConRif } from '../state/store.js';
import { logoHeaderHTML } from '../lib/logo.js';
import { calcularPrestaciones } from '../lib/calculos.js';
import { construirInformePrestacionesHTML, informeConAcciones } from '../lib/informes.js';
import { fmt } from '../lib/moneda.js';
import { fmtDate, todayStr } from '../lib/formato.js';
import { resultadoConAcciones } from '../components/resultado.js';
import { toast } from '../components/toast.js';

const MODULOS = [
  { id: 'calcular', label: 'Calcular' },
  { id: 'informes', label: 'Informes' }
];
let MODULO_ACTIVO = 'calcular';

export function render(root, rerender) {
  const pillsHtml = MODULOS.map((m) => `<button data-modulo="${m.id}" class="${MODULO_ACTIVO === m.id ? 'active' : ''}">${m.label}</button>`).join('');
  root.innerHTML = `
  <div class="pill-toggle" id="prestPillToggle" style="margin-bottom:18px;">${pillsHtml}</div>
  <div id="prestModuloArea">${MODULO_ACTIVO === 'calcular' ? calcularHTML() : informesHTML()}</div>`;

  root.querySelector('#prestPillToggle').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      MODULO_ACTIVO = b.dataset.modulo;
      render(root, rerender);
    });
  });

  wire(root);
}

function calcularHTML() {
  const opciones = state.EMPLEADOS.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join('');
  return `
  <div class="card">
    <h2>Prestaciones sociales (Art. 142 LOTTT)</h2>
    <div class="desc">
      Garantía trimestral: 15 días de salario integral por trimestre (lit. a). Días adicionales acumulativos: 2 días por año a partir del 2do año, tope 30 días (lit. b).
      Al término de la relación se compara ese acumulado contra el cálculo retroactivo (30 días de salario integral por año de antigüedad con el último salario, lit. c) y se paga el monto mayor, más los intereses generados.
    </div>
    <div class="field" style="max-width:360px;"><label>Empleado</label><select id="prestEmp">${opciones || '<option value="">— registre empleados —</option>'}</select></div>
    <div class="field" style="max-width:360px;"><label>Fecha de corte</label><input type="date" id="prestFecha" value="${todayStr()}"></div>
    <button class="btn" id="btnCalcularPrest" style="margin-top:6px;">Calcular acumulado</button>
    <div id="prestResultado"></div>
  </div>`;
}

function informesHTML() {
  return `
  <div class="card">
    <h2>Prestaciones sociales (provisión contable)</h2>
    <div class="desc">Acumulado, intereses y cálculo retroactivo de todos los empleados activos a una fecha de corte — útil para provisionar en contabilidad.</div>
    <div class="grid cols-3">
      <div class="field"><label>Fecha de corte</label><input type="date" id="prestInfFecha" value="${todayStr()}"></div>
      <div class="field" style="align-self:end;"><button class="btn" id="btnGenerarInfPrest">Generar informe</button></div>
    </div>
    <div id="prestInfResultado"></div>
  </div>`;
}

function wire(root) {
  const btnCalcularPrest = root.querySelector('#btnCalcularPrest');
  if (btnCalcularPrest) btnCalcularPrest.addEventListener('click', () => {
    const empId = root.querySelector('#prestEmp').value;
    const emp = state.EMPLEADOS.find((e) => e.id === empId);
    if (!emp) { toast('Registre al menos un empleado.', 'error'); return; }
    const fecha = root.querySelector('#prestFecha').value;
    const p = calcularPrestaciones(emp, fecha);
    const cont = root.querySelector('#prestResultado');
    if (!p) { cont.innerHTML = '<div class="note">La fecha de corte es anterior al ingreso del empleado.</div>'; return; }
    const trimRows = p.trimestres.map((t) => `<tr><td>T${t.n}</td><td>${fmtDate(t.desde)} – ${fmtDate(t.hasta)}</td><td>${fmt(t.salarioIntegralDiario, t.hasta)}</td><td>${t.dias}</td><td>${fmt(t.monto, t.hasta)}</td></tr>`).join('');
    const anualRows = p.anuales.map((a) => `<tr><td>Año ${a.ano}→${a.ano + 1}</td><td>${fmtDate(a.fecha)}</td><td>${a.dias}</td><td>${fmt(a.monto, a.fecha)}</td></tr>`).join('');
    const contenidoHtml = `
      <div>
        ${logoHeaderHTML()}
        <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Prestaciones sociales de ${emp.nombre} (corte ${fmtDate(fecha)})</h3>
        <h3 style="font-size:.95rem;margin-top:14px;">Garantía trimestral (Art. 142 lit. a)</h3>
        <table><thead><tr><th>Trimestre</th><th>Período</th><th>Salario integral diario</th><th>Días</th><th>Monto</th></tr></thead>
        <tbody>${trimRows || '<tr><td colspan="5" style="color:var(--charcoal-soft);">Aún no se cumple el primer trimestre.</td></tr>'}</tbody></table>

        <h3 style="font-size:.95rem;margin-top:18px;">Días adicionales acumulativos (Art. 142 lit. b)</h3>
        <table><thead><tr><th>Aniversario</th><th>Fecha</th><th>Días</th><th>Monto</th></tr></thead>
        <tbody>${anualRows || '<tr><td colspan="4" style="color:var(--charcoal-soft);">Aplica a partir del segundo año de servicio.</td></tr>'}</tbody></table>

        <div class="totals">
          <div class="item"><div class="lbl">Acumulado depositado</div><div class="val">${fmt(p.totalAcumuladoDeposito, fecha)}</div></div>
          <div class="item"><div class="lbl">Intereses estimados</div><div class="val">${fmt(p.interesAcumulado, fecha)}</div></div>
          <div class="item"><div class="lbl">Cálculo retroactivo (lit. c)</div><div class="val">${fmt(p.retroactivo, fecha)}</div></div>
          <div class="item"><div class="lbl">Monto a pagar (el mayor + intereses)</div><div class="val">${fmt(p.montoAPagar, fecha)}</div></div>
        </div>
        <div class="note" style="margin-top:12px;">La tasa de interés es un estimado configurable (promedio activa/pasiva BCV). Para precisión total, ajuste la tasa histórica año a año o verifique con su contador.</div>
      </div>`;
    cont.innerHTML = '';
    cont.appendChild(resultadoConAcciones({ contenidoHtml, filename: `prestaciones-${(emp.nombre || 'empleado').replace(/\s+/g, '-')}-${fecha}.pdf`, pdfTitle: 'Prestaciones sociales' }));
  });

  const btnGenerarInfPrest = root.querySelector('#btnGenerarInfPrest');
  if (btnGenerarInfPrest) btnGenerarInfPrest.addEventListener('click', () => {
    const hasta = root.querySelector('#prestInfFecha').value;
    const { contenidoHtml, csvHeaders, csvRows } = construirInformePrestacionesHTML(hasta);
    const cont = root.querySelector('#prestInfResultado');
    cont.innerHTML = '';
    cont.appendChild(informeConAcciones({ contenidoHtml, filename: `informe-prestaciones-${todayStr()}.pdf`, pdfTitle: 'Prestaciones sociales', csvHeaders, csvRows }));
  });
}
