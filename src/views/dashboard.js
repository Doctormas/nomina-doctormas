// Resumen: lo que hay que saber de un vistazo — alertas, próximos pagos,
// costo de la nómina, el equipo y accesos rápidos.
import { state, tasaEnFecha, getTasaActualValor } from '../state/store.js';
import { salarioVigente, estadoVacaciones, cestaticketEmp } from '../lib/calculos.js';
import { fmt } from '../lib/moneda.js';
import { todayStr, parseDate, fmtDate, fmtNum } from '../lib/formato.js';
import { calcularNotificaciones } from '../lib/notificaciones.js';
import { pagosAlrededor, fechaPagoQuincena, MESES } from '../lib/calendarioPagos.js';
import { puedeVer } from '../lib/auth.js';
import { estadoDe } from './empleados.js';

const esc = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A qué módulo lleva cada tipo de alerta al tocarla.
const DESTINO_ALERTA = {
  ivss: 'empleados', egreso: 'empleados', banco: 'empleados', cestaticket: 'empleados',
  documento: 'empleados', expediente: 'empleados', nomina: 'nomina'
};

const usd = (n) => '$' + fmtNum(n, 2);
const ir = (tab) => window.dispatchEvent(new CustomEvent('nomina-ir', { detail: tab }));

function saludo() {
  const h = new Date().getHours();
  const parte = h < 12 ? 'Buenos días' : (h < 19 ? 'Buenas tardes' : 'Buenas noches');
  const nombre = state.SESION && state.SESION.nombre ? state.SESION.nombre.split(' ')[0] : '';
  return nombre ? `${parte}, ${nombre}` : parte;
}

function diasHasta(fechaISO, hoyISO) {
  return Math.round((parseDate(fechaISO) - parseDate(hoyISO)) / 86400000);
}

function textoDias(n) {
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}

/* ---------- Costo de nómina por mes (US$) ---------- */
function costoPorMes(cuantosMeses) {
  const hoy = new Date();
  const meses = [];
  for (let i = cuantosMeses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push({ clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, etiqueta: MESES[d.getMonth()].slice(0, 3), sueldo: 0, bono: 0 });
  }
  const idx = new Map(meses.map((m, i) => [m.clave, i]));
  const aUSD = (bs, fecha) => { const t = tasaEnFecha(fecha); return t ? bs / t : 0; };
  state.PERIODOS.forEach((p) => {
    const i = idx.get(p.fecha.slice(0, 7));
    if (i === undefined) return;
    const r = p.resultado || {};
    meses[i].sueldo += aUSD(r.salarioNormalPeriodo || 0, p.fecha);
    meses[i].bono += aUSD(r.cestaticketPeriodo || 0, p.fecha);
  });
  state.BONO_ALIM_PAGADO.forEach((b) => {
    const i = idx.get(b.fecha.slice(0, 7));
    if (i !== undefined) meses[i].bono += aUSD(b.monto || 0, b.fecha);
  });
  return meses;
}

function graficoCostoHTML(meses) {
  const max = Math.max(1, ...meses.map((m) => m.sueldo + m.bono));
  const barras = meses.map((m) => {
    const total = m.sueldo + m.bono;
    const hS = (m.sueldo / max) * 100; const hB = (m.bono / max) * 100;
    return `<div class="dash-bar" title="${esc(m.etiqueta)}: ${usd(total)}">
      <div class="dash-bar-val">${total ? usd(Math.round(total)).replace('.00', '') : '—'}</div>
      <div class="dash-bar-col">
        <div class="dash-bar-seg bono" style="height:${hB}%;"></div>
        <div class="dash-bar-seg sueldo" style="height:${hS}%;"></div>
      </div>
      <div class="dash-bar-lbl">${esc(m.etiqueta)}</div>
    </div>`;
  }).join('');
  return `<div class="dash-bars">${barras}</div>
    <div class="dash-leyenda"><span><i class="sueldo"></i> Sueldos</span><span><i class="bono"></i> Bono de alimentación</span></div>`;
}

