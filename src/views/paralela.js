// Nómina paralela: bonos que la dirección establece y paga aparte. Es una
// sección privada (solo la ven los tipos de usuario con ese módulo; por
// defecto, solo el master) e independiente de la nómina normal: sus
// pagos viven solo en state.PARALELA (almacenamiento local de este equipo),
// jamás tocan PERIODOS / BONO_*_PAGADO, y por eso no afectan DPP, parafiscales,
// ISLR, informes ni notificaciones. Tampoco se sincronizan ni entran al
// Historial de modificaciones.
import { state, persistAll, empresaConRif, tasaEnFecha, syncConfigured } from '../state/store.js';
import { descifrarParalela } from '../lib/paralelaCrypto.js';
import { logoHeaderHTML } from '../lib/logo.js';
import { fmtDate, fmtNum, todayStr, uid } from '../lib/formato.js';
import { confirmDialog } from '../components/confirm.js';
import { toast } from '../components/toast.js';
import { informeConAcciones, construirInformePagosMensualesUSD } from '../lib/informes.js';
import { nominaBancoCSV } from '../lib/bancoCsv.js';
import { estadoDe } from './empleados.js';
import { puedeVer } from '../lib/auth.js';

const MODULOS = [
  { id: 'empleados', label: 'Empleados' },
  { id: 'nuevo', label: 'Correr nómina' },
  { id: 'historial', label: 'Historial' },
  { id: 'informes', label: 'Informes' },
  { id: 'respaldo', label: 'Sincronización y respaldo' }
];
let MODULO_ACTIVO = 'empleados';
let MES_FILTRO = '';

const esc = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bs = (n) => 'Bs. ' + fmtNum(n, 2);

/* ---------- Datos ---------- */
function paralela() {
  if (!state.PARALELA) state.PARALELA = { pinHash: '', salt: '', pagos: [] };
  if (!Array.isArray(state.PARALELA.pagos)) state.PARALELA.pagos = [];
  // Bono fijo de cada trabajador: { [empId]: { moneda: 'VES'|'USD', q1, q2 } }
  if (!state.PARALELA.bonos) state.PARALELA.bonos = {};
  // Personas que cobran en la nómina paralela sin ser trabajadores de la
  // nómina normal (vigilante, community manager…): { id, nombre, cedula, cargo, telefono, correo, activo }
  if (!Array.isArray(state.PARALELA.personas)) state.PARALELA.personas = [];
  return state.PARALELA;
}

/* ---------- Vista ---------- */
export function render(root, rerender) {
  paralela();
  if (!puedeVer('paralela')) {
    root.innerHTML = '<div class="card"><h2>Sin acceso</h2><div class="desc">Su tipo de usuario no tiene acceso a la nómina paralela.</div></div>';
    return;
  }
  if (MODULO_ACTIVO === 'seguridad') MODULO_ACTIVO = 'respaldo';

  const pills = MODULOS.map((m) => `<button data-modulo="${m.id}" class="${MODULO_ACTIVO === m.id ? 'active' : ''}">${m.label}</button>`).join('');
  root.innerHTML = `
  <div class="pill-toggle" id="parPills" style="margin-bottom:18px;">${pills}</div>
  <div id="parArea">${MODULO_ACTIVO === 'empleados' ? empleadosHTML() : MODULO_ACTIVO === 'nuevo' ? nuevoHTML() : MODULO_ACTIVO === 'historial' ? historialHTML() : MODULO_ACTIVO === 'informes' ? informesHTML() : respaldoHTML()}</div>`;

  root.querySelectorAll('#parPills button').forEach((b) => b.addEventListener('click', () => {
    MODULO_ACTIVO = b.dataset.modulo;
    render(root, rerender);
  }));

  if (MODULO_ACTIVO === 'empleados') wireEmpleados(root, rerender);
  else if (MODULO_ACTIVO === 'nuevo') wireNuevo(root, rerender);
  else if (MODULO_ACTIVO === 'historial') wireHistorial(root, rerender);
  else if (MODULO_ACTIVO === 'informes') wireInformes(root);
  else wireRespaldo(root, rerender);
}

/* ---------- Empleados: bono fijo por quincena ---------- */
// Trabajadores activos de la nómina + personas externas de la paralela.
function empleadosPagables() {
  const P = paralela();
  const externos = P.personas.filter((x) => x.activo !== false).map((x) => Object.assign({ externo: true }, x));
  return [...state.EMPLEADOS.filter((e) => estadoDe(e) === 'activo'), ...externos];
}
function buscarPersona(id) {
  return state.EMPLEADOS.find((e) => e.id === id) || paralela().personas.find((x) => x.id === id) || null;
}
let PERSONA_EDITANDO = null; // id, 'nueva' o null

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function mesTexto(mes) { return `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`; }
function ultimoDiaMes(mes) {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  return `${mes}-${String(d).padStart(2, '0')}`;
}
const QUINCENAS = {
  q1: { label: '1ª quincena', fecha: (mes) => `${mes}-15` },
  q2: { label: '2ª quincena', fecha: (mes) => ultimoDiaMes(mes) }
};

