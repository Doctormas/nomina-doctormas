// Documento completo de liquidación (4 hojas): garantía de prestaciones
// sociales con su detalle, intereses mes a mes, liquidación y constancia de
// trabajo. Todo se arma a partir del resultado de calcularLiquidacion() — no
// recalcula montos, solo los desglosa — para que lo que se ve aquí sea
// exactamente lo que la app calculó.
import { state, empresaConRif } from '../state/store.js';
import { logoHeaderHTML } from './logo.js';
import { salarioVigente, salarioIntegralDiario, diasUtilidadesEmp, antiguedad } from './calculos.js';
import { constanciaTrabajoHTML } from './constancia.js';
import { fmtNum, fmtDate, parseDate, todayStr, escapeHtml } from './formato.js';

const n2 = (n) => fmtNum(n, 2);
const bs = (n) => 'Bs. ' + fmtNum(n, 2);
const DIA_MS = 86400000;

function sumarMesesISO(iso, meses) {
  const d = parseDate(iso);
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// Mismo método de calcularInteresesAcumulado (interés simple diario sobre el
// saldo, con cada depósito sumándose en su fecha), pero repartido mes a mes.
// La tasa efectiva se despeja del interés total guardado, así el detalle
// siempre cuadra con el total aunque la tasa de Configuración haya cambiado.
function interesesPorMes(emp, L, fechaCorteISO) {
  const eventos = L.prest.trimestres.map((t) => ({ fecha: t.hasta, monto: t.monto }))
    .concat(L.prest.anuales.map((a) => ({ fecha: a.fecha, monto: a.monto })));
  const ing = emp.fechaIngreso;
  const puntos = new Set([ing, fechaCorteISO, ...eventos.map((e) => e.fecha)]);
  for (let m = sumarMesesISO(ing, 1); m < fechaCorteISO; m = sumarMesesISO(m, 1)) puntos.add(m);
  const orden = Array.from(puntos).filter((p) => p >= ing && p <= fechaCorteISO).sort();

  const pesoPorMes = new Map();
  let saldo = 0;
  for (let i = 0; i < orden.length - 1; i++) {
    const a = orden[i];
    saldo += eventos.filter((e) => e.fecha === a).reduce((s, e) => s + e.monto, 0);
    const dias = Math.round((parseDate(orden[i + 1]) - parseDate(a)) / DIA_MS);
    const clave = a.slice(0, 7);
    pesoPorMes.set(clave, (pesoPorMes.get(clave) || 0) + (saldo * dias) / 365);
  }
  const pesoTotal = Array.from(pesoPorMes.values()).reduce((s, v) => s + v, 0);
  const tasaEfectiva = pesoTotal > 0 ? L.prest.interesAcumulado / pesoTotal : 0;

  const filas = [];
  let acumulado = 0;
  let cursor = ing.slice(0, 7) + '-01';
  while (cursor <= fechaCorteISO) {
    const clave = cursor.slice(0, 7);
    const finMes = sumarMesesISO(cursor, 1);
    const topeSaldo = finMes > fechaCorteISO ? fechaCorteISO : new Date(parseDate(finMes) - DIA_MS).toISOString().slice(0, 10);
    const saldoCierre = eventos.filter((e) => e.fecha <= topeSaldo).reduce((s, e) => s + e.monto, 0);
    const interes = (pesoPorMes.get(clave) || 0) * tasaEfectiva;
    acumulado += interes;
    filas.push({ clave, saldoCierre, interes, acumulado });
    cursor = finMes;
  }
  return { filas, tasaPct: tasaEfectiva * 100 };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function etiquetaMes(clave) {
  const [a, m] = clave.split('-');
  return `${MESES[Number(m) - 1]} ${a}`;
}

function encabezadoHoja(titulo) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      ${logoHeaderHTML()}
      <div style="text-align:right;" class="legal">${escapeHtml(empresaConRif())}</div>
    </div>
    <h3 style="margin:4px 0 8px;font-size:1.05rem;">${titulo}</h3>`;
}

function datosTrabajador(emp, fecha, causaLabel, L) {
  const a = L.prest.antiguedad;
  const si = L.prest.salarioIntegralActual;
  const celda = (k, v) => `<td style="width:50%;padding:2px 6px;border:none;"><span class="legal">${k}</span> <b>${v}</b></td>`;
  return `
    <table style="margin:0 0 8px;">
      <tr>${celda('Trabajador(a):', escapeHtml(emp.nombre))}${celda('Cédula:', escapeHtml(emp.cedula || '—'))}</tr>
      <tr>${celda('Cargo:', escapeHtml(emp.cargo || '—'))}${celda('Departamento:', escapeHtml(emp.departamento || '—'))}</tr>
      <tr>${celda('Fecha de ingreso:', fmtDate(emp.fechaIngreso))}${celda('Fecha de egreso:', fmtDate(fecha))}</tr>
      <tr>${celda('Tiempo de servicio:', `${a.anos} año(s), ${a.meses} mes(es), ${a.dias} día(s)`)}${celda('Motivo de egreso:', escapeHtml(causaLabel))}</tr>
      <tr>${celda('Sueldo básico mensual:', bs(si.salarioDiario * 30))}${celda('Sueldo diario:', bs(si.salarioDiario))}</tr>
      <tr>${celda('Alícuota de utilidades:', bs(si.alicuotaUtil))}${celda('Alícuota de bono vacacional:', bs(si.alicuotaBono))}</tr>
      <tr>${celda('Salario integral diario:', bs(si.integral))}${celda('Días de utilidades al año:', diasUtilidadesEmp(emp))}</tr>
    </table>`;
}

function hojaGarantia(emp, fecha, L) {
  const p = L.prest;
  const filas = p.trimestres.map((t) => ({
    fecha: t.hasta, concepto: `Trimestre ${t.n} (${fmtDate(t.desde)} al ${fmtDate(t.hasta)})`,
    anoServ: antiguedad(emp.fechaIngreso, t.hasta).anoServicioActual, integral: t.salarioIntegralDiario, dias: t.dias, monto: t.monto
  })).concat(p.anuales.map((a) => ({
    fecha: a.fecha, concepto: `Días adicionales, año ${a.ano} cumplido (Art. 142 lit. b)`,
    anoServ: a.ano + 1, integral: a.salarioIntegralDiario, dias: a.dias, monto: a.monto
  }))).sort((x, y) => (x.fecha < y.fecha ? -1 : 1));

  let acum = 0;
  const filasHtml = filas.map((f) => {
    acum += f.monto;
    const salMes = salarioVigente(emp, f.fecha);
    const si = salarioIntegralDiario(salMes, f.anoServ, diasUtilidadesEmp(emp));
    return `<tr>
      <td>${fmtDate(f.fecha)}</td><td>${f.concepto}</td><td>${n2(salMes)}</td><td>${n2(si.salarioDiario)}</td>
      <td>${n2(si.alicuotaUtil)}</td><td>${n2(si.alicuotaBono)}</td><td>${n2(f.integral)}</td>
      <td>${f.dias}</td><td>${n2(f.monto)}</td><td><b>${n2(acum)}</b></td></tr>`;
  }).join('');
  const diasTrim = p.trimestres.reduce((s, t) => s + t.dias, 0);
  const diasAdic = p.anuales.reduce((s, a) => s + a.dias, 0);
  const mayorEsRetro = p.retroactivo > p.totalAcumuladoDeposito;

  return `
    ${encabezadoHoja('Garantía de prestaciones sociales (Art. 142 LOTTT)')}
    <div class="legal" style="margin-bottom:6px;">${escapeHtml(emp.nombre)} · C.I. ${escapeHtml(emp.cedula || '—')} · Ingreso ${fmtDate(emp.fechaIngreso)} · Corte ${fmtDate(fecha)}. Montos en bolívares. Cada depósito = días × salario integral diario a la fecha del depósito.</div>
    <table class="dense">
      <thead><tr><th>Fecha</th><th>Concepto</th><th>Salario mensual</th><th>Diario</th><th>Alíc. utilid.</th><th>Alíc. bono vac.</th><th>Integral diario</th><th>Días</th><th>Monto</th><th>Acumulado</th></tr></thead>
      <tbody>${filasHtml || '<tr><td colspan="10">Aún no completa el primer trimestre de servicio: no hay depósitos.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="7"><b>Total depositado (lit. a: ${diasTrim} días · lit. b: ${diasAdic} días)</b></td><td>${diasTrim + diasAdic}</td><td colspan="2"><b>${n2(p.totalAcumuladoDeposito)}</b></td></tr></tfoot>
    </table>

    <h3 style="margin:16px 0 6px;font-size:1rem;">Comparación con el cálculo retroactivo (Art. 142 lit. c)</h3>
    <table class="dense"><tbody>
      <tr><td>A. Depósitos acumulados (lit. a + lit. b)</td><td style="text-align:right;">${bs(p.totalAcumuladoDeposito)}</td></tr>
      <tr><td>B. Retroactivo: ${state.CONFIG.diasRetroactivoPorAno} días × ${fmtNum(p.antiguedad.anosDecimal, 4)} años de servicio × salario integral actual ${bs(p.salarioIntegralActual.integral)}</td><td style="text-align:right;">${bs(p.retroactivo)}</td></tr>
      <tr><td><b>Se toma el mayor (${mayorEsRetro ? 'B — retroactivo' : 'A — depósitos'})</b></td><td style="text-align:right;"><b>${bs(Math.max(p.totalAcumuladoDeposito, p.retroactivo))}</b></td></tr>
    </tbody></table>`;
}

function hojaIntereses(emp, fecha, L) {
  const { filas, tasaPct } = interesesPorMes(emp, L, fecha);
  const filasHtml = filas.map((f) => `<tr><td>${etiquetaMes(f.clave)}</td><td>${n2(f.saldoCierre)}</td><td>${n2(f.interes)}</td><td><b>${n2(f.acumulado)}</b></td></tr>`).join('');
  return `
    ${encabezadoHoja('Intereses sobre la garantía de prestaciones sociales (Art. 143 LOTTT)')}
    <div class="legal" style="margin-bottom:6px;">${escapeHtml(emp.nombre)} · C.I. ${escapeHtml(emp.cedula || '—')}. Interés simple diario sobre el saldo depositado, a una tasa anual de ${fmtNum(tasaPct, 2)}% (la tasa configurada en la app; la ley establece la tasa activa promedio del BCV — verifíquela). Intereses a la fecha ${fmtDate(fecha)}.</div>
    <table class="dense">
      <thead><tr><th>Mes</th><th>Saldo de garantía al cierre</th><th>Interés del mes</th><th>Interés acumulado</th></tr></thead>
      <tbody>${filasHtml}</tbody>
      <tfoot><tr><td colspan="3"><b>Total intereses</b></td><td><b>${n2(L.prest.interesAcumulado)}</b></td></tr></tfoot>
    </table>`;
}

function hojaLiquidacion(emp, fecha, causa, causaLabel, L) {
  const p = L.prest;
  const fila = (concepto, dias, monto) => `<tr><td>${concepto}</td><td style="text-align:center;">${dias === '' ? '' : (typeof dias === 'number' ? fmtNum(dias, 2).replace(/,00$/, '') : dias)}</td><td style="text-align:right;">${n2(monto)}</td></tr>`;
  const mayorEsRetro = p.retroactivo > p.totalAcumuladoDeposito;
  return `
    ${encabezadoHoja('Liquidación de prestaciones sociales y demás derechos laborales')}
    <div class="legal" style="margin-bottom:6px;">Fecha del cálculo: ${fmtDate(todayStr())}</div>
    ${datosTrabajador(emp, fecha, causaLabel, L)}
    <table>
      <thead><tr><th>Concepto</th><th style="text-align:center;">Días</th><th style="text-align:right;">Asignaciones (Bs.)</th></tr></thead>
      <tbody>
        ${fila(mayorEsRetro ? 'Prestaciones sociales — retroactivo (Art. 142 lit. c), mayor que los depósitos' : 'Prestaciones sociales — depósitos acumulados (Art. 142 lit. a y b), mayores que el retroactivo', '', mayorEsRetro ? p.retroactivo : p.totalAcumuladoDeposito)}
        ${fila('Intereses sobre prestaciones sociales (Art. 143)', '', p.interesAcumulado)}
        ${fila('Vacaciones vencidas no disfrutadas', L.vac.pendientesTotal, L.vacacionesPendientesMonto)}
        ${fila('Vacaciones fraccionadas del año en curso', L.vac.fraccionVac, L.vacacionesFraccionadasMonto)}
        ${fila('Bono vacacional fraccionado', L.vac.fraccionBono, L.bonoVacFraccionadoMonto)}
        ${fila('Utilidades fraccionadas (Art. 131)', L.util.diasProporcion, L.utilidadesFraccionadasMonto)}
        ${causa === 'despido_injustificado' ? fila('Indemnización por despido injustificado (Art. 92)', '', L.indemnizacionDespidoInjustificado) : ''}
      </tbody>
      <tfoot><tr><td colspan="2"><b>TOTAL NETO A CANCELAR</b></td><td style="text-align:right;"><b>${n2(L.totalGeneral)}</b></td></tr></tfoot>
    </table>
    <p class="legal" style="margin-top:10px;text-align:justify;">De conformidad con la LOTTT, se presenta el cálculo de las prestaciones sociales (Art. 142) con el detalle de los depósitos e intereses en las hojas anteriores. El(la) trabajador(a) queda notificado(a) de los cálculos efectuados.</p>
    <p class="legal" style="text-align:justify;">Yo, ${escapeHtml(emp.nombre)}, C.I. ${escapeHtml(emp.cedula || '—')}, declaro haber recibido a mi entera y cabal satisfacción el pago de los salarios e indemnizaciones causados por la relación de trabajo, que ha quedado terminada, sin tener nada que reclamar por esos conceptos.</p>
    <table style="width:100%;margin-top:70px;table-layout:fixed;page-break-inside:avoid;break-inside:avoid;">
      <tr>
        <td style="width:50%;text-align:center;padding:0 20px;border:none;"><div style="border-top:1px solid #3F4249;padding-top:6px;font-size:.8rem;">Recibe conforme — firma, huella y C.I.</div></td>
        <td style="width:50%;text-align:center;padding:0 20px;border:none;"><div style="border-top:1px solid #3F4249;padding-top:6px;font-size:.8rem;">Firma / sello de ${escapeHtml(empresaConRif())}</div></td>
      </tr>
    </table>`;
}

function hojaConstancia(emp, fecha) {
  const moneda = emp.monedaSalario === 'USD';
  const salarioTexto = moneda ? `US$ ${fmtNum(emp.salarioBase, 2)}` : bs(emp.salarioBase);
  return constanciaTrabajoHTML({
    nombre: emp.nombre, cedula: emp.cedula, nacionalidad: emp.nacionalidad, cargo: emp.cargo,
    fechaIngreso: emp.fechaIngreso, fechaEgreso: fecha, salarioTexto, fechaEmision: todayStr()
  });
}

const SALTO = '<div style="page-break-before:always;break-before:page;"></div>';

export function construirLiquidacionDetalladaHTML(emp, fecha, causa, causaLabel, L) {
  return `
  <div class="liqdet">
    <style>.liqdet table.dense th,.liqdet table.dense td{padding:3px 4px;font-size:8.5px;}.liqdet table.dense th{font-size:7px;}.liqdet tfoot td{border-top:2px solid #3F4249;}</style>
    ${hojaGarantia(emp, fecha, L)}
    ${SALTO}
    ${hojaIntereses(emp, fecha, L)}
    ${SALTO}
    ${hojaLiquidacion(emp, fecha, causa, causaLabel, L)}
    ${SALTO}
    ${hojaConstancia(emp, fecha)}
  </div>`;
}
