import { state, persistAll, empresaConRif } from '../state/store.js';
import { logoHeaderHTML } from '../lib/logo.js';
import { construirInformeAportesHTML, construirInformeARIHTML, construirInformeARCHTML, construirInformeDPPHTML, informeConAcciones } from '../lib/informes.js';
import { calcularPorcentajeARI, TARIFA_1, UT_VALOR_BS_REF, DESGRAVAMEN_UNICO_UT } from '../lib/ari.js';
import { estimarIngresoAnualEmp } from '../lib/calculos.js';
import { fmtNum, fmtDate, todayStr } from '../lib/formato.js';
import { toast } from '../components/toast.js';

const MODULOS = [
  { id: 'aportes', label: 'Aportes patronales' },
  { id: 'dpp', label: 'DPP' },
  { id: 'islr', label: 'ISLR (AR-I / AR-C)' }
];
let MODULO_ACTIVO = 'aportes';

// El AR-I se recalcula por trimestre (aunque legalmente se puede recalcular
// en cualquier momento que cambie el ingreso) — esto solo identifica cuál
// trimestre se está calculando, para que la fecha del documento y el
// registro queden acordes al período, no siempre a "hoy".
const TRIMESTRE_LABELS = {
  1: '1er trimestre (enero-marzo)', 2: '2do trimestre (abril-junio)',
  3: '3er trimestre (julio-septiembre)', 4: '4to trimestre (octubre-diciembre)'
};
function finTrimestreISO(trimestre, ano) {
  const mesFin = trimestre * 3;
  const ultimoDia = new Date(ano, mesFin, 0).getDate();
  return `${ano}-${String(mesFin).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
}

function moduloHTML() {
  if (MODULO_ACTIVO === 'aportes') return aportesHTML();
  if (MODULO_ACTIVO === 'dpp') return dppHTML();
  return islrHTML();
}

export function render(root) {
  const pillsHtml = MODULOS.map((m) => `<button data-modulo="${m.id}" class="${MODULO_ACTIVO === m.id ? 'active' : ''}">${m.label}</button>`).join('');
  root.innerHTML = `
  <div class="pill-toggle" id="parafPillToggle" style="margin-bottom:18px;">${pillsHtml}</div>
  <div id="parafModuloArea">${moduloHTML()}</div>`;

  root.querySelector('#parafPillToggle').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      MODULO_ACTIVO = b.dataset.modulo;
      render(root);
    });
  });

  wire(root);
}

function aportesHTML() {
  const anoActual = new Date().getFullYear();
  return `
  <div class="card">
    <h2>Parafiscales y aportes al Estado</h2>
    <div class="desc">Todo lo que Doctormás debe pagar al Estado a partir de la nómina: IVSS, FAOV/BANAVIH, INCES y RPE (Régimen Prestacional de Empleo). Se calcula automáticamente a partir de las corridas de nómina guardadas en el rango de fechas elegido. La Ley de Protección de las Pensiones (DPP) se calcula aparte, en el segmento <b>DPP</b> — es mensual, no por recibo.</div>
    <div class="grid cols-3">
      <div class="field"><label>Desde</label><input type="date" id="parafDesde" value="${anoActual}-01-01"></div>
      <div class="field"><label>Hasta</label><input type="date" id="parafHasta" value="${todayStr()}"></div>
      <div class="field" style="align-self:end;"><button class="btn" id="btnGenerarParaf">Generar informe</button></div>
    </div>
    <div id="parafResultado"></div>
  </div>
  <div class="card">
    <h2>Alícuotas configuradas</h2>
    <div class="desc">Los porcentajes de cada concepto se ajustan en Configuración → Parámetros. Ajústelos cuando cambien en Gaceta Oficial o lo publique el SENIAT.</div>
    <div class="grid cols-3">
      <div class="card" style="margin-bottom:0;padding:14px 16px;">
        <div class="desc" style="margin-bottom:4px;">IVSS patrono</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--burgundy);">${state.CONFIG.ivssPatrono}%</div>
        <div class="legal">Tope: ${state.CONFIG.ivssTopeSalariosMinimos} salarios mínimos</div>
      </div>
      <div class="card" style="margin-bottom:0;padding:14px 16px;">
        <div class="desc" style="margin-bottom:4px;">FAOV / BANAVIH patrono</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--burgundy);">${state.CONFIG.faovPatrono}%</div>
        <div class="legal">Sobre salario integral</div>
      </div>
      <div class="card" style="margin-bottom:0;padding:14px 16px;">
        <div class="desc" style="margin-bottom:4px;">RPE patrono — Pérdida Involuntaria del Empleo</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--burgundy);">${state.CONFIG.rpePatrono}%</div>
        <div class="legal">Mismo tope que IVSS · antes llamado "Paro forzoso"</div>
      </div>
      <div class="card" style="margin-bottom:0;padding:14px 16px;">
        <div class="desc" style="margin-bottom:4px;">INCES patrono</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--burgundy);">${state.CONFIG.incesPatrono}%</div>
        <div class="legal">Trimestral, sobre nómina normal</div>
      </div>
    </div>
  </div>`;
}

function dppHTML() {
  const mesActual = todayStr().slice(0, 7);
  return `
  <div class="card">
    <h2>Ley de Protección de las Pensiones (DPP)</h2>
    <div class="desc">Recaudada por el SENIAT (Gaceta Extraordinaria 6.806, 08-05-2024) — 100% a cargo del patrono, no se descuenta al trabajador. A diferencia de IVSS/FAOV/INCES/RPE, la DPP no se calcula recibo por recibo: se paga <b>una sola vez al mes</b> sobre el total que cada trabajador recibió ese mes (todas sus quincenas o su pago mensual, más el bono de alimentación, esté incluido en la nómina o pagado aparte), con un mínimo por trabajador si lo real fue menor a eso.</div>
    <div class="grid cols-3">
      <div class="card" style="margin-bottom:0;padding:14px 16px;">
        <div class="desc" style="margin-bottom:4px;">Alícuota DPP</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--burgundy);">${state.CONFIG.dppPatrono}%</div>
        <div class="legal">Hasta 15% permitido por ley — el SENIAT la fijó en 9%. Ajústela en Configuración → Parámetros.</div>
      </div>
      <div class="card" style="margin-bottom:0;padding:14px 16px;">
        <div class="desc" style="margin-bottom:4px;">Base mínima por trabajador</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--burgundy);">${state.CONFIG.dppBaseMinima} ${state.CONFIG.dppBaseMinimaMoneda === 'USD' ? 'USD' : 'Bs.'}</div>
        <div class="legal">Art. 7 Ley DPP — si un trabajador ganó menos que esto en el mes, su aporte igual se calcula sobre este mínimo.</div>
      </div>
    </div>
    <div class="grid cols-3" style="margin-top:14px;">
      <div class="field"><label>Mes a calcular</label><input type="month" id="dppMes" value="${mesActual}"></div>
      <div class="field" style="align-self:end;"><button class="btn" id="btnGenerarDPP">Calcular DPP del mes</button></div>
    </div>
    <div id="dppResultado"></div>
  </div>`;
}

function islrHTML() {
  const anoActual = new Date().getFullYear();
  const trimestreActual = Math.floor(new Date().getMonth() / 3) + 1;
  const opciones = state.EMPLEADOS.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join('');
  return `
  <div class="card">
    <h2>Calculadora AR-I — determinar el % de retención</h2>
    <div class="desc">Sigue el mismo método del formulario AR-I (Art. 50 LISLR y Art. 4 del Reglamento del Decreto 1.808): proyecta el ingreso anual, le resta un desgravamen, ubica el tramo de la Tarifa 1, resta las rebajas personales, y expresa el impuesto resultante como % del ingreso anual. Úsela quien no quiera hacer la cuenta a mano — el resultado es orientativo, revíselo con su contador antes de aplicarlo. Recalcule cada trimestre (o cuando el sueldo cambie de forma importante) — identifique aquí cuál trimestre está haciendo, para llevar el control de cuál es el vigente.</div>
    <div class="grid cols-3">
      <div class="field"><label>Trimestre que está calculando</label>
        <select id="ariTrimestre">
          <option value="1" ${trimestreActual === 1 ? 'selected' : ''}>1er trimestre (enero-marzo)</option>
          <option value="2" ${trimestreActual === 2 ? 'selected' : ''}>2do trimestre (abril-junio)</option>
          <option value="3" ${trimestreActual === 3 ? 'selected' : ''}>3er trimestre (julio-septiembre)</option>
          <option value="4" ${trimestreActual === 4 ? 'selected' : ''}>4to trimestre (octubre-diciembre)</option>
        </select>
      </div>
      <div class="field"><label>Año gravable</label><input type="number" step="1" id="ariAnoGravable" value="${anoActual}"></div>
      <div class="field"><label>Empleado</label><select id="ariEmp"><option value="">— seleccione para estimar el ingreso —</option>${opciones}</select></div>
      <div class="field">
        <label>Ingreso anual estimado (Bs.)</label>
        <div style="display:flex;gap:6px;">
          <input type="number" step="0.01" id="ariIngreso" value="" style="flex:1;">
          <button type="button" class="btn ghost small" id="btnRecalcularIngresoARI" title="Recalcular a partir del salario actual">↺</button>
        </div>
        <div class="legal" id="ariIngresoDesglose"></div>
      </div>
      <div class="field"><label>Unidad Tributaria (Bs.)</label><input type="number" step="0.01" id="ariUT" value="${UT_VALOR_BS_REF}"></div>
      <div class="field"><label>Desgravamen</label>
        <select id="ariDesgravamenTipo"><option value="unico">Único (${DESGRAVAMEN_UNICO_UT} U.T. — sin comprobantes)</option><option value="propio">Personalizado (U.T.)</option></select>
      </div>
      <div class="field"><label>Cargas familiares (cónyuge, hijos, etc.)</label><input type="number" step="1" id="ariCargas" value="0"></div>
    </div>
    <div id="ariDesgravamenPropioWrap" style="display:none;margin-top:6px;">
      <h3 style="font-size:.9rem;margin:0 0 8px;">Desgravámenes detallados (Art. 60 LISLR) — llene lo que el trabajador puede comprobar, en bolívares</h3>
      <div class="desc" style="margin-bottom:8px;">Solo se puede sumar lo que entra en estos 5 conceptos — el trabajador debe conservar los comprobantes. Ponga el monto en <b>bolívares</b> de cada uno; el sistema lo convierte solo a Unidades Tributarias (con el valor de arriba) y le aplica el tope a los dos que lo tienen.</div>
      <div class="grid cols-3">
        <div class="field"><label>Educación (trabajador e hijos ≤25 años)</label><input type="number" step="0.01" class="ariDesgInput" id="ariDesgEducacion" value="0"><div class="legal">Institutos docentes del país — sin tope</div></div>
        <div class="field"><label>Seguro de hospitalización, cirugía y maternidad</label><input type="number" step="0.01" class="ariDesgInput" id="ariDesgSeguro" value="0"><div class="legal">Contratado en el país — sin tope</div></div>
        <div class="field"><label>Servicios médicos, odontológicos y de hospitalización</label><input type="number" step="0.01" class="ariDesgInput" id="ariDesgMedico" value="0"><div class="legal">Del trabajador y cargas directas, en el país — sin tope</div></div>
        <div class="field"><label>Intereses de préstamo de vivienda principal</label><input type="number" step="0.01" class="ariDesgInput" id="ariDesgVivienda" value="0"><div class="legal">Tope: 1.000 U.T. al año</div></div>
        <div class="field"><label>Alquiler de vivienda (si no tiene propia)</label><input type="number" step="0.01" class="ariDesgInput" id="ariDesgAlquiler" value="0"><div class="legal">Tope: 800 U.T. al año</div></div>
      </div>
      <div class="legal" id="ariDesgTotalUT" style="margin-top:8px;font-weight:700;"></div>
    </div>
    <button class="btn" id="btnCalcularARI" style="margin-top:10px;">Calcular %</button>
    <div id="ariCalcResultado"></div>
    <div style="border-top:1px solid var(--line);margin-top:18px;padding-top:12px;">
      <h3 style="font-size:.9rem;margin:0 0 8px;">Tarifa 1 usada en el cálculo (Art. 50 LISLR)</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Hasta (U.T.)</th><th>%</th><th>Sustraendo (U.T.)</th></tr></thead>
        <tbody>${TARIFA_1.map((t) => `<tr><td>${t.hasta === Infinity ? 'En adelante' : fmtNum(t.hasta, 0)}</td><td>${t.pct}%</td><td>${t.sustraendoUT}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
  </div>
  <div class="card">
    <h2>AR-I — % de retención vigente por empleado</h2>
    <div class="desc">El Impuesto Sobre la Renta (ISLR) no tiene un % general: cada trabajador obligado a declarar (ingresos anuales estimados superiores a 1.000 Unidades Tributarias) llena la planilla AR-I, y con eso se determina su % de retención. Ese % se edita en la ficha de cada empleado (pestaña Empleados) y aquí se descuenta automáticamente en cada nómina.</div>
    <div class="btn-row">
      <button class="btn" id="btnGenerarInfARI">Generar listado</button>
      <button class="btn secondary" id="btnAbrirPlanillaARI">⇪ Abrir planilla AR-I del SENIAT</button>
    </div>
    <div class="note" style="margin-top:12px;">El PDF/Excel que descarga la calculadora de arriba sigue las mismas casillas (A, B, D/E, F, G, H, I, J) y la misma Tarifa 1 de la planilla oficial AR-I — sirve para calcular el % y como respaldo firmado. El botón de aquí abajo lleva al portal del SENIAT por si en algún momento necesita la planilla en blanco tal cual la publica el organismo (Asistencia al contribuyente → Formularios → Formatos Electrónicos → Formato ARI).</div>
    <div id="parafARIResultado"></div>
  </div>
  <div class="card">
    <h2>AR-C — Comprobante anual de retenciones</h2>
    <div class="desc">Resumen anual, por empleado, de la remuneración pagada y el ISLR retenido — el insumo para llenar el formulario oficial AR-C ante el SENIAT.</div>
    <div class="grid cols-3">
      <div class="field"><label>Año</label><input type="number" id="parafARCAno" value="${anoActual}"></div>
      <div class="field" style="align-self:end;"><button class="btn" id="btnGenerarInfARC">Generar informe</button></div>
    </div>
    <div id="parafARCResultado"></div>
  </div>`;
}

function wire(root) {
  const ariEmpSel = root.querySelector('#ariEmp');
  const ariTrimestreSel = root.querySelector('#ariTrimestre');
  const ariAnoGravableInput = root.querySelector('#ariAnoGravable');
  // La fecha de referencia para "estimar" el ingreso NO es siempre hoy: si
  // está calculando el AR-I de un trimestre pasado, el ingreso debe
  // reflejar el sueldo/tasa vigente en ESE trimestre (no la de hoy, que ya
  // puede ser muy distinta por la devaluación) — por eso cambia solo al
  // cambiar el trimestre o el año.
  function fechaReferenciaTrimestre() {
    const trimestre = Number(ariTrimestreSel && ariTrimestreSel.value) || 1;
    const ano = Number(ariAnoGravableInput && ariAnoGravableInput.value) || new Date().getFullYear();
    return finTrimestreISO(trimestre, ano);
  }
  function recalcularIngresoARI() {
    const emp = state.EMPLEADOS.find((e) => e.id === ariEmpSel.value);
    const ingresoInput = root.querySelector('#ariIngreso');
    const desglose = root.querySelector('#ariIngresoDesglose');
    if (!emp) { desglose.textContent = ''; return; }
    const fechaRef = fechaReferenciaTrimestre();
    const est = estimarIngresoAnualEmp(emp, fechaRef);
    ingresoInput.value = Math.round(est.total);
    desglose.textContent = `Al ${fmtDate(fechaRef)}: salario (${fmtNum(est.salarioAnual, 0)}) + utilidades (${fmtNum(est.utilidadesAnual, 0)}) + bono vacacional (${fmtNum(est.bonoVacAnual, 0)}) — no incluye el bono de alimentación, que no es salarial.`;
  }
  if (ariEmpSel) ariEmpSel.addEventListener('change', recalcularIngresoARI);
  // Al cambiar de trimestre o de año, si ya hay un empleado elegido, se
  // recalcula sola — no hace falta darle "Recalcular" a mano cada vez.
  if (ariTrimestreSel) ariTrimestreSel.addEventListener('change', () => { if (ariEmpSel.value) recalcularIngresoARI(); });
  if (ariAnoGravableInput) ariAnoGravableInput.addEventListener('change', () => { if (ariEmpSel.value) recalcularIngresoARI(); });
  const btnRecalcularIngresoARI = root.querySelector('#btnRecalcularIngresoARI');
  if (btnRecalcularIngresoARI) btnRecalcularIngresoARI.addEventListener('click', () => {
    if (!ariEmpSel.value) { toast('Seleccione un empleado para estimar su ingreso.', 'error'); return; }
    recalcularIngresoARI();
  });
  // Los 5 conceptos itemizados del Art. 60 LISLR — el usuario llena el monto
  // en Bs. de cada uno, esto los convierte solos a U.T. y le aplica el tope
  // a los dos que lo tienen (vivienda: 1.000 U.T.; alquiler: 800 U.T.).
  const DESG_CONCEPTOS = [
    { id: 'ariDesgEducacion', label: 'Educación (trabajador e hijos ≤25 años)', topeUT: null },
    { id: 'ariDesgSeguro', label: 'Seguro de hospitalización, cirugía y maternidad', topeUT: null },
    { id: 'ariDesgMedico', label: 'Servicios médicos, odontológicos y de hospitalización', topeUT: null },
    { id: 'ariDesgVivienda', label: 'Intereses de préstamo de vivienda principal', topeUT: 1000 },
    { id: 'ariDesgAlquiler', label: 'Alquiler de vivienda (si no tiene propia)', topeUT: 800 }
  ];
  function calcularDesgravamenDetalle(utValorBs) {
    return DESG_CONCEPTOS.map((c) => {
      const inp = root.querySelector('#' + c.id);
      const montoBs = Number(inp && inp.value) || 0;
      const utSinTope = montoBs / utValorBs;
      const utAplicado = c.topeUT !== null ? Math.min(utSinTope, c.topeUT) : utSinTope;
      return { ...c, montoBs, utSinTope, utAplicado, topeAplicado: c.topeUT !== null && utSinTope > c.topeUT };
    });
  }
  function actualizarTotalDesgravamen() {
    const utValorBs = Number(root.querySelector('#ariUT').value) || UT_VALOR_BS_REF;
    const detalle = calcularDesgravamenDetalle(utValorBs);
    const totalUT = detalle.reduce((a, d) => a + d.utAplicado, 0);
    const totalEl = root.querySelector('#ariDesgTotalUT');
    if (totalEl) {
      const conTope = detalle.filter((d) => d.topeAplicado);
      totalEl.innerHTML = `Total desgravamen: ${fmtNum(totalUT, 2)} U.T.${conTope.length ? ` — tope aplicado en: ${conTope.map((d) => d.label).join(', ')}` : ''}`;
    }
  }
  root.querySelectorAll('.ariDesgInput').forEach((inp) => inp.addEventListener('input', actualizarTotalDesgravamen));
  const ariUTInput = root.querySelector('#ariUT');
  if (ariUTInput) ariUTInput.addEventListener('input', actualizarTotalDesgravamen);

  const ariDesgravamenTipo = root.querySelector('#ariDesgravamenTipo');
  if (ariDesgravamenTipo) ariDesgravamenTipo.addEventListener('change', () => {
    const esPropio = ariDesgravamenTipo.value === 'propio';
    root.querySelector('#ariDesgravamenPropioWrap').style.display = esPropio ? '' : 'none';
    if (esPropio) actualizarTotalDesgravamen();
  });

  const btnCalcularARI = root.querySelector('#btnCalcularARI');
  if (btnCalcularARI) btnCalcularARI.addEventListener('click', () => {
    const empId = root.querySelector('#ariEmp').value;
    const emp = state.EMPLEADOS.find((e) => e.id === empId);
    const trimestre = Number(root.querySelector('#ariTrimestre').value) || 1;
    const anoGravable = Number(root.querySelector('#ariAnoGravable').value) || new Date().getFullYear();
    const trimestreLabel = TRIMESTRE_LABELS[trimestre];
    const fechaDocumento = finTrimestreISO(trimestre, anoGravable);
    const ingresoAnualBs = Number(root.querySelector('#ariIngreso').value);
    const utValorBs = Number(root.querySelector('#ariUT').value) || UT_VALOR_BS_REF;
    const esPropio = ariDesgravamenTipo.value === 'propio';
    const desgravamenDetalle = esPropio ? calcularDesgravamenDetalle(utValorBs) : null;
    const desgravamenUT = esPropio ? desgravamenDetalle.reduce((a, d) => a + d.utAplicado, 0) : DESGRAVAMEN_UNICO_UT;
    const cargas = Number(root.querySelector('#ariCargas').value) || 0;
    if (!ingresoAnualBs) { toast('Ingrese el ingreso anual estimado.', 'error'); return; }
    const r = calcularPorcentajeARI({ ingresoAnualBs, desgravamenUT, cargasFamiliares: cargas, utValorBs });
    const letraDesgravamen = esPropio ? 'D' : 'E';

    // Mismas letras de casilla que la planilla oficial AR-I (A, B, D/E, F, G, H, I, J)
    // para que el desglose se pueda cotejar renglón por renglón contra el formulario real.
    const filas = [
      ['A — Total que estima percibir en el año', `${fmtNum(ingresoAnualBs, 2)} Bs.`],
      ['B — Remuneraciones convertidas a U.T.', `${fmtNum(r.ingresoAnualUT, 2)} U.T. (÷ ${fmtNum(utValorBs, 2)} Bs./U.T.)`],
      [`${letraDesgravamen} — Desgravamen`, `${fmtNum(desgravamenUT, 2)} U.T.`],
      ['F — Enriquecimiento neto (B − ' + letraDesgravamen + ')', `${fmtNum(r.enriquecimientoNetoUT, 2)} U.T.`],
      ['— Tramo de la Tarifa 1 aplicado', `Hasta ${r.tramo.hasta === Infinity ? '∞' : fmtNum(r.tramo.hasta, 0)} U.T. — ${r.tramo.pct}%, sustraendo ${r.tramo.sustraendoUT} U.T.`],
      ['G — Impuesto estimado del año', `${fmtNum(r.impuestoUT, 2)} U.T.`],
      ['H — Total rebajas', `${fmtNum(r.rebajasUT, 2)} U.T. (10 personal + 10 × ${cargas} carga(s) familiar(es))`],
      ['I — Impuesto a retener en el año (G − H)', `${fmtNum(r.impuestoNetoUT, 2)} U.T. = ${fmtNum(r.impuestoNetoBs, 2)} Bs.`],
      ['J — % de retención inicial (I ÷ B × 100)', `${r.porcentaje}%`]
    ];
    // Desglose de los 5 conceptos del desgravamen itemizado — solo cuando es
    // "Personalizado", para que quede claro de dónde salió el total.
    const detalleDesgravamenHTML = desgravamenDetalle ? `
      <div class="legal" style="margin:10px 0 2px;">Desglose del desgravamen (Art. 60 LISLR):</div>
      <table><thead><tr><th>Concepto</th><th>Monto (Bs.)</th><th>U.T.</th></tr></thead><tbody>
        ${desgravamenDetalle.map((d) => `<tr><td>${d.label}</td><td>${fmtNum(d.montoBs, 2)}</td><td>${fmtNum(d.utAplicado, 2)}${d.topeAplicado ? ` <span class="tag warn">tope ${d.topeUT} U.T.</span>` : ''}</td></tr>`).join('')}
        <tr><td><b>Total</b></td><td></td><td><b>${fmtNum(desgravamenUT, 2)} U.T.</b></td></tr>
      </tbody></table>` : '';
    const cont = root.querySelector('#ariCalcResultado');
    cont.innerHTML = `
      <div class="legal" style="margin-top:12px;">${trimestreLabel} · ${anoGravable} — fecha del documento: ${fmtDate(fechaDocumento)}</div>
      <table style="margin-top:6px;"><tbody>${filas.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>
      ${detalleDesgravamenHTML}
      <div class="totals"><div class="item"><div class="lbl">% de ISLR a retener</div><div class="val">${r.porcentaje}%</div></div></div>
      ${r.porcentaje >= 15 ? `<div class="note" style="margin-top:12px;">Este % sale alto porque la Unidad Tributaria (Bs. ${fmtNum(utValorBs, 2)}) quedó muy por detrás de la inflación: casi cualquier sueldo en bolívares hoy equivale a miles de U.T. por año, lo que empuja el cálculo al tramo tope (34%) aunque el sueldo real sea modesto. Esto es un problema conocido y discutido de la ley actual, no un error de esta calculadora — antes de aplicar un % así de alto a un pago real, verifíquelo con su contador.</div>` : ''}
      <div class="btn-row no-print" style="margin-top:14px;">
        ${emp ? `<button class="btn secondary" id="btnAplicarARI">Aplicar ${r.porcentaje}% a ${emp.nombre}</button>` : ''}
        <button class="btn" id="btnDescargarPdfARI">⇩ Descargar PDF (con firma)</button>
        <button class="btn ghost" id="btnDescargarExcelARI">⇩ Descargar como Excel</button>
      </div>`;

    const btnAplicarARI = cont.querySelector('#btnAplicarARI');
    if (btnAplicarARI) btnAplicarARI.addEventListener('click', async () => {
      emp.islrPorcentaje = r.porcentaje;
      await persistAll(`ISLR (AR-I) aplicado: ${emp.nombre} → ${r.porcentaje}%`);
      toast(`% de ISLR de ${emp.nombre} actualizado a ${r.porcentaje}%.`, 'success');
    });

    cont.querySelector('#btnDescargarPdfARI').addEventListener('click', async () => {
      const html = `
        <div>
          <div style="display:flex;justify-content:center;">${logoHeaderHTML()}</div>
          <h2 style="margin:0 0 2px;font-size:1.2rem;text-align:center;">IMPUESTO SOBRE LA RENTA</h2>
          <div class="legal" style="text-align:center;">Aplicable sobre sueldos, salarios y demás remuneraciones, cuando el enriquecimiento anual exceda de 1.000 Unidades Tributarias — Art. 50 LISLR (formulario AR-I)</div>
          <table style="width:100%;margin-top:14px;table-layout:fixed;">
            <tr>
              <td style="width:34%;"><div class="legal">Apellidos y nombres</div><b>${emp ? emp.nombre : '—'}</b></td>
              <td style="width:22%;"><div class="legal">Cédula de identidad</div><b>${emp && emp.cedula ? emp.cedula : '—'}</b></td>
              <td style="width:22%;"><div class="legal">Año gravable</div><b>${anoGravable}</b></td>
              <td style="width:22%;"><div class="legal">Trimestre / fecha</div><b>${trimestreLabel}<br>${fmtDate(fechaDocumento)}</b></td>
            </tr>
          </table>
          <div class="legal" style="margin-top:4px;">Empresa u organismo donde trabaja: <b>${empresaConRif()}</b></div>

          <h3 style="font-size:.95rem;margin:16px 0 4px;">A · Estimación de las remuneraciones y B · conversión a Unidades Tributarias</h3>
          <table style="margin-top:4px;"><tbody>${filas.slice(0, 2).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>

          <h3 style="font-size:.95rem;margin:16px 0 4px;">${letraDesgravamen} · Desgravamen ${letraDesgravamen === 'E' ? 'único (Art. 61 LISLR)' : 'detallado (Art. 60 LISLR)'}</h3>
          <table style="margin-top:4px;"><tbody>${filas.slice(2, 4).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>
          ${detalleDesgravamenHTML}

          <h3 style="font-size:.95rem;margin:16px 0 4px;">G · Cálculo del impuesto estimado (Tarifa 1, Art. 50 LISLR)</h3>
          <table style="margin-top:4px;"><tbody>${filas.slice(4, 6).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>

          <h3 style="font-size:.95rem;margin:16px 0 4px;">H · Rebajas al impuesto (Art. 63 LISLR) e I · impuesto a retener</h3>
          <table style="margin-top:4px;"><tbody>${filas.slice(6, 8).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>

          <h3 style="font-size:.95rem;margin:16px 0 4px;">J · Porcentaje de retención inicial</h3>
          <div class="totals"><div class="item"><div class="lbl">% de ISLR a retener sobre cada pago</div><div class="val">${r.porcentaje}%</div></div></div>

          <div class="note" style="margin-top:16px;">Documento elaborado por ${state.CONFIG.nombreEmpresa} con la misma metodología de la planilla oficial AR-I del SENIAT, a partir de los datos que el trabajador declaró abajo. Verifique el % con su contador antes de aplicarlo a un pago real; si los datos varían durante el año, debe recalcularse (casilla K de la planilla oficial).</div>

          <table style="width:100%;margin-top:50px;table-layout:fixed;page-break-inside:avoid;break-inside:avoid;">
            <tr>
              <td style="width:50%;text-align:center;padding:0 20px;">
                <div style="border-top:1px solid #3F4249;padding-top:6px;font-size:.8rem;">Firma del contribuyente (trabajador) — declara que los datos arriba son ciertos</div>
              </td>
              <td style="width:50%;text-align:center;padding:0 20px;">
                <div style="border-top:1px solid #3F4249;padding-top:6px;font-size:.8rem;">Firma / sello del agente de retención — ${empresaConRif()}</div>
              </td>
            </tr>
          </table>
        </div>`;
      const res = await window.api.pdf.export(html, 'AR-I', `ar-i-${(emp ? emp.nombre.replace(/\s+/g, '-') : 'calculo')}-T${trimestre}-${anoGravable}.pdf`);
      if (!res.canceled) toast('PDF guardado: ' + res.filePath, 'success');
    });

    cont.querySelector('#btnDescargarExcelARI').addEventListener('click', async () => {
      const rows = [
        ['IMPUESTO SOBRE LA RENTA — Formulario AR-I (casillas de la planilla oficial)'],
        ['Empresa u organismo', state.CONFIG.nombreEmpresa],
        ['RIF', state.CONFIG.rif || ''],
        ['Apellidos y nombres', emp ? emp.nombre : ''],
        ['Cédula de identidad', emp && emp.cedula ? emp.cedula : ''],
        ['Año gravable', anoGravable],
        ['Trimestre', trimestreLabel],
        ['Fecha del período', fmtDate(fechaDocumento)],
        [],
        ['Casilla', 'Concepto', 'Valor'],
        ['A', 'Total que estima percibir en el año (Bs.)', ingresoAnualBs],
        ['—', 'Unidad Tributaria (Bs.)', utValorBs],
        ['B', 'Remuneraciones convertidas a U.T. (A ÷ U.T.)', Number(r.ingresoAnualUT.toFixed(2))],
        [letraDesgravamen, `Desgravamen ${letraDesgravamen === 'E' ? 'único' : 'detallado (Art. 60 LISLR)'} (U.T.)`, Number(desgravamenUT.toFixed(2))],
        ...(desgravamenDetalle ? desgravamenDetalle.map((d) => ['—', `   · ${d.label} (Bs. ${fmtNum(d.montoBs, 2)}${d.topeAplicado ? `, tope ${d.topeUT} U.T.` : ''})`, Number(d.utAplicado.toFixed(2))]) : []),
        ['F', 'Enriquecimiento neto (B − ' + letraDesgravamen + ') (U.T.)', Number(r.enriquecimientoNetoUT.toFixed(2))],
        ['—', 'Tramo Tarifa 1 hasta (U.T.)', r.tramo.hasta === Infinity ? 'sin tope' : r.tramo.hasta],
        ['—', '% del tramo', r.tramo.pct],
        ['—', 'Sustraendo del tramo (U.T.)', r.tramo.sustraendoUT],
        ['G', 'Impuesto estimado del año (U.T.)', Number(r.impuestoUT.toFixed(2))],
        ['—', 'Cargas familiares', cargas],
        ['H', 'Total rebajas — 10 personal + 10 × cargas (U.T.)', r.rebajasUT],
        ['I', 'Impuesto a retener en el año (G − H) (U.T.)', Number(r.impuestoNetoUT.toFixed(2))],
        ['I', 'Impuesto a retener en el año (Bs.)', Number(r.impuestoNetoBs.toFixed(2))],
        ['J', '% de retención inicial (I ÷ B × 100)', r.porcentaje],
        [],
        ['Nota: cálculo orientativo con la misma metodología y Tarifa 1 (Art. 50 LISLR) de la planilla oficial AR-I. Verifique con su contador antes de aplicarlo a un pago real.']
      ];
      const res = await window.api.xlsx.downloadSheet({
        sheetName: 'AR-I', rows, colWidths: [10, 44, 20],
        defaultFilename: `ar-i-${(emp ? emp.nombre.replace(/\s+/g, '-') : 'calculo')}-T${trimestre}-${anoGravable}.xlsx`
      });
      if (!res.canceled) toast('Excel guardado: ' + res.filePath, 'success');
    });
  });

  const btnGenerarParaf = root.querySelector('#btnGenerarParaf');
  if (btnGenerarParaf) btnGenerarParaf.addEventListener('click', () => {
    const desde = root.querySelector('#parafDesde').value;
    const hasta = root.querySelector('#parafHasta').value;
    const { contenidoHtml, csvHeaders, csvRows } = construirInformeAportesHTML(desde, hasta);
    const cont = root.querySelector('#parafResultado');
    cont.innerHTML = '';
    cont.appendChild(informeConAcciones({ contenidoHtml, filename: `parafiscales-${todayStr()}.pdf`, pdfTitle: 'Parafiscales', csvHeaders, csvRows }));
  });

  const btnGenerarDPP = root.querySelector('#btnGenerarDPP');
  if (btnGenerarDPP) btnGenerarDPP.addEventListener('click', () => {
    const mesISO = root.querySelector('#dppMes').value;
    if (!mesISO) { toast('Seleccione el mes a calcular.', 'error'); return; }
    const { contenidoHtml, csvHeaders, csvRows } = construirInformeDPPHTML(mesISO);
    const cont = root.querySelector('#dppResultado');
    cont.innerHTML = '';
    cont.appendChild(informeConAcciones({ contenidoHtml, filename: `dpp-${mesISO}.pdf`, pdfTitle: 'DPP', csvHeaders, csvRows }));
  });

  const btnAbrirPlanillaARI = root.querySelector('#btnAbrirPlanillaARI');
  if (btnAbrirPlanillaARI) btnAbrirPlanillaARI.addEventListener('click', () => {
    window.api.shell.openExternal('https://declaraciones.seniat.gob.ve/portal/page/portal/MANEJADOR_CONTENIDO_SENIAT/05MENU_HORIZONTAL/5.1ASISTENCIA_CONTRIBUYENTE/5.1.4INFORMACION_INTERE/5.1.4.1FORMULARIOS/5.1.4.1.html');
  });

  const btnGenerarInfARI = root.querySelector('#btnGenerarInfARI');
  if (btnGenerarInfARI) btnGenerarInfARI.addEventListener('click', () => {
    const { contenidoHtml, csvHeaders, csvRows } = construirInformeARIHTML();
    const cont = root.querySelector('#parafARIResultado');
    cont.innerHTML = '';
    cont.appendChild(informeConAcciones({ contenidoHtml, filename: `ar-i-porcentajes-${todayStr()}.pdf`, pdfTitle: 'AR-I', csvHeaders, csvRows }));
  });

  const btnGenerarInfARC = root.querySelector('#btnGenerarInfARC');
  if (btnGenerarInfARC) btnGenerarInfARC.addEventListener('click', () => {
    const ano = Number(root.querySelector('#parafARCAno').value);
    const { contenidoHtml, csvHeaders, csvRows } = construirInformeARCHTML(ano);
    const cont = root.querySelector('#parafARCResultado');
    cont.innerHTML = '';
    cont.appendChild(informeConAcciones({ contenidoHtml, filename: `ar-c-${ano}.pdf`, pdfTitle: 'AR-C', csvHeaders, csvRows }));
  });
}