function empleadosHTML() {
  const P = paralela();
  const filas = empleadosPagables().map((e) => {
    const b = P.bonos[e.id] || {};
    return `<tr data-emp="${e.id}">
      <td>${esc(e.nombre)}${e.externo ? ' <span class="tag warn">fuera de nómina</span>' : ''}<div class="legal" style="font-size:.72rem;color:var(--charcoal-muted);">${esc(e.cargo || '')}</div></td>
      <td><select class="bnMoneda"><option value="VES" ${b.moneda !== 'USD' ? 'selected' : ''}>Bs.</option><option value="USD" ${b.moneda === 'USD' ? 'selected' : ''}>USD</option></select></td>
      <td><input type="number" class="bnQ1" min="0" step="0.01" placeholder="0,00" value="${b.q1 || ''}" style="width:140px;"></td>
      <td><input type="number" class="bnQ2" min="0" step="0.01" placeholder="0,00" value="${b.q2 || ''}" style="width:140px;"></td>
    </tr>`;
  }).join('');
  return `
  <div class="card">
    <h2>Bono por trabajador</h2>
    <div class="desc">Defina aquí cuánto bono tiene cada trabajador en la <b>1ª</b> y en la <b>2ª quincena</b>. Cuando corra la nómina paralela (pestaña "Correr nómina") estos montos aparecen ya cargados, y usted puede ajustarlos antes de registrar el pago. Deje en blanco a quien no recibe bono.</div>
    <div class="field" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:12px;">
      <div><label>Aplicar a todos: 1ª quincena</label><input type="number" id="bnTodosQ1" min="0" step="0.01" style="width:150px;"></div>
      <div><label>2ª quincena</label><input type="number" id="bnTodosQ2" min="0" step="0.01" style="width:150px;"></div>
      <button class="btn secondary" id="btnBnTodos">Aplicar</button>
    </div>
    <table>
      <thead><tr><th>Trabajador</th><th>Moneda</th><th>Bono 1ª quincena</th><th>Bono 2ª quincena</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="4" style="color:var(--charcoal-muted);">No hay trabajadores activos.</td></tr>'}</tbody>
    </table>
    <div class="btn-row" style="margin-top:14px;"><button class="btn" id="btnBnGuardar">Guardar bonos</button></div>
  </div>
  ${personasHTML()}`;
}

function personasHTML() {
  const P = paralela();
  const ed = PERSONA_EDITANDO && PERSONA_EDITANDO !== 'nueva' ? P.personas.find((x) => x.id === PERSONA_EDITANDO) : null;
  const filas = P.personas.map((x) => `<tr>
    <td>${esc(x.nombre)}${x.activo === false ? ' <span class="tag err">Inactivo</span>' : ''}</td>
    <td>${esc(x.cedula || '')}</td><td>${esc(x.cargo || '')}</td><td>${esc(x.numeroCuenta || '')}</td>
    <td><div class="row-actions-inner">
      <button class="btn small ghost" data-per-edit="${x.id}">Editar</button>
      <button class="btn small ghost" data-per-toggle="${x.id}">${x.activo === false ? 'Activar' : 'Desactivar'}</button>
      <button class="btn small danger ghost" data-per-del="${x.id}">Eliminar</button>
    </div></td>
  </tr>`).join('');
  const form = PERSONA_EDITANDO ? `
    <div class="card" style="background:var(--cream);margin-top:14px;">
      <h2 style="font-size:1.05rem;">${ed ? 'Editar persona' : 'Nueva persona'}</h2>
      <div class="grid cols-3">
        <div class="field"><label>Nombre completo</label><input type="text" id="perNombre" value="${esc(ed ? ed.nombre : '')}"></div>
        <div class="field"><label>Cédula</label><input type="text" id="perCedula" value="${esc(ed ? ed.cedula : '')}" placeholder="V-12.345.678"></div>
        <div class="field"><label>Cargo / función</label><input type="text" id="perCargo" value="${esc(ed ? ed.cargo : '')}" placeholder="Vigilante"></div>
        <div class="field"><label>Nº de cuenta / teléfono (pago móvil)</label><input type="text" id="perCuenta" value="${esc(ed ? ed.numeroCuenta : '')}"></div>
        <div class="field"><label>Teléfono</label><input type="text" id="perTelefono" value="${esc(ed ? ed.telefono : '')}"></div>
        <div class="field"><label>Correo (para el banco)</label><input type="text" id="perCorreo" value="${esc(ed ? ed.correo : '')}"></div>
      </div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn" id="btnPerGuardar">Guardar</button>
        <button class="btn ghost" id="btnPerCancelar">Cancelar</button>
      </div>
    </div>` : '';
  return `
  <div class="card">
    <h2>Personas fuera de la nómina</h2>
    <div class="desc">Quienes cobran bonos aquí pero no son trabajadores de la nómina normal (vigilante, community manager…). Solo existen en la nómina paralela: no aparecen en Empleados ni en ningún informe de la nómina normal. Al agregarlas, aparecen en la tabla de bonos de arriba.</div>
    <table>
      <thead><tr><th>Nombre</th><th>Cédula</th><th>Cargo</th><th>Cuenta</th><th></th></tr></thead>
      <tbody>${filas || '<tr><td colspan="5" style="color:var(--charcoal-muted);">Aún no hay personas externas.</td></tr>'}</tbody>
    </table>
    <div class="btn-row" style="margin-top:12px;"><button class="btn secondary" id="btnPerNueva">Agregar persona</button></div>
    ${form}
  </div>`;
}

