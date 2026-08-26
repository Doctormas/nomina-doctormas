import { state, persistAll, empresaConRif } from '../state/store.js';
import { logoHeaderHTML } from '../lib/logo.js';
import { antiguedad, estadoVacaciones, diasVacacionesPorAno, planificarDisfrute } from '../lib/calculos.js';
import { fmtDate, fmtNum, todayStr, uid } from '../lib/formato.js';
import { resultadoConAcciones } from '../components/resultado.js';
import { confirmDialog } from '../components/confirm.js';
import { toast } from '../components/toast.js';
import { construirLibroVacacionesHTML, informeConAcciones } from '../lib/informes.js';

// El bono vacacional se calcula y se paga desde la pestaña Nómina (es otro
// tipo de nómina más) — aquí solo queda el seguimiento del disfrute de
// vacaciones en sí, que es un asunto distinto (días tomados, no pagados).
const MODULOS = [
  { id: 'resumen', label: 'Resumen por empleado' },
  { id: 'individual', label: 'Disfrute individual' },
  { id: 'colectivo', label: 'Disfrute colectivo' },
  { id: 'informes', label: 'Informes' }
];
let MODULO_ACTIVO = 'resumen';

export function render(root, rerender) {
  const pillsHtml = MODULOS.map((m) => `<button data-modulo="${m.id}" class="${MODULO_ACTIVO === m.id ? 'active' : ''}">${m.label}</button>`).join('');

  root.innerHTML = `
  <div class="pill-toggle" id="vacPillToggle" style="margin-bottom:18px;">${pillsHtml}</div>
  <div id="vacModuloArea">${moduloHTML(MODULO_ACTIVO)}</div>`;

  root.querySelector('#vacPillToggle').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      MODULO_ACTIVO = b.dataset.modulo;
      render(root, rerender);
    });
  });

  wire(root, rerender);
}

function moduloHTML(modulo) {
  if (modulo === 'resumen') return resumenHTML();
  if (modulo === 'individual') return individualHTML();
  if (modulo === 'colectivo') return colectivoHTML();
  if (modulo === 'informes') return informesHTML();
  return '';
}

function informesHTML() {
  return `
  <div class="card">
    <h2>Libro de vacaciones</h2>
    <div class="desc">Períodos correspondientes, días de bono y disfrutes de cada empleado a una fecha de corte — el detalle completo para respaldar cualquier revisión.</div>
    <div class="grid cols-3">
      <div class="field"><label>Corte al</label><input type="date" id="vacInfHasta" value="${todayStr()}"></div>
      <div class="field" style="align-self:end;"><button class="btn" id="btnGenerarInfVac">Generar informe</button></div>
    </div>
    <div id="vacInfResultado"></div>
  </div>`;
}

function opcionesEmpleados() {
  return state.EMPLEADOS.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join('');
}

function resumenHTML() {
  const opciones = opcionesEmpleados();
  return `
  <div class="card">
    <h2>Vacaciones por empleado</h2>
    <div class="desc">Días correspondientes según antigüedad (Art. 190 y 192 LOTTT: 15 días hábiles + 1 día adicional por cada año, hasta un máximo de 15 adicionales).</div>
    <div class="field" style="max-width:360px;"><label>Empleado</label><select id="vacEmp">${opciones || '<option value="">— registre empleados —</option>'}</select></div>
    <div id="vacResultado"></div>
    <div class="legal" style="margin-top:10px;">¿Vas a pagar el bono vacacional? Eso se hace desde la pestaña <b>Nómina</b> — es otro tipo de nómina más.</div>
  </div>`;
}

