// Plantillas HTML de recibos/resúmenes de nómina — mismo contenido del
// original, reutilizadas tanto por la corrida en vivo como por el historial.
// Una corrida puede ser de nómina (quincena/mensual), de utilidades o de
// bono vacacional — cada una arma su propio recibo y resumen.
import { state, tipoNominaCfg, empresaConRif } from '../state/store.js';
import { fmt } from './moneda.js';
import { fmtDate, fmtNum } from './formato.js';
import { tasaEnFecha } from '../state/store.js';
import { logoHeaderHTML } from './logo.js';

const FIRMA_HTML = (empresa) => `
  <table style="width:100%;margin-top:80px;table-layout:fixed;page-break-inside:avoid;break-inside:avoid;">
    <tr>
      <td style="width:50%;text-align:center;padding:0 20px;">
        <div style="border-top:1px solid #3F4249;padding-top:6px;font-size:.8rem;">Firma del trabajador</div>
      </td>
      <td style="width:50%;text-align:center;padding:0 20px;">
        <div style="border-top:1px solid #3F4249;padding-top:6px;font-size:.8rem;">Firma / sello de ${empresa}</div>
      </td>
    </tr>
  </table>`;

export function reciboContentHTML(emp, fecha, r) {
  return `
    <div class="recibo-compacto">
      ${logoHeaderHTML()}
      <h2 style="margin:0 0 2px;font-size:1.25rem;">Recibo de pago — ${emp.nombre}</h2>
      <div class="desc" style="margin-bottom:2px;">${empresaConRif()} · ${r.tipoLabel} · fecha de corte ${fmtDate(fecha)}</div>
      ${r.usaTasaUSD ? `<div class="legal" style="margin-bottom:6px;">Tasa BCV aplicada (fecha de corte): ${fmtNum(r.tasaBCV, 2)} Bs./USD</div>` : ''}
      <table style="margin-top:6px;">
        <thead><tr><th>Devengado</th><th>Salario diario</th><th>Días</th><th>Total</th></tr></thead>
        <tbody>
          ${r.anticipo ? `
            <tr><td>Salario del mes completo</td><td>${fmt(r.salarioDiario, fecha)}</td><td>30</td><td>${fmt(r.salarioMesCompleto, fecha)}</td></tr>
            <tr><td>(–) Anticipo ${r.anticipo.real ? 'ya pagado' : 'estimado (sin corrida guardada ese mes)'}</td><td>${fmt(r.salarioDiario, fecha)}</td><td>-${fmtNum(r.anticipo.dias, 0)}</td><td>-${fmt(r.anticipo.monto, fecha)}</td></tr>
          ` : `
            <tr><td>Salario del período</td><td>${fmt(r.salarioDiario, fecha)}</td><td>${fmtNum(r.diasPeriodo, 0)}</td><td>${fmt(r.salarioNormalPeriodo, fecha)}</td></tr>
          `}
          <tr><td>Bono de alimentación (no salarial)</td><td>—</td><td>—</td><td>${fmt(r.cestaticketPeriodo, fecha)}</td></tr>
          <tr><td><b>Total devengado</b></td><td></td><td></td><td><b>${fmt(r.totalDevengado, fecha)}</b></td></tr>
        </tbody>
      </table>
      ${r.anticipo && !r.anticipo.real ? '<div class="legal" style="margin-top:4px;">No se encontró una corrida de anticipo guardada para este empleado en este mes — el anticipo se estimó con los días configurados para el otro tipo de nómina. Verifique antes de pagar.</div>' : ''}
      <table style="margin-top:14px;">
        <thead><tr><th colspan="2">Deducciones al trabajador</th></tr></thead>
        <tbody>
          <tr><td>IVSS (${state.CONFIG.ivssTrabajador}%)</td><td>${fmt(r.ivssTrab, fecha)}</td></tr>
          <tr><td>Paro forzoso / RPE (${state.CONFIG.rpeTrabajador}%)</td><td>${fmt(r.rpeTrab, fecha)}</td></tr>
          <tr><td>FAOV (${state.CONFIG.faovTrabajador}% s/ salario integral)</td><td>${fmt(r.faovTrab, fecha)}</td></tr>
          ${r.islrTrab ? `<tr><td>ISLR (AR-I)</td><td>${fmt(r.islrTrab, fecha)}</td></tr>` : ''}
          <tr><td><b>Total deducciones</b></td><td><b>${fmt(r.totalDeducciones, fecha)}</b></td></tr>
        </tbody>
      </table>
      <div class="totals"><div class="item"><div class="lbl">Neto a pagar</div><div class="val">${fmt(r.neto, fecha)}</div></div></div>
      <h3 style="font-size:1rem;margin:10px 0 4px;">Aportes patronales de este período (no se descuentan al trabajador)</h3>
      <table>
        <tbody>
          <tr><td>IVSS patrono (${state.CONFIG.ivssPatrono}%)</td><td>${fmt(r.ivssPatrono, fecha)}</td></tr>
          <tr><td>FAOV patrono (${state.CONFIG.faovPatrono}%)</td><td>${fmt(r.faovPatrono, fecha)}</td></tr>
          <tr><td>RPE patrono (${state.CONFIG.rpePatrono}%)</td><td>${fmt(r.rpePatrono, fecha)}</td></tr>
          <tr><td>INCES patrono (${state.CONFIG.incesPatrono}%)</td><td>${fmt(r.incesPatrono, fecha)}</td></tr>
          <tr><td>Ley de Protección de las Pensiones / DPP (${state.CONFIG.dppPatrono}%)${r.dppBaseMinimaAplicada ? ' <span class="legal">— calculada sobre la base mínima</span>' : ''}</td><td>${fmt(r.dppPatrono, fecha)}</td></tr>
          <tr><td><b>Total aportes patronales</b></td><td><b>${fmt(r.aportesPatronales, fecha)}</b></td></tr>
        </tbody>
      </table>
      ${FIRMA_HTML(empresaConRif())}
    </div>`;
}