function wireEmpleados(root, rerender) {
  const filas = () => Array.from(root.querySelectorAll('tr[data-emp]'));
  root.querySelector('#btnBnTodos').addEventListener('click', () => {
    const q1 = root.querySelector('#bnTodosQ1').value;
    const q2 = root.querySelector('#bnTodosQ2').value;
    if (q1 === '' && q2 === '') return toast('Escriba un monto para la 1ª o la 2ª quincena.', 'error');
    filas().forEach((tr) => {
      if (q1 !== '') tr.querySelector('.bnQ1').value = q1;
      if (q2 !== '') tr.querySelector('.bnQ2').value = q2;
    });
  });
  root.querySelector('#btnBnGuardar').addEventListener('click', async () => {
    const P = paralela();
    const bonos = Object.assign({}, P.bonos);
    filas().forEach((tr) => {
      const q1 = Number(tr.querySelector('.bnQ1').value) || 0;
      const q2 = Number(tr.querySelector('.bnQ2').value) || 0;
      const moneda = tr.querySelector('.bnMoneda').value;
      const previo = bonos[tr.dataset.emp];
      const igual = previo && previo.moneda === moneda && Number(previo.q1) === q1 && Number(previo.q2) === q2;
      if (!igual && (previo || q1 > 0 || q2 > 0)) bonos[tr.dataset.emp] = { moneda, q1, q2, mod: new Date().toISOString() };
    });
    P.bonos = bonos;
    await persistAll(); // sin etiqueta: no entra al historial compartido
    toast('Bonos guardados.', 'success');
    rerender();
  });

  /* ---- Personas fuera de la nómina ---- */
  const q = (sel) => root.querySelector(sel);
  q('#btnPerNueva').addEventListener('click', () => { PERSONA_EDITANDO = 'nueva'; rerender(); });
  root.querySelectorAll('[data-per-edit]').forEach((b) => b.addEventListener('click', () => { PERSONA_EDITANDO = b.dataset.perEdit; rerender(); }));
  const cancel = q('#btnPerCancelar');
  if (cancel) cancel.addEventListener('click', () => { PERSONA_EDITANDO = null; rerender(); });
  const guardarP = q('#btnPerGuardar');
  if (guardarP) guardarP.addEventListener('click', async () => {
    const P = paralela();
    const nombre = q('#perNombre').value.trim();
    if (!nombre) return toast('Escriba el nombre de la persona.', 'error');
    const existente = PERSONA_EDITANDO !== 'nueva' ? P.personas.find((x) => x.id === PERSONA_EDITANDO) : null;
    const x = existente || { id: 'ext-' + uid(), activo: true };
    x.nombre = nombre;
    x.cedula = q('#perCedula').value.trim();
    x.cargo = q('#perCargo').value.trim();
    x.numeroCuenta = q('#perCuenta').value.trim();
    x.telefono = q('#perTelefono').value.trim();
    x.correo = q('#perCorreo').value.trim();
    x.mod = new Date().toISOString();
    if (!existente) P.personas.push(x);
    await persistAll();
    PERSONA_EDITANDO = null;
    toast('Persona guardada.', 'success');
    rerender();
  });
  root.querySelectorAll('[data-per-toggle]').forEach((b) => b.addEventListener('click', async () => {
    const x = paralela().personas.find((y) => y.id === b.dataset.perToggle);
    if (!x) return;
    x.activo = x.activo === false;
    x.mod = new Date().toISOString();
    await persistAll();
    rerender();
  }));
  root.querySelectorAll('[data-per-del]').forEach((b) => b.addEventListener('click', async () => {
    const P = paralela();
    const x = P.personas.find((y) => y.id === b.dataset.perDel);
    if (!x) return;
    const ok = await confirmDialog({
      title: 'Eliminar persona',
      message: `Se eliminará a <b>${esc(x.nombre)}</b> de la nómina paralela y su bono fijo. Los pagos ya registrados se conservan.`,
      confirmLabel: 'Eliminar', danger: true
    });
    if (!ok) return;
    P.personas = P.personas.filter((y) => y.id !== x.id);
    P.bonos[x.id] = { moneda: 'USD', q1: 0, q2: 0, mod: new Date().toISOString() };
    (P.eliminados = P.eliminados || []).push(x.id);
    await persistAll();
    rerender();
  }));
}

