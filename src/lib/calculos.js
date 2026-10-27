// =========================================================
// FÓRMULAS LOTTT — portadas literalmente del archivo original
// (nomina-doctormas_44.html v2.6.1). No se altera ninguna aritmética,
// solo se referencian state.CONFIG / state.VAC_DISFRUTE / state.BONO_VAC_PAGADO
// en vez de variables globales sueltas.
// =========================================================
import { state, tasaEnFecha, getTasaActualValor, tipoNominaCfg } from '../state/store.js';
import { parseDate, todayStr } from './formato.js';

/* ---------- Utilidades de fechas (para prorratear períodos parciales) ---------- */
function sumarDias(fechaISO, delta) {
  const d = parseDate(fechaISO);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}
function diasEntreInclusive(desdeISO, hastaISO) {
  return Math.round((parseDate(hastaISO) - parseDate(desdeISO)) / (1000 * 60 * 60 * 24)) + 1;
}
function primerYUltimoDiaMes(fechaISO) {
  const anoMes = fechaISO.slice(0, 7);
  const y = Number(fechaISO.slice(0, 4)), m = Number(fechaISO.slice(5, 7));
  const ultimoDia = new Date(y, m, 0).getDate();
  return { primero: `${anoMes}-01`, ultimo: `${anoMes}-${String(ultimoDia).padStart(2, '0')}` };
}
// Rango "oficial" del período que se muestra en el recibo (independiente de si
// el empleado ingresó a mitad de período, lo cual ya se aclara aparte con
// "parcial"): primera quincena = 1 al 15 del mes de la fecha de corte; segunda
// quincena = 16 al último día de ese mes; pago mensual = 1 al último día.
export function periodoNominal(tipoKey, fechaPeriodoISO) {
  const { primero, ultimo } = primerYUltimoDiaMes(fechaPeriodoISO);
  if (tipoKey === 'primera') return { desde: primero, hasta: `${fechaPeriodoISO.slice(0, 7)}-15` };
  if (tipoKey === 'segunda') return { desde: `${fechaPeriodoISO.slice(0, 7)}-16`, hasta: ultimo };
  if (tipoKey === 'mensual') return { desde: primero, hasta: ultimo };
  const cfg = tipoNominaCfg(tipoKey);
  return { desde: sumarDias(fechaPeriodoISO, -(cfg.diasSueldo - 1)), hasta: fechaPeriodoISO };
}

/* ---------- Cálculo de antigüedad ---------- */
export function antiguedad(fechaIngreso, fechaRef) {
  const ing = parseDate(fechaIngreso);
  const ref = fechaRef ? parseDate(fechaRef) : new Date();
  if (!ing) return { anos: 0, meses: 0, dias: 0, anoServicioActual: 1, totalDiasCalendario: 0, anosDecimal: 0 };
  let anos = ref.getFullYear() - ing.getFullYear();
  let meses = ref.getMonth() - ing.getMonth();
  let dias = ref.getDate() - ing.getDate();
  if (dias < 0) {
    meses -= 1;
    const diasMesAnterior = new Date(ref.getFullYear(), ref.getMonth(), 0).getDate();
    dias += diasMesAnterior;
  }
  if (meses < 0) { anos -= 1; meses += 12; }
  const totalDiasCalendario = Math.floor((ref - ing) / (1000 * 60 * 60 * 24));
  const anosDecimal = totalDiasCalendario / 365;
  const anoServicioActual = anos + 1;
  return { anos, meses, dias, anoServicioActual, totalDiasCalendario, anosDecimal };
}

/* ---------- Historial salarial ---------- */
export function salarioBaseActualBs(emp) {
  if (emp.monedaSalario === 'USD') return Number(emp.salarioBase || 0) * getTasaActualValor();
  return Number(emp.salarioBase || 0);
}

export function salarioVigente(emp, fechaISO) {
  const hist = (emp.historial || []).slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  let entry = null;
  for (const h of hist) {
    if (h.fecha <= fechaISO) entry = h; else break;
  }
  if (entry) {
    // Si el cambio se cargó en USD, el equivalente en bolívares NO se
    // congela con la tasa del día en que se cargó — se recalcula cada vez
    // con la tasa vigente en la fecha que se está calculando (fechaISO),
    // porque en dólares el salario no cambia, pero en bolívares sí por el
    // diferencial cambiario. montoBs (si existe) queda solo como referencia
    // de lo que valía ese día, no se usa para el cálculo.
    if (entry.moneda === 'USD') return Number(entry.monto || 0) * tasaEnFecha(fechaISO);
    return entry.montoBs !== undefined ? entry.montoBs : entry.salario;
  }
  if (emp.monedaSalario === 'USD') return Number(emp.salarioBase || 0) * tasaEnFecha(fechaISO);
  return Number(emp.salarioBase || 0);
}

/** Sueldo semanal que el IVSS tiene realmente cargado para este trabajador,
 * vigente a la fecha dada (histórico, como el salarial) — o null si nunca se
 * cargó ninguno para él. Cuando existe, el IVSS y el RPE se calculan sobre
 * ESE sueldo semanal (igual que hace el IVSS en la práctica), en vez de la
 * fórmula legal con tope. */
export function salarioSemanalIVSSVigente(emp, fechaISO) {
  const hist = (emp.historialIVSS || []).slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  let s = null;
  for (const h of hist) {
    if (h.fecha <= fechaISO) s = h.salarioSemanal; else break;
  }
  return s;
}

/* ---------- Fórmulas legales ---------- */
export function diasVacacionesPorAno(n) {
  return Math.min(state.CONFIG.diasVacacionesBase + Math.max(n - 1, 0), state.CONFIG.diasVacacionesTope);
}
export function diasBonoVacPorAno(n) {
  return Math.min(state.CONFIG.diasBonoVacBase + Math.max(n - 1, 0), state.CONFIG.diasBonoVacTope);
}
export function diasAdicionalPrestacion(n) {
  if (n < 2) return 0;
  return Math.min(state.CONFIG.diasAdicionalAnualPorAno * (n - 1), state.CONFIG.diasAdicionalTope);
}

export function salarioIntegralDiario(salarioMensual, anoServicio, diasUtilOverride) {
  const salarioDiario = salarioMensual / 30;
  const diasUtil = (diasUtilOverride !== undefined && diasUtilOverride !== null) ? diasUtilOverride : state.CONFIG.diasUtilidadesAnual;
  const diasBono = diasBonoVacPorAno(anoServicio);
  const alicuotaUtil = (diasUtil * salarioDiario) / 360;
  const alicuotaBono = (diasBono * salarioDiario) / 360;
  return { salarioDiario, alicuotaUtil, alicuotaBono, integral: salarioDiario + alicuotaUtil + alicuotaBono };
}