function individualHTML() {
  const opciones = opcionesEmpleados();
  const historialDisfrute = state.VAC_DISFRUTE.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 20).map((v) => {
    const emp = state.EMPLEADOS.find((e) => e.id === v.empId);
    return `<tr><td>${emp ? emp.nombre : '—'}</td><td>Año ${v.anoServicio}</td><td>${v.dias}</td><td>${fmtDate(v.fecha)}</td>
      <td class="row-actions"><button class="btn ghost small" data-descargar-vacdisf="${v.id}">PDF</button><button class="btn danger ghost small" data-eliminar-vacdisf="${v.id}">Quitar</button></td></tr>`;
  }).join('');
  const historialPermisos = state.PERMISOS_REMUNERADOS.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 20).map((p) => {
    const emp = state.EMPLEADOS.find((e) => e.id === p.empId);
    return `<tr><td>${emp ? emp.nombre : '—'}</td><td>${p.dias}</td><td>${fmtDate(p.fecha)}</td>
      <td class="row-actions"><button class="btn ghost small" data-descargar-permiso="${p.id}">PDF</button><button class="btn danger ghost small" data-eliminar-permiso="${p.id}">Quitar</button></td></tr>`;
  }).join('');

  return `
  <div class="card">
    <h2>Registrar disfrute de vacaciones</h2>
    <div class="desc">Metes el total de días que se toma el empleado — la app los reparte sola entre los años de servicio vencidos que tenga pendientes, del más viejo al más nuevo, y crea un registro por cada año que toque. Si no le quedan años vencidos pendientes, el resto se asigna como adelanto al año en curso (con aviso). Si el empleado todavía no cumple su primer año de servicio, no tiene derecho legal a vacaciones (Art. 190 LOTTT) — esos días se registran aparte como <b>permiso remunerado</b> y no descuentan de ningún año futuro.</div>
    <div class="grid cols-3">
      <div class="field"><label>Empleado</label><select id="vacDisfEmp">${opciones}</select></div>
      <div class="field"><label>Total de días a disfrutar</label><input type="number" id="vacDisfDias" value="15"></div>
      <div class="field"><label>Fecha de inicio del disfrute</label><input type="date" id="vacDisfFecha" value="${todayStr()}"></div>
    </div>
    <button class="btn" id="btnRegistrarVac" style="margin-top:10px;">Calcular</button>
    <div id="vacDisfResultado"></div>
  </div>
  <div class="card">
    <h2>Historial de disfrute de vacaciones</h2>
    <div class="desc">Últimos registros, individuales o de una tanda colectiva.</div>
    <div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Año de servicio</th><th>Días</th><th>Fecha de inicio</th><th></th></tr></thead>
    <tbody>${historialDisfrute || '<tr class="empty-row"><td colspan="5">Sin disfrutes registrados aún.</td></tr>'}</tbody></table></div>
  </div>
  <div class="card">
    <h2>Historial de permisos remunerados</h2>
    <div class="desc">Días pagados a empleados que aún no cumplían su primer año de servicio — no cuentan como vacaciones ni descuentan de ningún año.</div>
    <div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Días</th><th>Fecha de inicio</th><th></th></tr></thead>
    <tbody>${historialPermisos || '<tr class="empty-row"><td colspan="4">Sin permisos registrados aún.</td></tr>'}</tbody></table></div>
  </div>`;
}

function colectivoHTML() {
  return `
  <div class="card">
    <h2>Vacaciones colectivas</h2>
    <div class="desc">Para cuando Doctormás cierra por un período y todo el personal (o un grupo) sale de vacaciones a la vez. Elija la fecha de inicio, cargue la tabla y ajuste los días por persona si hace falta antes de registrar. A quien todavía no cumpla su primer año de servicio se le registra como permiso remunerado en vez de vacaciones (no tiene derecho legal aún — Art. 190 LOTTT).</div>
    <div class="grid cols-3">
      <div class="field"><label>Fecha de inicio del disfrute colectivo</label><input type="date" id="vacColFecha" value="${todayStr()}"></div>
      <div class="field" style="align-self:end;"><button class="btn secondary" id="btnCargarVacColectivas">Cargar empleados</button></div>
    </div>
    <div id="vacColectivasResultado"></div>
  </div>`;
}