/* ---------- Correr nómina paralela ---------- */
function nuevoHTML() {
  const emps = empleadosPagables();
  const hoy = todayStr();
  const mes = hoy.slice(0, 7);
  const q = Number(hoy.slice(8, 10)) <= 15 ? 'q1' : 'q2';
  const filas = emps.map((e) => `<tr data-emp="${e.id}">
    <td><input type="checkbox" class="parSel" checked></td>
    <td>${esc(e.nombre)}${e.externo ? ' <span class="tag warn">fuera de nómina</span>' : ''}<div class="legal" style="font-size:.72rem;color:var(--charcoal-muted);">${esc(e.cargo || '')}</div></td>
    <td><select class="parMonedaFila"><option value="VES">Bs.</option><option value="USD">USD</option></select></td>
    <td><input type="number" class="parMonto" min="0" step="0.01" placeholder="0,00" style="width:150px;"></td>
  </tr>`).join('');
  return `
  <div class="card">
    <h2>Correr nómina paralela</h2>
    <div class="desc">Elija el mes y la quincena: se cargan los bonos definidos en la pestaña "Empleados". Sin retenciones ni aportes — lo que figure es lo que recibe cada persona. Puede ajustar cualquier monto antes de registrar.</div>
    <div class="grid cols-4">
      <div class="field"><label>Mes</label><input type="month" id="parMes" value="${mes}"></div>
      <div class="field"><label>Período</label>
        <select id="parQuincena"><option value="q1" ${q === 'q1' ? 'selected' : ''}>1ª quincena</option><option value="q2" ${q === 'q2' ? 'selected' : ''}>2ª quincena</option><option value="otro">Otro bono (monto libre)</option></select>
      </div>
      <div class="field"><label>Fecha de pago</label><input type="date" id="parFecha" value="${QUINCENAS[q].fecha(mes)}"></div>
      <div class="field"><label>Tasa BCV (Bs. por USD)</label><input type="number" id="parTasa" min="0" step="0.0001" value="${tasaEnFecha(QUINCENAS[q].fecha(mes)) || ''}"></div>
    </div>
    <div class="grid cols-2" style="margin-top:8px;">
      <div class="field"><label>Concepto</label><input type="text" id="parConcepto"></div>
      <div class="field"><label>Nota (opcional)</label><input type="text" id="parNota" placeholder="Observación que saldrá en el recibo"></div>
    </div>
    <div id="parAviso" class="legal" style="margin-top:10px;font-size:.8rem;"></div>

    <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:16px 0 8px;">
      <div class="field"><label>Mismo monto para todos los marcados</label><input type="number" id="parMontoTodos" min="0" step="0.01" placeholder="0,00" style="width:170px;"></div>
      <button class="btn secondary" id="btnAplicarTodos">Aplicar</button>
      <label style="font-size:.8rem;display:flex;gap:6px;align-items:center;"><input type="checkbox" id="parSelTodos" checked> Marcar / desmarcar todos</label>
    </div>

    <table>
      <thead><tr><th style="width:44px;"></th><th>Trabajador</th><th>Moneda</th><th>Monto</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="4" style="color:var(--charcoal-muted);">No hay trabajadores activos.</td></tr>'}</tbody>
    </table>
    <div id="parTotal" style="margin:12px 0;font-weight:700;"></div>
    <div class="btn-row"><button class="btn" id="btnGuardarPago">Registrar pago</button></div>
  </div>`;
}

