import { state, persistAll, empresaConRif } from '../state/store.js';
import { logoHeaderHTML } from '../lib/logo.js';
import { construirInformeAportesHTML, construirInformeARIHTML, construirInformeARCHTML, informeConAcciones } from '../lib/informes.js';
import { calcularPorcentajeARI, TARIFA_1, UT_VALOR_BS_REF, DESGRAVAMEN_UNICO_UT } from '../lib/ari.js';
import { estimarIngresoAnualEmp } from '../lib/calculos.js';
import { fmtNum, todayStr } from '../lib/formato.js';
import { toast } from '../components/toast.js';

const MODULOS = [
  { id: 'aportes', label: 'Aportes patronales' },
  { id: 'islr', label: 'ISLR (AR-I / AR-C)' }
];
let MODULO_ACTIVO = 'aportes';

export function render(root) {
  const pillsHtml = MODULOS.map((m) => `<button data-modulo="${m.id}" class="${MODULO_ACTIVO === m.id ? 'active' : ''}">${m.label}</button>`).join('');
  root.innerHTML = `
  <div class="pill-toggle" id="parafPillToggle" style="margin-bottom:18px;">${pillsHtml}</div>
  <div id="parafModuloArea">${MODULO_ACTIVO === 'aportes' ? aportesHTML() : islrHTML()}</div>`;

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
    <div class="desc">Todo lo que Doctormás debe pagar al Estado a partir de la nómina: IVSS, FAOV/BANAVIH, INCES y RPE (Régimen Prestacional de Empleo), más la Ley de Protección de las Pensiones de la Seguridad Social (DPP, recaudada por el SENIAT). Se calcula automáticamente a partir de las corridas de nómina guardadas en el rango de fechas elegido.</div>
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
        <div class="desc" style="margin-bottom:4px;">RPE / Paro forzoso patrono</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--burgundy);">${state.CONFIG.rpePatrono}%</div>
        <div class="legal">Mismo tope que IVSS</div>
      </div>
      <div class="card" style="margin-bottom:0;padding:14px 16px;">
        <div class="desc" style="margin-bottom:4px;">INCES patrono</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--burgundy);">${state.CONFIG.incesPatrono}%</div>
        <div class="legal">Trimestral, sobre nómina normal</div>
      </div>
      <div class="card" style="margin-bottom:0;padding:14px 16px;">
        <div class="desc" style="margin-bottom:4px;">Ley de Protección de las Pensiones (DPP)</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--burgundy);">${state.CONFIG.dppPatrono}%</div>
        <div class="legal">Recaudada por el SENIAT, mensual, sin tope superior. Base mínima por trabajador: ${state.CONFIG.dppBaseMinima} ${state.CONFIG.dppBaseMinimaMoneda === 'USD' ? 'USD' : 'Bs.'} — si gana menos, se calcula igual sobre ese mínimo.</div>
      </div>
    </div>
  </div>`;
}

function islrHTML() {
  const anoActual = new Date().getFullYear();
  const opciones = state.EMPLEADOS.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join('');
  return `
  <div class="card">
    <h2>Calculadora AR-I — determinar el % de retención</h2>
    <div class="desc">Sigue el mismo método del formulario AR-I (Art. 50 LISLR y Art. 4 del Reglamento del Decreto 1.808): proyecta el ingreso anual, le resta un desgravamen, ubica el tramo de la Tarifa 1, resta las rebajas personales, y expresa el impuesto resultante como % del ingreso anual. Úsela quien no quiera hacer la cuenta a mano — el resultado es orientativo, revíselo con su contador antes de aplicarlo.</div>
    <div class="grid cols-3">
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
      <div class="field" id="ariDesgravamenPropioWrap" style="display:none;"><label>Desgravamen personalizado (U.T.)</label><input type="number" step="1" id="ariDesgravamenPropio" value="${DESGRAVAMEN_UNICO_UT}"></div>
      <div class="field"><label>Cargas familiares (cónyuge, hijos, etc.)</label><input type="number" step="1" id="ariCargas" value="0"></div>
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
  function recalcularIngresoARI() {
    const emp = state.EMPLEADOS.find((e) => e.id === ariEmpSel.value);
    const ingresoInput = root.querySelector('#ariIngreso');
    const desglose = root.querySelector('#ariIngresoDesglose');
    if (!emp) { desglose.textContent = ''; return; }
    const est = estimarIngresoAnualEmp(emp, todayStr());
    ingresoInput.value = Math.round(est.total);
    desglose.textContent = `Salario (${fmtNum(est.salarioAnual, 0)}) + utilidades (${fmtNum(est.utilidadesAnual, 0)}) + bono vacacional (${fmtNum(est.bonoVacAnual, 0)}) — no incluye el bono de alimentación, que no es salarial.`;
  }
  if (ariEmpSel) ariEmpSel.addEventListener('change', recalcularIngresoARI);
  const btnRecalcularIngresoARI = root.querySelector('#btnRecalcularIngresoARI');
  if (btnRecalcularIngresoARI) btnRecalcularIngresoARI.addEventListener('click', () => {
    if (!ariEmpSel.value) { toast('Seleccione un empleado para estimar su ingreso.', 'error'); return; }
    recalcularIngresoARI();
  });
  const ariDesgravamenTipo = root.querySelector('#ariDesgravamenTipo');
  if (ariDesgravamenTipo) ariDesgravamenTipo.addEventListener('change', () => {
    root.querySelector('#ariDesgravamenPropioWrap').style.display = ariDesgravamenTipo.value === 'propio' ? '' : 'none';
  });

  const btnCalcularARI = root.querySelector('#btnCalcularARI');
  if (btnCalcularARI) btnCalcularARI.addEventListener('click', () => {
    const empId = root.querySelector('#ariEmp').value;
    const emp = state.EMPLEADOS.find((e) => e.id === empId);
    const ingresoAnualBs = Number(root.querySelector('#ariIngreso').value);
    const utValorBs = Number(root.querySelector('#ariUT').value) || UT_VALOR_BS_REF;
    const desgravamenUT = ariDesgravamenTipo.value === 'propio' ? Number(root.querySelector('#ariDesgravamenPropio').value) || 0 : DESGRAVAMEN_UNICO_UT;
    const cargas = Number(root.querySelector('#ariCargas').value) || 0;
    if (!ingresoAnualBs) { toast('Ingrese el ingreso anual estimado.', 'error'); return; }
    const r = calcularPorcentajeARI({ ingresoAnualBs, desgravamenUT, cargasFamiliares: cargas, utValorBs });
    const letraDesgravamen = ariDesgravamenTipo.value === 'propio' ? 'D' : 'E';

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
    const cont = root.querySelector('#ariCalcResultado');
    cont.innerHTML = `
      <table style="margin-top:14px;"><tbody>${filas.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>
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
      await persistAll();
      toast(`% de ISLR de ${emp.nombre} actualizado a ${r.porcentaje}%.`, 'success');
    });

    cont.querySelector('#btnDescargarPdfARI').addEventListener('click', async () => {
      const anoGravable = new Date().getFullYear();
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
              <td style="width:22%;"><div class="legal">Fecha</div><b>${todayStr()}</b></td>
            </tr>
          </table>
          <div class="legal" style="margin-top:4px;">Empresa u organismo donde trabaja: <b>${empresaConRif()}</b></div>

          <h3 style="font-size:.95rem;margin:16px 0 4px;">A · Estimación de las remuneraciones y B · conversión a Unidades Tributarias</h3>
          <table style="margin-top:4px;"><tbody>${filas.slice(0, 2).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>

          <h3 style="font-size:.95rem;margin:16px 0 4px;">${letraDesgravamen} · Desgravamen ${letraDesgravamen === 'E' ? 'único (Art. 61 LISLR)' : 'estimado (itemizado)'}</h3>
          <table style="margin-top:4px;"><tbody>${filas.slice(2, 4).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>

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
      const res = await window.api.pdf.export(html, 'AR-I', `ar-i-${(emp ? emp.nombre.replace(/\s+/g, '-') : 'calculo')}-${todayStr()}.pdf`);
      if (!res.canceled) toast('PDF guardado: ' + res.filePath, 'success');
    });

    cont.querySelector('#btnDescargarExcelARI').addEventListener('click', async () => {
      const anoGravable = new Date().getFullYear();
      const rows = [
        ['IMPUESTO SOBRE LA RENTA — Formulario AR-I (casillas de la planilla oficial)'],
        ['Empresa u organismo', state.CONFIG.nombreEmpresa],
        ['RIF', state.CONFIG.rif || ''],
        ['Apellidos y nombres', emp ? emp.nombre : ''],
        ['Cédula de identidad', emp && emp.cedula ? emp.cedula : ''],
        ['Año gravable', anoGravable],
        ['Fecha del cálculo', todayStr()],
        [],
        ['Casilla', 'Concepto', 'Valor'],
        ['A', 'Total que estima percibir en el año (Bs.)', ingresoAnualBs],
        ['—', 'Unidad Tributaria (Bs.)', utValorBs],
        ['B', 'Remuneraciones convertidas a U.T. (A ÷ U.T.)', Number(r.ingresoAnualUT.toFixed(2))],
        [letraDesgravamen, `Desgravamen ${letraDesgravamen === 'E' ? 'único' : 'estimado'} (U.T.)`, desgravamenUT],
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
        defaultFilename: `ar-i-${(emp ? emp.nombre.replace(/\s+/g, '-') : 'calculo')}-${todayStr()}.xlsx`
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