/* ---------- Prestaciones sociales: cálculo automático a partir del historial ---------- */
export function calcularPrestaciones(emp, fechaCorteISO) {
  fechaCorteISO = fechaCorteISO || todayStr();
  const ing = parseDate(emp.fechaIngreso);
  const corte = parseDate(fechaCorteISO);
  if (!ing || corte < ing) return null;

  const trimestres = [];
  let cursor = new Date(ing);
  let trimNum = 0;
  let acumuladoGarantia = 0;

  while (true) {
    const finTrim = new Date(cursor);
    finTrim.setMonth(finTrim.getMonth() + 3);
    if (finTrim > corte) break;
    trimNum++;
    const fechaFinISO = finTrim.toISOString().slice(0, 10);
    const antTrim = antiguedad(emp.fechaIngreso, fechaFinISO);
    const salMes = salarioVigente(emp, fechaFinISO);
    const si = salarioIntegralDiario(salMes, antTrim.anoServicioActual, diasUtilidadesEmp(emp));
    const monto = state.CONFIG.diasGarantiaTrimestral * si.integral;
    acumuladoGarantia += monto;
    trimestres.push({
      n: trimNum, desde: cursor.toISOString().slice(0, 10), hasta: fechaFinISO,
      salarioIntegralDiario: si.integral, dias: state.CONFIG.diasGarantiaTrimestral, monto
    });
    cursor = finTrim;
  }

  const anuales = [];
  let acumuladoAdicional = 0;
  cursor = new Date(ing);
  let anoNum = 0;
  while (true) {
    const finAno = new Date(cursor);
    finAno.setFullYear(finAno.getFullYear() + 1);
    if (finAno > corte) break;
    anoNum++;
    const dias = diasAdicionalPrestacion(anoNum + 1);
    if (dias > 0) {
      const fechaFinISO = finAno.toISOString().slice(0, 10);
      const salMes = salarioVigente(emp, fechaFinISO);
      const si = salarioIntegralDiario(salMes, anoNum + 1, diasUtilidadesEmp(emp));
      const monto = dias * si.integral;
      acumuladoAdicional += monto;
      anuales.push({ ano: anoNum, fecha: fechaFinISO, dias, salarioIntegralDiario: si.integral, monto });
    }
    cursor = finAno;
  }

  const totalAcumuladoDeposito = acumuladoGarantia + acumuladoAdicional;
  const interes = calcularInteresesAcumulado(trimestres, anuales, ing, corte);

  const antFinal = antiguedad(emp.fechaIngreso, fechaCorteISO);
  const salarioActual = salarioVigente(emp, fechaCorteISO);
  const siActual = salarioIntegralDiario(salarioActual, antFinal.anoServicioActual, diasUtilidadesEmp(emp));
  const retroactivo = state.CONFIG.diasRetroactivoPorAno * antFinal.anosDecimal * siActual.integral;

  const mayor = Math.max(totalAcumuladoDeposito, retroactivo);

  return {
    trimestres, anuales, acumuladoGarantia, acumuladoAdicional,
    totalAcumuladoDeposito, interesAcumulado: interes,
    retroactivo, montoAPagar: mayor + interes,
    antiguedad: antFinal, salarioIntegralActual: siActual
  };
}

export function calcularInteresesAcumulado(trimestres, anuales, fechaIng, fechaCorte) {
  const eventos = trimestres.map((t) => ({ fecha: t.hasta, monto: t.monto }))
    .concat(anuales.map((a) => ({ fecha: a.fecha, monto: a.monto })))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  let saldo = 0, interesTotal = 0, lastDate = fechaIng;
  const tasa = state.CONFIG.tasaInteresAnual / 100;
  // lastDate arranca como objeto Date (fechaIng) y pasa a ser una fecha ISO
  // (string) en cuanto se registra el primer evento — parseDate() solo sabe
  // interpretar strings, así que hay que evitar pasarle un Date ya construido
  // (si no, produce "Invalid Date" y NaN se arrastra por todo el acumulado).
  const asDate = (d) => (typeof d === 'string' ? parseDate(d) : d);
  for (const ev of eventos) {
    const dias = (parseDate(ev.fecha) - asDate(lastDate)) / (1000 * 60 * 60 * 24);
    interesTotal += saldo * tasa * (dias / 365);
    saldo += ev.monto;
    lastDate = ev.fecha;
  }
  const diasFinal = (fechaCorte - asDate(lastDate)) / (1000 * 60 * 60 * 24);
  interesTotal += saldo * tasa * (diasFinal / 365);
  return interesTotal;
}

/* ---------- Vacaciones: estado actual ---------- */
export function estadoVacaciones(emp, fechaRefISO) {
  fechaRefISO = fechaRefISO || todayStr();
  const ant = antiguedad(emp.fechaIngreso, fechaRefISO);
  const disfrutes = state.VAC_DISFRUTE.filter((v) => v.empId === emp.id);
  let periodosDerecho = [];
  for (let n = 1; n <= ant.anos; n++) {
    const fechaCumple = new Date(parseDate(emp.fechaIngreso));
    fechaCumple.setFullYear(fechaCumple.getFullYear() + n);
    const dias = diasVacacionesPorAno(n);
    const diasBono = diasBonoVacPorAno(n);
    const disfrutado = disfrutes.filter((d) => d.anoServicio === n).reduce((a, d) => a + Number(d.dias), 0);
    periodosDerecho.push({
      anoServicio: n, fechaCumple: fechaCumple.toISOString().slice(0, 10),
      diasCorresponden: dias, diasBono, diasDisfrutados: disfrutado, diasPendientes: Math.max(dias - disfrutado, 0)
    });
  }
  const pendientesTotal = periodosDerecho.reduce((a, p) => a + p.diasPendientes, 0);
  const diasCorrespondenAnoActual = diasVacacionesPorAno(ant.anoServicioActual);
  const diasBonoAnoActual = diasBonoVacPorAno(ant.anoServicioActual);
  const mesesEnCurso = ant.meses + (ant.dias > 0 ? 1 : 0);
  const fraccionVac = (diasCorrespondenAnoActual / 12) * mesesEnCurso;
  const fraccionBono = (diasBonoAnoActual / 12) * mesesEnCurso;
  return { periodosDerecho, pendientesTotal, fraccionVac, fraccionBono, mesesEnCurso, ant };
}