function wireNuevo(root, rerender) {
  const q = (s) => root.querySelector(s);
  const filas = () => Array.from(root.querySelectorAll('tr[data-emp]'));
  const tasa = () => Number(q('#parTasa').value) || 0;

  const recalcular = () => {
    let totalBs = 0; let n = 0;
    filas().forEach((tr) => {
      if (!tr.querySelector('.parSel').checked) return;
      const m = Number(tr.querySelector('.parMonto').value) || 0;
      if (m <= 0) return;
      n += 1;
      totalBs += tr.querySelector('.parMonedaFila').value === 'USD' ? m * tasa() : m;
    });
    q('#parTotal').textContent = `${n} trabajador${n === 1 ? '' : 'es'} · Total: ${bs(totalBs)}`;
  };

  // Carga concepto, fecha, tasa y montos según el mes y la quincena elegidos.
  const cargarPeriodo = () => {
    const mes = q('#parMes').value;
    const per = q('#parQuincena').value;
    if (!mes) return;
    if (per !== 'otro') {
      q('#parFecha').value = QUINCENAS[per].fecha(mes);
      q('#parConcepto').value = `Bono ${QUINCENAS[per].label} de ${mesTexto(mes)}`;
    } else {
      q('#parConcepto').value = '';
    }
    const t = tasaEnFecha(q('#parFecha').value);
    if (t) q('#parTasa').value = t;
    const P = paralela();
    filas().forEach((tr) => {
      const b = P.bonos[tr.dataset.emp];
      if (per === 'otro') {
        tr.querySelector('.parMonto').value = '';
        tr.querySelector('.parSel').checked = true;
        return;
      }
      const monto = b ? Number(b[per]) || 0 : 0;
      tr.querySelector('.parMonto').value = monto > 0 ? monto : '';
      tr.querySelector('.parMonedaFila').value = b && b.moneda === 'USD' ? 'USD' : 'VES';
      tr.querySelector('.parSel').checked = monto > 0;
    });
    const previo = per === 'otro' ? null : P.pagos.find((p) => p.periodo && p.periodo.mes === mes && p.periodo.quincena === per);
    q('#parAviso').innerHTML = previo
      ? `<span class="tag warn">Ya hay un pago registrado de este período (N° ${previo.numero}, ${fmtDate(previo.fecha)}).</span>`
      : '';
    recalcular();
  };

  q('#parMes').addEventListener('change', cargarPeriodo);
  q('#parQuincena').addEventListener('change', cargarPeriodo);
  q('#parFecha').addEventListener('change', () => {
    const t = tasaEnFecha(q('#parFecha').value);
    if (t) q('#parTasa').value = t;
    recalcular();
  });
  q('#parTasa').addEventListener('input', recalcular);
  root.querySelectorAll('.parMonto, .parSel, .parMonedaFila').forEach((el) => el.addEventListener('input', recalcular));
  q('#parSelTodos').addEventListener('change', (e) => {
    filas().forEach((tr) => { tr.querySelector('.parSel').checked = e.target.checked; });
    recalcular();
  });
  q('#btnAplicarTodos').addEventListener('click', () => {
    const m = q('#parMontoTodos').value;
    if (!(Number(m) > 0)) return toast('Escriba un monto mayor a cero.', 'error');
    filas().forEach((tr) => { if (tr.querySelector('.parSel').checked) tr.querySelector('.parMonto').value = m; });
    recalcular();
  });

  q('#btnGuardarPago').addEventListener('click', async () => {
    const fecha = q('#parFecha').value;
    const concepto = q('#parConcepto').value.trim();
    const mes = q('#parMes').value;
    const per = q('#parQuincena').value;
    const t = tasa();
    if (!fecha) return toast('Indique la fecha de pago.', 'error');
    if (!concepto) return toast('Indique el concepto del bono.', 'error');
    const items = [];
    let hayUSD = false;
    filas().forEach((tr) => {
      if (!tr.querySelector('.parSel').checked) return;
      const monto = Number(tr.querySelector('.parMonto').value) || 0;
      if (monto <= 0) return;
      const moneda = tr.querySelector('.parMonedaFila').value;
      if (moneda === 'USD') hayUSD = true;
      items.push({ empId: tr.dataset.emp, monto, moneda, montoBs: Math.round(monto * (moneda === 'USD' ? t : 1) * 100) / 100 });
    });
    if (hayUSD && !(t > 0)) return toast('Indique la tasa BCV para convertir los dólares.', 'error');
    if (!items.length) return toast('Ningún trabajador tiene un monto mayor a cero.', 'error');

    const P = paralela();
    const previo = per === 'otro' ? null : P.pagos.find((p) => p.periodo && p.periodo.mes === mes && p.periodo.quincena === per);
    const totalBs = items.reduce((a, i) => a + i.montoBs, 0);
    const ok = await confirmDialog({
      title: 'Registrar pago',
      message: `${esc(concepto)}: ${items.length} trabajador(es), total ${bs(totalBs)}, fecha ${fmtDate(fecha)}.`
        + (previo ? `<br><br><b>Atención:</b> ya registró un pago de este mismo período (N° ${previo.numero}). ¿Registrar otro igualmente?` : ''),
      confirmLabel: 'Registrar'
    });
    if (!ok) return;

    const correlativo = P.pagos.length ? Math.max(...P.pagos.map((p) => p.numero || 0)) + 1 : 1;
    P.pagos.push({
      id: uid(), numero: correlativo, fecha, concepto, tasa: t,
      periodo: per === 'otro' ? null : { mes, quincena: per },
      nota: q('#parNota').value.trim(), items,
      // Copia del nombre/cédula: el recibo no cambia si luego se edita la ficha.
      nombres: Object.fromEntries(items.map((i) => {
        const e = buscarPersona(i.empId) || {};
        return [i.empId, { nombre: e.nombre || '—', cedula: e.cedula || '', cargo: e.cargo || '', telefono: e.telefono || '', correo: e.correo || '', numeroCuenta: e.numeroCuenta || '' }];
      }))
    });
    await persistAll(); // sin etiqueta: no entra al historial compartido
    toast('Pago registrado en la nómina paralela.', 'success');
    MODULO_ACTIVO = 'historial';
    rerender();
  });

  cargarPeriodo();
}

/* ---------- Historial ---------- */
const monedaDe = (p, i) => i.moneda || p.moneda || 'VES';
const hayUSD = (p) => p.items.some((i) => monedaDe(p, i) === 'USD');
function totalPago(p) { return p.items.reduce((a, i) => a + i.montoBs, 0); }

function historialHTML() {
  const P = paralela();
  const meses = Array.from(new Set(P.pagos.map((p) => p.fecha.slice(0, 7)))).sort().reverse();
  const pagos = P.pagos
    .filter((p) => !MES_FILTRO || p.fecha.slice(0, 7) === MES_FILTRO)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero);
  const total = pagos.reduce((a, p) => a + totalPago(p), 0);

  const filas = pagos.map((p) => `<tr>
    <td>${p.numero}</td>
    <td>${fmtDate(p.fecha)}</td>
    <td>${esc(p.concepto)}${p.nota ? `<div class="legal" style="font-size:.72rem;color:var(--charcoal-muted);">${esc(p.nota)}</div>` : ''}</td>
    <td>${p.items.length}</td>
    <td>${bs(totalPago(p))}${hayUSD(p) ? `<div class="legal" style="font-size:.72rem;color:var(--charcoal-muted);">incluye USD a ${fmtNum(p.tasa, 4)} Bs./USD</div>` : ''}</td>
    <td><div class="row-actions-inner">
      <button class="btn small ghost" data-act="resumen" data-id="${p.id}">Resumen</button>
      <button class="btn small ghost" data-act="recibos" data-id="${p.id}">Recibos</button>
      <button class="btn small ghost" data-act="csv" data-id="${p.id}" title="Transferencia a la cuenta de cada persona (con Nº de cuenta)">CSV banco</button>
      <button class="btn small danger ghost" data-act="eliminar" data-id="${p.id}">Eliminar</button>
    </div></td>
  </tr>`).join('');

  return `
  <div class="card">
    <h2>Pagos registrados</h2>
    <div class="desc">Historial de la nómina paralela. Nada de lo que aparece aquí se mezcla con la nómina normal.</div>
    <div class="field" style="max-width:240px;margin-bottom:12px;"><label>Mes</label>
      <select id="parMesFiltro"><option value="">Todos</option>${meses.map((m) => `<option value="${m}" ${m === MES_FILTRO ? 'selected' : ''}>${m}</option>`).join('')}</select>
    </div>
    <table>
      <thead><tr><th>N°</th><th>Fecha</th><th>Concepto</th><th>Pers.</th><th>Total</th><th></th></tr></thead>
      <tbody>${filas || '<tr><td colspan="6" style="color:var(--charcoal-muted);">Aún no hay pagos registrados.</td></tr>'}</tbody>
    </table>
    ${pagos.length ? `<div style="margin-top:10px;font-weight:700;">Total del filtro: ${bs(total)}</div>` : ''}
    <div id="parVista" style="margin-top:18px;"></div>
  </div>`;
}