/* ---------- Equipo ---------- */
function proximasFechasEquipo(activos, hoyISO) {
  const hoy = parseDate(hoyISO);
  const items = [];
  const proxima = (mmdd) => {
    const [m, d] = mmdd;
    let f = new Date(hoy.getFullYear(), m - 1, d);
    if (f < hoy) f = new Date(hoy.getFullYear() + 1, m - 1, d);
    return f;
  };
  activos.forEach((e) => {
    if (e.fechaNacimiento) {
      const [, m, d] = e.fechaNacimiento.split('-').map(Number);
      const f = proxima([m, d]);
      items.push({ tipo: 'cumple', nombre: e.nombre, fecha: f, dias: Math.round((f - hoy) / 86400000) });
    }
    if (e.fechaIngreso) {
      const [a, m, d] = e.fechaIngreso.split('-').map(Number);
      const f = proxima([m, d]);
      const anos = f.getFullYear() - a;
      if (anos >= 1) items.push({ tipo: 'aniv', nombre: e.nombre, fecha: f, anos, dias: Math.round((f - hoy) / 86400000) });
    }
  });
  return items.filter((i) => i.dias <= 45).sort((a, b) => a.dias - b.dias).slice(0, 6);
}

function porDepartamento(activos) {
  const cuenta = new Map();
  activos.forEach((e) => { const d = e.departamento || 'Sin departamento'; cuenta.set(d, (cuenta.get(d) || 0) + 1); });
  return Array.from(cuenta.entries()).sort((a, b) => b[1] - a[1]);
}