export function utilidadesReciboHTML(emp, fecha, r) {
  const ano = fecha.slice(0, 4);
  return `
    <div class="recibo-compacto">
      ${logoHeaderHTML()}
      <h2 style="margin:0 0 2px;font-size:1.25rem;">Recibo de utilidades — ${emp.nombre}</h2>
      <div class="desc" style="margin-bottom:8px;">${empresaConRif()} · Utilidades ${ano} · fecha de corte ${fmtDate(fecha)}</div>
      <table>
        <tbody>
          <tr><td>Meses trabajados en el año</td><td>${r.meses}</td></tr>
          <tr><td>Días de utilidades anuales aplicados</td><td>${r.diasAnual}</td></tr>
          <tr><td>Días proporcionales de utilidades</td><td>${fmtNum(r.diasProporcion, 2)}</td></tr>
          <tr><td>Salario diario aplicado</td><td>${fmt(r.salarioDiario, fecha)}</td></tr>
          <tr><td>Monto bruto</td><td>${fmt(r.montoBruto, fecha)}</td></tr>
          <tr><td>INCES trabajador (${state.CONFIG.incesTrabajador}% — única retención sobre utilidades)</td><td>${fmt(r.incesTrabajador, fecha)}</td></tr>
          <tr><td><b>Monto neto a pagar</b></td><td><b>${fmt(r.montoNeto, fecha)}</b></td></tr>
        </tbody>
      </table>
      ${FIRMA_HTML(empresaConRif())}
    </div>`;
}

export function bonoVacacionalReciboHTML(emp, anoServicio, fecha, r) {
  return `
    <div class="recibo-compacto">
      ${logoHeaderHTML()}
      <h2 style="margin:0 0 2px;font-size:1.25rem;">Recibo de bono vacacional — ${emp.nombre}</h2>
      <div class="desc" style="margin-bottom:8px;">${empresaConRif()} · Año de servicio ${anoServicio} · fecha de pago ${fmtDate(fecha)}</div>
      <table>
        <tbody>
          <tr><td>Días de bono vacacional correspondientes</td><td>${r.dias}</td></tr>
          <tr><td>Salario diario aplicado</td><td>${fmt(r.salarioDiario, fecha)}</td></tr>
          <tr><td><b>Monto a pagar</b></td><td><b>${fmt(r.monto, fecha)}</b></td></tr>
        </tbody>
      </table>
      ${FIRMA_HTML(empresaConRif())}
    </div>`;
}