/**
 * Reparte un total de días de disfrute entre los años de servicio pendientes,
 * del más viejo al más nuevo (FIFO) — así es como se deben consumir las
 * vacaciones acumuladas. Si sobran días después de cubrir todo lo vencido,
 * el resto se asigna al año en curso (un adelanto) y se marca con un aviso.
 * Devuelve una asignación por año (para crear un registro de disfrute por
 * cada uno) más los avisos a mostrar antes de confirmar.
 */
export function planificarDisfrute(emp, diasTotales, fechaISO) {
  const v = estadoVacaciones(emp, fechaISO);
  let restante = Number(diasTotales) || 0;
  const asignaciones = [];
  for (const p of v.periodosDerecho) {
    if (restante <= 0) break;
    if (p.diasPendientes <= 0) continue;
    const usar = Math.min(p.diasPendientes, restante);
    asignaciones.push({ anoServicio: p.anoServicio, dias: usar });
    restante -= usar;
  }
  const avisos = [];
  let permisoDias = 0;
  if (restante > 0) {
    if (v.ant.anos === 0) {
      // Todavía no cumple su primer año de servicio: no existe derecho legal
      // a vacaciones (Art. 190 LOTTT nace al cumplir el año), así que esto NO
      // se registra como un adelanto que luego se le descontaría del año 1 —
      // se registra aparte como permiso remunerado, sin afectar ningún año.
      permisoDias = restante;
      avisos.push(`${emp.nombre} todavía no cumple su primer año de servicio (lleva ${v.ant.meses} mes(es)) — no tiene derecho legal a vacaciones aún. Estos ${restante} días se registran como permiso remunerado, no como vacaciones: no se descontarán de ningún año futuro.`);
    } else {
      const anoActual = v.ant.anoServicioActual;
      const diasCorrespondenAnoActual = diasVacacionesPorAno(anoActual);
      asignaciones.push({ anoServicio: anoActual, dias: restante });
      avisos.push(`${emp.nombre} ya no tenía años vencidos pendientes por esa cantidad — los últimos ${restante} días se asignaron al año de servicio ${anoActual} (en curso), que es un adelanto.`);
      if (restante > diasCorrespondenAnoActual) {
        avisos.push(`Además, ${restante} días supera incluso lo que correspondería al año ${anoActual} completo (${diasCorrespondenAnoActual} días).`);
      }
    }
  }
  return { asignaciones, permisoDias, avisos };
}

/* ---------- Bono vacacional: cálculo de monto a pagar ---------- */
export function calcularBonoVacacional(emp, anoServicio, fechaPagoISO) {
  fechaPagoISO = fechaPagoISO || todayStr();
  const dias = diasBonoVacPorAno(anoServicio);
  const salario = salarioVigente(emp, fechaPagoISO);
  const salarioDiario = salario / 30;
  const monto = dias * salarioDiario;
  const yaPagado = state.BONO_VAC_PAGADO.some((b) => b.empId === emp.id && b.anoServicio === anoServicio);
  return { dias, salario, salarioDiario, monto, yaPagado };
}

// Fecha de egreso del empleado si ya egresó (Liquidación / ficha), o null.
function fechaEgresoEmp(emp) {
  return (emp.activo === false && emp.egreso && emp.egreso.fecha) ? emp.egreso.fecha : null;
}

// Días que corresponden a un trabajador dentro de una ventana [desde, hasta]
// según su ingreso y su egreso: la ventana completa vale `diasCompleto` (15 de
// quincena, 30 de mes — así febrero o un mes de 31 días no paga de más ni de
// menos); si solo estuvo parte, se pagan los días reales (nunca más del
// completo). Si ya se había ido antes de empezar la ventana, son 0.
function diasEnVentana(emp, desdeISO, hastaISO, diasCompleto) {
  const egreso = fechaEgresoEmp(emp);
  const ini = emp.fechaIngreso && emp.fechaIngreso > desdeISO ? emp.fechaIngreso : desdeISO;
  const fin = egreso && egreso < hastaISO ? egreso : hastaISO;
  if (fin < ini) return 0;
  if (ini <= desdeISO && fin >= hastaISO) return diasCompleto;
  return Math.min(diasEntreInclusive(ini, fin), diasCompleto);
}

/* ---------- Nómina (período) ---------- */
/**
 * Trabajo en día feriado, no laborable decretado o de descanso (Art. 119-120
 * LOTTT). Cada día registrado se paga ADEMÁS del sueldo mensual (que ya cubre
 * los días de descanso y feriados) con su salario normal del día más el recargo
 * configurado (50% por defecto): factor 1,5 sobre el salario diario. Es salarial.
 */
export function factorFeriadoTrabajado() {
  const c = state.CONFIG;
  const pct = c.feriadoTrabajadoRecargoPct === undefined || c.feriadoTrabajadoRecargoPct === null || c.feriadoTrabajadoRecargoPct === ''
    ? 50 : Number(c.feriadoTrabajadoRecargoPct);
  return (c.feriadoTrabajadoPagaDia === false ? 0 : 1) + pct / 100;
}

export function calcularFeriadosTrabajados(emp, desdeISO, hastaISO) {
  const regs = (state.FERIADOS_TRABAJADOS || []).filter((r) => r.empId === emp.id && r.fecha >= desdeISO && r.fecha <= hastaISO);
  const factor = factorFeriadoTrabajado();
  const detalle = regs
    .slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map((r) => ({ id: r.id, fecha: r.fecha, tipo: r.tipo, monto: (salarioVigente(emp, r.fecha) / 30) * factor }));
  return { dias: detalle.length, monto: detalle.reduce((a, d) => a + d.monto, 0), detalle, factor };
}