function filasDePago(p) {
  return p.items.map((i) => {
    const d = (p.nombres && p.nombres[i.empId]) || {};
    // Primero la ficha viva (por si cambió el teléfono/correo); si ya no existe, la copia del pago.
    const emp = buscarPersona(i.empId);
    return { emp: emp || { nombre: d.nombre, cedula: d.cedula, cargo: d.cargo, telefono: d.telefono, correo: d.correo, numeroCuenta: d.numeroCuenta }, d, item: i, r: { monto: i.montoBs } };
  });
}

function encabezadoDoc(titulo, p) {
  return `${logoHeaderHTML()}
    <h2 style="margin:0 0 2px;font-size:1.25rem;">${titulo}</h2>
    <div class="desc" style="margin-bottom:8px;">${esc(empresaConRif())} · Pago N° ${p.numero} · ${esc(p.concepto)} · ${fmtDate(p.fecha)}</div>`;
}

function resumenHTML(p) {
  const filas = filasDePago(p).map(({ emp, item }) => `<tr>
    <td>${esc(emp.nombre)}</td><td>${esc(emp.cedula || '')}</td>
    ${hayUSD(p) ? `<td>${monedaDe(p, item) === 'USD' ? '$' + fmtNum(item.monto, 2) : '—'}</td>` : ''}
    <td style="text-align:right;"><b>${bs(item.montoBs)}</b></td></tr>`).join('');
  return `${encabezadoDoc('Resumen de pago — nómina paralela', p)}
    ${p.nota ? `<div class="legal" style="margin-bottom:8px;">${esc(p.nota)}</div>` : ''}
    <table><thead><tr><th>Trabajador</th><th>Cédula</th>${hayUSD(p) ? '<th>USD</th>' : ''}<th style="text-align:right;">Monto</th></tr></thead>
    <tbody>${filas}
      <tr><td colspan="${hayUSD(p) ? 3 : 2}"><b>Total (${p.items.length})</b></td><td style="text-align:right;"><b>${bs(totalPago(p))}</b></td></tr>
    </tbody></table>
    ${hayUSD(p) ? `<div class="legal" style="margin-top:6px;">Montos en USD convertidos a la tasa BCV de ${fmtNum(p.tasa, 4)} Bs./USD.</div>` : ''}`;
}

function recibosHTML(p) {
  return filasDePago(p).map(({ emp, item }, i) => `
    <div style="${i === 0 ? '' : 'page-break-before:always;break-before:page;'}padding-top:1px;">
      <div class="recibo-compacto">
        ${encabezadoDoc('Recibo de bono — ' + esc(emp.nombre), p)}
        <div class="legal">Cédula: ${esc(emp.cedula || '—')} · Cargo: ${esc(emp.cargo || '—')} · Recibo N° ${p.numero}-${i + 1}</div>
        <table style="margin-top:10px;"><tbody>
          <tr><td>${esc(p.concepto)}${monedaDe(p, item) === 'USD' ? ` — $${fmtNum(item.monto, 2)} a ${fmtNum(p.tasa, 4)} Bs./USD` : ''}</td><td style="text-align:right;">${bs(item.montoBs)}</td></tr>
          <tr><td><b>Monto a pagar</b></td><td style="text-align:right;"><b>${bs(item.montoBs)}</b></td></tr>
        </tbody></table>
        ${p.nota ? `<div class="legal" style="margin-top:6px;">${esc(p.nota)}</div>` : ''}
        <table style="width:100%;margin-top:80px;table-layout:fixed;page-break-inside:avoid;break-inside:avoid;"><tr>
          <td style="width:50%;text-align:center;padding:0 20px;"><div style="border-top:1px solid #3F4249;padding-top:6px;font-size:.8rem;">Firma del trabajador</div></td>
          <td style="width:50%;text-align:center;padding:0 20px;"><div style="border-top:1px solid #3F4249;padding-top:6px;font-size:.8rem;">Firma / sello de ${esc(empresaConRif())}</div></td>
        </tr></table>
      </div>
    </div>`).join('');
}