function tituloYFilasResumen(tipoPeriodo, fecha, filas, kind) {
  if (kind === 'utilidades') {
    const ano = fecha.slice(0, 4);
    const filasHtml = filas.map(({ emp, r }) => `<tr>
      <td>${emp ? emp.nombre : '—'}</td><td>${emp ? (emp.cargo || '—') : '—'}</td><td>${fmtNum(r.diasProporcion, 1)}</td><td>${fmt(r.montoBruto, fecha)}</td><td>${fmt(r.incesTrabajador, fecha)}</td>
      <td><b>${fmt(r.montoNeto, fecha)}</b></td>
    </tr>`).join('');
    return {
      subtitulo: `Utilidades ${ano} · Fecha de corte: ${fmtDate(fecha)} · ${filas.length} empleados`,
      encabezados: ['Empleado', 'Cargo', 'Días', 'Bruto', 'INCES', 'Neto'],
      filasHtml
    };
  }
  if (kind === 'bonovacacional') {
    const filasHtml = filas.map(({ emp, anoServicio, r }) => `<tr>
      <td>${emp ? emp.nombre : '—'}</td><td>${emp ? (emp.cargo || '—') : '—'}</td><td>Año ${anoServicio}</td><td>${r.dias}</td>
      <td><b>${fmt(r.monto, fecha)}</b></td>
    </tr>`).join('');
    return {
      subtitulo: `Bono vacacional · Fecha de pago: ${fmtDate(fecha)} · ${filas.length} empleados`,
      encabezados: ['Empleado', 'Cargo', 'Año de servicio', 'Días', 'Monto'],
      filasHtml
    };
  }
  const filasHtml = filas.map(({ emp, r }) => `<tr>
    <td>${emp ? emp.nombre : '—'}${r.usaTasaUSD ? ' <span class="tag warn">USD</span>' : ''}</td><td>${emp ? (emp.cargo || '—') : '—'}</td><td>${fmt(r.totalDevengado, fecha)}</td><td>${fmt(r.totalDeducciones, fecha)}</td>
    <td><b>${fmt(r.neto, fecha)}</b></td><td>${fmt(r.aportesPatronales, fecha)}</td>
  </tr>`).join('');
  return {
    subtitulo: `${tipoNominaCfg(tipoPeriodo).label} · Fecha de corte: ${fmtDate(fecha)} · ${filas.length} empleados`,
    encabezados: ['Empleado', 'Cargo', 'Devengado', 'Deducciones', 'Neto', 'Aportes patronales'],
    filasHtml
  };
}

export function construirResumenCorridaHTML(tipoPeriodo, fecha, filas, kind) {
  kind = kind || 'nomina';
  const totales = filas.reduce((a, { r }) => {
    if (kind === 'utilidades') return { devengado: a.devengado + r.montoBruto, deducciones: a.deducciones + r.incesTrabajador, neto: a.neto + r.montoNeto, aportes: 0 };
    if (kind === 'bonovacacional') return { devengado: a.devengado + r.monto, deducciones: 0, neto: a.neto + r.monto, aportes: 0 };
    return { devengado: a.devengado + r.totalDevengado, deducciones: a.deducciones + r.totalDeducciones, neto: a.neto + r.neto, aportes: a.aportes + r.aportesPatronales };
  }, { devengado: 0, deducciones: 0, neto: 0, aportes: 0 });
  const { subtitulo, encabezados, filasHtml } = tituloYFilasResumen(tipoPeriodo, fecha, filas, kind);
  const tasaBCV = tasaEnFecha(fecha);
  const hayUSD = kind === 'nomina' && filas.some(({ r }) => r.usaTasaUSD);
  return `
    <div>
      ${logoHeaderHTML()}
      <h2 style="margin-top:0;">${empresaConRif()} — Resumen${kind === 'nomina' ? ' de nómina' : kind === 'utilidades' ? ' de utilidades' : ' de bono vacacional'}</h2>
      <div class="desc">${subtitulo}</div>
      ${hayUSD ? `<div class="legal">Tasa BCV aplicada (fecha de corte): ${fmtNum(tasaBCV, 2)} Bs./USD — usada para los empleados marcados "USD"</div>` : ''}
      <table style="margin-top:10px;"><thead><tr>${encabezados.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${filasHtml}</tbody></table>
      <div class="totals">
        <div class="item"><div class="lbl">Total devengado</div><div class="val">${fmt(totales.devengado, fecha)}</div></div>
        ${kind !== 'bonovacacional' ? `<div class="item"><div class="lbl">Total deducciones</div><div class="val">${fmt(totales.deducciones, fecha)}</div></div>` : ''}
        <div class="item"><div class="lbl">Total neto a pagar</div><div class="val">${fmt(totales.neto, fecha)}</div></div>
        ${kind === 'nomina' ? `<div class="item"><div class="lbl">Total aportes patronales</div><div class="val">${fmt(totales.aportes, fecha)}</div></div>` : ''}
      </div>
    </div>`;
}

export function construirRecibosCorridaHTML(fecha, filas, kind) {
  kind = kind || 'nomina';
  let html = '';
  filas.forEach((fila, i) => {
    const { emp, r } = fila;
    if (!emp) return;
    const salto = i === 0 ? '' : 'page-break-before:always;break-before:page;';
    const contenido = kind === 'utilidades' ? utilidadesReciboHTML(emp, fecha, r)
      : kind === 'bonovacacional' ? bonoVacacionalReciboHTML(emp, fila.anoServicio, fecha, r)
      : reciboContentHTML(emp, fecha, r);
    html += `<div style="${salto}padding-top:1px;">${contenido}</div>`;
  });
  return html;
}