export function calcularReciboNomina(emp, tipoKey, fechaPeriodoISO) {
  const cfg = tipoNominaCfg(tipoKey);
  const salarioMensual = salarioVigente(emp, fechaPeriodoISO);
  const salarioDiario = salarioMensual / 30;
  const diasConfigurados = cfg.diasSueldo;
  const mesDeCorte = primerYUltimoDiaMes(fechaPeriodoISO);
  const egresoEmp = fechaEgresoEmp(emp);
  // Si ya se le pagó el bono de alimentación de este mes en su propia corrida
  // (tipo de nómina "Bono de alimentación"), esta nómina normal no lo incluye
  // de nuevo — se paga una sola vez por mes.
  const bonoAlimPagadoAparte = bonoAlimentacionYaPagadoEnMes(emp.id, fechaPeriodoISO);
  // El bono de alimentación (Ley de Alimentación) se genera por jornada
  // efectivamente laborada: igual que el sueldo, si ingresó o egresó dentro
  // del mes se paga por los días reales de ese mes (de 30) — no el mes completo.
  // Esto incluye a quien ya egresó: el bono del mes en que se fue sigue
  // pagándose por sus días trabajados.
  const diasBonoMes = diasEnVentana(emp, mesDeCorte.primero, mesDeCorte.ultimo, 30);
  const cestaticketPeriodo = (cfg.incluyeCestaticket && !bonoAlimPagadoAparte)
    ? cestaticketEmp(emp, fechaPeriodoISO) * (diasBonoMes / 30) : 0;

  // Sueldo: días trabajados dentro del período nominal (1-15, 16-fin de mes, o
  // el mes). Si ingresó a mitad del período (o, para el primer mes de
  // Doctormás, la empresa misma empezó a mitad de mes — 17/04/2023), o si ya
  // egresó antes de que cerrara, se prorratea; quien ya se había ido antes de
  // empezar el período tiene 0 días de sueldo (pero igual puede tener bono y
  // deducciones del mes, si este tipo de nómina los incluye).
  const { desde: periodoDesdeCalc, hasta: periodoHastaCalc } = periodoNominal(tipoKey, fechaPeriodoISO);
  const diasPeriodo = diasEnVentana(emp, periodoDesdeCalc, periodoHastaCalc, diasConfigurados);

  const salarioNormalPeriodo = salarioDiario * diasPeriodo;
  // Feriados / descansos trabajados dentro del período: salarial, se suma al devengado
  // y a la base de las deducciones.
  const feriadosTrab = calcularFeriadosTrabajados(emp, periodoDesdeCalc, periodoHastaCalc);
  const pagoFeriados = feriadosTrab.monto;

  const ant = antiguedad(emp.fechaIngreso, fechaPeriodoISO);
  const si = salarioIntegralDiario(salarioMensual, ant.anoServicioActual, diasUtilidadesEmp(emp));

  // IVSS, RPE, FAOV, INCES e ISLR se calculan POR PERÍODO: cada quincena
  // (o el mes, si la nómina es mensual) sobre los días y el sueldo de ESE
  // período, con los topes prorrateados a sus días. El informe del mes de
  // Parafiscales es la suma de los recibos de las dos quincenas. La Ley DPP
  // NO se calcula aquí: se paga una vez al mes por el total del mes de cada
  // trabajador (ver calcularDPPMes).
  let ivssTrab = 0, rpeTrab = 0, faovTrab = 0, islrTrab = 0, ivssPatrono = 0, faovPatrono = 0, rpePatrono = 0, incesPatrono = 0;
  let ivssBaseDeclarada = false;
  let baseIVSSCalc = 0, baseRPECalc = 0, baseFAOVCalc = 0, baseINCESCalc = 0;
  if (cfg.incluyeDeducciones) {
    const diasMes = diasPeriodo;
    const salarioMesBase = salarioNormalPeriodo + pagoFeriados;

    const fraccionMes = diasMes / 30;
    // Tope IVSS: 5 salarios mínimos (Art. 59 Ley del Seguro Social).
    const topeIVSSMes = state.CONFIG.salarioMinimo * state.CONFIG.ivssTopeSalariosMinimos * fraccionMes;
    let baseCotizable = Math.min(salarioMesBase, topeIVSSMes);
    // Tope RPE: 10 salarios mínimos, con un PISO de 1 salario mínimo (Art. 46
    // Ley del Régimen Prestacional de Empleo) — es una ley distinta a la del
    // IVSS, con su propio tope (el doble del de IVSS), no el mismo.
    const topeRPEMes = state.CONFIG.salarioMinimo * state.CONFIG.rpeTopeSalariosMinimos * fraccionMes;
    const pisoRPEMes = state.CONFIG.salarioMinimo * (state.CONFIG.rpePisoSalariosMinimos || 1) * fraccionMes;
    let baseCotizableRPE = Math.min(Math.max(salarioMesBase, pisoRPEMes), topeRPEMes);

    // Si hay un sueldo semanal cargado en el IVSS para este trabajador
    // (Empleados → Registro ante el IVSS), el IVSS y el RPE se calculan
    // sobre ESE sueldo (× 5 semanas por mes, prorrateado si el mes es
    // parcial) en vez de la fórmula con tope — reproduce exactamente lo que
    // el IVSS va a cobrar en la práctica, tenga o no la base correcta según
    // la ley. Sin ese dato cargado, se usa la fórmula legal de arriba.
    const salarioSemanalIVSS = salarioSemanalIVSSVigente(emp, fechaPeriodoISO);
    ivssBaseDeclarada = salarioSemanalIVSS !== null;
    if (ivssBaseDeclarada) {
      const baseDeclarada = salarioSemanalIVSS * 5 * fraccionMes;
      baseCotizable = baseDeclarada;
      baseCotizableRPE = baseDeclarada;
    }

    // IVSS y RPE van juntos en la misma inscripción patronal ante el IVSS —
    // si el trabajador no está inscrito, no cotiza ninguno de los dos (ni
    // trabajador ni patrono). FAOV e INCES son registros aparte y sí aplican
    // igual, esté o no inscrito en el IVSS.
    const inscritoIVSS = emp.inscritoIVSS !== false;
    if (inscritoIVSS) {
      ivssTrab = baseCotizable * (state.CONFIG.ivssTrabajador / 100);
      rpeTrab = baseCotizableRPE * (state.CONFIG.rpeTrabajador / 100);
      ivssPatrono = baseCotizable * (state.CONFIG.ivssPatrono / 100);
      rpePatrono = baseCotizableRPE * (state.CONFIG.rpePatrono / 100);
    }
    // FAOV sobre el SALARIO NORMAL del mes (no el integral): criterio fijado
    // por la empresa (la ley habla de salario integral; hay doctrina que
    // sostiene el salario normal — validar con la contadora).
    faovTrab = salarioMesBase * (state.CONFIG.faovTrabajador / 100);
    faovPatrono = salarioMesBase * (state.CONFIG.faovPatrono / 100);
    incesPatrono = salarioMesBase * (state.CONFIG.incesPatrono / 100);
    baseIVSSCalc = inscritoIVSS ? baseCotizable : 0;
    baseRPECalc = inscritoIVSS ? baseCotizableRPE : 0;
    baseFAOVCalc = salarioMesBase;
    baseINCESCalc = salarioMesBase;

    // ISLR (impuesto sobre la renta): % propio de cada empleado, determinado con el
    // formulario AR-I (declaración anual del trabajador). No hay un % general porque
    // depende de los ingresos y desgravámenes que cada quien declaró — se fija en su
    // ficha (Empleados). Igual que las demás deducciones, se retiene una sola vez al
    // mes (en la quincena que trae deducciones) sobre el salario normal del mes
    // completo, no solo sobre los días de ese recibo.
    islrTrab = salarioMesBase * (islrPorcentajeEmp(emp) / 100);
  }

  const totalDeducciones = ivssTrab + rpeTrab + faovTrab + islrTrab;
  const totalDevengado = salarioNormalPeriodo + pagoFeriados + cestaticketPeriodo;
  const neto = totalDevengado - totalDeducciones;

  const tasaBCV = tasaEnFecha(fechaPeriodoISO);
  const usaTasaUSD = emp.monedaSalario === 'USD' || (cfg.incluyeCestaticket && !bonoAlimPagadoAparte && cestaticketMonedaEmp(emp, fechaPeriodoISO) === 'USD');
  const { desde: periodoDesde, hasta: periodoHasta } = periodoNominal(tipoKey, fechaPeriodoISO);

  return {
    salarioMensual, salarioDiario, salarioNormalPeriodo, cestaticketPeriodo, diasPeriodo,
    pagoFeriados, diasFeriadosTrab: feriadosTrab.dias, detalleFeriados: feriadosTrab.detalle,
    bonoAlimPagadoAparte, diasBonoMes,
    salarioIntegralDiario: si.integral, alicuotaUtilDiaria: si.alicuotaUtil, alicuotaBonoDiaria: si.alicuotaBono,
    baseIVSS: baseIVSSCalc, baseRPE: baseRPECalc, baseFAOV: baseFAOVCalc, baseINCES: baseINCESCalc,
    inscritoIVSS: emp.inscritoIVSS !== false,
    ivssBaseDeclarada,
    periodoParcial: diasPeriodo < diasConfigurados,
    periodoParcialPorEgreso: diasPeriodo < diasConfigurados && !!egresoEmp && egresoEmp <= periodoHastaCalc,
    periodoDesde, periodoHasta,
    tipoLabel: cfg.label, tasaBCV, usaTasaUSD,
    ivssTrab, rpeTrab, faovTrab, islrTrab, totalDeducciones, totalDevengado, neto,
    ivssPatrono, faovPatrono, rpePatrono, incesPatrono,
    aportesPatronales: ivssPatrono + faovPatrono + rpePatrono + incesPatrono
  };
}