/* ---------- Vista ---------- */
export function render(root, rerender) {
  const hoy = todayStr();
  const activos = state.EMPLEADOS.filter((e) => estadoDe(e) === 'activo');
  const verNomina = puedeVer('nomina');
  const verParalela = puedeVer('paralela');

  // KPIs
  const sueldosBs = activos.reduce((a, e) => a + Number(salarioVigente(e, hoy)), 0);
  const bonosBs = activos.reduce((a, e) => a + Number(cestaticketEmp(e, hoy)), 0);
  const tasaHoy = getTasaActualValor() || tasaEnFecha(hoy);
  const costoUSD = tasaHoy ? (sueldosBs + bonosBs) / tasaHoy : 0;
  let empVacPend = 0; let diasVacPend = 0;
  const listaVac = [];
  activos.forEach((e) => {
    const v = estadoVacaciones(e);
    if (v.pendientesTotal > 0) { empVacPend++; diasVacPend += v.pendientesTotal; listaVac.push({ nombre: e.nombre, dias: v.pendientesTotal }); }
  });
  listaVac.sort((a, b) => b.dias - a.dias);

  // Alertas
  const alertas = calcularNotificaciones();
  const nAlta = alertas.filter((a) => a.severidad === 'alta').length;
  const nMedia = alertas.filter((a) => a.severidad === 'media').length;

  // Pagos
  const generada = (p) => (p.tipoPeriodo === 'utilidades'
    ? state.UTILIDADES_PAGADAS.some((u) => u.fecha.slice(0, 4) === String(p.ano))
    : state.PERIODOS.some((r) => r.tipoPeriodo === p.tipoPeriodo && r.fecha.slice(0, 7) === `${p.ano}-${String(p.mes).padStart(2, '0')}`));
  const pagos = pagosAlrededor(hoy, 4, 20).map((p) => Object.assign({ hecha: generada(p), dias: diasHasta(p.fecha, hoy) }, p));
  const proximo = pagos.find((p) => !p.hecha && p.dias >= -20) || pagos.find((p) => p.dias >= 0);

  // Última nómina generada
  const ultima = state.PERIODOS.length ? state.PERIODOS.reduce((a, p) => (p.fecha > a.fecha ? p : a)) : null;

  // Paralela del mes (solo para quien tiene acceso)
  let paralelaMes = null;
  if (verParalela && state.PARALELA && Array.isArray(state.PARALELA.pagos)) {
    const mes = hoy.slice(0, 7);
    paralelaMes = state.PARALELA.pagos.filter((p) => p.fecha.slice(0, 7) === mes).reduce((a, p) => a + p.items.reduce((s, i) => {
      const t = tasaEnFecha(p.fecha);
      return s + ((i.moneda || p.moneda) === 'USD' ? i.monto : (t ? i.montoBs / t : 0));
    }, 0), 0);
  }

  const meses = costoPorMes(6);
  const fechasEquipo = proximasFechasEquipo(activos, hoy);
  const deptos = porDepartamento(activos);
  const maxDepto = Math.max(1, ...deptos.map((d) => d[1]));

  const sync = state.SYNC || {};
  const nubeTxt = sync.url
    ? (state.CAMBIOS_SIN_SINCRONIZAR
      ? '<span class="tag warn">Subiendo cambios a la nube…</span>'
      : '<span class="tag ok">Todo sincronizado con la nube</span>')
    : '<span class="tag">Sin conectar a la nube</span>';

  const alertasHTML = alertas.length
    ? alertas.slice(0, 7).map((a) => `
      <button type="button" class="dash-alerta ${a.severidad}" data-ir="${DESTINO_ALERTA[a.tipo] || 'empleados'}">
        <span class="dash-punto"></span><span class="dash-alerta-txt">${esc(a.texto)}</span><span class="dash-flecha">›</span>
      </button>`).join('') + (alertas.length > 7 ? `<div class="dash-mas">y ${alertas.length - 7} alerta${alertas.length - 7 === 1 ? '' : 's'} más — ábralas con la campana 🔔 de arriba.</div>` : '')
    : '<div class="dash-vacio">✓ Todo en orden: no hay alertas pendientes.</div>';

  const pagosHTML = pagos.map((p) => {
    const estado = p.hecha ? '<span class="tag ok">Generada</span>'
      : (p.dias < 0 ? '<span class="tag err">Atrasada</span>' : (p.dias <= 3 ? '<span class="tag warn">Próxima</span>' : '<span class="tag">Pendiente</span>'));
    return `<div class="dash-pago ${p.hecha ? 'hecha' : ''}">
      <div class="dash-pago-fecha"><b>${p.fecha.slice(8, 10)}</b><span>${MESES[Number(p.fecha.slice(5, 7)) - 1].slice(0, 3)}</span></div>
      <div class="dash-pago-info"><div>${esc(p.titulo)}</div><small>${textoDias(p.dias)}</small></div>
      ${estado}
    </div>`;
  }).join('');

  // Utilidades y bono vacacional: evento anual de diciembre, siempre visible.
  const anoU = parseDate(hoy).getFullYear();
  let fechaUtil = fechaPagoQuincena(anoU, 12, 1);
  if (fechaUtil < hoy) fechaUtil = fechaPagoQuincena(anoU + 1, 12, 1);
  const anoDeUtil = Number(fechaUtil.slice(0, 4));
  const utilHecha = state.UTILIDADES_PAGADAS.some((u) => u.fecha.slice(0, 4) === String(anoDeUtil));
  const diasUtil = diasHasta(fechaUtil, hoy);
  const utilidadesHTML = `<div class="dash-pago ${utilHecha ? 'hecha' : ''}" style="margin-top:8px;">
      <div class="dash-pago-fecha"><b>${fechaUtil.slice(8, 10)}</b><span>dic</span></div>
      <div class="dash-pago-info"><div>Utilidades y bono vacacional ${anoDeUtil}</div><small>${textoDias(diasUtil)}</small></div>
      ${utilHecha ? '<span class="tag ok">Generada</span>' : (diasUtil <= 30 ? '<span class="tag warn">Próxima</span>' : '<span class="tag">Pendiente</span>')}
    </div>`;

  const fechasHTML = fechasEquipo.length
    ? fechasEquipo.map((f) => `<div class="dash-fila">
        <span class="dash-ico">${f.tipo === 'cumple' ? '🎂' : '⭐'}</span>
        <div class="dash-fila-info"><div>${esc(f.nombre)}</div><small>${f.tipo === 'cumple' ? 'Cumpleaños' : `${f.anos} año${f.anos === 1 ? '' : 's'} en la empresa`} · ${f.fecha.getDate()} de ${MESES[f.fecha.getMonth()]}</small></div>
        <span class="dash-cuando">${textoDias(f.dias)}</span>
      </div>`).join('')
    : '<div class="dash-vacio">Sin fechas especiales en los próximos 45 días.</div>';

  const vacHTML = listaVac.length
    ? listaVac.slice(0, 5).map((v) => `<div class="dash-fila">
        <div class="dash-fila-info"><div>${esc(v.nombre)}</div></div>
        <span class="tag warn">${v.dias} día${v.dias === 1 ? '' : 's'}</span>
      </div>`).join('')
    : '<div class="dash-vacio">Nadie tiene vacaciones pendientes.</div>';

  const deptoHTML = deptos.map(([nombre, n]) => `<div class="dash-depto">
      <div class="dash-depto-top"><span>${esc(nombre)}</span><b>${n}</b></div>
      <div class="dash-depto-barra"><i style="width:${(n / maxDepto) * 100}%;"></i></div>
    </div>`).join('') || '<div class="dash-vacio">Sin empleados activos.</div>';

  root.innerHTML = `
  <div class="dash-saludo">
    <div>
      <h2>${esc(saludo())}</h2>
      <div class="dash-sub">${new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        · ${alertas.length ? `<b>${alertas.length}</b> alerta${alertas.length === 1 ? '' : 's'}${nAlta ? ` (${nAlta} importante${nAlta === 1 ? '' : 's'})` : ''}` : 'sin alertas'}</div>
    </div>
    <div class="dash-nube">${nubeTxt}</div>
  </div>

  <div class="dash-kpis">
    <div class="dash-kpi">
      <div class="dash-kpi-t">Empleados activos</div>
      <div class="dash-kpi-v">${activos.length}</div>
      <div class="dash-kpi-s">${deptos.length} departamento${deptos.length === 1 ? '' : 's'}</div>
    </div>
    ${verNomina ? `<div class="dash-kpi">
      <div class="dash-kpi-t">Costo mensual estimado</div>
      <div class="dash-kpi-v">${usd(costoUSD)}</div>
      <div class="dash-kpi-s">${fmt(sueldosBs)} sueldos + ${fmt(bonosBs)} bono</div>
    </div>
    <div class="dash-kpi ${proximo && !proximo.hecha && proximo.dias < 0 ? 'alerta' : ''}">
      <div class="dash-kpi-t">Próximo pago</div>
      <div class="dash-kpi-v">${proximo ? fmtDate(proximo.fecha) : '—'}</div>
      <div class="dash-kpi-s">${proximo ? `${esc(proximo.corta)} · ${textoDias(proximo.dias)}` : 'Sin pagos programados'}</div>
    </div>` : ''}
    <div class="dash-kpi">
      <div class="dash-kpi-t">Vacaciones pendientes</div>
      <div class="dash-kpi-v">${empVacPend}</div>
      <div class="dash-kpi-s">${diasVacPend} día${diasVacPend === 1 ? '' : 's'} por disfrutar</div>
    </div>
    ${paralelaMes !== null ? `<div class="dash-kpi">
      <div class="dash-kpi-t">Paralela este mes</div>
      <div class="dash-kpi-v">${usd(paralelaMes)}</div>
      <div class="dash-kpi-s">Bonos de la nómina paralela</div>
    </div>` : ''}
  </div>

  <div class="dash-cols">
    <div class="card dash-card">
      <div class="dash-card-h"><h3>Requiere atención</h3>
        <span class="dash-chips">${nAlta ? `<span class="tag err">${nAlta} importante${nAlta === 1 ? '' : 's'}</span>` : ''}${nMedia ? `<span class="tag warn">${nMedia} pendiente${nMedia === 1 ? '' : 's'}</span>` : ''}</span>
      </div>
      <div class="dash-alertas">${alertasHTML}</div>
    </div>
    ${verNomina ? `<div class="card dash-card">
      <div class="dash-card-h"><h3>Calendario de pagos</h3></div>
      <div class="dash-pagos">${pagosHTML}</div>
      ${utilidadesHTML}
      <div class="dash-nota">Se paga el 15 y fin de mes; si cae fin de semana o feriado, el día hábil anterior.${ultima ? ` Última nómina guardada: <b>${fmtDate(ultima.fecha)}</b>.` : ''}</div>
    </div>` : ''}
  </div>

  <div class="dash-cols">
    ${verNomina ? `<div class="card dash-card">
      <div class="dash-card-h"><h3>Costo de nómina, últimos 6 meses</h3><small>en dólares</small></div>
      ${graficoCostoHTML(meses)}
    </div>` : ''}
    <div class="card dash-card">
      <div class="dash-card-h"><h3>El equipo</h3></div>
      <div class="dash-deptos">${deptoHTML}</div>
    </div>
  </div>

  <div class="dash-cols">
    <div class="card dash-card">
      <div class="dash-card-h"><h3>Próximas fechas</h3><small>cumpleaños y aniversarios</small></div>
      ${fechasHTML}
    </div>
    <div class="card dash-card">
      <div class="dash-card-h"><h3>Vacaciones por disfrutar</h3><small>quienes más acumulan</small></div>
      ${vacHTML}
    </div>
  </div>`;

  root.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => ir(b.dataset.ir)));
}