function wireHistorial(root, rerender) {
  const sel = root.querySelector('#parMesFiltro');
  if (sel) sel.addEventListener('change', () => { MES_FILTRO = sel.value; rerender(); });
  const vista = root.querySelector('#parVista');

  root.querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const P = paralela();
    const p = P.pagos.find((x) => x.id === b.dataset.id);
    if (!p) return;
    const act = b.dataset.act;
    if (act === 'resumen' || act === 'recibos') {
      const html = act === 'resumen' ? resumenHTML(p) : recibosHTML(p);
      vista.innerHTML = '';
      vista.appendChild(informeConAcciones({
        contenidoHtml: html,
        filename: `${act === 'resumen' ? 'resumen' : 'recibos'}-pago-paralelo-${p.numero}.pdf`,
        pdfTitle: act === 'resumen' ? 'Resumen de pago' : 'Recibos de bono'
      }));
      vista.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (act === 'csv') {
      const filas = filasDePago(p).map(({ emp, r }) => ({ emp, r }));
      const sinCuenta = filas.filter((f) => !f.emp.numeroCuenta).map((f) => f.emp.nombre);
      if (sinCuenta.length) toast(`Sin Nº de cuenta: ${sinCuenta.join(', ')}. Complételo en su ficha (o en Empleados de la paralela).`, 'error', 8000);
      // Igual que el CSV bancario de la nómina normal: texto plano SIN marca BOM
      // al inicio (el banco lee mal la primera columna con ella).
      const csv = nominaBancoCSV(filas, (f) => f.r.monto);
      const res = await window.api.file.saveAs(csv, `Doctormas_Paralela_${p.periodo ? p.periodo.mes + '_' + p.periodo.quincena : p.fecha}_${p.numero}.csv`, 'CSV', ['csv']);
      if (!res.canceled) toast('CSV guardado: ' + res.filePath, 'success');
    } else if (act === 'eliminar') {
      const ok = await confirmDialog({
        title: 'Eliminar pago',
        message: `Se eliminará el pago N° ${p.numero} (${p.concepto}, ${fmtDate(p.fecha)}, ${bs(totalPago(p))}). No se puede deshacer.`,
        confirmLabel: 'Eliminar', danger: true
      });
      if (!ok) return;
      P.pagos = P.pagos.filter((x) => x.id !== p.id);
      (P.eliminados = P.eliminados || []).push(p.id);
      await persistAll();
      toast('Pago eliminado.', 'success');
      rerender();
    }
  }));
}

/* ---------- Informes (confidenciales) ---------- */
function informesHTML() {
  return `
  <div class="card">
    <h2>Pagos del año mes a mes, en dólares</h2>
    <div class="desc">Todo lo que se pagó en cada mes del año, <b>incluida la nómina paralela</b>: salarial (sueldo) y no salarial (bono de alimentación, bono vacacional, utilidades, liquidaciones y bonos paralelos), con las retenciones, el neto pagado, los aportes patronales y el total por trabajador. Cada pago se convierte a US$ con la tasa BCV de su fecha. Este informe es confidencial: solo se genera desde aquí.</div>
    <div class="grid cols-3">
      <div class="field"><label>Año</label><input type="number" id="parInfAno" value="${new Date().getFullYear()}"></div>
      <div class="field" style="align-self:end;"><button class="btn" id="btnParInfPagos">Generar informe</button></div>
    </div>
    <div id="parInfResultado"></div>
  </div>`;
}

function wireInformes(root) {
  root.querySelector('#btnParInfPagos').addEventListener('click', () => {
    const ano = Number(root.querySelector('#parInfAno').value);
    if (!ano) return toast('Indique el año.', 'error');
    const { contenidoHtml, csvHeaders, csvRows } = construirInformePagosMensualesUSD(ano, true);
    const cont = root.querySelector('#parInfResultado');
    cont.innerHTML = '';
    cont.appendChild(informeConAcciones({ contenidoHtml, filename: `pagos-${ano}-mes-a-mes-usd.pdf`, pdfTitle: `Pagos ${ano} en dólares`, csvHeaders, csvRows }));
  });
}

/* ---------- Respaldo ---------- */
function sincronizacionHTML() {
  const tiene = !!state.PARALELA_CLAVE;
  const aviso = state.PARALELA_ESTADO === 'clave'
    ? '<div class="note" style="background:var(--red-tint);color:var(--red);border-color:transparent;">La clave guardada en este equipo NO abre la nómina paralela que hay en la nube. Escriba la clave correcta.</div>'
    : (state.PARALELA_ESTADO === 'sin-clave'
      ? '<div class="note">Hay una nómina paralela en la nube, pero este equipo aún no tiene la clave para abrirla. Escríbala abajo.</div>'
      : (tiene ? '<div class="note" style="background:var(--green-tint);color:var(--green);border-color:transparent;">✓ Este equipo tiene la clave: la nómina paralela se sincroniza cifrada con la nube.</div>' : ''));
  return `
  <div class="card" style="max-width:640px;">
    <h2>Sincronización cifrada con la nube</h2>
    <div class="desc">Para ver y operar la nómina paralela en el teléfono y en la computadora, se sincroniza <b>cifrada</b>: en la nube solo hay texto ilegible, y solo quien tenga esta clave puede abrirla. Defina una clave (distinta a su clave de usuario) y escríbala igual en cada equipo. <b>Si la pierde, nadie podrá recuperar los datos cifrados de la nube</b> (los de cada equipo siguen ahí).</div>
    ${aviso}
    <div class="grid cols-2" style="margin-top:10px;">
      <div class="field"><label>Clave de la nómina paralela</label><input type="password" id="parClaveSync" autocomplete="new-password" placeholder="${tiene ? 'Ya hay una clave guardada en este equipo' : 'Mínimo 8 caracteres'}"></div>
      <div class="field" style="align-self:end;"><button class="btn" id="btnParClaveSync">${tiene ? 'Cambiar clave de este equipo' : 'Guardar clave y sincronizar'}</button></div>
    </div>
    ${tiene ? '<div class="btn-row" style="margin-top:8px;"><button class="btn ghost small" id="btnParQuitarClave">Quitar la clave de este equipo</button></div>' : ''}
  </div>`;
}