/**
 * Ley de Protección de las Pensiones (DPP, recaudada por el SENIAT): NO se
 * calcula recibo por recibo — se paga una sola vez al mes por el TOTAL que
 * cada trabajador recibió ese mes (salario de todas sus quincenas/mensual +
 * bono de alimentación, esté incluido en la nómina o pagado aparte), con un
 * mínimo por trabajador (Art. 7 Ley DPP) si lo real fue menor a eso.
 * Se calcula en la pestaña Parafiscales, no en cada nómina individual.
 */
// corridaExtra (opcional): { tipoPeriodo, fecha, filas:[{emp, r}] } — una
// corrida todavía no guardada, para estimar la DPP del mes incluyéndola
// (si esa misma corrida ya estuviera guardada, no se cuenta dos veces).
export function calcularDPPMes(mesISO, corridaExtra) {
  let periodos = state.PERIODOS;
  if (corridaExtra) {
    periodos = periodos.filter((p) => !(p.tipoPeriodo === corridaExtra.tipoPeriodo && p.fecha === corridaExtra.fecha))
      .concat(corridaExtra.filas.filter((x) => x.emp).map((x) => ({ empId: x.emp.id, tipoPeriodo: corridaExtra.tipoPeriodo, fecha: corridaExtra.fecha, resultado: x.r })));
  }
  const empleadosIds = new Set();
  periodos.forEach((p) => { if (p.fecha.slice(0, 7) === mesISO) empleadosIds.add(p.empId); });
  state.BONO_ALIM_PAGADO.forEach((b) => { if (b.fecha.slice(0, 7) === mesISO) empleadosIds.add(b.empId); });

  const fechaRef = mesISO + '-01';
  const dppBaseMinimaBs = state.CONFIG.dppBaseMinimaMoneda === 'USD'
    ? state.CONFIG.dppBaseMinima * tasaEnFecha(fechaRef)
    : state.CONFIG.dppBaseMinima;

  const filas = Array.from(empleadosIds).map((empId) => {
    const emp = state.EMPLEADOS.find((e) => e.id === empId);
    const periodosDelMes = periodos.filter((p) => p.empId === empId && p.fecha.slice(0, 7) === mesISO);
    const salario = periodosDelMes.reduce((a, p) => a + p.resultado.salarioNormalPeriodo + (p.resultado.pagoFeriados || 0), 0);
    const bonoEnNomina = periodosDelMes.reduce((a, p) => a + (p.resultado.cestaticketPeriodo || 0), 0);
    const bonoAparte = state.BONO_ALIM_PAGADO.filter((b) => b.empId === empId && b.fecha.slice(0, 7) === mesISO)
      .reduce((a, b) => a + b.monto, 0);
    const bono = bonoEnNomina + bonoAparte;
    const baseReal = salario + bono;
    // Base mínima solo si está configurada (> 0); por defecto se usa el cálculo
    // de ley: 9% sobre lo realmente pagado, sin piso por trabajador.
    const baseMinimaAplicada = dppBaseMinimaBs > 0 && baseReal < dppBaseMinimaBs;
    const baseFinal = baseMinimaAplicada ? dppBaseMinimaBs : baseReal;
    const dpp = baseFinal * (state.CONFIG.dppPatrono / 100);
    return { emp, salario, bono, baseReal, baseFinal, baseMinimaAplicada, dpp };
  }).filter((f) => f.emp).sort((a, b) => a.emp.nombre.localeCompare(b.emp.nombre));

  const totalDPP = filas.reduce((a, f) => a + f.dpp, 0);
  return { filas, totalDPP, dppBaseMinimaBs };
}

/**
 * Parafiscales del MES por trabajador = la SUMA de los recibos guardados de
 * ese mes (cada quincena se calcula a sus 15 días; el mes es la suma de las
 * dos). Solo cuentan los conceptos salariales: el bono de alimentación no
 * entra en ninguna base. La DPP tiene su propio informe (su base sí incluye
 * el bono).
 */