function comprobante(titulo, filas) {
  return `<div>
    ${logoHeaderHTML()}
    <h3 style="font-size:1rem;margin-top:0;">${titulo}</h3>
    <table style="margin-top:8px;"><tbody>${filas.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>
    <table style="width:100%;margin-top:60px;table-layout:fixed;page-break-inside:avoid;break-inside:avoid;">
      <tr>
        <td style="width:50%;text-align:center;padding:0 20px;">
          <div style="border-top:1px solid #3F4249;padding-top:6px;font-size:.8rem;">Firma del trabajador</div>
        </td>
        <td style="width:50%;text-align:center;padding:0 20px;">
          <div style="border-top:1px solid #3F4249;padding-top:6px;font-size:.8rem;">Firma del aprobador</div>
        </td>
      </tr>
    </table>
  </div>`;
}

function wire(root, rerender) {
  const vacEmpSel = root.querySelector('#vacEmp');
  function renderVacResultado() {
    const empId = vacEmpSel.value;
    const emp = state.EMPLEADOS.find((e) => e.id === empId);
    const cont = root.querySelector('#vacResultado');
    if (!emp || !cont) { if (cont) cont.innerHTML = ''; return; }
    const v = estadoVacaciones(emp);
    const rows = v.periodosDerecho.map((p) => `<tr>
      <td>Año ${p.anoServicio}</td><td>${fmtDate(p.fechaCumple)}</td><td>${p.diasCorresponden}</td><td>${p.diasBono}</td>
      <td>${p.diasDisfrutados}</td><td>${p.diasPendientes > 0 ? '<span class="tag warn">' + p.diasPendientes + ' pendientes</span>' : '<span class="tag ok">Al día</span>'}</td>
    </tr>`).join('');
    cont.innerHTML = `
      <div class="table-wrap" style="margin-top:12px;">
      <table>
        <thead><tr><th>Período</th><th>Se cumple el</th><th>Días vacaciones</th><th>Días bono vac.</th><th>Disfrutados</th><th>Estado</th></tr></thead>
        <tbody>${rows || '<tr class="empty-row"><td colspan="6">Aún no completa su primer año de servicio.</td></tr>'}</tbody>
      </table>
      </div>
      <div class="totals">
        <div class="item"><div class="lbl">Días pendientes acumulados</div><div class="val">${v.pendientesTotal}</div></div>
        <div class="item"><div class="lbl">Fracción año en curso (vac.)</div><div class="val">${fmtNum(v.fraccionVac, 1)}</div></div>
        <div class="item"><div class="lbl">Fracción año en curso (bono)</div><div class="val">${fmtNum(v.fraccionBono, 1)}</div></div>
      </div>`;
  }
  if (vacEmpSel) { vacEmpSel.addEventListener('change', renderVacResultado); renderVacResultado(); }

  const btnRegistrarVac = root.querySelector('#btnRegistrarVac');
  if (btnRegistrarVac) btnRegistrarVac.addEventListener('click', () => {
    const empId = root.querySelector('#vacDisfEmp').value;
    if (!empId) { toast('Seleccione un empleado.', 'error'); return; }
    const emp = state.EMPLEADOS.find((e) => e.id === empId);
    const diasTotales = Number(root.querySelector('#vacDisfDias').value);
    const fecha = root.querySelector('#vacDisfFecha').value;
    if (!diasTotales) { toast('Ingrese cuántos días se toma.', 'error'); return; }

    // Calcular es solo una vista previa — todavía no se guarda nada. El
    // registro real ocurre al hacer clic en "Confirmar registro" abajo,
    // igual que una corrida de nómina: primero se revisa, después se confirma.
    const { asignaciones, permisoDias, avisos } = planificarDisfrute(emp, diasTotales, fecha);
    const filasReparto = asignaciones.map((a) => [`Año de servicio ${a.anoServicio}`, `${a.dias} días`]);
    if (permisoDias > 0) filasReparto.push(['Permiso remunerado (no descuenta ningún año)', `${permisoDias} días`]);
    const contenidoHtml = comprobante(`${empresaConRif()} — Comprobante de disfrute de vacaciones`, [
      ['Empleado', emp.nombre], ['Fecha de inicio', fmtDate(fecha)], ['Total de días', diasTotales], ...filasReparto
    ]) + (avisos.length ? `<div class="note" style="margin-top:10px;">${avisos.join('<br><br>')}</div>` : '');

    const cont = root.querySelector('#vacDisfResultado');
    cont.innerHTML = '';
    cont.appendChild(resultadoConAcciones({
      contenidoHtml, filename: `vacaciones-${(emp.nombre || 'empleado').replace(/\s+/g, '-')}-${fecha}.pdf`, pdfTitle: 'Comprobante de vacaciones',
      guardarLabel: 'Confirmar registro',
      onGuardar: async () => {
        if (avisos.length) {
          const ok = await confirmDialog({
            title: 'Revisar antes de registrar',
            message: avisos.join('<br><br>') + '<br><br>¿Registrar de todas formas?',
            confirmLabel: 'Registrar igual', danger: false
          });
          if (!ok) return;
        }
        asignaciones.forEach(({ anoServicio, dias }) => {
          state.VAC_DISFRUTE.push({ id: uid(), empId, anoServicio, dias, fecha });
        });
        if (permisoDias > 0) {
          state.PERMISOS_REMUNERADOS.push({ id: uid(), empId, dias: permisoDias, fecha });
        }
        await persistAll();
        toast('Disfrute de vacaciones registrado en el historial.', 'success');
        rerender();
      }
    }));
  });

  const btnCargarVacColectivas = root.querySelector('#btnCargarVacColectivas');
  if (btnCargarVacColectivas) btnCargarVacColectivas.addEventListener('click', () => {
    const fecha = root.querySelector('#vacColFecha').value;
    const activos = state.EMPLEADOS.filter((e) => e.activo !== false && e.fechaIngreso && e.fechaIngreso <= fecha);
    const cont = root.querySelector('#vacColectivasResultado');
    if (!activos.length) {
      cont.innerHTML = '<div class="note" style="margin-top:12px;">No hay empleados activos que ya hubieran ingresado para esta fecha.</div>';
      return;
    }
    const filas = activos.map((emp) => {
      const ant = antiguedad(emp.fechaIngreso, fecha);
      const dias = diasVacacionesPorAno(ant.anoServicioActual);
      return `<tr>
        <td><input type="checkbox" class="vacColChk" data-emp="${emp.id}" checked style="width:auto;"></td>
        <td>${emp.nombre}</td>
        <td>${ant.anos}a ${ant.meses}m</td>
        <td>Año ${ant.anoServicioActual}</td>
        <td><input type="number" class="vacColDias" data-emp="${emp.id}" value="${dias}" min="0" style="max-width:90px;"></td>
      </tr>`;
    }).join('');
    cont.innerHTML = `
      <div class="table-wrap" style="margin-top:14px;">
      <table>
        <thead><tr><th><input type="checkbox" id="vacColTodos" checked style="width:auto;"></th><th>Empleado</th><th>Antigüedad</th><th>Año de servicio que cubre</th><th>Días a registrar</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      </div>
      <button class="btn" id="btnConfirmarVacColectivas" style="margin-top:12px;">Registrar vacaciones colectivas</button>
    `;
    cont.querySelector('#vacColTodos').addEventListener('change', (e) => {
      cont.querySelectorAll('.vacColChk').forEach((c) => { c.checked = e.target.checked; });
    });
    cont.querySelector('#btnConfirmarVacColectivas').addEventListener('click', async () => {
      const candidatos = [];
      const avisos = [];
      cont.querySelectorAll('.vacColChk').forEach((chk) => {
        if (!chk.checked) return;
        const empId = chk.dataset.emp;
        const emp = state.EMPLEADOS.find((e) => e.id === empId);
        if (!emp) return;
        const diasInput = cont.querySelector(`.vacColDias[data-emp="${empId}"]`);
        const dias = Number(diasInput.value);
        if (!dias) return;
        const ant = antiguedad(emp.fechaIngreso, fecha);
        const anoServicio = ant.anoServicioActual;
        if (ant.anos === 0) {
          // Todavía no cumple su primer año: no hay derecho legal a vacaciones
          // (Art. 190 LOTTT) — esto se registra como permiso remunerado, no
          // como un adelanto del año 1 que luego se le descontaría.
          candidatos.push({ emp, esPermiso: true, dias });
          return;
        }
        // Solo se revisa que no excedan los días del año — el "año en curso" es
        // justo lo que esta operación colectiva registra a propósito, así que
        // no tiene sentido avisar que "aún no lo cumple".
        const yaDisfrutado = state.VAC_DISFRUTE.filter((d) => d.empId === empId && d.anoServicio === anoServicio).reduce((a, d) => a + Number(d.dias), 0);
        const diasCorresponden = diasVacacionesPorAno(anoServicio);
        if (yaDisfrutado + dias > diasCorresponden) {
          avisos.push(`${emp.nombre}: el año ${anoServicio} da derecho a ${diasCorresponden} días, y con este registro llevaría ${yaDisfrutado + dias}.`);
        }
        candidatos.push({ emp, anoServicio, dias });
      });

      if (avisos.length) {
        const ok = await confirmDialog({
          title: 'Revisar antes de registrar',
          message: avisos.join('<br>') + '<br><br>¿Registrar de todas formas?',
          confirmLabel: 'Registrar igual', danger: false
        });
        if (!ok) return;
      }

      const registrados = [];
      candidatos.forEach(({ emp, anoServicio, dias, esPermiso }) => {
        if (esPermiso) state.PERMISOS_REMUNERADOS.push({ id: uid(), empId: emp.id, dias, fecha });
        else state.VAC_DISFRUTE.push({ id: uid(), empId: emp.id, anoServicio, dias, fecha });
        registrados.push({ emp, anoServicio, dias, esPermiso });
      });
      await persistAll();
      const filasHtml = registrados.map((r) => `<tr><td>${r.emp.nombre}</td><td>${r.esPermiso ? 'Permiso remunerado' : 'Año ' + r.anoServicio}</td><td>${r.dias}</td></tr>`).join('');
      const contenidoHtml = `
        <div>
          ${logoHeaderHTML()}
          <h3 style="font-size:1rem;margin-top:0;">${empresaConRif()} — Vacaciones colectivas</h3>
          <div class="legal">Fecha de inicio: ${fmtDate(fecha)} · ${registrados.length} empleados</div>
          <table style="margin-top:8px;"><thead><tr><th>Empleado</th><th>Año de servicio</th><th>Días</th></tr></thead>
          <tbody>${filasHtml}</tbody></table>
        </div>`;
      const resCont = root.querySelector('#vacColectivasResultado');
      resCont.innerHTML = '';
      resCont.appendChild(resultadoConAcciones({ contenidoHtml, filename: `vacaciones-colectivas-${fecha}.pdf`, pdfTitle: 'Vacaciones colectivas' }));
      renderVacResultado();
    });
  });

  root.querySelectorAll('[data-descargar-vacdisf]').forEach((b) => {
    b.addEventListener('click', async () => {
      const v = state.VAC_DISFRUTE.find((x) => x.id === b.dataset.descargarVacdisf);
      if (!v) return;
      const emp = state.EMPLEADOS.find((e) => e.id === v.empId);
      if (!emp) { toast('El empleado de este registro ya no existe.', 'error'); return; }
      const html = comprobante(`${empresaConRif()} — Comprobante de disfrute de vacaciones`, [
        ['Empleado', emp.nombre], ['Año de servicio cubierto', 'Año ' + v.anoServicio], ['Días disfrutados', v.dias], ['Fecha de inicio', fmtDate(v.fecha)]
      ]);
      const res = await window.api.pdf.export(html, 'Comprobante de vacaciones', `vacaciones-${emp.nombre.replace(/\s+/g, '-')}-${v.fecha}.pdf`);
      if (!res.canceled) toast('PDF guardado: ' + res.filePath, 'success');
    });
  });
  root.querySelectorAll('[data-eliminar-vacdisf]').forEach((b) => {
    b.addEventListener('click', async () => {
      const v = state.VAC_DISFRUTE.find((x) => x.id === b.dataset.eliminarVacdisf);
      const emp = v && state.EMPLEADOS.find((e) => e.id === v.empId);
      const ok = await confirmDialog({ title: 'Eliminar registro', message: `¿Eliminar este registro de disfrute de vacaciones${emp ? ' de ' + emp.nombre : ''}? Esta acción no se puede deshacer.`, confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      state.VAC_DISFRUTE = state.VAC_DISFRUTE.filter((x) => x.id !== b.dataset.eliminarVacdisf);
      await persistAll();
      rerender();
    });
  });

  root.querySelectorAll('[data-descargar-permiso]').forEach((b) => {
    b.addEventListener('click', async () => {
      const p = state.PERMISOS_REMUNERADOS.find((x) => x.id === b.dataset.descargarPermiso);
      if (!p) return;
      const emp = state.EMPLEADOS.find((e) => e.id === p.empId);
      if (!emp) { toast('El empleado de este registro ya no existe.', 'error'); return; }
      const html = comprobante(`${empresaConRif()} — Comprobante de permiso remunerado`, [
        ['Empleado', emp.nombre], ['Días', p.dias], ['Fecha de inicio', fmtDate(p.fecha)],
        ['Motivo', 'Empleado aún sin cumplir su primer año de servicio — no tiene derecho legal a vacaciones (Art. 190 LOTTT); este permiso no descuenta de ningún año.']
      ]);
      const res = await window.api.pdf.export(html, 'Permiso remunerado', `permiso-remunerado-${emp.nombre.replace(/\s+/g, '-')}-${p.fecha}.pdf`);
      if (!res.canceled) toast('PDF guardado: ' + res.filePath, 'success');
    });
  });
  root.querySelectorAll('[data-eliminar-permiso]').forEach((b) => {
    b.addEventListener('click', async () => {
      const p = state.PERMISOS_REMUNERADOS.find((x) => x.id === b.dataset.eliminarPermiso);
      const emp = p && state.EMPLEADOS.find((e) => e.id === p.empId);
      const ok = await confirmDialog({ title: 'Eliminar registro', message: `¿Eliminar este permiso remunerado${emp ? ' de ' + emp.nombre : ''}? Esta acción no se puede deshacer.`, confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      state.PERMISOS_REMUNERADOS = state.PERMISOS_REMUNERADOS.filter((x) => x.id !== b.dataset.eliminarPermiso);
      await persistAll();
      rerender();
    });
  });

  const btnGenerarInfVac = root.querySelector('#btnGenerarInfVac');
  if (btnGenerarInfVac) btnGenerarInfVac.addEventListener('click', () => {
    const hasta = root.querySelector('#vacInfHasta').value;
    const { contenidoHtml, csvHeaders, csvRows } = construirLibroVacacionesHTML(hasta);
    const cont = root.querySelector('#vacInfResultado');
    cont.innerHTML = '';
    cont.appendChild(informeConAcciones({ contenidoHtml, filename: `libro-vacaciones-${todayStr()}.pdf`, pdfTitle: 'Libro de vacaciones', csvHeaders, csvRows }));
  });
}