function respaldoHTML() {
  return sincronizacionHTML() + `
  <div class="card" style="max-width:640px;">
    <h2>Respaldo de esta sección</h2>
    <div class="desc">Además de la sincronización cifrada, puede descargar un respaldo de la nómina paralela en un archivo (pagos, personas y bonos) para guardarlo aparte.</div>
    <div class="btn-row">
      <button class="btn secondary" id="btnRespaldoPar">Descargar respaldo</button>
      <button class="btn ghost" id="btnRestaurarPar">Restaurar desde archivo…</button>
      <input type="file" id="fileRestaurarPar" accept=".json,application/json" style="display:none;">
    </div>
  </div>`;
}

function wireRespaldo(root, rerender) {
  const btnClave = root.querySelector('#btnParClaveSync');
  if (btnClave) btnClave.addEventListener('click', async () => {
    const clave = root.querySelector('#parClaveSync').value;
    if (clave.length < 8) return toast('La clave debe tener al menos 8 caracteres.', 'error');
    btnClave.disabled = true;
    try {
      // Si ya hay paralela en la nube, esta clave debe poder abrirla.
      if (syncConfigured()) {
        const res = await fetch(state.SYNC.url.replace(/\/$/, '') + '/api/state', { headers: { 'X-Access-Pin': state.SYNC.pin } });
        if (res.ok) {
          const j = await res.json();
          const blob = j && j.data ? j.data.PARALELA_CIFRADA : null;
          if (blob) {
            try { await descifrarParalela(blob, clave); } catch (e) { btnClave.disabled = false; return toast('Esa clave NO abre la nómina paralela que ya está en la nube. Verifique la clave.', 'error'); }
          }
        }
      }
      state.PARALELA_CLAVE = clave;
      state.PARALELA_ESTADO = '';
      if (syncConfigured()) {
        // Trae y combina lo de la nube, y sube lo local cifrado.
        const { syncPull, syncPush } = await import('../lib/sync.js');
        await syncPull(true);
        await syncPush();
        toast('Clave guardada. Nómina paralela sincronizada (cifrada).', 'success');
      } else {
        await persistAll();
        toast('Clave guardada. Configure la nube en Configuración → Nube para sincronizar.', 'success');
      }
    } catch (err) {
      toast('No se pudo completar: ' + err.message, 'error');
    }
    rerender();
  });
  const btnQuitar = root.querySelector('#btnParQuitarClave');
  if (btnQuitar) btnQuitar.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Quitar la clave', message: 'Este equipo dejará de sincronizar la nómina paralela con la nube (sus datos locales se conservan). Podrá volver a poner la clave cuando quiera.', confirmLabel: 'Quitar' });
    if (!ok) return;
    state.PARALELA_CLAVE = '';
    await persistAll();
    rerender();
  });

  root.querySelector('#btnRespaldoPar').addEventListener('click', async () => {
    const P = paralela();
    const json = JSON.stringify({ tipo: 'nomina-paralela', version: 2, generado: new Date().toISOString(), pagos: P.pagos, personas: P.personas, bonos: P.bonos }, null, 2);
    const res = await window.api.file.saveAs(json, `respaldo-nomina-paralela-${todayStr()}.json`, 'JSON', ['json']);
    if (!res.canceled) toast('Respaldo guardado: ' + res.filePath, 'success');
  });

  const fileInput = root.querySelector('#fileRestaurarPar');
  root.querySelector('#btnRestaurarPar').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.tipo !== 'nomina-paralela' || !Array.isArray(data.pagos)) throw new Error('El archivo no es un respaldo de la nómina paralela.');
      const ok = await confirmDialog({
        title: 'Restaurar respaldo',
        message: `El respaldo trae ${data.pagos.length} pago(s). Se agregarán los que aún no estén registrados aquí.`,
        confirmLabel: 'Restaurar'
      });
      if (!ok) return;
      const P = paralela();
      const ids = new Set(P.pagos.map((p) => p.id));
      let n = 0;
      data.pagos.forEach((p) => { if (p && p.id && !ids.has(p.id) && Array.isArray(p.items)) { P.pagos.push(p); n += 1; } });
      const idsPer = new Set(P.personas.map((x) => x.id));
      (data.personas || []).forEach((x) => { if (x && x.id && !idsPer.has(x.id)) P.personas.push(x); });
      Object.keys(data.bonos || {}).forEach((k) => { if (!P.bonos[k]) P.bonos[k] = data.bonos[k]; });
      await persistAll();
      toast(`${n} pago(s) restaurado(s).`, 'success');
      rerender();
    } catch (err) {
      toast('No se pudo restaurar: ' + err.message, 'error');
    }
  });
}