export function calcularParafiscalesMes(mesISO) {
  return calcularParafiscalesPeriodo(`${mesISO}-01`, `${mesISO}-31`);
}

// Igual que el mensual pero para cualquier rango [desde, hasta] (ej. el
// trimestre del INCES): suma los recibos guardados en ese rango.
export function calcularParafiscalesPeriodo(desdeISO, hastaISO) {
  const C = state.CONFIG;
  const periodos = state.PERIODOS.filter((p) => p.fecha >= desdeISO && p.fecha <= hastaISO);
  const ids = Array.from(new Set(periodos.map((p) => p.empId)));
  // Recibos viejos no guardaron la base: se despeja del monto y su alícuota.
  const baseDe = (guardada, monto, pct) => (guardada !== undefined ? guardada : (pct > 0 ? monto / (pct / 100) : 0));
  const filas = ids.map((empId) => {
    const emp = state.EMPLEADOS.find((e) => e.id === empId);
    if (!emp) return null;
    const delEmp = periodos.filter((p) => p.empId === empId);
    const ps = delEmp.map((p) => p.resultado);
    const S = (fn) => ps.reduce((a, r) => a + (fn(r) || 0), 0);
    // Días: dentro de cada mes se suman las quincenas (tope 30 por mes); en un
    // rango de varios meses (ej. el trimestre del INCES) se suman los meses.
    const diasPorMes = {};
    delEmp.forEach((p) => { const m = p.fecha.slice(0, 7); diasPorMes[m] = (diasPorMes[m] || 0) + (p.resultado.diasPeriodo || 0); });
    const dias = Object.values(diasPorMes).reduce((a, d) => a + Math.min(d, 30), 0);
    return {
      emp, recibos: ps.length,
      dias,
      salario: S((r) => r.salarioNormalPeriodo + (r.pagoFeriados || 0)), bono: S((r) => r.cestaticketPeriodo),
      inscrito: emp.inscritoIVSS !== false, declaradoIVSS: ps.some((r) => r.ivssBaseDeclarada),
      baseIVSS: S((r) => baseDe(r.baseIVSS, r.ivssTrab, C.ivssTrabajador)),
      baseRPE: S((r) => baseDe(r.baseRPE, r.rpeTrab, C.rpeTrabajador)),
      baseFAOV: S((r) => baseDe(r.baseFAOV, r.faovTrab, C.faovTrabajador)),
      // INCES patronal: es costo de la empresa (no se descuenta al trabajador), así que
      // se calcula siempre sobre lo realmente devengado en el período — no sobre la
      // base que haya guardado un recibo viejo (mensual y a la tasa de otra quincena).
      baseINCES: S((r) => r.salarioNormalPeriodo + (r.pagoFeriados || 0)),
      ivssT: S((r) => r.ivssTrab), ivssP: S((r) => r.ivssPatrono),
      rpeT: S((r) => r.rpeTrab), rpeP: S((r) => r.rpePatrono),
      faovT: S((r) => r.faovTrab), faovP: S((r) => r.faovPatrono),
      incesP: S((r) => r.salarioNormalPeriodo + (r.pagoFeriados || 0)) * (C.incesPatrono / 100), islr: S((r) => r.islrTrab)
    };
  }).filter(Boolean).sort((a, b) => a.emp.nombre.localeCompare(b.emp.nombre));

  const totales = {};
  ['salario', 'bono', 'baseIVSS', 'baseRPE', 'baseFAOV', 'baseINCES', 'ivssT', 'ivssP', 'rpeT', 'rpeP', 'faovT', 'faovP', 'incesP', 'islr']
    .forEach((k) => { totales[k] = filas.reduce((a, f) => a + f[k], 0); });
  // INCES del trabajador (0,5%): se retiene al pagar las utilidades.
  const utilidades = state.UTILIDADES_PAGADAS.filter((u) => u.fecha >= desdeISO && u.fecha <= hastaISO).map((u) => ({
    emp: state.EMPLEADOS.find((e) => e.id === u.empId), fecha: u.fecha,
    bruto: u.resultado.montoBruto, inces: u.resultado.incesTrabajador
  })).filter((u) => u.emp);
  return { filas, totales, recibosGuardados: periodos.length, utilidades };
}

// Tipos de nómina "especiales": utilidades, bono vacacional y bono de
// alimentación son, para efectos de una corrida, otro tipo de nómina más
// (igual que primera/segunda quincena o mensual) — solo que se calculan y se
// guardan aparte de tiposNomina de Configuración.
export const TIPOS_NOMINA_ESPECIALES = [
  { id: 'utilidades', label: 'Utilidades (fin de año)' },
  { id: 'bonovacacional', label: 'Bono vacacional' },
  { id: 'bonoalimentacion', label: 'Bono de alimentación' }
];

/** ¿Ya se le pagó a este empleado el bono de alimentación de este mes en su
 * propia corrida? Si es así, la nómina normal (quincena/mensual) de ese mismo
 * mes no debe volver a incluirlo — se pagó una sola vez, por separado. */
function bonoAlimentacionYaPagadoEnMes(empId, fechaPeriodoISO) {
  const mesISO = fechaPeriodoISO.slice(0, 7);
  return state.BONO_ALIM_PAGADO.some((b) => b.empId === empId && b.fecha.slice(0, 7) === mesISO);
}

// Se paga al cierre de mes, pero prorrateado por los días REALMENTE
// trabajados ese mes de 30 días — igual que la base de las deducciones en
// calcularReciboNomina: si ingresó a mitad de mes, o si ya egresó (aunque
// hoy su ficha diga "Egresado"), no se le paga el mes completo ni se le
// deja de pagar nada — se le paga la porción de esos días.
export function calcularBonoAlimentacion(emp, fechaPeriodoISO) {
  const montoCompleto = cestaticketEmp(emp, fechaPeriodoISO);
  const mes = primerYUltimoDiaMes(fechaPeriodoISO);
  const dias = diasEnVentana(emp, mes.primero, mes.ultimo, 30);
  const monto = montoCompleto * (dias / 30);
  const yaPagado = bonoAlimentacionYaPagadoEnMes(emp.id, fechaPeriodoISO);
  const egreso = fechaEgresoEmp(emp);
  const parcialPorEgreso = dias < 30 && !!egreso && egreso <= mes.ultimo;
  return { monto, dias, montoCompleto, yaPagado, parcialPorEgreso };
}

