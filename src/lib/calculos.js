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

/* ---------- Nómina (período) ---------- */
export function calcularReciboNomina(emp, tipoKey, fechaPeriodoISO) {
  const cfg = tipoNominaCfg(tipoKey);
  const salarioMensual = salarioVigente(emp, fechaPeriodoISO);
  const salarioDiario = salarioMensual / 30;
  const diasConfigurados = cfg.diasSueldo;
  // Si ya se le pagó el bono de alimentación de este mes en su propia corrida
  // (tipo de nómina "Bono de alimentación"), esta nómina normal no lo incluye
  // de nuevo — se paga una sola vez por mes.
  const bonoAlimPagadoAparte = bonoAlimentacionYaPagadoEnMes(emp.id, fechaPeriodoISO);
  const cestaticketPeriodo = (cfg.incluyeCestaticket && !bonoAlimPagadoAparte) ? cestaticketEmp(emp, fechaPeriodoISO) : 0;

  // Si el empleado ingresó a mitad de este período (o, para el primer mes de
  // Doctormás, la empresa misma empezó a mitad de mes — 17/04/2023), no se
  // paga como si hubiera trabajado el período completo: se prorratea a los
  // días reales trabajados dentro de este período (quincena o mes).
  const inicioVentanaPeriodo = sumarDias(fechaPeriodoISO, -(diasConfigurados - 1));
  const inicioRealPeriodo = emp.fechaIngreso && emp.fechaIngreso > inicioVentanaPeriodo ? emp.fechaIngreso : inicioVentanaPeriodo;
  const diasPeriodo = Math.min(diasEntreInclusive(inicioRealPeriodo, fechaPeriodoISO), diasConfigurados);

  const salarioNormalPeriodo = salarioDiario * diasPeriodo;

  const ant = antiguedad(emp.fechaIngreso, fechaPeriodoISO);
  const si = salarioIntegralDiario(salarioMensual, ant.anoServicioActual, diasUtilidadesEmp(emp));

  // Lo que se PAGA en este recibo (devengado) es solo lo de este período (15
  // días de quincena, o 30 si es mensual) — eso no cambia. Pero IVSS, FAOV,
  // RPE, INCES e ISLR son una obligación MENSUAL real: si el tipo de nómina
  // que "trae las deducciones" (ej. segunda quincena) las calculara solo
  // sobre sus propios 15 días, y la quincena sin deducciones (ej. primera)
  // no aporta nada, entre las dos se estaría declarando y pagando la MITAD
  // de lo que realmente corresponde ese mes. Por eso la base de las
  // deducciones/aportes usa los días del MES completo del trabajador (todas
  // sus quincenas hasta la fecha de corte, o los 30 días si es mensual) —
  // prorrateados si ingresó a mitad de mes — aunque el dinero se descuente
  // de este recibo en particular. La Ley DPP NO se calcula aquí (recibo por
  // recibo): se paga una vez al mes por el total del mes de cada
  // trabajador — se calcula aparte, en Parafiscales (ver calcularDPPMes).
  let ivssTrab = 0, rpeTrab = 0, faovTrab = 0, islrTrab = 0, ivssPatrono = 0, faovPatrono = 0, rpePatrono = 0, incesPatrono = 0;
  let ivssBaseDeclarada = false;
  if (cfg.incluyeDeducciones) {
    const inicioVentanaMes = sumarDias(fechaPeriodoISO, -29);
    const inicioRealMes = emp.fechaIngreso && emp.fechaIngreso > inicioVentanaMes ? emp.fechaIngreso : inicioVentanaMes;
    const diasMes = Math.min(diasEntreInclusive(inicioRealMes, fechaPeriodoISO), 30);
    const salarioMesBase = salarioDiario * diasMes;

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
    const salarioIntegralMes = si.integral * diasMes;

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
    faovTrab = salarioIntegralMes * (state.CONFIG.faovTrabajador / 100);
    faovPatrono = salarioIntegralMes * (state.CONFIG.faovPatrono / 100);
    incesPatrono = salarioMesBase * (state.CONFIG.incesPatrono / 100);

    // ISLR (impuesto sobre la renta): % propio de cada empleado, determinado con el
    // formulario AR-I (declaración anual del trabajador). No hay un % general porque
    // depende de los ingresos y desgravámenes que cada quien declaró — se fija en su
    // ficha (Empleados). Igual que las demás deducciones, se retiene una sola vez al
    // mes (en la quincena que trae deducciones) sobre el salario normal del mes
    // completo, no solo sobre los días de ese recibo.
    islrTrab = salarioMesBase * (islrPorcentajeEmp(emp) / 100);
  }

  const totalDeducciones = ivssTrab + rpeTrab + faovTrab + islrTrab;
  const totalDevengado = salarioNormalPeriodo + cestaticketPeriodo;
  const neto = totalDevengado - totalDeducciones;

  const tasaBCV = tasaEnFecha(fechaPeriodoISO);
  const usaTasaUSD = emp.monedaSalario === 'USD' || (cfg.incluyeCestaticket && !bonoAlimPagadoAparte && cestaticketMonedaEmp(emp) === 'USD');
  const { desde: periodoDesde, hasta: periodoHasta } = periodoNominal(tipoKey, fechaPeriodoISO);

  return {
    salarioMensual, salarioDiario, salarioNormalPeriodo, cestaticketPeriodo, diasPeriodo,
    bonoAlimPagadoAparte,
    inscritoIVSS: emp.inscritoIVSS !== false,
    ivssBaseDeclarada,
    periodoParcial: diasPeriodo < diasConfigurados,
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
export function calcularDPPMes(mesISO) {
  const empleadosIds = new Set();
  state.PERIODOS.forEach((p) => { if (p.fecha.slice(0, 7) === mesISO) empleadosIds.add(p.empId); });
  state.BONO_ALIM_PAGADO.forEach((b) => { if (b.fecha.slice(0, 7) === mesISO) empleadosIds.add(b.empId); });

  const fechaRef = mesISO + '-01';
  const dppBaseMinimaBs = state.CONFIG.dppBaseMinimaMoneda === 'USD'
    ? state.CONFIG.dppBaseMinima * tasaEnFecha(fechaRef)
    : state.CONFIG.dppBaseMinima;

  const filas = Array.from(empleadosIds).map((empId) => {
    const emp = state.EMPLEADOS.find((e) => e.id === empId);
    const periodosDelMes = state.PERIODOS.filter((p) => p.empId === empId && p.fecha.slice(0, 7) === mesISO);
    const salario = periodosDelMes.reduce((a, p) => a + p.resultado.salarioNormalPeriodo, 0);
    const bonoEnNomina = periodosDelMes.reduce((a, p) => a + (p.resultado.cestaticketPeriodo || 0), 0);
    const bonoAparte = state.BONO_ALIM_PAGADO.filter((b) => b.empId === empId && b.fecha.slice(0, 7) === mesISO)
      .reduce((a, b) => a + b.monto, 0);
    const bono = bonoEnNomina + bonoAparte;
    const baseReal = salario + bono;
    const baseMinimaAplicada = baseReal < dppBaseMinimaBs;
    const baseFinal = Math.max(baseReal, dppBaseMinimaBs);
    const dpp = baseFinal * (state.CONFIG.dppPatrono / 100);
    return { emp, salario, bono, baseReal, baseFinal, baseMinimaAplicada, dpp };
  }).filter((f) => f.emp).sort((a, b) => a.emp.nombre.localeCompare(b.emp.nombre));

  const totalDPP = filas.reduce((a, f) => a + f.dpp, 0);
  return { filas, totalDPP, dppBaseMinimaBs };
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

export function calcularBonoAlimentacion(emp, fechaPeriodoISO) {
  const monto = cestaticketEmp(emp, fechaPeriodoISO);
  const yaPagado = bonoAlimentacionYaPagadoEnMes(emp.id, fechaPeriodoISO);
  return { monto, yaPagado };
}

export function departamentosEmpleados() {
  const set = new Set(state.EMPLEADOS.map((e) => (e.departamento || '').trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
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
    const filas = activos.map((emp) => ({ emp, kind: 'bonoalimentacion', r: calcularBonoAlimentacion(emp, fechaPeriodoISO) }));
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

  const filas = activos.map((emp) => ({ emp, kind: 'nomina', r: calcularReciboNomina(emp, tipoPeriodo, fechaPeriodoISO) }));
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

export function cestaticketGeneralBs(fechaISO) {
  fechaISO = fechaISO || todayStr();
  return state.CONFIG.cestaticketMoneda === 'USD' ? Number(state.CONFIG.cestaticket || 0) * tasaEnFecha(fechaISO) : Number(state.CONFIG.cestaticket || 0);
}

export function cestaticketEmp(emp, fechaISO) {
  fechaISO = fechaISO || todayStr();
  const tienePropio = emp.cestaticket !== undefined && emp.cestaticket !== null && emp.cestaticket !== '';
  if (!tienePropio) return cestaticketGeneralBs(fechaISO);
  const moneda = emp.cestaticketMoneda || 'VES';
  return moneda === 'USD' ? Number(emp.cestaticket) * tasaEnFecha(fechaISO) : Number(emp.cestaticket);
}

export function cestaticketMonedaEmp(emp) {
  const tienePropio = emp.cestaticket !== undefined && emp.cestaticket !== null && emp.cestaticket !== '';
  return tienePropio ? (emp.cestaticketMoneda || 'VES') : (state.CONFIG.cestaticketMoneda || 'VES');
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
