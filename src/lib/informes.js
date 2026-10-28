// Generadores de informes para contabilidad — antes vivían todos juntos en la
// pestaña "Informes"; ahora cada uno vive dentro del segmento "Informes" de la
// pestaña con la que se relaciona (Nómina, Vacaciones, Utilidades, Prestaciones).
import { state, tipoNominaCfg, empresaConRif, tasaEnFecha } from '../state/store.js';
import { logoHeaderHTML } from './logo.js';
import { estadoVacaciones, calcularPrestaciones, antiguedad, salarioVigente, diasUtilidadesEmp, cestaticketEmp, islrPorcentajeEmp, calcularDPPMes, calcularParafiscalesMes, calcularParafiscalesPeriodo } from '../lib/calculos.js';
import { fmt } from './moneda.js';
import { fmtDate, fmtNum, tablaToCSV } from './formato.js';
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

/* ---------- Parafiscales / aportes al Estado (pestaña Parafiscales) ----------
 * La Ley de Protección de las Pensiones (DPP) NO entra en este informe — se
 * calcula y se declara aparte, una vez al mes, en el segmento DPP de esta
 * misma pestaña (ver calcularDPPMes en calculos.js). */
export function generarInformeAportes(desde, hasta) {
  const periodos = state.PERIODOS.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const totales = periodos.reduce((a, p) => ({
    ivss: a.ivss + p.resultado.ivssPatrono, faov: a.faov + p.resultado.faovPatrono,
    rpe: a.rpe + p.resultado.rpePatrono, inces: a.inces + p.resultado.incesPatrono,
    ivssTrab: a.ivssTrab + p.resultado.ivssTrab, faovTrab: a.faovTrab + p.resultado.faovTrab, rpeTrab: a.rpeTrab + p.resultado.rpeTrab
  }), { ivss: 0, faov: 0, rpe: 0, inces: 0, ivssTrab: 0, faovTrab: 0, rpeTrab: 0 });
  const totalPatrono = totales.ivss + totales.faov + totales.rpe + totales.inces;
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
          <tr><td>RPE — Pérdida Involuntaria del Empleo</td><td>${fmt(totales.rpeTrab)}</td><td>${fmt(totales.rpe)}</td></tr>
          <tr><td>INCES</td><td>—</td><td>${fmt(totales.inces)}</td></tr>
        </tbody>
      </table>
      <div class="totals"><div class="item"><div class="lbl">Total aportado por Doctormás al Estado</div><div class="val">${fmt(totalPatrono)}</div></div></div>
      <div class="note" style="margin-top:12px;">El INCES trabajador (0,5%) solo se calcula sobre utilidades y aparece en el informe de Utilidades, no aquí. La Ley de Protección de las Pensiones (DPP) tampoco está en este informe — se calcula aparte, una vez al mes, en el segmento <b>DPP</b> de esta pestaña. Verifique siempre las alícuotas vigentes (IVSS, FAOV, INCES, RPE en Gaceta Oficial) antes de declarar y pagar.</div>
    </div>`;
  return {
    contenidoHtml,
    csvHeaders: ['Concepto', 'Retenido trabajador', 'Aportado patrono'],
    csvRows: [
      ['IVSS', totales.ivssTrab.toFixed(2), totales.ivss.toFixed(2)],
      ['FAOV', totales.faovTrab.toFixed(2), totales.faov.toFixed(2)],
      ['RPE — Pérdida Involuntaria del Empleo', totales.rpeTrab.toFixed(2), totales.rpe.toFixed(2)],
      ['INCES', '', totales.inces.toFixed(2)],
      ['Total aportado por Doctormás', '', totalPatrono.toFixed(2)]
    ]
  };
}

/* ---------- DPP (Ley de Protección de las Pensiones) — cálculo mensual ---------- */
/* ---------- Informe de nómina mensual (detallado) ---------- */
export function construirInformeNominaMensualHTML(mesISO) {
  const C = state.CONFIG;
  const n = (v) => fmt(v).replace(/^Bs\. /, '');
  const u = state.DISPLAY_CURRENCY === 'USD' ? 'US$' : 'Bs.';
  const periodos = state.PERIODOS.filter((p) => p.fecha.slice(0, 7) === mesISO);
  const porEmp = new Map();
  periodos.forEach((p) => {
    const r = p.resultado;
    if (!porEmp.has(p.empId)) {
      porEmp.set(p.empId, { emp: state.EMPLEADOS.find((e) => e.id === p.empId), dias: 0, salario: 0, bono: 0, devengado: 0, ivss: 0, rpe: 0, faov: 0, islr: 0, ded: 0, neto: 0, patr: 0, ingreso: false, egreso: false, recibos: 0 });
    }
    const f = porEmp.get(p.empId);
    f.dias += r.diasPeriodo || 0; f.salario += (r.salarioNormalPeriodo || 0) + (r.pagoFeriados || 0); f.bono += r.cestaticketPeriodo || 0;
    f.devengado += r.totalDevengado || 0; f.ivss += r.ivssTrab || 0; f.rpe += r.rpeTrab || 0; f.faov += r.faovTrab || 0; f.islr += r.islrTrab || 0;
    f.ded += r.totalDeducciones || 0; f.neto += r.neto || 0; f.patr += r.aportesPatronales || 0; f.recibos += 1;
    if (r.periodoParcial) { if (r.periodoParcialPorEgreso) f.egreso = true; else f.ingreso = true; }
  });
  const filas = Array.from(porEmp.values()).filter((f) => f.emp).sort((a, b) => a.emp.nombre.localeCompare(b.emp.nombre));
  const T = filas.reduce((a, f) => { Object.keys(f).forEach((k) => { if (typeof f[k] === 'number') a[k] = (a[k] || 0) + f[k]; }); return a; }, {});
  const S = (fn) => periodos.reduce((a, p) => a + (fn(p.resultado) || 0), 0);
  const pat = { ivss: S((r) => r.ivssPatrono), rpe: S((r) => r.rpePatrono), faov: S((r) => r.faovPatrono), inces: S((r) => r.incesPatrono) };
  const patTotal = pat.ivss + pat.rpe + pat.faov + pat.inces;
  const dpp = calcularDPPMes(mesISO);
  const bonoAparte = state.BONO_ALIM_PAGADO.filter((b) => b.fecha.slice(0, 7) === mesISO).reduce((a, b) => a + b.monto, 0);
  const retenciones = (T.ivss || 0) + (T.rpe || 0) + (T.faov || 0) + (T.islr || 0);
  const costo = (T.devengado || 0) + patTotal + dpp.totalDPP + bonoAparte;

  const filasHtml = filas.map((f) => `<tr>
    <td><b>${f.emp.nombre}</b>${f.egreso ? ' <span class="tag err">egresó</span>' : ''}${f.ingreso ? ' <span class="tag warn">ingresó</span>' : ''}<div class="legal">${f.emp.cargo || ''}${f.emp.departamento ? ' · ' + f.emp.departamento : ''}</div></td>
    <td style="text-align:center;">${Math.min(f.dias, 30)}</td><td>${n(f.salario)}</td><td>${n(f.bono)}</td><td><b>${n(f.devengado)}</b></td>
    <td>${n(f.ivss)}</td><td>${n(f.rpe)}</td><td>${n(f.faov)}</td><td>${n(f.islr)}</td><td>${n(f.ded)}</td><td><b>${n(f.neto)}</b></td><td>${n(f.patr)}</td>
  </tr>`).join('');

  const contenidoHtml = `
    <div class="nommes">
      <style>.nommes table.dn th,.nommes table.dn td{padding:3px 4px;font-size:8px;}.nommes table.dn th{font-size:6.5px;}.nommes table.dn td:not(:first-child){text-align:right;}.nommes table.dn td:nth-child(2){text-align:center;}</style>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Informe de nómina del mes ${mesISO}</h3>
      <div class="legal">${periodos.length} recibos guardados · ${filas.length} trabajadores · montos en ${u === 'Bs.' ? 'bolívares' : 'dólares'}. Conceptos salariales: sueldo. No salariales: bono de alimentación.</div>

      <table class="dn" style="margin-top:10px;">
        <thead><tr><th>Trabajador</th><th>Días</th><th>Sueldo (salarial)</th><th>Bono alim. (no salarial)</th><th>Total devengado</th><th>IVSS</th><th>RPE</th><th>FAOV</th><th>ISLR</th><th>Total deducc.</th><th>Neto pagado</th><th>Aportes patronales</th></tr></thead>
        <tbody>${filasHtml || '<tr class="empty-row"><td colspan="12">No hay nómina guardada en este mes.</td></tr>'}</tbody>
        <tfoot><tr><td><b>TOTAL</b></td><td></td><td><b>${n(T.salario || 0)}</b></td><td><b>${n(T.bono || 0)}</b></td><td><b>${n(T.devengado || 0)}</b></td><td><b>${n(T.ivss || 0)}</b></td><td><b>${n(T.rpe || 0)}</b></td><td><b>${n(T.faov || 0)}</b></td><td><b>${n(T.islr || 0)}</b></td><td><b>${n(T.ded || 0)}</b></td><td><b>${n(T.neto || 0)}</b></td><td><b>${n(T.patr || 0)}</b></td></tr></tfoot>
      </table>

      ${totalesPorConceptoMesHTML(mesISO, n, u)}

      <div style="display:flex;gap:14px;align-items:flex-start;margin-top:14px;">
        <table style="flex:1;"><thead><tr><th colspan="2">Aportes patronales del mes (por ente)</th></tr></thead><tbody>
          <tr><td>IVSS (${C.ivssPatrono}%)</td><td style="text-align:right;">${n(pat.ivss)}</td></tr>
          <tr><td>RPE (${C.rpePatrono}%)</td><td style="text-align:right;">${n(pat.rpe)}</td></tr>
          <tr><td>FAOV (${C.faovPatrono}%)</td><td style="text-align:right;">${n(pat.faov)}</td></tr>
          <tr><td>INCES (${C.incesPatrono}%)</td><td style="text-align:right;">${n(pat.inces)}</td></tr>
          <tr><td><b>Total aportes patronales</b></td><td style="text-align:right;"><b>${n(patTotal)}</b></td></tr>
        </tbody></table>
        <table style="flex:1;"><thead><tr><th colspan="2">Costo de la nómina para la empresa</th></tr></thead><tbody>
          <tr><td>Total devengado (sueldos + bono)</td><td style="text-align:right;">${n(T.devengado || 0)}</td></tr>
          ${bonoAparte > 0 ? `<tr><td>Bono de alimentación pagado aparte</td><td style="text-align:right;">${n(bonoAparte)}</td></tr>` : ''}
          <tr><td>Aportes patronales</td><td style="text-align:right;">${n(patTotal)}</td></tr>
          <tr><td>DPP del mes (${C.dppPatrono}%)</td><td style="text-align:right;">${n(dpp.totalDPP)}</td></tr>
          <tr><td><b>Costo total del mes</b></td><td style="text-align:right;"><b>${n(costo)}</b></td></tr>
        </tbody></table>
      </div>

      <div class="note" style="margin-top:12px;">De lo devengado, ${n(T.neto || 0)} se paga a los trabajadores y ${n(retenciones)} se retiene para enterar (IVSS, RPE, FAOV e ISLR). Los aportes patronales y la DPP se suman a lo devengado como costo de la empresa. El detalle por tributo y su periodicidad de declaración está en la pestaña Parafiscales.</div>
    </div>`;
  const d = (v) => (v || 0).toFixed(2);
  const csvHeaders = ['Trabajador', 'Cargo', 'Días', 'Sueldo salarial', 'Bono alimentación', 'Total devengado', 'IVSS', 'RPE', 'FAOV', 'ISLR', 'Total deducciones', 'Neto pagado', 'Aportes patronales'];
  const csvRows = filas.map((f) => [f.emp.nombre, f.emp.cargo || '', Math.min(f.dias, 30), d(f.salario), d(f.bono), d(f.devengado), d(f.ivss), d(f.rpe), d(f.faov), d(f.islr), d(f.ded), d(f.neto), d(f.patr)])
    .concat([['TOTAL', '', '', d(T.salario), d(T.bono), d(T.devengado), d(T.ivss), d(T.rpe), d(T.faov), d(T.islr), d(T.ded), d(T.neto), d(T.patr)]]);
  return { contenidoHtml, csvHeaders, csvRows };
}

/* ---------- Pagos mes a mes en dólares (salarial / no salarial) ---------- */
// Todo lo que se pagó en cada mes del año, convertido a USD con la tasa BCV de
// la fecha en que se pagó cada cosa (que es la misma con que se calculó).
// incluirParalela suma los bonos de la nómina paralela (solo si el usuario
// tiene acceso a esa sección — el llamador decide).
export function construirInformePagosMensualesUSD(ano, incluirParalela) {
  const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const doce = () => new Array(12).fill(0);
  let sinTasa = 0;
  const aUSD = (bsMonto, fecha) => {
    const t = tasaEnFecha(fecha);
    if (!t) { if (bsMonto) sinTasa += 1; return 0; }
    return bsMonto / t;
  };
  const mesIdx = (fecha) => Number(fecha.slice(5, 7)) - 1;
  const delAno = (fecha) => fecha && fecha.slice(0, 4) === String(ano);

  const filas = {
    sueldo: doce(), bonoAlim: doce(), bonoVac: doce(), utilidades: doce(), liquidaciones: doce(), paralela: doce(),
    ivss: doce(), rpe: doce(), faov: doce(), islr: doce(), incesUtil: doce(), patronal: doce()
  };
  const porTrabajador = new Map(); // clave -> { nombre, cargo, externo, meses[12] }
  const sumaTrab = (clave, nombre, cargo, externo, i, v) => {
    if (!porTrabajador.has(clave)) porTrabajador.set(clave, { nombre, cargo, externo, meses: doce() });
    porTrabajador.get(clave).meses[i] += v;
  };
  const datosEmp = (empId) => {
    const e = state.EMPLEADOS.find((x) => x.id === empId);
    return { nombre: e ? e.nombre : '(trabajador eliminado)', cargo: e ? (e.cargo || '') : '' };
  };

  state.PERIODOS.filter((p) => delAno(p.fecha)).forEach((p) => {
    const i = mesIdx(p.fecha); const r = p.resultado; const f = p.fecha;
    const sueldo = aUSD(r.salarioNormalPeriodo + (r.pagoFeriados || 0), f); const bono = aUSD(r.cestaticketPeriodo, f);
    filas.sueldo[i] += sueldo; filas.bonoAlim[i] += bono;
    filas.ivss[i] += aUSD(r.ivssTrab, f); filas.rpe[i] += aUSD(r.rpeTrab, f);
    filas.faov[i] += aUSD(r.faovTrab, f); filas.islr[i] += aUSD(r.islrTrab, f);
    filas.patronal[i] += aUSD(r.aportesPatronales, f);
    const d = datosEmp(p.empId);
    sumaTrab(p.empId, d.nombre, d.cargo, false, i, sueldo + bono);
  });
  state.BONO_ALIM_PAGADO.filter((b) => delAno(b.fecha)).forEach((b) => {
    const v = aUSD(b.monto, b.fecha); filas.bonoAlim[mesIdx(b.fecha)] += v;
    const d = datosEmp(b.empId); sumaTrab(b.empId, d.nombre, d.cargo, false, mesIdx(b.fecha), v);
  });
  state.BONO_VAC_PAGADO.filter((b) => delAno(b.fecha)).forEach((b) => {
    const v = aUSD(b.monto, b.fecha); filas.bonoVac[mesIdx(b.fecha)] += v;
    const d = datosEmp(b.empId); sumaTrab(b.empId, d.nombre, d.cargo, false, mesIdx(b.fecha), v);
  });
  state.UTILIDADES_PAGADAS.filter((u) => delAno(u.fecha)).forEach((u) => {
    const i = mesIdx(u.fecha);
    const v = aUSD(u.resultado.montoBruto, u.fecha);
    filas.utilidades[i] += v; filas.incesUtil[i] += aUSD(u.resultado.incesTrabajador, u.fecha);
    const d = datosEmp(u.empId); sumaTrab(u.empId, d.nombre, d.cargo, false, i, v);
  });
  state.LIQUIDACIONES.filter((l) => delAno(l.fecha)).forEach((l) => {
    const v = aUSD(l.resultado.totalGeneral, l.fecha); filas.liquidaciones[mesIdx(l.fecha)] += v;
    const d = datosEmp(l.empId); sumaTrab(l.empId, d.nombre, d.cargo, false, mesIdx(l.fecha), v);
  });
  if (incluirParalela && state.PARALELA && Array.isArray(state.PARALELA.pagos)) {
    state.PARALELA.pagos.filter((p) => delAno(p.fecha)).forEach((p) => {
      const i = mesIdx(p.fecha);
      p.items.forEach((it) => {
        const v = (it.moneda || p.moneda) === 'USD' ? it.monto : aUSD(it.montoBs, p.fecha);
        filas.paralela[i] += v;
        const per = (state.PARALELA.personas || []).find((x) => x.id === it.empId);
        const emp = state.EMPLEADOS.find((x) => x.id === it.empId);
        const snap = (p.nombres && p.nombres[it.empId]) || {};
        const nombre = (emp && emp.nombre) || (per && per.nombre) || snap.nombre || '—';
        const cargo = (emp && emp.cargo) || (per && per.cargo) || snap.cargo || '';
        sumaTrab(it.empId, nombre, cargo, !emp, i, v);
      });
    });
  }

  const suma = (a) => a.reduce((x, y) => x + y, 0);
  const sumar = (...arrs) => doce().map((_, i) => arrs.reduce((a, arr) => a + arr[i], 0));
  const salarial = filas.sueldo;
  const noSalarial = sumar(filas.bonoAlim, filas.bonoVac, filas.utilidades, filas.liquidaciones);
  const totalPagado = sumar(salarial, noSalarial, filas.paralela);
  const retenciones = sumar(filas.ivss, filas.rpe, filas.faov, filas.islr, filas.incesUtil);
  const neto = totalPagado.map((v, i) => v - retenciones[i]);

  const usd = (v) => (v ? '$' + fmtNum(v, 2) : '—');
  const filaHtml = (etiqueta, arr, fuerte, sub) => `<tr${fuerte ? ' style="background:#F7F3EF;"' : ''}>
    <td style="${sub ? 'padding-left:14px;' : ''}">${fuerte ? `<b>${etiqueta}</b>` : etiqueta}</td>
    ${arr.map((v) => `<td>${fuerte ? `<b>${usd(v)}</b>` : usd(v)}</td>`).join('')}
    <td><b>${usd(suma(arr))}</b></td></tr>`;
  const cabecera = `<tr><th>Concepto (US$)</th>${MES.map((m) => `<th>${m}</th>`).join('')}<th>Total ${ano}</th></tr>`;
  const seccion = (t) => `<tr><td colspan="14" style="background:#EAE3DB;"><b>${t}</b></td></tr>`;

  const trabajadores = Array.from(porTrabajador.values())
    .sort((a, b) => (a.externo - b.externo) || a.nombre.localeCompare(b.nombre));
  const trabHtml = trabajadores.map((t) => `<tr>
    <td>${t.nombre}${t.externo ? ' <span class="tag warn">paralela</span>' : ''}<div class="legal">${t.cargo}</div></td>
    ${t.meses.map((v) => `<td>${usd(v)}</td>`).join('')}<td><b>${usd(suma(t.meses))}</b></td></tr>`).join('');

  const contenidoHtml = `
    <div class="nommes">
      <style>.nommes table.dn th,.nommes table.dn td{padding:3px 3px;font-size:7.5px;}.nommes table.dn th{font-size:6.5px;}.nommes table.dn td:not(:first-child),.nommes table.dn th:not(:first-child){text-align:right;}</style>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Pagos de ${ano}, mes a mes, en dólares</h3>
      <div class="legal">Cada pago está convertido a US$ con la tasa BCV de su fecha de pago. Salarial: sueldo. No salarial: bono de alimentación, bono vacacional, utilidades y liquidaciones${incluirParalela ? '; además, los bonos de la nómina paralela' : ''}.${sinTasa ? ` <b>Atención:</b> ${sinTasa} pago(s) sin tasa BCV de su fecha no pudieron convertirse.` : ''}</div>

      <table class="dn" style="margin-top:10px;">
        <thead>${cabecera}</thead>
        <tbody>
          ${seccion('Conceptos salariales')}
          ${filaHtml('Sueldo', filas.sueldo, false, true)}
          ${filaHtml('Total salarial', salarial, true)}
          ${seccion('Conceptos no salariales')}
          ${filaHtml('Bono de alimentación', filas.bonoAlim, false, true)}
          ${filaHtml('Bono vacacional', filas.bonoVac, false, true)}
          ${filaHtml('Utilidades', filas.utilidades, false, true)}
          ${filaHtml('Liquidaciones (prestaciones, vacaciones, etc.)', filas.liquidaciones, false, true)}
          ${filaHtml('Total no salarial', noSalarial, true)}
          ${incluirParalela ? seccion('Nómina paralela') + filaHtml('Bonos nómina paralela', filas.paralela, true) : ''}
          ${filaHtml('TOTAL PAGADO (bruto)', totalPagado, true)}
          ${seccion('Retenciones al trabajador (incluidas arriba)')}
          ${filaHtml('IVSS', filas.ivss, false, true)}
          ${filaHtml('RPE', filas.rpe, false, true)}
          ${filaHtml('FAOV', filas.faov, false, true)}
          ${filaHtml('ISLR', filas.islr, false, true)}
          ${filaHtml('INCES sobre utilidades', filas.incesUtil, false, true)}
          ${filaHtml('Total retenciones', retenciones, true)}
          ${filaHtml('NETO PAGADO A LOS TRABAJADORES', neto, true)}
          ${seccion('Costo adicional de la empresa (no incluido arriba)')}
          ${filaHtml('Aportes patronales (IVSS, RPE, FAOV, INCES)', filas.patronal, false, true)}
        </tbody>
      </table>

      <h3 style="font-size:.95rem;margin:16px 0 4px;">Total pagado por trabajador (bruto, US$)</h3>
      <table class="dn">
        <thead><tr><th>Trabajador</th>${MES.map((m) => `<th>${m}</th>`).join('')}<th>Total ${ano}</th></tr></thead>
        <tbody>${trabHtml || '<tr class="empty-row"><td colspan="14">No hay pagos registrados en este año.</td></tr>'}</tbody>
        <tfoot><tr><td><b>TOTAL</b></td>${totalPagado.map((v) => `<td><b>${usd(v)}</b></td>`).join('')}<td><b>${usd(suma(totalPagado))}</b></td></tr></tfoot>
      </table>
    </div>`;

  const d = (v) => v.toFixed(2);
  const csvHeaders = ['Concepto', ...MES, `Total ${ano}`];
  const lin = (nom, arr) => [nom, ...arr.map(d), d(suma(arr))];
  const csvRows = [
    lin('Sueldo (salarial)', filas.sueldo), lin('Bono de alimentación', filas.bonoAlim), lin('Bono vacacional', filas.bonoVac),
    lin('Utilidades', filas.utilidades), lin('Liquidaciones', filas.liquidaciones),
    ...(incluirParalela ? [lin('Bonos nómina paralela', filas.paralela)] : []),
    lin('TOTAL PAGADO (bruto)', totalPagado), lin('IVSS', filas.ivss), lin('RPE', filas.rpe), lin('FAOV', filas.faov), lin('ISLR', filas.islr),
    lin('INCES utilidades', filas.incesUtil), lin('NETO PAGADO', neto), lin('Aportes patronales', filas.patronal),
    ['', ...MES.map(() => ''), ''],
    ...trabajadores.map((t) => lin(t.nombre + (t.externo ? ' (paralela)' : ''), t.meses))
  ];
  return { contenidoHtml, csvHeaders, csvRows };
}

/* ---------- Parafiscales del mes (sobre lo devengado salarial) ---------- */
// Totales por concepto del mes: una columna por cada corrida de nómina
// guardada ese mes (ej. 1ra y 2da quincena) y la columna TOTAL DEL MES.
function totalesPorConceptoMesHTML(mesISO, n, u) {
  const periodos = state.PERIODOS.filter((p) => p.fecha.slice(0, 7) === mesISO);
  const grupos = new Map();
  periodos.forEach((p) => {
    const k = `${p.fecha}|${p.tipoPeriodo}`;
    if (!grupos.has(k)) grupos.set(k, { fecha: p.fecha, tipo: p.tipoPeriodo, rs: [] });
    grupos.get(k).rs.push(p.resultado);
  });
  const corridas = Array.from(grupos.values()).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const bonoAparte = state.BONO_ALIM_PAGADO.filter((b) => b.fecha.slice(0, 7) === mesISO).reduce((a, b) => a + b.monto, 0);
  const suma = (rs, fn) => rs.reduce((a, r) => a + (fn(r) || 0), 0);
  const filas = [
    ['Conceptos salariales (sueldo y feriados trabajados)', (r) => r.salarioNormalPeriodo + (r.pagoFeriados || 0), false],
    ['Conceptos no salariales (bono de alimentación)', (r) => r.cestaticketPeriodo, false],
    ['TOTAL DEVENGADO', (r) => r.totalDevengado, true],
    ['(−) IVSS trabajador', (r) => r.ivssTrab, false],
    ['(−) RPE trabajador', (r) => r.rpeTrab, false],
    ['(−) FAOV trabajador', (r) => r.faovTrab, false],
    ['(−) ISLR retenido', (r) => r.islrTrab, false],
    ['TOTAL DEDUCCIONES', (r) => r.totalDeducciones, true],
    ['NETO A PAGAR', (r) => r.neto, true],
    ['Aporte patronal IVSS', (r) => r.ivssPatrono, false],
    ['Aporte patronal RPE', (r) => r.rpePatrono, false],
    ['Aporte patronal FAOV', (r) => r.faovPatrono, false],
    ['Aporte patronal INCES', (r) => r.incesPatrono, false],
    ['TOTAL APORTES PATRONALES', (r) => r.aportesPatronales, true]
  ];
  const todos = corridas.flatMap((c) => c.rs);
  const encabezados = corridas.map((c) => `<th style="text-align:right;">${tipoNominaCfg(c.tipo).label.split('—')[0].trim()}<div class="legal">${fmtDate(c.fecha)} · ${c.rs.length} recibos</div></th>`).join('');
  const cuerpo = filas.map(([nom, fn, fuerte]) => {
    const cel = (v) => `<td style="text-align:right;">${fuerte ? `<b>${n(v)}</b>` : n(v)}</td>`;
    return `<tr><td>${fuerte ? `<b>${nom}</b>` : nom}</td>${corridas.map((c) => cel(suma(c.rs, fn))).join('')}${cel(suma(todos, fn))}</tr>`;
  }).join('');
  return `
      <h3 style="font-size:.95rem;margin:16px 0 4px;">Totales por concepto del mes — todas las nóminas guardadas en ${mesISO}</h3>
      <table><thead><tr><th>Concepto (${u})</th>${encabezados}<th style="text-align:right;">TOTAL DEL MES</th></tr></thead>
      <tbody>${cuerpo || '<tr class="empty-row"><td colspan="3">No hay nóminas guardadas en este mes.</td></tr>'}</tbody></table>
      ${bonoAparte > 0 ? `<div class="legal">Además se pagó en corrida aparte de bono de alimentación (no salarial): ${n(bonoAparte)}.</div>` : ''}`;
}


export function construirInformeParafiscalesMesHTML(mesISO) {
  const { filas, totales: T, recibosGuardados } = calcularParafiscalesMes(mesISO);
  const C = state.CONFIG;
  const n = (v) => fmt(v).replace(/^Bs\. /, '');
  const u = state.DISPLAY_CURRENCY === 'USD' ? 'US$' : 'Bs.';
  const filasHtml = filas.map((f) => `<tr>
    <td><b>${f.emp.nombre}</b>${f.inscrito ? '' : ' <span class="tag err">no inscrito IVSS</span>'}</td>
    <td style="text-align:center;">${f.dias}</td><td>${n(f.salario)}</td><td style="color:#8a7f77;">${n(f.bono)}</td>
    <td>${n(f.ivssT)}</td><td>${n(f.ivssP)}</td><td>${n(f.rpeT)}</td><td>${n(f.rpeP)}</td>
    <td>${n(f.faovT)}</td><td>${n(f.faovP)}</td><td>${n(f.incesP)}</td><td>${n(f.islr)}</td>
  </tr>`).join('');
  const filasBases = filas.map((f) => `<tr><td>${f.emp.nombre}</td>
    <td>${n(f.salario)}</td><td>${n(f.baseIVSS)}${f.declaradoIVSS ? ' <span class="tag warn">sueldo semanal IVSS</span>' : ''}</td><td>${n(f.baseRPE)}</td><td>${n(f.baseFAOV)}</td><td>${n(f.baseINCES)}</td></tr>`).join('');
  const entes = [
    ['IVSS', T.baseIVSS, T.ivssT, T.ivssP, `${C.ivssTrabajador}% trab. / ${C.ivssPatrono}% patr.`],
    ['RPE — Pérdida Involuntaria del Empleo', T.baseRPE, T.rpeT, T.rpeP, `${C.rpeTrabajador}% trab. / ${C.rpePatrono}% patr.`],
    ['FAOV / BANAVIH', T.baseFAOV, T.faovT, T.faovP, `${C.faovTrabajador}% trab. / ${C.faovPatrono}% patr. (salario normal)`],
    ['INCES', T.baseINCES, 0, T.incesP, `${C.incesPatrono}% patronal`],
    ['ISLR retenido (SENIAT)', T.salario, T.islr, 0, 'Según % del AR-I de cada trabajador']
  ];
  const tTrab = entes.reduce((a, e) => a + e[2], 0), tPatr = entes.reduce((a, e) => a + e[3], 0);
  const filasEntes = entes.map(([nom, base, t, p, nota]) => `<tr><td>${nom}<div class="legal">${nota}</div></td><td style="text-align:right;">${n(base)}</td><td style="text-align:right;">${t ? n(t) : '—'}</td><td style="text-align:right;">${p ? n(p) : '—'}</td><td style="text-align:right;"><b>${n(t + p)}</b></td></tr>`).join('');
  const contenidoHtml = `
    <div class="parafmes">
      <style>.parafmes table.dn th,.parafmes table.dn td{padding:3px 4px;font-size:8px;}.parafmes table.dn th{font-size:6.5px;}.parafmes table.dn td:not(:first-child){text-align:right;}.parafmes table.dn td:nth-child(2){text-align:center;}</style>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Parafiscales del mes ${mesISO}</h3>
      <div class="legal">Cada quincena se calcula a sus 15 días sobre lo devengado en conceptos <b>salariales</b>; este informe es la suma de los ${recibosGuardados} recibos guardados del mes. El bono de alimentación no es salarial y queda fuera de la base. Montos en ${u === 'Bs.' ? 'bolívares' : 'dólares'}. ${filas.length} trabajadores.</div>
      <table class="dn" style="margin-top:10px;">
        <thead><tr><th>Trabajador</th><th>Días</th><th>Salario devengado</th><th>No salarial (excluido)</th><th>IVSS trab.</th><th>IVSS patr.</th><th>RPE trab.</th><th>RPE patr.</th><th>FAOV trab.</th><th>FAOV patr.</th><th>INCES patr.</th><th>ISLR</th></tr></thead>
        <tbody>${filasHtml || '<tr class="empty-row"><td colspan="12">No hay nómina guardada para este mes.</td></tr>'}</tbody>
        <tfoot><tr><td><b>TOTAL</b></td><td></td><td><b>${n(T.salario)}</b></td><td>${n(T.bono)}</td><td><b>${n(T.ivssT)}</b></td><td><b>${n(T.ivssP)}</b></td><td><b>${n(T.rpeT)}</b></td><td><b>${n(T.rpeP)}</b></td><td><b>${n(T.faovT)}</b></td><td><b>${n(T.faovP)}</b></td><td><b>${n(T.incesP)}</b></td><td><b>${n(T.islr)}</b></td></tr></tfoot>
      </table>

      ${totalesPorConceptoMesHTML(mesISO, n, u)}

      <h3 style="font-size:.95rem;margin:16px 0 4px;">Resumen por ente: retención al trabajador vs. aporte patronal</h3>
      <table><thead><tr><th>Ente</th><th style="text-align:right;">Base (${u})</th><th style="text-align:right;">Retención trabajador</th><th style="text-align:right;">Aporte patronal</th><th style="text-align:right;">Total a enterar</th></tr></thead>
        <tbody>${filasEntes}</tbody>
        <tfoot><tr><td><b>TOTAL</b></td><td></td><td style="text-align:right;"><b>${n(tTrab)}</b></td><td style="text-align:right;"><b>${n(tPatr)}</b></td><td style="text-align:right;"><b>${n(tTrab + tPatr)}</b></td></tr></tfoot>
      </table>

      <h3 style="font-size:.95rem;margin:16px 0 4px;">Base aplicada a cada parafiscal, por trabajador</h3>
      <table class="dn"><thead><tr><th>Trabajador</th><th>Salario devengado</th><th>Base IVSS</th><th>Base RPE</th><th>Base FAOV (salario normal)</th><th>Base INCES</th></tr></thead><tbody>${filasBases}</tbody></table>

      <div class="note" style="margin-top:12px;">
        Cálculo de cada quincena (15 días): IVSS = el menor entre el sueldo de la quincena y ${C.ivssTopeSalariosMinimos} salarios mínimos prorrateados a 15 días; si el trabajador tiene sueldo semanal declarado ante el IVSS, se usa ese sueldo × 5 semanas, prorrateado. RPE: igual, con tope de ${C.rpeTopeSalariosMinimos} y piso de ${C.rpePisoSalariosMinimos} salario(s) mínimo(s). FAOV e INCES: sobre el salario normal de la quincena. ISLR: sobre el salario de la quincena por el % del AR-I de cada trabajador.
        Los trabajadores no inscritos en el IVSS no generan IVSS ni RPE. La DPP (base con bono, mínimo por trabajador) tiene su informe propio en la pestaña DPP.
      </div>
    </div>`;
  const csvHeaders = ['Trabajador', 'Días', 'Salario devengado', 'No salarial (excluido)', 'Base IVSS', 'IVSS trabajador', 'IVSS patronal', 'Base RPE', 'RPE trabajador', 'RPE patronal', 'Base FAOV', 'FAOV trabajador', 'FAOV patronal', 'INCES patronal', 'ISLR retenido'];
  const d = (v) => v.toFixed(2);
  const csvRows = filas.map((f) => [f.emp.nombre, f.dias, d(f.salario), d(f.bono), d(f.baseIVSS), d(f.ivssT), d(f.ivssP), d(f.baseRPE), d(f.rpeT), d(f.rpeP), d(f.baseFAOV), d(f.faovT), d(f.faovP), d(f.incesP), d(f.islr)])
    .concat([['TOTAL', '', d(T.salario), d(T.bono), d(T.baseIVSS), d(T.ivssT), d(T.ivssP), d(T.baseRPE), d(T.rpeT), d(T.rpeP), d(T.baseFAOV), d(T.faovT), d(T.faovP), d(T.incesP), d(T.islr)]]);
  return { contenidoHtml, csvHeaders, csvRows };
}

/* ---------- Informe por tributo (IVSS, RPE, FAOV, INCES, ISLR) ---------- */
// Cada tributo tiene su propia periodicidad de declaración: IVSS, RPE, FAOV e
// ISLR (retenciones) son mensuales; el INCES patronal es TRIMESTRAL (y el del
// trabajador se declara cuando se pagan las utilidades).
export const TRIBUTOS = {
  ivss: { label: 'IVSS', ente: 'Instituto Venezolano de los Seguros Sociales', frecuencia: 'mensual', base: 'baseIVSS', trab: 'ivssT', patr: 'ivssP', pctT: 'ivssTrabajador', pctP: 'ivssPatrono',
    baseTxt: 'Sueldo con tope de 5 salarios mínimos, prorrateado a los días de la quincena; o el sueldo semanal declarado ante el IVSS × 5 semanas. Quien no está inscrito no cotiza.' },
  rpe: { label: 'RPE — Pérdida Involuntaria del Empleo', ente: 'Régimen Prestacional de Empleo (se declara junto con el IVSS)', frecuencia: 'mensual', base: 'baseRPE', trab: 'rpeT', patr: 'rpeP', pctT: 'rpeTrabajador', pctP: 'rpePatrono',
    baseTxt: 'Sueldo entre 1 y 10 salarios mínimos, prorrateado a los días de la quincena; o el sueldo semanal declarado ante el IVSS × 5 semanas.' },
  faov: { label: 'FAOV / BANAVIH', ente: 'Banco Nacional de Vivienda y Hábitat', frecuencia: 'mensual', base: 'baseFAOV', trab: 'faovT', patr: 'faovP', pctT: 'faovTrabajador', pctP: 'faovPatrono',
    baseTxt: 'Salario normal devengado en el período (criterio de la empresa).' },
  inces: { label: 'INCES', ente: 'Instituto Nacional de Capacitación y Educación Socialista', frecuencia: 'trimestral', base: 'baseINCES', trab: null, patr: 'incesP', pctT: null, pctP: 'incesPatrono',
    baseTxt: 'Salario devengado en el trimestre (nómina total). El 0,5% del trabajador se retiene sobre las utilidades al pagarlas.' },
  islr: { label: 'ISLR — retenciones sobre sueldos', ente: 'SENIAT', frecuencia: 'mensual', base: 'salario', trab: 'islr', patr: null, pctT: null, pctP: null,
    baseTxt: 'Salario devengado por el porcentaje de retención del AR-I de cada trabajador. Al cierre del año se emite el AR-C.' }
};

export function construirInformeTributoHTML(tributoId, periodoTxt, desdeISO, hastaISO) {
  const t = TRIBUTOS[tributoId];
  const C = state.CONFIG;
  const { filas, totales: T, recibosGuardados, utilidades } = calcularParafiscalesPeriodo(desdeISO, hastaISO);
  const n = (v) => fmt(v).replace(/^Bs\. /, '');
  const u = state.DISPLAY_CURRENCY === 'USD' ? 'US$' : 'Bs.';
  const pct = (clave) => (clave ? C[clave] : null);
  const filasH = filas.map((f) => {
    const tr = t.trab ? f[t.trab] : 0, pa = t.patr ? f[t.patr] : 0;
    return `<tr><td><b>${f.emp.nombre}</b>${f.inscrito || (tributoId !== 'ivss' && tributoId !== 'rpe') ? '' : ' <span class="tag err">no inscrito</span>'}<div class="legal">C.I. ${f.emp.cedula || '—'}</div></td>
      <td style="text-align:center;">${f.dias}</td><td>${n(f.salario)}</td><td>${n(f[t.base])}</td><td>${t.trab ? n(tr) : '—'}</td><td>${t.patr ? n(pa) : '—'}</td><td><b>${n(tr + pa)}</b></td></tr>`;
  }).join('');
  const sumTrab = t.trab ? T[t.trab] : 0, sumPatr = t.patr ? T[t.patr] : 0;
  const incesUtil = utilidades.reduce((a, x) => a + x.inces, 0);
  const tablaUtil = tributoId === 'inces' && utilidades.length ? `
      <h3 style="font-size:.95rem;margin:16px 0 4px;">INCES del trabajador sobre utilidades pagadas en el período (${C.incesTrabajador}%)</h3>
      <table><thead><tr><th>Trabajador</th><th>Fecha de pago</th><th style="text-align:right;">Utilidades brutas</th><th style="text-align:right;">INCES retenido</th></tr></thead><tbody>
      ${utilidades.map((x) => `<tr><td>${x.emp.nombre}</td><td>${fmtDate(x.fecha)}</td><td style="text-align:right;">${n(x.bruto)}</td><td style="text-align:right;">${n(x.inces)}</td></tr>`).join('')}
      <tr><td colspan="3"><b>Total INCES trabajador</b></td><td style="text-align:right;"><b>${n(incesUtil)}</b></td></tr></tbody></table>` : '';
  const totalEnterar = sumTrab + sumPatr + (tributoId === 'inces' ? incesUtil : 0);
  const alicuotas = [t.pctT ? `trabajador ${pct(t.pctT)}%` : null, t.pctP ? `patrono ${pct(t.pctP)}%` : null].filter(Boolean).join(' · ');
  const contenidoHtml = `
    <div class="tribmes">
      <style>.tribmes table.dn th,.tribmes table.dn td{padding:3px 5px;font-size:8.5px;}.tribmes table.dn th{font-size:7px;}.tribmes table.dn td:not(:first-child){text-align:right;}.tribmes table.dn td:nth-child(2){text-align:center;}</style>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — ${t.label}</h3>
      <div class="legal"><b>Período: ${periodoTxt}</b> · Ente: ${t.ente} · Declaración: <b>${t.frecuencia.toUpperCase()}</b>${alicuotas ? ` · Alícuotas: ${alicuotas}` : ''} · Base: suma de los ${recibosGuardados} recibos guardados del período (solo conceptos salariales; el bono de alimentación no entra). Montos en ${u === 'Bs.' ? 'bolívares' : 'dólares'}.</div>
      <table class="dn" style="margin-top:10px;">
        <thead><tr><th>Trabajador</th><th>Días</th><th>Salario devengado</th><th>Base ${t.label.split(' ')[0]}</th><th>Retención trabajador</th><th>Aporte patronal</th><th>Total</th></tr></thead>
        <tbody>${filasH || '<tr class="empty-row"><td colspan="7">No hay nómina guardada en este período.</td></tr>'}</tbody>
        <tfoot><tr><td><b>TOTAL</b></td><td></td><td><b>${n(T.salario)}</b></td><td><b>${n(T[t.base])}</b></td><td><b>${t.trab ? n(sumTrab) : '—'}</b></td><td><b>${t.patr ? n(sumPatr) : '—'}</b></td><td><b>${n(sumTrab + sumPatr)}</b></td></tr></tfoot>
      </table>
      ${tablaUtil}
      <div class="totals"><div class="item"><div class="lbl">Total a declarar y pagar — ${t.label.split(' ')[0]}</div><div class="val">${fmt(totalEnterar)}</div></div></div>
      <div class="note" style="margin-top:12px;"><b>Para el portal del ente (calcula automático):</b> ingrese por trabajador el <b>Salario devengado</b> de este informe — es la suma de lo realmente pagado en bolívares en cada quincena, cada una a su tasa del día de pago; no el sueldo en dólares multiplicado por una sola tasa. ${t.baseTxt} La fecha límite de declaración y pago la fija el calendario vigente de ${t.label.split(' ')[0] === 'ISLR' ? 'SENIAT' : 'cada ente'}: verifíquela antes de declarar.</div>
    </div>`;
  const d = (v) => v.toFixed(2);
  const csvHeaders = ['Trabajador', 'Cédula', 'Días', 'Salario devengado', `Base ${t.label.split(' ')[0]}`, 'Retención trabajador', 'Aporte patronal', 'Total'];
  const csvRows = filas.map((f) => { const tr = t.trab ? f[t.trab] : 0, pa = t.patr ? f[t.patr] : 0; return [f.emp.nombre, f.emp.cedula || '', f.dias, d(f.salario), d(f[t.base]), d(tr), d(pa), d(tr + pa)]; })
    .concat([['TOTAL', '', '', d(T.salario), d(T[t.base]), d(sumTrab), d(sumPatr), d(sumTrab + sumPatr)]]);
  return { contenidoHtml, csvHeaders, csvRows };
}

export function construirInformeDPPHTML(mesISO) {
  const { filas, totalDPP, dppBaseMinimaBs } = calcularDPPMes(mesISO);
  const filasHtml = filas.map((f) => `<tr>
    <td>${f.emp.nombre}</td><td>${fmt(f.salario)}</td><td>${fmt(f.bono)}</td>
    <td>${fmt(f.baseFinal)}${f.baseMinimaAplicada ? ' <span class="tag warn">mínimo</span>' : ''}</td>
    <td><b>${fmt(f.dpp)}</b></td>
  </tr>`).join('');
  const contenidoHtml = `
    <div>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Ley de Protección de las Pensiones (DPP)</h3>
      <div class="legal">Mes ${mesISO} · ${state.CONFIG.dppPatrono}% sobre el total pagado a cada trabajador (salario + bono de alimentación)${dppBaseMinimaBs > 0 ? `, con un mínimo de ${fmt(dppBaseMinimaBs)} por trabajador` : ', sin base mínima (cálculo de ley)'} · ${filas.length} trabajadores</div>
      <table style="margin-top:10px;">
        <thead><tr><th>Trabajador</th><th>Salario del mes</th><th>Bono de alimentación</th><th>Base aplicada</th><th>Aporte DPP</th></tr></thead>
        <tbody>${filasHtml || '<tr class="empty-row"><td colspan="5">No hay nómina guardada para este mes.</td></tr>'}</tbody>
      </table>
      <div class="totals"><div class="item"><div class="lbl">Total DPP a declarar y pagar</div><div class="val">${fmt(totalDPP)}</div></div></div>
      <div class="note" style="margin-top:12px;">Recaudada por el SENIAT — 100% a cargo del patrono, no se descuenta al trabajador. ${state.CONFIG.dppBaseMinima > 0 ? `La base mínima por trabajador configurada es ${state.CONFIG.dppBaseMinima} ${state.CONFIG.dppBaseMinimaMoneda === 'USD' ? 'USD' : 'Bs.'}; quien aparece marcado "mínimo" ganó menos que eso en el mes y su aporte igual se calculó sobre ese mínimo. ` : 'Se calcula sobre lo realmente pagado a cada trabajador en el mes, sin base mínima. '}Verifique la alícuota vigente en el portal del SENIAT antes de declarar.</div>
    </div>`;
  return {
    contenidoHtml,
    csvHeaders: ['Trabajador', 'Salario del mes', 'Bono de alimentación', 'Base aplicada', 'Mínimo aplicado', 'Aporte DPP'],
    csvRows: filas.map((f) => [f.emp.nombre, f.salario.toFixed(2), f.bono.toFixed(2), f.baseFinal.toFixed(2), f.baseMinimaAplicada ? 'Sí' : 'No', f.dpp.toFixed(2)])
      .concat([['Total', '', '', '', '', totalDPP.toFixed(2)]])
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
const estadoEmpleado = (e) => e.estado || (e.activo === false ? (e.motivoBaja ? 'egresado' : 'inactivo') : 'activo');
const ETIQUETA_ESTADO = { activo: 'Activo', egresado: 'Egresado', inactivo: 'Inactivo' };
const ETIQUETA_MOTIVO = {
  renuncia: 'Renuncia', despido_justificado: 'Despido justificado', despido_injustificado: 'Despido injustificado',
  mutuo_acuerdo: 'Mutuo acuerdo', causa_ajena: 'Causas ajenas a la voluntad de las partes', fallecimiento: 'Fallecimiento'
};
const normBusq = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Columnas que se pueden elegir en el listado de personal. */
export const COLUMNAS_LISTADO = [
  { key: 'nombre', label: 'Nombre', def: true, txt: (e) => e.nombre },
  { key: 'cedula', label: 'Cédula', def: true, txt: (e) => e.cedula || '' },
  { key: 'cargo', label: 'Cargo', def: true, txt: (e) => e.cargo || '' },
  { key: 'departamento', label: 'Departamento', def: true, txt: (e) => e.departamento || '' },
  { key: 'ingreso', label: 'Ingreso', def: true, txt: (e) => fmtDate(e.fechaIngreso), csv: (e) => e.fechaIngreso || '' },
  { key: 'egreso', label: 'Egreso', def: false, txt: (e) => (e.egreso && e.egreso.fecha ? fmtDate(e.egreso.fecha) : ''), csv: (e) => (e.egreso && e.egreso.fecha) || '' },
  { key: 'motivo', label: 'Motivo de egreso', def: false, txt: (e) => ETIQUETA_MOTIVO[e.egreso && e.egreso.causa] || '' },
  { key: 'antiguedad', label: 'Antigüedad', def: true, txt: (e) => {
    // Quien ya egresó: antigüedad hasta su egreso (no hasta hoy).
    const hasta = e.egreso && e.egreso.fecha && estadoEmpleado(e) !== 'activo' ? e.egreso.fecha : undefined;
    const ant = antiguedad(e.fechaIngreso, hasta); return `${ant.anos}a ${ant.meses}m`;
  } },
  { key: 'salario', label: 'Salario actual', def: true, txt: (e, f) => fmt(salarioVigente(e, f)), csv: (e, f) => salarioVigente(e, f).toFixed(2) },
  { key: 'salarioUsd', label: 'Salario (US$)', def: false, txt: (e, f) => 'US$ ' + fmtNum(salarioVigente(e, f) / (tasaEnFecha(f) || 1), 2), csv: (e, f) => (salarioVigente(e, f) / (tasaEnFecha(f) || 1)).toFixed(2) },
  { key: 'utilidades', label: 'Días utilidades', def: true, txt: (e) => String(diasUtilidadesEmp(e)) },
  { key: 'bono', label: 'Bono de alimentación', def: true, txt: (e, f) => fmt(cestaticketEmp(e, f), f), csv: (e, f) => cestaticketEmp(e, f).toFixed(2) },
  { key: 'contrato', label: 'Tipo de contrato', def: false, txt: (e) => ({ indefinido: 'Tiempo indeterminado', determinado: 'Tiempo determinado', obra_determinada: 'Obra determinada', pasantia: 'Pasantía' }[e.tipoContrato] || '') },
  { key: 'telefono', label: 'Teléfono', def: false, txt: (e) => e.telefono || '' },
  { key: 'correo', label: 'Correo', def: false, txt: (e) => e.correo || '' },
  { key: 'estado', label: 'Estado', def: true, txt: (e) => ETIQUETA_ESTADO[estadoEmpleado(e)] }
];

const ORDENES_LISTADO = {
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
  ingreso: (a, b) => (a.fechaIngreso || '').localeCompare(b.fechaIngreso || ''),
  egreso: (a, b) => ((a.egreso && a.egreso.fecha) || '9999').localeCompare((b.egreso && b.egreso.fecha) || '9999'),
  cargo: (a, b) => (a.cargo || '').localeCompare(b.cargo || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'),
  departamento: (a, b) => (a.departamento || '').localeCompare(b.departamento || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'),
  salario: (a, b) => salarioVigente(b, new Date().toISOString().slice(0, 10)) - salarioVigente(a, new Date().toISOString().slice(0, 10))
};
export const OPCIONES_ORDEN_LISTADO = [
  ['nombre', 'Nombre (A–Z)'], ['ingreso', 'Fecha de ingreso'], ['egreso', 'Fecha de egreso'],
  ['cargo', 'Cargo'], ['departamento', 'Departamento'], ['salario', 'Salario (mayor a menor)']
];

/**
 * Listado de personal a la medida: filtra (estado, departamento, cargo, texto), elige columnas,
 * ordena y, si se quiere, agrupa por departamento o cargo con subtotal de personas.
 * opc = { estado, departamento, cargo, texto, columnas[], orden, agruparPor ('', 'departamento', 'cargo') }
 */
export function construirListadoEmpleadosHTML(opc) {
  if (typeof opc === 'boolean') opc = { estado: opc ? 'activo' : 'todos' }; // compatibilidad
  const o = Object.assign({ estado: 'activo', departamento: '', cargo: '', texto: '', orden: 'nombre', agruparPor: '' }, opc || {});
  const fecha = new Date().toISOString().slice(0, 10);
  const cols = COLUMNAS_LISTADO.filter((c) => (o.columnas && o.columnas.length ? o.columnas.includes(c.key) : c.def));
  const q = normBusq(o.texto);
  const lista = state.EMPLEADOS.filter((e) => {
    if (o.estado !== 'todos' && estadoEmpleado(e) !== o.estado) return false;
    if (o.departamento && (e.departamento || '') !== o.departamento) return false;
    if (o.cargo && (e.cargo || '') !== o.cargo) return false;
    if (q && !normBusq(`${e.nombre} ${e.cedula || ''} ${e.cargo || ''}`).includes(q)) return false;
    return true;
  }).sort(o.agruparPor ? (a, b) => (a[o.agruparPor] || '').localeCompare(b[o.agruparPor] || '', 'es') || (ORDENES_LISTADO[o.orden] || ORDENES_LISTADO.nombre)(a, b) : (ORDENES_LISTADO[o.orden] || ORDENES_LISTADO.nombre));

  const fila = (e) => `<tr>${cols.map((c) => `<td>${c.txt(e, fecha) || '—'}</td>`).join('')}</tr>`;
  let cuerpo = '';
  if (o.agruparPor) {
    const grupos = new Map();
    lista.forEach((e) => { const g = e[o.agruparPor] || 'Sin ' + (o.agruparPor === 'cargo' ? 'cargo' : 'departamento'); if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(e); });
    grupos.forEach((personas, g) => {
      cuerpo += `<tr><td colspan="${cols.length}" style="background:#f3ece6;font-weight:600;">${g} <span style="font-weight:400;">· ${personas.length} ${personas.length === 1 ? 'persona' : 'personas'}</span></td></tr>${personas.map(fila).join('')}`;
    });
  } else {
    cuerpo = lista.map(fila).join('');
  }
  const filtros = [
    o.estado === 'todos' ? 'Todos los estados' : ({ activo: 'Solo activos', egresado: 'Solo egresados', inactivo: 'Solo inactivos' }[o.estado]),
    o.departamento && `Departamento: ${o.departamento}`, o.cargo && `Cargo: ${o.cargo}`, o.texto && `Búsqueda: "${o.texto}"`
  ].filter(Boolean).join(' · ');
  const contenidoHtml = `
    <div>
      ${logoHeaderHTML()}
      <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Listado de personal</h3>
      <div class="legal">${filtros} · al ${fmtDate(fecha)} · ${lista.length} ${lista.length === 1 ? 'persona' : 'personas'}</div>
      <table style="margin-top:10px;"><thead><tr>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>${cuerpo || `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--charcoal-soft);">Ningún empleado coincide con los filtros.</td></tr>`}</tbody></table>
    </div>`;
  return {
    contenidoHtml,
    csvHeaders: cols.map((c) => c.label),
    csvRows: lista.map((e) => cols.map((c) => (c.csv ? c.csv(e, fecha) : c.txt(e, fecha))))
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
    acc.remuneracion += p.resultado.salarioNormalPeriodo + (p.resultado.pagoFeriados || 0);
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