export function departamentosEmpleados() {
  const set = new Set(state.EMPLEADOS.map((e) => (e.departamento || '').trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// Empleados que ya quedaron "Egresado" pero estuvieron activos en algún
// momento dentro de la ventana [desde, hastaISO] — para que no desaparezcan
// de una corrida (nómina o bono de alimentación) de un período en el que sí
// trabajaron, solo porque su ficha hoy ya no está activa.
function egresadosEnVentana(desde, hastaISO, departamento) {
  let lista = state.EMPLEADOS.filter((e) =>
    e.activo === false && e.egreso && e.egreso.fecha &&
    e.egreso.fecha >= desde &&
    e.fechaIngreso && e.fechaIngreso <= hastaISO
  );
  if (departamento) lista = lista.filter((e) => (e.departamento || '') === departamento);
  return lista;
}

export function generarCorridaNomina(tipoPeriodo, fechaPeriodoISO, departamento) {
  let activos = state.EMPLEADOS.filter((e) => e.activo !== false && e.fechaIngreso && e.fechaIngreso <= fechaPeriodoISO);
  if (departamento) activos = activos.filter((e) => (e.departamento || '') === departamento);

  if (tipoPeriodo === 'utilidades') {
    const ano = Number(fechaPeriodoISO.slice(0, 4));
    const filas = activos.map((emp) => ({ emp, kind: 'utilidades', r: calcularUtilidades(emp, ano, fechaPeriodoISO) }));
    const totales = filas.reduce((a, f) => ({
      devengado: a.devengado + f.r.montoBruto, deducciones: a.deducciones + f.r.incesTrabajador,
      neto: a.neto + f.r.montoNeto, aportes: a.aportes
    }), { devengado: 0, deducciones: 0, neto: 0, aportes: 0 });
    return { filas, totales, kind: 'utilidades' };
  }

  if (tipoPeriodo === 'bonoalimentacion') {
    // El bono de alimentación se paga al cierre de mes por los días de ESE
    // mes — a diferencia de utilidades/bono vacacional (que sí se liquidan
    // aparte, fraccionados, al egresar), este NO se liquida en ningún lado:
    // si no se incluye aquí, un empleado que egresó a mitad de mes se queda
    // sin cobrar los días que sí trabajó.
    const activosBono = activos.concat(egresadosEnVentana(primerYUltimoDiaMes(fechaPeriodoISO).primero, fechaPeriodoISO, departamento));
    const filas = activosBono.map((emp) => ({ emp, kind: 'bonoalimentacion', r: calcularBonoAlimentacion(emp, fechaPeriodoISO) }));
    const totales = filas.reduce((a, f) => ({
      devengado: a.devengado + f.r.monto, deducciones: a.deducciones, neto: a.neto + f.r.monto, aportes: a.aportes
    }), { devengado: 0, deducciones: 0, neto: 0, aportes: 0 });
    return { filas, totales, kind: 'bonoalimentacion' };
  }

  if (tipoPeriodo === 'bonovacacional') {
    const filas = activos.map((emp) => {
      const ant = antiguedad(emp.fechaIngreso, fechaPeriodoISO);
      const anoServicio = ant.anoServicioActual;
      const r = calcularBonoVacacional(emp, anoServicio, fechaPeriodoISO);
      return { emp, kind: 'bonovacacional', anoServicio, r };
    });
    const totales = filas.reduce((a, f) => ({
      devengado: a.devengado + f.r.monto, deducciones: a.deducciones, neto: a.neto + f.r.monto, aportes: a.aportes
    }), { devengado: 0, deducciones: 0, neto: 0, aportes: 0 });
    return { filas, totales, kind: 'bonovacacional' };
  }

  // Nómina ordinaria: a diferencia de utilidades/bono vacacional (que sí se
  // liquidan aparte, fraccionados, al egresar), un empleado que estuvo
  // activo durante ESTE período todavía tiene derecho a su sueldo — no debe
  // desaparecer de la corrida solo porque HOY su ficha ya está en estado
  // "Egresado". Esto incluye generar/regenerar un período PASADO después de
  // que la persona ya se fue: si egresó DESPUÉS del cierre de este período,
  // estuvo activa los 15/30 días completos (no hace falta que su egreso
  // caiga justo dentro de las fechas de este período) — calcularReciboNomina
  // se encarga de cobrarle solo hasta su fecha de egreso cuando sí cae
  // dentro, o el período completo si egresó después.
  // En los tipos que cierran el mes (traen el bono de alimentación y/o las
  // deducciones mensuales) también entra quien egresó en la quincena anterior
  // del mismo mes: ya no tiene sueldo en este período, pero el bono y las
  // deducciones del mes se calculan por los días que sí trabajó.
  const cfgTipo = tipoNominaCfg(tipoPeriodo);
  const { desde: periodoDesde } = periodoNominal(tipoPeriodo, fechaPeriodoISO);
  const desdeInclusion = (cfgTipo.incluyeCestaticket || cfgTipo.incluyeDeducciones)
    ? primerYUltimoDiaMes(fechaPeriodoISO).primero : periodoDesde;
  const activosNomina = activos.concat(egresadosEnVentana(desdeInclusion, fechaPeriodoISO, departamento));

  const filas = activosNomina.map((emp) => ({ emp, kind: 'nomina', r: calcularReciboNomina(emp, tipoPeriodo, fechaPeriodoISO) }));
  const totales = filas.reduce((a, f) => ({
    devengado: a.devengado + f.r.totalDevengado, deducciones: a.deducciones + f.r.totalDeducciones,
    neto: a.neto + f.r.neto, aportes: a.aportes + f.r.aportesPatronales
  }), { devengado: 0, deducciones: 0, neto: 0, aportes: 0 });
  return { filas, totales, kind: 'nomina' };
}

/* ---------- ISLR (AR-I / AR-C) ---------- */
export function islrPorcentajeEmp(emp) {
  return (emp.islrPorcentaje !== undefined && emp.islrPorcentaje !== null && emp.islrPorcentaje !== '')
    ? Number(emp.islrPorcentaje) : 0;
}

/**
 * Estima el ingreso anual de un empleado para la calculadora AR-I: salario de
 * los 12 meses del año, más lo que se proyecta recibir de utilidades y bono
 * vacacional en ese mismo período (el cestaticket no entra: no es salarial).
 * Proyecta hacia adelante (un año completo trabajado), no lo ya devengado.
 */
export function estimarIngresoAnualEmp(emp, fechaISO) {
  fechaISO = fechaISO || todayStr();
  const salarioMensual = salarioVigente(emp, fechaISO);
  const salarioDiario = salarioMensual / 30;
  const salarioAnual = salarioMensual * 12;
  const ant = antiguedad(emp.fechaIngreso, fechaISO);
  const utilidadesAnual = diasUtilidadesEmp(emp) * salarioDiario;
  const bonoVacAnual = diasBonoVacPorAno(Math.max(ant.anoServicioActual, 1)) * salarioDiario;
  const total = salarioAnual + utilidadesAnual + bonoVacAnual;
  return { salarioAnual, utilidadesAnual, bonoVacAnual, total };
}

/* ---------- Utilidades ---------- */
export function diasUtilidadesEmp(emp) {
  return (emp.diasUtilidadesAnual !== undefined && emp.diasUtilidadesAnual !== null && emp.diasUtilidadesAnual !== '')
    ? Number(emp.diasUtilidadesAnual) : state.CONFIG.diasUtilidadesAnual;
}

// Historial del bono de alimentación: [{ fecha, monto, moneda }]. El monto que
// rige para una fecha es el de la última entrada con fecha <= esa fecha (así,
// al generar una nómina de un mes anterior sale el bono que se pagaba entonces,
// no el actual). Si todas las entradas son posteriores a la fecha, rige la más
// antigua — salvo que se pida estricto (ficha del empleado): ahí no hay entrada
// y rige el monto que tiene cargado la ficha en sus campos (el "de antes").
function entradaCestaVigente(hist, fechaISO, estricto) {
  if (!hist || !hist.length) return null;
  const orden = hist.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  let e = null;
  for (const h of orden) { if (h.fecha <= fechaISO) e = h; else break; }
  return e || (estricto ? null : orden[0]);
}

const montoCestaDefinido = (m) => m !== undefined && m !== null && m !== '';

// Bono general (Configuración) vigente a la fecha, en su moneda nativa.
export function cestaticketGeneralVigente(fechaISO) {
  fechaISO = fechaISO || todayStr();
  const e = entradaCestaVigente(state.CONFIG.historialCestaticket, fechaISO);
  if (e) return { monto: Number(e.monto || 0), moneda: e.moneda || 'VES' };
  return { monto: Number(state.CONFIG.cestaticket || 0), moneda: state.CONFIG.cestaticketMoneda || 'VES' };
}

// Bono de este empleado vigente a la fecha, en su moneda nativa: su historial
// propio; si no tiene (o la entrada está en blanco), el campo propio de la
// ficha; y si tampoco, el general de Configuración (también con historial).
export function cestaticketVigenteEmp(emp, fechaISO) {
  fechaISO = fechaISO || todayStr();
  const e = entradaCestaVigente(emp.historialCestaticket, fechaISO, true);
  if (e) {
    if (montoCestaDefinido(e.monto)) return { monto: Number(e.monto), moneda: e.moneda || 'VES' };
    return cestaticketGeneralVigente(fechaISO);
  }
  if (montoCestaDefinido(emp.cestaticket)) return { monto: Number(emp.cestaticket), moneda: emp.cestaticketMoneda || 'VES' };
  return cestaticketGeneralVigente(fechaISO);
}

const cestaABs = (v, fechaISO) => (v.moneda === 'USD' ? v.monto * tasaEnFecha(fechaISO) : v.monto);

export function cestaticketGeneralBs(fechaISO) {
  fechaISO = fechaISO || todayStr();
  return cestaABs(cestaticketGeneralVigente(fechaISO), fechaISO);
}

export function cestaticketEmp(emp, fechaISO) {
  fechaISO = fechaISO || todayStr();
  return cestaABs(cestaticketVigenteEmp(emp, fechaISO), fechaISO);
}

export function cestaticketMonedaEmp(emp, fechaISO) {
  return cestaticketVigenteEmp(emp, fechaISO).moneda;
}

export function calcularUtilidades(emp, anoCalculo, fechaCorteISO) {
  fechaCorteISO = fechaCorteISO || (anoCalculo + '-12-31');
  const inicioAno = anoCalculo + '-01-01';
  const ing = parseDate(emp.fechaIngreso);
  const desde = ing > parseDate(inicioAno) ? emp.fechaIngreso : inicioAno;
  const hasta = fechaCorteISO;
  const meses = mesesEntre(desde, hasta);
  const salario = salarioVigente(emp, hasta);
  const salarioDiario = salario / 30;
  const diasAnual = diasUtilidadesEmp(emp);
  const diasProporcion = (diasAnual / 12) * meses;
  const monto = diasProporcion * salarioDiario;
  const incesTrabajador = monto * (state.CONFIG.incesTrabajador / 100);
  return { meses, diasProporcion, diasAnual, salarioDiario, montoBruto: monto, incesTrabajador, montoNeto: monto - incesTrabajador };
}

export function mesesEntre(desdeISO, hastaISO) {
  const d = parseDate(desdeISO), h = parseDate(hastaISO);
  let meses = (h.getFullYear() - d.getFullYear()) * 12 + (h.getMonth() - d.getMonth());
  if (h.getDate() >= d.getDate()) meses += 1;
  return Math.max(meses, 0);
}

/* ---------- Liquidación final ---------- */
export function calcularLiquidacion(emp, fechaEgresoISO, causa) {
  const prest = calcularPrestaciones(emp, fechaEgresoISO);
  const vac = estadoVacaciones(emp, fechaEgresoISO);
  const salario = salarioVigente(emp, fechaEgresoISO);
  const salarioDiario = salario / 30;
  const util = calcularUtilidades(emp, parseDate(fechaEgresoISO).getFullYear(), fechaEgresoISO);

  const vacacionesPendientesMonto = vac.pendientesTotal * salarioDiario;
  const vacacionesFraccionadasMonto = vac.fraccionVac * salarioDiario;
  const bonoVacFraccionadoMonto = vac.fraccionBono * salarioDiario;
  const utilidadesFraccionadasMonto = util.montoBruto;

  const indemnizacionDespidoInjustificado = causa === 'despido_injustificado' ? prest.montoAPagar : 0;

  const totalGeneral = prest.montoAPagar + vacacionesPendientesMonto + vacacionesFraccionadasMonto +
    bonoVacFraccionadoMonto + utilidadesFraccionadasMonto + indemnizacionDespidoInjustificado;

  return {
    prest, vac, util, salarioDiario,
    vacacionesPendientesMonto, vacacionesFraccionadasMonto, bonoVacFraccionadoMonto,
    utilidadesFraccionadasMonto, indemnizacionDespidoInjustificado, totalGeneral
  };
}
