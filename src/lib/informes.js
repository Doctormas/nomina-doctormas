// Generadores de informes para contabilidad — antes vivían todos juntos en la
// pestaña "Informes"; ahora cada uno vive dentro del segmento "Informes" de la
// pestaña con la que se relaciona (Nómina, Vacaciones, Utilidades, Prestaciones).
import { state, tipoNominaCfg, empresaConRif } from '../state/store.js';
import { logoHeaderHTML } from './logo.js';
import { estadoVacaciones, calcularPrestaciones, antiguedad, salarioVigente, diasUtilidadesEmp, cestaticketEmp, islrPorcentajeEmp } from '../lib/calculos.js';
import { fmt } from './moneda.js';
import { fmtDate, tablaToCSV } from './formato.js';
import { downloadCSV } from './csv.js';
import { toast } from '../components/toast.js';

/**
 * Bloque estándar de acciones para un informe: imprimir / CSV / PDF.
 * Distinto de resultadoConAcciones (que es para un cálculo individual con
 * opción de "guardar en historial") porque un informe es una tabla ya
 * agregada que se exporta, no un registro que se guarda.
 */
export function informeConAcciones({ contenidoHtml, filename, pdfTitle, csvHeaders, csvRows }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div>${contenidoHtml}</div>
    <div class="btn-row no-print" style="margin-top:14px;">
      <button class="btn ghost" data-accion="imprimir">Imprimir</button>
      ${csvHeaders ? '<button class="btn secondary" data-accion="csv">Descargar CSV</button>' : ''}
      <button class="btn" data-accion="pdf">Descargar PDF</button>
    </div>`;

  wrap.querySelector('[data-accion="imprimir"]').addEventListener('click', () => window.print());

  if (csvHeaders) {
    wrap.querySelector('[data-accion="csv"]').addEventListener('click', () => {
      const csv = tablaToCSV(csvHeaders, csvRows);
      downloadCSV(csv, `${filename.replace(/\.pdf$/, '')}.csv`);
    });
  }

  wrap.querySelector('[data-accion="pdf"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Generando…';
    try {
      const res = await window.api.pdf.export(contenidoHtml, pdfTitle || 'Informe', filename);
      if (!res.canceled) toast('PDF guardado: ' + res.filePath, 'success');
    } catch (err) {
      toast('No se pudo generar el PDF: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  });

  return wrap;
}

/* ---------- Nómina ---------- */
export function generarInformeNomina(desde, hasta, tipoPeriodo) {
  const periodos = state.PERIODOS.filter((p) => p.fecha >= desde && p.fecha <= hasta && (tipoPeriodo === 'todos' || p.tipoPeriodo === tipoPeriodo));
  const filas = periodos.map((p) => {
    const emp = state.EMPLEADOS.find((e) => e.id === p.empId);
    const r = p.resultado;
    return { nombre: emp ? emp.nombre : '—', tipo: tipoNominaCfg(p.tipoPeriodo).label, fecha: p.fecha, devengado: r.totalDevengado, deducciones: r.totalDeducciones, neto: r.neto, aportes: r.aportesPatronales };
  }).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const totales = filas.reduce((a, f) => ({
    devengado: a.devengado + f.devengado, deducciones: a.deducciones + f.deducciones, neto: a.neto + f.neto, aportes: a.aportes + f.aportes
  }), { devengado: 0, deducciones: 0, neto: 0, aportes: 0 });
  return { filas, totales };
}

export function construirInformeNominaHTML(desde, hasta, tipoPeriodo) {
  const { filas, totales } = generarInformeNomina(desde, hasta, tipoPeriodo);
  const rows = filas.map((f) => `<tr><td>${f.nombre}</td><td>${f.tipo}</td><td>${fmtDate(f.fecha)}</td><td>${fmt(f.devengado)}</td><td>${fmt(f.deducciones)}</td><td>${fmt(f.neto)}</td><td>${fmt(f.aportes)}</td></tr>`).join('');
  const contenidoHtml = `
    <div>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Resumen de nómina</h3>
      <div class="legal">Del ${fmtDate(desde)} al ${fmtDate(hasta)}</div>
      <table style="margin-top:10px;"><thead><tr><th>Empleado</th><th>Tipo</th><th>Fecha</th><th>Devengado</th><th>Deducciones</th><th>Neto</th><th>Aportes patronales</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:var(--charcoal-soft);">Sin recibos generados en este rango.</td></tr>'}</tbody></table>
      <div class="totals">
        <div class="item"><div class="lbl">Total devengado</div><div class="val">${fmt(totales.devengado)}</div></div>
        <div class="item"><div class="lbl">Total deducciones</div><div class="val">${fmt(totales.deducciones)}</div></div>
        <div class="item"><div class="lbl">Total neto</div><div class="val">${fmt(totales.neto)}</div></div>
        <div class="item"><div class="lbl">Total aportes patronales</div><div class="val">${fmt(totales.aportes)}</div></div>
      </div>
    </div>`;
  return {
    contenidoHtml,
    csvHeaders: ['Empleado', 'Tipo', 'Fecha', 'Devengado', 'Deducciones', 'Neto', 'Aportes patronales'],
    csvRows: filas.map((f) => [f.nombre, f.tipo, f.fecha, f.devengado.toFixed(2), f.deducciones.toFixed(2), f.neto.toFixed(2), f.aportes.toFixed(2)])
  };
}

/* ---------- Parafiscales / aportes al Estado (pestaña Parafiscales) ---------- */
export function generarInformeAportes(desde, hasta) {
  const periodos = state.PERIODOS.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const totales = periodos.reduce((a, p) => ({
    ivss: a.ivss + p.resultado.ivssPatrono, faov: a.faov + p.resultado.faovPatrono,
    rpe: a.rpe + p.resultado.rpePatrono, inces: a.inces + p.resultado.incesPatrono,
    dpp: a.dpp + (p.resultado.dppPatrono || 0),
    ivssTrab: a.ivssTrab + p.resultado.ivssTrab, faovTrab: a.faovTrab + p.resultado.faovTrab, rpeTrab: a.rpeTrab + p.resultado.rpeTrab
  }), { ivss: 0, faov: 0, rpe: 0, inces: 0, dpp: 0, ivssTrab: 0, faovTrab: 0, rpeTrab: 0 });
  const totalPatrono = totales.ivss + totales.faov + totales.rpe + totales.inces + totales.dpp;
  return { totales, totalPatrono, cantidad: periodos.length };
}

export function construirInformeAportesHTML(desde, hasta) {
  const { totales, totalPatrono, cantidad } = generarInformeAportes(desde, hasta);
  const contenidoHtml = `
    <div>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Parafiscales y aportes al Estado</h3>
      <div class="legal">Del ${fmtDate(desde)} al ${fmtDate(hasta)} · ${cantidad} recibos de nómina considerados</div>
      <table style="margin-top:10px;">
        <thead><tr><th>Concepto</th><th>Retenido al trabajador</th><th>Aportado por el patrono</th></tr></thead>
        <tbody>
          <tr><td>IVSS</td><td>${fmt(totales.ivssTrab)}</td><td>${fmt(totales.ivss)}</td></tr>
          <tr><td>FAOV / BANAVIH</td><td>${fmt(totales.faovTrab)}</td><td>${fmt(totales.faov)}</td></tr>
          <tr><td>RPE / Paro forzoso</td><td>${fmt(totales.rpeTrab)}</td><td>${fmt(totales.rpe)}</td></tr>
          <tr><td>INCES</td><td>—</td><td>${fmt(totales.inces)}</td></tr>
          <tr><td>Ley de Protección de las Pensiones (DPP, SENIAT)</td><td>—</td><td>${fmt(totales.dpp)}</td></tr>
        </tbody>
      </table>
      <div class="totals"><div class="item"><div class="lbl">Total aportado por Doctormás al Estado</div><div class="val">${fmt(totalPatrono)}</div></div></div>
      <div class="note" style="margin-top:12px;">El INCES trabajador (0,5%) solo se calcula sobre utilidades y aparece en el informe de Utilidades, no aquí. La DPP se calculó con la base mínima por trabajador vigente (${state.CONFIG.dppBaseMinima} ${state.CONFIG.dppBaseMinimaMoneda === 'USD' ? 'USD' : 'Bs.'} — Art. 7 Ley DPP) para quien ganó menos que eso en el mes. Verifique siempre las alícuotas vigentes (IVSS, FAOV, INCES, RPE en Gaceta Oficial; DPP en el portal del SENIAT) antes de declarar y pagar.</div>
    </div>`;
  return {
    contenidoHtml,
    csvHeaders: ['Concepto', 'Retenido trabajador', 'Aportado patrono'],
    csvRows: [
      ['IVSS', totales.ivssTrab.toFixed(2), totales.ivss.toFixed(2)],
      ['FAOV', totales.faovTrab.toFixed(2), totales.faov.toFixed(2)],
      ['RPE', totales.rpeTrab.toFixed(2), totales.rpe.toFixed(2)],
      ['INCES', '', totales.inces.toFixed(2)],
      ['DPP (Ley de Protección de las Pensiones)', '', totales.dpp.toFixed(2)],
      ['Total aportado por Doctormás', '', totalPatrono.toFixed(2)]
    ]
  };
}

/* ---------- Vacaciones: libro de vacaciones ---------- */
export function generarLibroVacaciones(fechaCorte) {
  return state.EMPLEADOS.map((emp) => {
    const v = estadoVacaciones(emp, fechaCorte);
    const disfrutes = state.VAC_DISFRUTE.filter((d) => d.empId === emp.id).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    return { emp, periodos: v.periodosDerecho, pendientesTotal: v.pendientesTotal, disfrutes };
  });
}

export function construirLibroVacacionesHTML(hasta) {
  const libro = generarLibroVacaciones(hasta);
  const bloques = libro.map(({ emp, periodos, pendientesTotal, disfrutes }) => {
    const filasPeriodos = periodos.map((p) => `<tr><td>Año ${p.anoServicio}</td><td>${fmtDate(p.fechaCumple)}</td><td>${p.diasCorresponden}</td><td>${p.diasBono}</td><td>${p.diasDisfrutados}</td><td>${p.diasPendientes}</td></tr>`).join('');
    const filasDisfrute = disfrutes.map((d) => `<tr><td>${fmtDate(d.fecha)}</td><td>Año ${d.anoServicio}</td><td>${d.dias}</td></tr>`).join('');
    return `
      <h3 style="font-size:.95rem;margin-top:18px;">${emp.nombre} ${emp.activo === false ? '<span class="tag err">Inactivo</span>' : ''}</h3>
      <table><thead><tr><th>Período</th><th>Se cumple</th><th>Días vac.</th><th>Días bono</th><th>Disfrutados</th><th>Pendientes</th></tr></thead>
      <tbody>${filasPeriodos || '<tr><td colspan="6" style="color:var(--charcoal-soft);">Aún no cumple su primer año.</td></tr>'}</tbody></table>
      <div class="legal" style="margin-top:6px;">Disfrutes registrados:</div>
      <table><tbody>${filasDisfrute || '<tr><td style="color:var(--charcoal-soft);">Sin disfrutes registrados.</td></tr>'}</tbody></table>
      <div class="legal">Total pendiente: ${pendientesTotal} días</div>
    `;
  }).join('<hr style="border:none;border-top:1px solid var(--line);margin:16px 0;">');
  const contenidoHtml = `<div>${logoHeaderHTML()}<h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Libro de vacaciones</h3><div class="legal">Corte al ${fmtDate(hasta)}</div>${bloques || '<div class="note">No hay empleados registrados.</div>'}</div>`;
  return {
    contenidoHtml,
    csvHeaders: ['Empleado', 'Año servicio', 'Fecha cumple', 'Días vac.', 'Días bono', 'Disfrutados', 'Pendientes'],
    csvRows: libro.flatMap(({ emp, periodos }) => periodos.map((p) => [emp.nombre, p.anoServicio, p.fechaCumple, p.diasCorresponden, p.diasBono, p.diasDisfrutados, p.diasPendientes]))
  };
}

/* ---------- Utilidades ---------- */
export function generarInformeUtilidades(ano) {
  const filas = state.UTILIDADES_PAGADAS.filter((u) => u.ano === ano).map((u) => {
    const emp = state.EMPLEADOS.find((e) => e.id === u.empId);
    return { nombre: emp ? emp.nombre : '—', dias: u.resultado.diasProporcion, bruto: u.resultado.montoBruto, inces: u.resultado.incesTrabajador, neto: u.resultado.montoNeto };
  });
  const totales = filas.reduce((a, f) => ({ bruto: a.bruto + f.bruto, inces: a.inces + f.inces, neto: a.neto + f.neto }), { bruto: 0, inces: 0, neto: 0 });
  return { filas, totales };
}

export function construirInformeUtilidadesHTML(ano) {
  const { filas, totales } = generarInformeUtilidades(ano);
  const rows = filas.map((f) => `<tr><td>${f.nombre}</td><td>${f.dias.toFixed(1)}</td><td>${fmt(f.bruto)}</td><td>${fmt(f.inces)}</td><td>${fmt(f.neto)}</td></tr>`).join('');
  const contenidoHtml = `
    <div>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Utilidades ${ano}</h3>
      <table style="margin-top:10px;"><thead><tr><th>Empleado</th><th>Días</th><th>Bruto</th><th>INCES</th><th>Neto</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--charcoal-soft);">Sin utilidades registradas para este año.</td></tr>'}</tbody></table>
      <div class="totals">
        <div class="item"><div class="lbl">Total bruto</div><div class="val">${fmt(totales.bruto)}</div></div>
        <div class="item"><div class="lbl">Total INCES</div><div class="val">${fmt(totales.inces)}</div></div>
        <div class="item"><div class="lbl">Total neto</div><div class="val">${fmt(totales.neto)}</div></div>
      </div>
    </div>`;
  return {
    contenidoHtml,
    csvHeaders: ['Empleado', 'Días', 'Bruto', 'INCES', 'Neto'],
    csvRows: filas.map((f) => [f.nombre, f.dias.toFixed(2), f.bruto.toFixed(2), f.inces.toFixed(2), f.neto.toFixed(2)])
  };
}

/* ---------- Prestaciones sociales ---------- */
export function generarInformePrestaciones(fechaCorte) {
  return state.EMPLEADOS.filter((e) => e.activo !== false).map((emp) => ({ emp, p: calcularPrestaciones(emp, fechaCorte) })).filter((x) => x.p);
}

export function construirInformePrestacionesHTML(hasta) {
  const datos = generarInformePrestaciones(hasta);
  const rows = datos.map(({ emp, p }) => `<tr><td>${emp.nombre}</td><td>${fmt(p.totalAcumuladoDeposito)}</td><td>${fmt(p.interesAcumulado)}</td><td>${fmt(p.retroactivo)}</td><td><b>${fmt(p.montoAPagar)}</b></td></tr>`).join('');
  const totalGeneral = datos.reduce((a, { p }) => a + p.montoAPagar, 0);
  const contenidoHtml = `
    <div>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Prestaciones sociales (provisión contable)</h3>
      <div class="legal">Corte al ${fmtDate(hasta)}</div>
      <table style="margin-top:10px;"><thead><tr><th>Empleado</th><th>Acumulado depositado</th><th>Intereses</th><th>Retroactivo</th><th>A provisionar</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--charcoal-soft);">Sin empleados activos.</td></tr>'}</tbody></table>
      <div class="totals"><div class="item"><div class="lbl">Total a provisionar</div><div class="val">${fmt(totalGeneral)}</div></div></div>
    </div>`;
  return {
    contenidoHtml,
    csvHeaders: ['Empleado', 'Acumulado depositado', 'Intereses', 'Retroactivo', 'A provisionar'],
    csvRows: datos.map(({ emp, p }) => [emp.nombre, p.totalAcumuladoDeposito.toFixed(2), p.interesAcumulado.toFixed(2), p.retroactivo.toFixed(2), p.montoAPagar.toFixed(2)])
  };
}

/* ---------- Empleados: listado de personal ---------- */
export function construirListadoEmpleadosHTML(soloActivos) {
  const fecha = new Date().toISOString().slice(0, 10);
  const lista = soloActivos ? state.EMPLEADOS.filter((e) => e.activo !== false) : state.EMPLEADOS;
  const rows = lista.map((e) => {
    const ant = antiguedad(e.fechaIngreso);
    return `<tr>
      <td>${e.nombre}</td><td>${e.cedula || '—'}</td><td>${e.cargo || '—'}</td><td>${e.departamento || '—'}</td>
      <td>${fmtDate(e.fechaIngreso)}</td><td>${ant.anos}a ${ant.meses}m</td>
      <td>${fmt(salarioVigente(e, fecha))}</td><td>${diasUtilidadesEmp(e)}</td><td>${fmt(cestaticketEmp(e, fecha), fecha)}</td>
      <td>${e.activo === false ? 'Inactivo' : 'Activo'}</td>
    </tr>`;
  }).join('');
  const contenidoHtml = `
    <div>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Listado de personal</h3>
      <div class="legal">${soloActivos ? 'Solo empleados activos' : 'Todos los empleados'} · al ${fmtDate(fecha)} · ${lista.length} personas</div>
      <table style="margin-top:10px;"><thead><tr><th>Nombre</th><th>Cédula</th><th>Cargo</th><th>Departamento</th><th>Ingreso</th><th>Antigüedad</th><th>Salario actual</th><th>Días utilidades</th><th>Bono de alimentación</th><th>Estado</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="10" style="text-align:center;color:var(--charcoal-soft);">Aún no hay empleados registrados.</td></tr>'}</tbody></table>
    </div>`;
  return {
    contenidoHtml,
    csvHeaders: ['Nombre', 'Cédula', 'Cargo', 'Departamento', 'Ingreso', 'Antigüedad', 'Salario actual', 'Días utilidades', 'Bono de alimentación', 'Estado'],
    csvRows: lista.map((e) => {
      const ant = antiguedad(e.fechaIngreso);
      return [e.nombre, e.cedula || '', e.cargo || '', e.departamento || '', e.fechaIngreso, `${ant.anos}a ${ant.meses}m`, salarioVigente(e, fecha).toFixed(2), diasUtilidadesEmp(e), cestaticketEmp(e, fecha).toFixed(2), e.activo === false ? 'Inactivo' : 'Activo'];
    })
  };
}

/* ---------- ISLR: AR-I (% vigente por empleado) ---------- */
export function construirInformeARIHTML() {
  const conRetencion = state.EMPLEADOS.filter((e) => islrPorcentajeEmp(e) > 0);
  const rows = conRetencion.map((e) => `<tr><td>${e.nombre}</td><td>${e.cedula || '—'}</td><td>${islrPorcentajeEmp(e)}%</td></tr>`).join('');
  const contenidoHtml = `
    <div>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — AR-I: % de retención de ISLR por empleado</h3>
      <div class="legal">Solo se listan quienes tienen un % configurado en su ficha (Empleados). El resto no tiene retención de ISLR activa.</div>
      <table style="margin-top:10px;"><thead><tr><th>Empleado</th><th>Cédula</th><th>% ISLR a retener</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:var(--charcoal-soft);">Ningún empleado tiene % de ISLR configurado.</td></tr>'}</tbody></table>
      <div class="note" style="margin-top:12px;">El % se calcula con la planilla AR-I que llena cada trabajador obligado a declarar (ingresos anuales estimados superiores a 1.000 U.T.) y se edita en la ficha del empleado.</div>
    </div>`;
  return {
    contenidoHtml,
    csvHeaders: ['Empleado', 'Cédula', '% ISLR'],
    csvRows: conRetencion.map((e) => [e.nombre, e.cedula || '', islrPorcentajeEmp(e)])
  };
}

/* ---------- ISLR: AR-C (comprobante anual de retenciones) ---------- */
export function generarInformeARC(ano) {
  const desde = ano + '-01-01', hasta = ano + '-12-31';
  const periodos = state.PERIODOS.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const porEmpleado = new Map();
  periodos.forEach((p) => {
    const emp = state.EMPLEADOS.find((e) => e.id === p.empId);
    if (!emp) return;
    const acc = porEmpleado.get(p.empId) || { emp, remuneracion: 0, islr: 0 };
    acc.remuneracion += p.resultado.salarioNormalPeriodo;
    acc.islr += p.resultado.islrTrab || 0;
    porEmpleado.set(p.empId, acc);
  });
  const filas = Array.from(porEmpleado.values()).filter((f) => f.islr > 0).sort((a, b) => a.emp.nombre.localeCompare(b.emp.nombre));
  const totales = filas.reduce((a, f) => ({ remuneracion: a.remuneracion + f.remuneracion, islr: a.islr + f.islr }), { remuneracion: 0, islr: 0 });
  return { filas, totales };
}

export function construirInformeARCHTML(ano) {
  const { filas, totales } = generarInformeARC(ano);
  const rows = filas.map((f) => `<tr><td>${f.emp.nombre}</td><td>${f.emp.cedula || '—'}</td><td>${fmt(f.remuneracion)}</td><td>${fmt(f.islr)}</td></tr>`).join('');
  const contenidoHtml = `
    <div>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — AR-C: comprobante anual de retenciones ${ano}</h3>
      <div class="legal">Solo empleados con retención de ISLR durante el año</div>
      <table style="margin-top:10px;"><thead><tr><th>Empleado</th><th>Cédula</th><th>Remuneración del año</th><th>ISLR retenido</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--charcoal-soft);">Nadie tuvo retención de ISLR en este año.</td></tr>'}</tbody></table>
      <div class="totals">
        <div class="item"><div class="lbl">Total remuneración</div><div class="val">${fmt(totales.remuneracion)}</div></div>
        <div class="item"><div class="lbl">Total ISLR retenido</div><div class="val">${fmt(totales.islr)}</div></div>
      </div>
      <div class="note" style="margin-top:12px;">Este comprobante resume lo calculado en esta app a partir de las corridas de nómina guardadas — sirve de insumo para llenar el formulario oficial AR-C ante el SENIAT; verifique los montos con su contador antes de declarar.</div>
    </div>`;
  return {
    contenidoHtml,
    csvHeaders: ['Empleado', 'Cédula', 'Remuneración del año', 'ISLR retenido'],
    csvRows: filas.map((f) => [f.emp.nombre, f.emp.cedula || '', f.remuneracion.toFixed(2), f.islr.toFixed(2)])
  };
}
