import { state, persistAll } from '../state/store.js';
import { antiguedad, salarioVigente, diasUtilidadesEmp, cestaticketEmp } from '../lib/calculos.js';
import { getTasaActualValor, tasaEnFecha, tipoNominaCfg, empresaConRif } from '../state/store.js';
import { fmt } from '../lib/moneda.js';
import { fmtDate, fmtNum, todayStr, uid } from '../lib/formato.js';
import { confirmDialog } from '../components/confirm.js';
import { toast } from '../components/toast.js';
import { plantillaEmpleadosPayload, mapearFilasBulk, validarRegistroBulk } from '../lib/bulkEmpleados.js';
import { construirListadoEmpleadosHTML, informeConAcciones } from '../lib/informes.js';

const MODULOS = [
  { id: 'listado', label: 'Listado' },
  { id: 'informes', label: 'Informes' }
];
let MODULO_ACTIVO = 'listado';

// Monto y moneda del bono de alimentación TAL COMO SE FIJÓ (sin convertir a
// Bs) — propio del empleado si lo tiene, si no el general de Configuración.
// Misma regla de fallback que cestaticketMonedaEmp()/cestaticketEmp() en
// calculos.js, pero sin pasar por la tasa: para el contrato de trabajo hay
// que mostrar el monto en la moneda pactada, no ya convertido.
// "estado" (activo/inactivo/egresado) es el dato nuevo; para fichas viejas
// que solo tenían el booleano "activo" + el texto suelto "motivoBaja" de una
// liquidación anterior, se deduce aquí — sin tener que migrar los datos.
export function estadoDe(e) {
  return e.estado || (e.activo === false ? (e.motivoBaja ? 'egresado' : 'inactivo') : 'activo');
}

function cestaticketNativoDe(emp) {
  const tienePropio = emp.cestaticket !== undefined && emp.cestaticket !== null && emp.cestaticket !== '';
  return tienePropio
    ? { monto: Number(emp.cestaticket), moneda: emp.cestaticketMoneda || 'VES' }
    : { monto: Number(state.CONFIG.cestaticket || 0), moneda: state.CONFIG.cestaticketMoneda || 'VES' };
}

export function render(root, rerender) {
  const pillsHtml = MODULOS.map((m) => `<button data-modulo="${m.id}" class="${MODULO_ACTIVO === m.id ? 'active' : ''}">${m.label}</button>`).join('');
  root.innerHTML = `
  <div class="pill-toggle" id="empPillToggle" style="margin-bottom:18px;">${pillsHtml}</div>
  <div id="empModuloArea">${MODULO_ACTIVO === 'listado' ? listadoHTML() : informesHTML()}</div>`;

  root.querySelector('#empPillToggle').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      MODULO_ACTIVO = b.dataset.modulo;
      render(root, rerender);
    });
  });

  wire(root, rerender);
}

function listadoHTML() {
  const rows = state.EMPLEADOS.map((e) => {
    const ant = antiguedad(e.fechaIngreso);
    return `<tr>
      <td>${e.nombre}</td>
      <td>${e.cedula || '—'}</td>
      <td>${e.cargo || '—'}${e.departamento ? '<div class="legal">' + e.departamento + '</div>' : ''}</td>
      <td>${fmtDate(e.fechaIngreso)}</td>
      <td>${ant.anos}a ${ant.meses}m</td>
      <td>${fmt(salarioVigente(e, todayStr()))} ${e.monedaSalario === 'USD' ? '<span class="tag warn">fijado en USD</span>' : ''}</td>
      <td>${diasUtilidadesEmp(e)} días${(e.diasUtilidadesAnual !== undefined && e.diasUtilidadesAnual !== null && e.diasUtilidadesAnual !== '') ? ' <span class="tag warn">propio</span>' : ''}</td>
      <td>${fmt(cestaticketEmp(e, todayStr()), todayStr())}${(e.cestaticket !== undefined && e.cestaticket !== null && e.cestaticket !== '') ? ` <span class="tag warn">propio${e.cestaticketMoneda === 'USD' ? ' USD' : ''}</span>` : ''}</td>
      <td>${estadoDe(e) === 'egresado' ? '<span class="tag err">Egresado</span>' : estadoDe(e) === 'inactivo' ? '<span class="tag err">Inactivo</span>' : '<span class="tag ok">Activo</span>'}${e.inscritoIVSS === false ? ' <span class="tag err">No inscrito IVSS</span>' : ''}</td>
      <td class="row-actions">
        <button class="btn ghost small" data-edit-emp="${e.id}">Editar</button>
        <button class="btn danger ghost small" data-del-emp="${e.id}">Eliminar</button>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="card">
    <h2>Empleados</h2>
    <div class="desc">Registro de personal de Doctormás. El historial salarial permite recalcular con precisión prestaciones, vacaciones y utilidades aunque el sueldo haya cambiado varias veces. Cada empleado puede tener sus propios días de utilidades anuales y su propio bono de alimentación; si se dejan vacíos, se usa el valor general de Configuración.</div>
    <div class="btn-row">
      <button class="btn" id="btnNuevoEmp">+ Nuevo empleado</button>
      <button class="btn secondary" id="btnCargaMasiva">⇪ Carga masiva de empleados</button>
    </div>
    <div class="table-wrap" style="margin-top:14px;">
    <table>
      <thead><tr><th>Nombre</th><th>Cédula</th><th>Cargo</th><th>Ingreso</th><th>Antigüedad</th><th>Salario actual</th><th>Utilidades</th><th>Bono de alimentación</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rows || '<tr class="empty-row"><td colspan="10">Aún no hay empleados registrados.</td></tr>'}</tbody>
    </table>
    </div>
  </div>`;
}

function informesHTML() {
  return `
  <div class="card">
    <h2>Listado de personal</h2>
    <div class="desc">Directorio completo de empleados con cargo, antigüedad, salario actual y bono de alimentación, listo para exportar.</div>
    <label class="checkline"><input type="checkbox" id="empInfSoloActivos" checked> Solo empleados activos</label>
    <button class="btn" id="btnGenerarInfEmpleados" style="margin-top:10px;">Generar listado</button>
    <div id="empInformeResultado"></div>
  </div>`;
}

function wire(root, rerender) {
  const btnNuevoEmp = root.querySelector('#btnNuevoEmp');
  if (btnNuevoEmp) btnNuevoEmp.addEventListener('click', () => openEmpModal(null, rerender));
  const btnCargaMasiva = root.querySelector('#btnCargaMasiva');
  if (btnCargaMasiva) btnCargaMasiva.addEventListener('click', () => openBulkModal(rerender));
  root.querySelectorAll('[data-edit-emp]').forEach((b) => {
    b.addEventListener('click', () => openEmpModal(state.EMPLEADOS.find((e) => e.id === b.dataset.editEmp), rerender));
  });
  root.querySelectorAll('[data-del-emp]').forEach((b) => {
    b.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Eliminar empleado',
        message: '¿Eliminar este empleado y todos sus registros asociados de vacaciones/utilidades? Esta acción no se puede deshacer.',
        confirmLabel: 'Eliminar', danger: true
      });
      if (!ok) return;
      const id = b.dataset.delEmp;
      state.EMPLEADOS = state.EMPLEADOS.filter((e) => e.id !== id);
      state.VAC_DISFRUTE = state.VAC_DISFRUTE.filter((v) => v.empId !== id);
      state.PERMISOS_REMUNERADOS = state.PERMISOS_REMUNERADOS.filter((p) => p.empId !== id);
      state.UTILIDADES_PAGADAS = state.UTILIDADES_PAGADAS.filter((u) => u.empId !== id);
      state.BONO_VAC_PAGADO = state.BONO_VAC_PAGADO.filter((x) => x.empId !== id);
      state.PERIODOS = state.PERIODOS.filter((p) => p.empId !== id);
      await persistAll();
      rerender();
    });
  });

  const btnGenerarInfEmpleados = root.querySelector('#btnGenerarInfEmpleados');
  if (btnGenerarInfEmpleados) btnGenerarInfEmpleados.addEventListener('click', () => {
    const soloActivos = root.querySelector('#empInfSoloActivos').checked;
    const { contenidoHtml, csvHeaders, csvRows } = construirListadoEmpleadosHTML(soloActivos);
    const cont = root.querySelector('#empInformeResultado');
    cont.innerHTML = '';
    cont.appendChild(informeConAcciones({ contenidoHtml, filename: `listado-empleados-${todayStr()}.pdf`, pdfTitle: 'Listado de personal', csvHeaders, csvRows }));
  });
}

/* =========================================================
   MODAL: FICHA DE EMPLEADO
   ========================================================= */
let TEMP_HIST = [];
let TEMP_HIST_IVSS = [];

function empleadoFormModal(emp) {
  emp = emp || {
    id: null, nombre: '', cedula: '', cargo: '', fechaIngreso: todayStr(), salarioBase: state.CONFIG.salarioMinimo, monedaSalario: 'VES', activo: true, historial: [],
    fechaNacimiento: '', nacionalidad: 'Venezolana', sexo: '', direccion: '', telefono: '', correo: '',
    departamento: '', tipoContrato: 'indefinido', formaPago: 'transferencia', banco: '', numeroCuenta: '',
    formaPago2: '', banco2: '', numeroCuenta2: '',
    contactoEmergenciaNombre: '', contactoEmergenciaTelefono: '', diasUtilidadesAnual: '', cestaticket: '', cestaticketMoneda: 'VES', islrPorcentaje: '', inscritoIVSS: true, historialIVSS: [],
    estadoCivil: '', contratoDescripcionServicio: '', contratoFechaTermino: '', contratoMotivoDeterminado: 'naturaleza', contratoDescripcionObra: '',
    jornada: 'diurna', horarioDesde: '08:00', horarioHasta: '17:00', diasLaborables: 'lunes a viernes',
    modalidadPrestacion: 'presencial', lugarPrestacion: '', periodicidadPago: 'quincenal',
    beneficiosAdicionales: '', clausulasAdicionales: '',
    estado: 'activo', egreso: null, tieneTarjetaAlimentacion: true
  };
  const estadoActual = estadoDe(emp);
  const egreso = emp.egreso || { fecha: '', motivo: emp.motivoBaja || '', tramites: {} };
  const tramitesDefault = { ivss: { hecho: false, fecha: '' }, faov: { hecho: false, fecha: '' }, inces: { hecho: false, fecha: '' }, rpe: { hecho: false, fecha: '' } };
  const tramites = Object.assign({}, tramitesDefault, egreso.tramites || {});
  // Historial real de lo que se usó en cada corrida de nómina guardada —
  // se arma solo, de state.PERIODOS, no hay que cargarlo a mano. Así se ve
  // cómo fue variando el equivalente en bolívares nómina tras nómina (si el
  // salario está en USD, cada corrida ya lo convirtió con la tasa de su
  // propia fecha). Solo se muestran los tipos que traen deducciones
  // (segunda quincena, mensual) — la primera quincena es un anticipo, no
  // representa el sueldo real del mes.
  const historialPagosBs = emp.id ? state.PERIODOS
    .filter((p) => p.empId === emp.id && tipoNominaCfg(p.tipoPeriodo).incluyeDeducciones !== false)
    .slice()
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .slice(0, 24)
    .map((p) => `<tr><td>${fmtDate(p.fecha)}</td><td>${tipoNominaCfg(p.tipoPeriodo).label}</td><td>${fmt(p.resultado.salarioMensual)}</td></tr>`)
    .join('') : '';
  const histRowsIVSS = (emp.historialIVSS || []).map((h, i) =>
    `<tr><td>${fmtDate(h.fecha)}</td><td>${fmt(h.salarioSemanal)}</td><td><button type="button" class="btn ghost small" data-del-hist-ivss="${i}">Quitar</button></td></tr>`
  ).join('');
  const histRows = (emp.historial || []).map((h, i) => {
    const monedaTxt = h.moneda === 'USD' ? `$${h.monto} @ ${h.tasa}` : '—';
    // El equivalente en Bs. de un cambio en USD NO queda congelado con la
    // tasa del día que se cargó — se recalcula con la tasa de hoy (y así
    // seguirá recalculándose con la tasa de cada nómina futura).
    const equivBs = h.moneda === 'USD' ? Number(h.monto || 0) * tasaEnFecha(todayStr()) : (h.montoBs !== undefined ? h.montoBs : h.salario);
    return `<tr><td>${fmtDate(h.fecha)}</td><td>${h.moneda === 'USD' ? 'USD' : 'Bs.'}</td><td>${monedaTxt}</td><td>${fmt(equivBs)}</td><td><button type="button" class="btn ghost small" data-del-hist="${i}">Quitar</button></td></tr>`;
  }).join('');
  const empTabs = [
    { id: 'personales', label: 'Datos personales' },
    { id: 'laborales', label: 'Datos laborales' },
    { id: 'jornada', label: 'Jornada y lugar' },
    { id: 'remuneracion', label: 'Remuneración' },
    { id: 'bancario', label: 'Bancario' },
    { id: 'parafiscales', label: 'Parafiscales' },
    { id: 'contrato', label: 'Contrato' },
    { id: 'egreso', label: 'Egreso' }
  ];
  const empTabsHtml = empTabs.map((t, i) => `<button type="button" data-emptab="${t.id}" class="${i === 0 ? 'active' : ''}">${t.label}</button>`).join('');
  return `
  <div class="modal-overlay" id="empModalOverlay">
    <div class="modal" style="max-width:820px;">
      <h3>${emp.id ? 'Editar empleado' : 'Nuevo empleado'}</h3>
      <form id="formEmpleado">
        <input type="hidden" name="id" value="${emp.id || ''}">
        <div class="pill-toggle" id="empTabToggle" style="margin-bottom:16px;">${empTabsHtml}</div>

        <div class="emp-tab-panel" data-emptab-panel="personales">
          <div class="grid cols-3">
            <div class="field"><label>Nombre completo</label><input name="nombre" value="${emp.nombre}" required></div>
            <div class="field"><label>Cédula</label><input name="cedula" value="${emp.cedula || ''}"></div>
            <div class="field"><label>Nacionalidad</label><input name="nacionalidad" value="${emp.nacionalidad || 'Venezolana'}"></div>
            <div class="field"><label>Fecha de nacimiento</label><input type="date" name="fechaNacimiento" value="${emp.fechaNacimiento || ''}"></div>
            <div class="field"><label>Sexo</label>
              <select name="sexo"><option value="" ${!emp.sexo ? 'selected' : ''}>—</option><option value="F" ${emp.sexo === 'F' ? 'selected' : ''}>Femenino</option><option value="M" ${emp.sexo === 'M' ? 'selected' : ''}>Masculino</option></select>
            </div>
            <div class="field"><label>Teléfono</label><input name="telefono" value="${emp.telefono || ''}"></div>
            <div class="field"><label>Correo</label><input type="email" name="correo" value="${emp.correo || ''}"></div>
            <div class="field"><label>Estado civil</label>
              <select name="estadoCivil">
                <option value="" ${!emp.estadoCivil ? 'selected' : ''}>— no especificar —</option>
                <option value="soltero(a)" ${emp.estadoCivil === 'soltero(a)' ? 'selected' : ''}>Soltero(a)</option>
                <option value="casado(a)" ${emp.estadoCivil === 'casado(a)' ? 'selected' : ''}>Casado(a)</option>
                <option value="divorciado(a)" ${emp.estadoCivil === 'divorciado(a)' ? 'selected' : ''}>Divorciado(a)</option>
                <option value="viudo(a)" ${emp.estadoCivil === 'viudo(a)' ? 'selected' : ''}>Viudo(a)</option>
                <option value="en unión estable de hecho" ${emp.estadoCivil === 'en unión estable de hecho' ? 'selected' : ''}>En unión estable de hecho</option>
              </select>
            </div>
          </div>
          <div class="field"><label>Dirección</label><input name="direccion" value="${emp.direccion || ''}"></div>
          <h3 style="font-size:1rem;margin-top:16px;">Contacto de emergencia</h3>
          <div class="grid cols-2">
            <div class="field"><label>Nombre</label><input name="contactoEmergenciaNombre" value="${emp.contactoEmergenciaNombre || ''}"></div>
            <div class="field"><label>Teléfono</label><input name="contactoEmergenciaTelefono" value="${emp.contactoEmergenciaTelefono || ''}"></div>
          </div>
        </div>

        <div class="emp-tab-panel" data-emptab-panel="laborales" hidden>
          <div class="grid cols-3">
            <div class="field"><label>Cargo</label><input name="cargo" value="${emp.cargo || ''}"></div>
            <div class="field"><label>Departamento / área</label><input name="departamento" value="${emp.departamento || ''}"></div>
            <div class="field"><label>Tipo de contrato</label>
              <select name="tipoContrato">
                <option value="indefinido" ${emp.tipoContrato === 'indefinido' ? 'selected' : ''}>Tiempo indeterminado</option>
                <option value="determinado" ${emp.tipoContrato === 'determinado' ? 'selected' : ''}>Tiempo determinado</option>
                <option value="obra_determinada" ${emp.tipoContrato === 'obra_determinada' ? 'selected' : ''}>Obra determinada</option>
                <option value="pasantia" ${emp.tipoContrato === 'pasantia' ? 'selected' : ''}>Pasantía</option>
              </select>
            </div>
            <div class="field"><label>Fecha de ingreso</label><input type="date" name="fechaIngreso" value="${emp.fechaIngreso}" required></div>
            <div class="field"><label>Estado</label>
              <select name="estado">
                <option value="activo" ${estadoActual === 'activo' ? 'selected' : ''}>Activo</option>
                <option value="inactivo" ${estadoActual === 'inactivo' ? 'selected' : ''}>Inactivo (suspensión, permiso, etc.)</option>
                <option value="egresado" ${estadoActual === 'egresado' ? 'selected' : ''}>Egresado</option>
              </select>
              ${estadoActual === 'egresado' ? '<div class="legal">Complete los datos de su egreso en la pestaña "Egreso".</div>' : ''}
            </div>
            <div class="field"><label>Días de utilidades anuales (este empleado)</label><input type="number" step="1" name="diasUtilidadesAnual" value="${emp.diasUtilidadesAnual !== undefined && emp.diasUtilidadesAnual !== null ? emp.diasUtilidadesAnual : ''}" placeholder="Vacío = usar ${state.CONFIG.diasUtilidadesAnual} (Configuración)"></div>
            <div class="field"><label>Bono de alimentación mensual (este empleado)</label><input type="number" step="0.01" name="cestaticket" value="${emp.cestaticket !== undefined && emp.cestaticket !== null ? emp.cestaticket : ''}" placeholder="Vacío = usar el general de Configuración"></div>
            <div class="field"><label>Moneda del bono de alimentación</label>
              <select name="cestaticketMoneda"><option value="VES" ${emp.cestaticketMoneda !== 'USD' ? 'selected' : ''}>Bolívares (Bs.)</option><option value="USD" ${emp.cestaticketMoneda === 'USD' ? 'selected' : ''}>Dólares (USD, según tasa del día)</option></select>
            </div>
            <div class="field"><label>Tarjeta de bono de alimentación</label>
              <select name="tieneTarjetaAlimentacion"><option value="true" ${emp.tieneTarjetaAlimentacion !== false ? 'selected' : ''}>Sí tiene</option><option value="false" ${emp.tieneTarjetaAlimentacion === false ? 'selected' : ''}>No tiene / pendiente</option></select>
            </div>
          </div>
          <div class="field"><label>Descripción de funciones (para el contrato, además del cargo)</label><textarea name="contratoDescripcionServicio" rows="4" placeholder="Se determina con la mayor precisión posible">${emp.contratoDescripcionServicio || ''}</textarea></div>

          <h3 style="font-size:1rem;margin-top:16px;">Naturaleza del contrato (Art. 60-64 LOTTT)</h3>
          <div class="note" style="margin-bottom:8px;">Complete esto solo si "Tipo de contrato" (arriba) es determinado u obra determinada.</div>
          <div class="grid cols-3">
            <div class="field"><label>Fecha de término (si es a tiempo determinado)</label><input type="date" name="contratoFechaTermino" value="${emp.contratoFechaTermino || ''}"></div>
            <div class="field"><label>Motivo (uno de los supuestos taxativos del Art. 64)</label>
              <select name="contratoMotivoDeterminado">
                <option value="naturaleza" ${emp.contratoMotivoDeterminado === 'naturaleza' ? 'selected' : ''}>Lo exige la naturaleza del servicio</option>
                <option value="sustitucion" ${emp.contratoMotivoDeterminado === 'sustitucion' ? 'selected' : ''}>Sustituir provisional y lícitamente a otro trabajador</option>
                <option value="exterior" ${emp.contratoMotivoDeterminado === 'exterior' ? 'selected' : ''}>Trabajador venezolano que prestará servicio fuera del país</option>
                <option value="labor_pendiente" ${emp.contratoMotivoDeterminado === 'labor_pendiente' ? 'selected' : ''}>No ha terminado la labor para la que fue contratado</option>
              </select>
            </div>
            <div class="field"><label>Descripción de la obra a ejecutar (si es por obra determinada)</label><input name="contratoDescripcionObra" value="${emp.contratoDescripcionObra || ''}" placeholder="Con toda precisión — Art. 63 LOTTT"></div>
          </div>
          <div class="note" style="margin-top:4px;">Fuera de los 4 supuestos del Art. 64, la ley considera nulo el contrato a tiempo determinado y el trabajador queda investido de estabilidad. Máximo 1 año, y una segunda prórroga lo convierte en indeterminado (Art. 62).</div>

          <h3 style="font-size:1rem;margin-top:16px;">Beneficios y cláusulas adicionales (opcional, para el contrato)</h3>
          <div class="note" style="margin-bottom:8px;">El bono de alimentación de arriba se agrega solo, como cláusula aparte. Use este campo solo para OTROS beneficios (ej. seguro médico privado, bono de transporte).</div>
          <div class="field"><label>Otros beneficios a mencionar</label><textarea name="beneficiosAdicionales" rows="2" placeholder="Ej: seguro médico privado, bono de transporte...">${emp.beneficiosAdicionales || ''}</textarea></div>
          <div class="field"><label>Cláusulas adicionales</label><textarea name="clausulasAdicionales" rows="2" placeholder="Confidencialidad, uso de equipos, etc. (opcional)">${emp.clausulasAdicionales || ''}</textarea></div>
        </div>

        <div class="emp-tab-panel" data-emptab-panel="jornada" hidden>
          <h3 style="font-size:1rem;margin-top:0;">Jornada</h3>
          <div class="grid cols-3">
            <div class="field"><label>Jornada</label>
              <select name="jornada">
                <option value="diurna" ${emp.jornada !== 'nocturna' && emp.jornada !== 'mixta' ? 'selected' : ''}>Diurna (5:00 a.m.–7:00 p.m., máx. 8h/día · 40h/semana)</option>
                <option value="nocturna" ${emp.jornada === 'nocturna' ? 'selected' : ''}>Nocturna (7:00 p.m.–5:00 a.m., máx. 7h/día · 35h/semana)</option>
                <option value="mixta" ${emp.jornada === 'mixta' ? 'selected' : ''}>Mixta (máx. 7,5h/día · 37,5h/semana)</option>
              </select>
            </div>
            <div class="field"><label>Días laborables</label><input name="diasLaborables" value="${emp.diasLaborables || 'lunes a viernes'}"></div>
            <div class="field"><label>Horario desde</label><input type="time" name="horarioDesde" value="${emp.horarioDesde || '08:00'}"></div>
            <div class="field"><label>Horario hasta</label><input type="time" name="horarioHasta" value="${emp.horarioHasta || '17:00'}"></div>
          </div>

          <h3 style="font-size:1rem;margin-top:16px;">Modalidad y lugar de prestación</h3>
          <div class="grid cols-2">
            <div class="field"><label>Modalidad de prestación</label>
              <select name="modalidadPrestacion">
                <option value="presencial" ${emp.modalidadPrestacion !== 'remoto' && emp.modalidadPrestacion !== 'hibrido' ? 'selected' : ''}>Presencial</option>
                <option value="remoto" ${emp.modalidadPrestacion === 'remoto' ? 'selected' : ''}>Remoto (teletrabajo)</option>
                <option value="hibrido" ${emp.modalidadPrestacion === 'hibrido' ? 'selected' : ''}>Híbrido</option>
              </select>
            </div>
            <div class="field"><label>Lugar de prestación del servicio</label><input name="lugarPrestacion" value="${emp.lugarPrestacion || state.CONFIG.domicilioLegal || ''}"></div>
          </div>
        </div>

        <div class="emp-tab-panel" data-emptab-panel="remuneracion" hidden>
          <div class="grid cols-3">
            <div class="field"><label>Moneda del salario</label>
              <select name="monedaSalario" id="empMonedaSel"><option value="VES" ${emp.monedaSalario !== 'USD' ? 'selected' : ''}>Bolívares (Bs.)</option><option value="USD" ${emp.monedaSalario === 'USD' ? 'selected' : ''}>Dólares (USD)</option></select>
            </div>
            <div class="field"><label id="empSalarioLabel">Salario base mensual actual ${emp.monedaSalario === 'USD' ? '(USD)' : '(Bs.)'}</label><input type="number" step="0.01" name="salarioBase" id="empSalarioInput" value="${emp.salarioBase}" required></div>
            <div class="field"><label>Periodicidad de pago</label>
              <select name="periodicidadPago"><option value="quincenal" ${emp.periodicidadPago !== 'mensual' ? 'selected' : ''}>Quincenal</option><option value="mensual" ${emp.periodicidadPago === 'mensual' ? 'selected' : ''}>Mensual</option></select>
            </div>
          </div>
          <div class="note" id="empUsdNote" style="${emp.monedaSalario === 'USD' ? '' : 'display:none;'}margin-top:8px;">
            Si el salario está fijado en USD, el equivalente en bolívares se recalcula automáticamente con la tasa de cambio vigente cada vez que se procese nómina, vacaciones, utilidades o prestaciones.
          </div>
          <h3 style="font-size:1rem;margin-top:18px;">Historial salarial (para cálculos retroactivos precisos)</h3>
          <div class="note" style="margin-bottom:8px;">Un cambio cargado en USD no queda fijo en bolívares: en dólares el salario no varía, pero su equivalente en Bs. se recalcula solo con la tasa de cada nómina, a medida que se genera — nunca con la tasa del día que se cargó aquí.</div>
          <table style="margin-bottom:8px;"><thead><tr><th>Fecha desde</th><th>Moneda</th><th>Monto/tasa</th><th>Equivalente Bs. (hoy)</th><th></th></tr></thead>
          <tbody id="histTbody">${histRows || '<tr><td colspan="5" style="color:var(--charcoal-soft);">Sin cambios registrados aún.</td></tr>'}</tbody></table>
          <div class="grid cols-4">
            <div class="field"><label>Fecha del cambio</label><input type="date" id="histFecha"></div>
            <div class="field"><label>Moneda</label>
              <select id="histMoneda"><option value="VES">Bolívares (Bs.)</option><option value="USD">Dólares (USD)</option></select>
            </div>
            <div class="field"><label>Monto</label><input type="number" step="0.01" id="histSalario"></div>
            <div class="field" id="histTasaWrap" style="display:none;"><label>Tasa aplicada (Bs./USD)</label><input type="number" step="0.01" id="histTasa" value="${getTasaActualValor()}"></div>
          </div>
          <button type="button" class="btn ghost" id="btnAddHist" style="margin-top:8px;">+ Agregar al historial</button>

          <h3 style="font-size:1rem;margin-top:18px;">Sueldo mensual en Bs. usado en cada nómina</h3>
          <div class="note" style="margin-bottom:8px;">Esta tabla se arma sola — no hay que cargar nada aquí. Cada vez que se guarda una corrida de nómina de este empleado, queda registrado qué sueldo mensual en bolívares se usó ese día (últimas 24 corridas).</div>
          <div class="table-wrap"><table style="margin-bottom:8px;"><thead><tr><th>Fecha de corte</th><th>Tipo de nómina</th><th>Sueldo mensual usado (Bs.)</th></tr></thead>
          <tbody>${historialPagosBs || '<tr><td colspan="3" style="color:var(--charcoal-soft);">Aún no hay corridas guardadas para este empleado.</td></tr>'}</tbody></table></div>
        </div>

        <div class="emp-tab-panel" data-emptab-panel="bancario" hidden>
          <div class="grid cols-3">
            <div class="field"><label>Forma de pago</label>
              <select name="formaPago">
                <option value="transferencia" ${emp.formaPago === 'transferencia' ? 'selected' : ''}>Transferencia</option>
                <option value="pago_movil" ${emp.formaPago === 'pago_movil' ? 'selected' : ''}>Pago móvil</option>
                <option value="efectivo" ${emp.formaPago === 'efectivo' ? 'selected' : ''}>Efectivo</option>
                <option value="zelle" ${emp.formaPago === 'zelle' ? 'selected' : ''}>Zelle / divisas</option>
              </select>
            </div>
            <div class="field"><label>Banco</label><input name="banco" value="${emp.banco || ''}"></div>
            <div class="field"><label>Nº de cuenta / teléfono (pago móvil)</label><input name="numeroCuenta" value="${emp.numeroCuenta || ''}"></div>
          </div>
          <h3 style="font-size:1rem;margin-top:16px;">Cuenta alterna (respaldo)</h3>
          <div class="note" style="margin-bottom:8px;">Por si hay algún problema con la cuenta principal — no se usa a menos que la principal falle.</div>
          <div class="grid cols-3">
            <div class="field"><label>Forma de pago</label>
              <select name="formaPago2">
                <option value="" ${!emp.formaPago2 ? 'selected' : ''}>— ninguna —</option>
                <option value="transferencia" ${emp.formaPago2 === 'transferencia' ? 'selected' : ''}>Transferencia</option>
                <option value="pago_movil" ${emp.formaPago2 === 'pago_movil' ? 'selected' : ''}>Pago móvil</option>
                <option value="efectivo" ${emp.formaPago2 === 'efectivo' ? 'selected' : ''}>Efectivo</option>
                <option value="zelle" ${emp.formaPago2 === 'zelle' ? 'selected' : ''}>Zelle / divisas</option>
              </select>
            </div>
            <div class="field"><label>Banco</label><input name="banco2" value="${emp.banco2 || ''}"></div>
            <div class="field"><label>Nº de cuenta / teléfono (pago móvil)</label><input name="numeroCuenta2" value="${emp.numeroCuenta2 || ''}"></div>
          </div>
        </div>

        <div class="emp-tab-panel" data-emptab-panel="parafiscales" hidden>
          <div class="grid cols-3">
            <div class="field"><label>Inscrito en el IVSS</label>
              <select name="inscritoIVSS"><option value="true" ${emp.inscritoIVSS !== false ? 'selected' : ''}>Sí</option><option value="false" ${emp.inscritoIVSS === false ? 'selected' : ''}>No</option></select>
              <div class="legal">Si no está inscrito, no se le calcula ni IVSS ni RPE (van juntos en la misma inscripción).</div>
            </div>
            <div class="field"><label>% ISLR a retener (formulario AR-I)</label><input type="number" step="0.01" name="islrPorcentaje" value="${emp.islrPorcentaje !== undefined && emp.islrPorcentaje !== null ? emp.islrPorcentaje : ''}" placeholder="Vacío = 0% (sin retención)"><div class="legal">Solo aplica a quien esté obligado a declarar (ingresos anuales &gt; 1.000 U.T.). Calcule el % con la planilla AR-I que llena el trabajador; sin ella, se retiene 0%.</div></div>
          </div>
          <h3 style="font-size:1rem;margin-top:16px;">Sueldo semanal cargado en el IVSS</h3>
          <div class="note" style="margin-top:4px;margin-bottom:8px;">
            El IVSS tiene registrado un "salario de clase" propio, distinto al sueldo real — así sale en la columna "Salario Semanal" de su factura. Mientras haya un valor cargado aquí (vigente a la fecha de cada recibo), el IVSS y el RPE se calculan sobre <b>ese</b> sueldo semanal (igual que hace el IVSS realmente), en vez de la fórmula con tope legal. Si no carga ningún valor, se usa la fórmula legal normal (tope 5x/10x salario mínimo).
          </div>
          <table style="margin-bottom:8px;"><thead><tr><th>Vigente desde</th><th>Sueldo semanal IVSS (Bs.)</th><th></th></tr></thead>
          <tbody id="histIVSSTbody">${histRowsIVSS || '<tr><td colspan="3" style="color:var(--charcoal-soft);">Sin sueldo semanal del IVSS cargado — se usa la fórmula legal.</td></tr>'}</tbody></table>
          <div class="grid cols-3">
            <div class="field"><label>Vigente desde</label><input type="date" id="histIVSSFecha"></div>
            <div class="field"><label>Sueldo semanal IVSS (Bs.)</label><input type="number" step="0.01" id="histIVSSSalario" placeholder="Ej: 130.00"></div>
            <div class="field" style="align-self:end;"><button type="button" class="btn ghost" id="btnAddHistIVSS">+ Agregar al histórico</button></div>
          </div>
        </div>

        <div class="emp-tab-panel" data-emptab-panel="contrato" hidden>
          <div class="desc">El contrato de trabajo en Word se arma con los datos que ya cargó en las demás pestañas (personales, laborales, jornada y lugar, remuneración) — con el contenido mínimo que exige el Art. 59 de la LOTTT. Aquí solo falta el lugar y la fecha de la firma.</div>
          <div class="grid cols-2">
            <div class="field"><label>Lugar de celebración (ciudad)</label><input id="contratoLugarCelebracion" value="Caracas"></div>
            <div class="field"><label>Fecha de celebración</label><input type="date" id="contratoFechaCelebracion" value="${todayStr()}"></div>
          </div>
          <div class="note" style="margin-bottom:8px;">Se recomienda guardar la ficha (botón Guardar) antes de generar el contrato, para que quede registrado lo que se cargó en las demás pestañas.</div>
          <button type="button" class="btn" id="btnGenerarContrato">⇩ Generar contrato (Word)</button>
        </div>

        <div class="emp-tab-panel" data-emptab-panel="egreso" hidden>
          <div class="desc">Datos del egreso — se llenan solos al Liquidar (pestaña Liquidación), o puede cargarlos aquí a mano. Recuerde poner "Estado" en Egresado (pestaña Datos laborales) para que quede reflejado en el listado.</div>
          <div class="grid cols-2">
            <div class="field"><label>Fecha de egreso</label><input type="date" name="egresoFecha" value="${egreso.fecha || ''}"></div>
            <div class="field"><label>Motivo de egreso</label>
              <select name="egresoCausa">
                <option value="" ${!egreso.causa ? 'selected' : ''}>— sin especificar —</option>
                <option value="renuncia" ${egreso.causa === 'renuncia' ? 'selected' : ''}>Renuncia voluntaria</option>
                <option value="despido_justificado" ${egreso.causa === 'despido_justificado' ? 'selected' : ''}>Despido justificado</option>
                <option value="despido_injustificado" ${egreso.causa === 'despido_injustificado' ? 'selected' : ''}>Despido injustificado</option>
                <option value="mutuo_acuerdo" ${egreso.causa === 'mutuo_acuerdo' ? 'selected' : ''}>Mutuo acuerdo</option>
              </select>
            </div>
          </div>

          <h3 style="font-size:1rem;margin-top:16px;">Desincorporación de entes parafiscales</h3>
          <div class="note" style="margin-bottom:8px;">Marque cada trámite a medida que lo haga ante el ente correspondiente, con su fecha — para llevar el control de qué falta.</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Ente</th><th>Hecho</th><th>Fecha del trámite</th></tr></thead>
            <tbody>
              <tr><td>IVSS (Seguro Social) — participación de egreso</td><td><input type="checkbox" name="egresoTramiteIvssHecho" ${tramites.ivss.hecho ? 'checked' : ''} style="width:auto;"></td><td><input type="date" name="egresoTramiteIvssFecha" value="${tramites.ivss.fecha || ''}"></td></tr>
              <tr><td>FAOV / BANAVIH</td><td><input type="checkbox" name="egresoTramiteFaovHecho" ${tramites.faov.hecho ? 'checked' : ''} style="width:auto;"></td><td><input type="date" name="egresoTramiteFaovFecha" value="${tramites.faov.fecha || ''}"></td></tr>
              <tr><td>INCES</td><td><input type="checkbox" name="egresoTramiteIncesHecho" ${tramites.inces.hecho ? 'checked' : ''} style="width:auto;"></td><td><input type="date" name="egresoTramiteIncesFecha" value="${tramites.inces.fecha || ''}"></td></tr>
              <tr><td>RPE (Régimen Prestacional de Empleo)</td><td><input type="checkbox" name="egresoTramiteRpeHecho" ${tramites.rpe.hecho ? 'checked' : ''} style="width:auto;"></td><td><input type="date" name="egresoTramiteRpeFecha" value="${tramites.rpe.fecha || ''}"></td></tr>
            </tbody>
          </table></div>
        </div>

        <div style="margin-top:18px;display:flex;gap:10px;">
          <button class="btn" type="submit">Guardar</button>
          <button class="btn ghost" type="button" id="btnCancelEmp">Cancelar</button>
        </div>
      </form>
    </div>
  </div>`;
}

function openEmpModal(emp, rerender) {
  TEMP_HIST = emp ? JSON.parse(JSON.stringify(emp.historial || [])) : [];
  TEMP_HIST_IVSS = emp ? JSON.parse(JSON.stringify(emp.historialIVSS || [])) : [];
  const wrapper = document.createElement('div');
  wrapper.innerHTML = empleadoFormModal(emp);
  document.body.appendChild(wrapper.firstElementChild);

  const empTabToggle = document.getElementById('empTabToggle');
  if (empTabToggle) empTabToggle.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      empTabToggle.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      document.querySelectorAll('[data-emptab-panel]').forEach((p) => { p.hidden = p.dataset.emptabPanel !== b.dataset.emptab; });
    });
  });

  function refreshHistTable() {
    const tbody = document.getElementById('histTbody');
    tbody.innerHTML = TEMP_HIST.map((h, i) => `<tr><td>${fmtDate(h.fecha)}</td><td>${fmt(h.montoBs !== undefined ? h.montoBs : h.salario)}</td><td><button type="button" class="btn ghost small" data-del-hist="${i}">Quitar</button></td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--charcoal-soft);">Sin cambios registrados aún.</td></tr>';
    tbody.querySelectorAll('[data-del-hist]').forEach((b) => b.addEventListener('click', () => {
      TEMP_HIST.splice(Number(b.dataset.delHist), 1); refreshHistTable();
    }));
  }
  refreshHistTable();

  function refreshHistIVSSTable() {
    const tbody = document.getElementById('histIVSSTbody');
    tbody.innerHTML = TEMP_HIST_IVSS.map((h, i) => `<tr><td>${fmtDate(h.fecha)}</td><td>${fmt(h.salarioSemanal)}</td><td><button type="button" class="btn ghost small" data-del-hist-ivss="${i}">Quitar</button></td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--charcoal-soft);">Sin sueldo semanal del IVSS cargado — se usa la fórmula legal.</td></tr>';
    tbody.querySelectorAll('[data-del-hist-ivss]').forEach((b) => b.addEventListener('click', () => {
      TEMP_HIST_IVSS.splice(Number(b.dataset.delHistIvss), 1); refreshHistIVSSTable();
    }));
  }
  refreshHistIVSSTable();
  document.getElementById('btnAddHistIVSS').addEventListener('click', () => {
    const f = document.getElementById('histIVSSFecha').value;
    const salarioSemanal = Number(document.getElementById('histIVSSSalario').value);
    if (!f || !salarioSemanal) { toast('Ingrese la fecha y el sueldo semanal.', 'error'); return; }
    TEMP_HIST_IVSS.push({ fecha: f, salarioSemanal });
    refreshHistIVSSTable();
  });

  const histMonedaSel = document.getElementById('histMoneda');
  const histTasaWrap = document.getElementById('histTasaWrap');
  const histTasaInput = document.getElementById('histTasa');
  const histFechaInput = document.getElementById('histFecha');
  histMonedaSel.addEventListener('change', () => {
    histTasaWrap.style.display = histMonedaSel.value === 'USD' ? '' : 'none';
    if (histMonedaSel.value === 'USD' && histFechaInput.value) histTasaInput.value = tasaEnFecha(histFechaInput.value);
  });
  histFechaInput.addEventListener('change', () => {
    if (histMonedaSel.value === 'USD') histTasaInput.value = tasaEnFecha(histFechaInput.value);
  });

  const empMonedaSel = document.getElementById('empMonedaSel');
  const empSalarioLabel = document.getElementById('empSalarioLabel');
  const empUsdNote = document.getElementById('empUsdNote');
  empMonedaSel.addEventListener('change', () => {
    const isUsd = empMonedaSel.value === 'USD';
    empSalarioLabel.textContent = 'Salario base mensual actual ' + (isUsd ? '(USD)' : '(Bs.)');
    empUsdNote.style.display = isUsd ? '' : 'none';
  });

  document.getElementById('btnAddHist').addEventListener('click', () => {
    const f = document.getElementById('histFecha').value;
    const moneda = histMonedaSel.value;
    const monto = Number(document.getElementById('histSalario').value);
    if (!f || !monto) { toast('Complete fecha y monto.', 'error'); return; }
    let montoBs = monto, tasa = null;
    if (moneda === 'USD') {
      tasa = Number(document.getElementById('histTasa').value) || getTasaActualValor();
      montoBs = monto * tasa;
    }
    TEMP_HIST.push({ fecha: f, moneda, monto, tasa, montoBs });
    refreshHistTable();
  });

  const btnGenerarContrato = document.getElementById('btnGenerarContrato');
  if (btnGenerarContrato) btnGenerarContrato.addEventListener('click', async () => {
    const fd = new FormData(document.getElementById('formEmpleado'));
    const modalidad = TIPO_CONTRATO_A_MODALIDAD[fd.get('tipoContrato')] || 'indeterminado';
    const cestaticketNativo = cestaticketNativoDe({
      cestaticket: fd.get('cestaticket'), cestaticketMoneda: fd.get('cestaticketMoneda')
    });
    const salarioMoneda = fd.get('monedaSalario') || 'VES';
    const salarioMonto = fmtNum(Number(fd.get('salarioBase')) || 0, 2);
    const datos = {
      empresaTxt: empresaConRif() + (state.CONFIG.domicilioLegal ? ', domiciliada en ' + state.CONFIG.domicilioLegal : ''),
      repNombre: state.CONFIG.repLegalNombre || '', repCedula: state.CONFIG.repLegalCedula || '',
      lugarCelebracion: document.getElementById('contratoLugarCelebracion').value || 'Caracas',
      fechaCelebracion: fmtDate(document.getElementById('contratoFechaCelebracion').value || todayStr()),
      trabNombre: fd.get('nombre'), trabCedula: fd.get('cedula') || '', trabNacionalidad: fd.get('nacionalidad') || 'Venezolana',
      trabEstadoCivil: fd.get('estadoCivil') || '', trabDireccion: fd.get('direccion') || '',
      cargo: fd.get('cargo') || '', descripcionServicio: fd.get('contratoDescripcionServicio') || '',
      modalidad, fechaTermino: fd.get('contratoFechaTermino') ? fmtDate(fd.get('contratoFechaTermino')) : '',
      motivoDeterminado: fd.get('contratoMotivoDeterminado'), descripcionObra: fd.get('contratoDescripcionObra') || '',
      fechaInicio: fmtDate(fd.get('fechaIngreso')),
      jornada: fd.get('jornada'), horarioDesde: fd.get('horarioDesde'), horarioHasta: fd.get('horarioHasta'),
      diasLaborables: fd.get('diasLaborables') || '',
      modalidadPrestacion: fd.get('modalidadPrestacion'), lugarPrestacion: fd.get('lugarPrestacion') || '',
      salarioMonto, salarioMoneda,
      periodicidadPago: fd.get('periodicidadPago') || 'quincenal',
      formaPago: fd.get('formaPago') === 'transferencia' ? 'transferencia bancaria' : fd.get('formaPago') === 'pago_movil' ? 'pago móvil' : (fd.get('formaPago') || 'transferencia bancaria'),
      // Bono de alimentación en su moneda pactada (no convertido a Bs) — si
      // está en USD, la cláusula del contrato agrega sola la mención de pago
      // en bolívares a tasa BCV, igual que con el salario.
      cestaticketMonto: cestaticketNativo.monto ? fmtNum(cestaticketNativo.monto, 2) : '',
      cestaticketMoneda: cestaticketNativo.moneda,
      beneficiosAdicionales: fd.get('beneficiosAdicionales') || '', clausulasAdicionales: fd.get('clausulasAdicionales') || ''
    };
    const nombreArchivo = `Contrato-${(fd.get('nombre') || 'empleado').replace(/\s+/g, '-')}-${todayStr()}.docx`;
    const res = await window.api.contrato.export(datos, nombreArchivo);
    if (!res.canceled) toast('Contrato guardado: ' + res.filePath, 'success');
  });

  document.getElementById('btnCancelEmp').addEventListener('click', closeEmpModal);
  document.getElementById('formEmpleado').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const id = fd.get('id') || uid();
    const nuevo = {
      id, nombre: fd.get('nombre'), cedula: fd.get('cedula'), cargo: fd.get('cargo'),
      fechaIngreso: fd.get('fechaIngreso'), salarioBase: Number(fd.get('salarioBase')),
      monedaSalario: fd.get('monedaSalario') || 'VES',
      // "estado" manda: Activo cuenta para nómina/vacaciones; Inactivo y
      // Egresado quedan afuera igual (activo=false), pero se distinguen en
      // el listado y en la pestaña Egreso.
      estado: fd.get('estado') || 'activo', activo: fd.get('estado') === 'activo',
      inscritoIVSS: fd.get('inscritoIVSS') !== 'false',
      tieneTarjetaAlimentacion: fd.get('tieneTarjetaAlimentacion') !== 'false',
      egreso: {
        fecha: fd.get('egresoFecha') || '', causa: fd.get('egresoCausa') || '',
        tramites: {
          ivss: { hecho: fd.get('egresoTramiteIvssHecho') === 'on', fecha: fd.get('egresoTramiteIvssFecha') || '' },
          faov: { hecho: fd.get('egresoTramiteFaovHecho') === 'on', fecha: fd.get('egresoTramiteFaovFecha') || '' },
          inces: { hecho: fd.get('egresoTramiteIncesHecho') === 'on', fecha: fd.get('egresoTramiteIncesFecha') || '' },
          rpe: { hecho: fd.get('egresoTramiteRpeHecho') === 'on', fecha: fd.get('egresoTramiteRpeFecha') || '' }
        }
      },
      historial: TEMP_HIST, historialIVSS: TEMP_HIST_IVSS,
      fechaNacimiento: fd.get('fechaNacimiento') || '', nacionalidad: fd.get('nacionalidad') || '',
      sexo: fd.get('sexo') || '', direccion: fd.get('direccion') || '', telefono: fd.get('telefono') || '',
      correo: fd.get('correo') || '', departamento: fd.get('departamento') || '',
      tipoContrato: fd.get('tipoContrato') || 'indefinido',
      formaPago: fd.get('formaPago') || 'transferencia', banco: fd.get('banco') || '', numeroCuenta: fd.get('numeroCuenta') || '',
      formaPago2: fd.get('formaPago2') || '', banco2: fd.get('banco2') || '', numeroCuenta2: fd.get('numeroCuenta2') || '',
      contactoEmergenciaNombre: fd.get('contactoEmergenciaNombre') || '', contactoEmergenciaTelefono: fd.get('contactoEmergenciaTelefono') || '',
      diasUtilidadesAnual: fd.get('diasUtilidadesAnual') !== '' ? Number(fd.get('diasUtilidadesAnual')) : '',
      cestaticket: fd.get('cestaticket') !== '' ? Number(fd.get('cestaticket')) : '',
      cestaticketMoneda: fd.get('cestaticketMoneda') || 'VES',
      islrPorcentaje: fd.get('islrPorcentaje') !== '' ? Number(fd.get('islrPorcentaje')) : '',
      estadoCivil: fd.get('estadoCivil') || '', contratoDescripcionServicio: fd.get('contratoDescripcionServicio') || '',
      contratoFechaTermino: fd.get('contratoFechaTermino') || '', contratoMotivoDeterminado: fd.get('contratoMotivoDeterminado') || 'naturaleza',
      contratoDescripcionObra: fd.get('contratoDescripcionObra') || '',
      jornada: fd.get('jornada') || 'diurna', horarioDesde: fd.get('horarioDesde') || '', horarioHasta: fd.get('horarioHasta') || '',
      diasLaborables: fd.get('diasLaborables') || '', modalidadPrestacion: fd.get('modalidadPrestacion') || 'presencial',
      lugarPrestacion: fd.get('lugarPrestacion') || '', periodicidadPago: fd.get('periodicidadPago') || 'quincenal',
      beneficiosAdicionales: fd.get('beneficiosAdicionales') || '', clausulasAdicionales: fd.get('clausulasAdicionales') || ''
    };
    const idx = state.EMPLEADOS.findIndex((x) => x.id === id);
    if (idx >= 0) state.EMPLEADOS[idx] = nuevo; else state.EMPLEADOS.push(nuevo);
    await persistAll();
    closeEmpModal();
    toast('Empleado guardado.', 'success');
    rerender();
  });
}

function closeEmpModal() {
  const ov = document.getElementById('empModalOverlay');
  if (ov) ov.remove();
}

const TIPO_CONTRATO_A_MODALIDAD = { indefinido: 'indeterminado', determinado: 'determinado', obra_determinada: 'obra', pasantia: 'determinado' };

/* =========================================================
   MODAL: CARGA MASIVA
   ========================================================= */
let BULK_REGISTROS = [];

function bulkModalHTML() {
  return `
  <div class="modal-overlay" id="bulkModalOverlay">
    <div class="modal" style="max-width:900px;">
      <h3>Carga masiva de empleados</h3>
      <div class="desc">Suba un archivo Excel (.xlsx) o CSV con sus empleados. Si no tiene el formato listo, descargue la plantilla, complétela y vuelva a subirla.</div>
      <div class="btn-row" style="margin:12px 0;">
        <button type="button" class="btn ghost" id="btnDescargarPlantilla">⬇ Descargar plantilla (.xlsx)</button>
        <label class="btn secondary" style="cursor:pointer;">
          Elegir archivo…
          <input type="file" id="bulkFileInput" accept=".xlsx,.xls,.csv" style="display:none;">
        </label>
      </div>
      <div id="bulkPreviewArea"></div>
      <div style="margin-top:18px;display:flex;gap:10px;">
        <button class="btn ghost" type="button" id="btnCerrarBulk">Cerrar</button>
      </div>
    </div>
  </div>`;
}

function openBulkModal(rerender) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = bulkModalHTML();
  document.body.appendChild(wrapper.firstElementChild);

  document.getElementById('btnDescargarPlantilla').addEventListener('click', async () => {
    const res = await window.api.xlsx.downloadTemplate(plantillaEmpleadosPayload());
    if (!res.canceled) toast('Plantilla guardada: ' + res.filePath, 'success');
  });
  document.getElementById('btnCerrarBulk').addEventListener('click', closeBulkModal);

  document.getElementById('bulkFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const previewArea = document.getElementById('bulkPreviewArea');
    previewArea.innerHTML = '<div class="note">Leyendo archivo…</div>';
    try {
      const buffer = await file.arrayBuffer();
      const filas = await window.api.xlsx.parseFile(buffer);
      BULK_REGISTROS = mapearFilasBulk(filas);
      renderBulkPreview(rerender);
    } catch (err) {
      previewArea.innerHTML = `<div class="note">No se pudo leer el archivo: ${err.message}</div>`;
    }
  });
}

function renderBulkPreview(rerender) {
  const previewArea = document.getElementById('bulkPreviewArea');
  if (!BULK_REGISTROS.length) {
    previewArea.innerHTML = '<div class="note">No se encontraron filas de datos en el archivo.</div>';
    return;
  }
  let validos = 0, invalidos = 0, duplicados = 0;
  const rows = BULK_REGISTROS.map((r, i) => {
    const { errores, duplicado } = validarRegistroBulk(r);
    if (errores.length) invalidos++; else validos++;
    if (duplicado) duplicados++;
    const estado = errores.length ? `<span class="tag err">${errores.join(', ')}</span>` : (duplicado ? '<span class="tag warn">cédula ya existe — se omitirá</span>' : '<span class="tag ok">OK</span>');
    return `<tr>
      <td>${i + 1}</td><td>${r.nombre || '—'}</td><td>${r.cedula || '—'}</td><td>${fmtDate(r.fechaIngreso) || '—'}</td>
      <td>${r.salarioBase !== '' ? r.salarioBase : '—'} ${r.monedaSalario}</td><td>${r.cargo || '—'}</td><td>${estado}</td>
    </tr>`;
  }).join('');
  previewArea.innerHTML = `
    <div class="legal" style="margin-top:10px;">${BULK_REGISTROS.length} filas leídas · ${validos} válidas · ${invalidos} con errores${duplicados ? ` · ${duplicados} con cédula duplicada (se omitirán)` : ''}</div>
    <div class="table-wrap" style="max-height:320px;overflow-y:auto;margin-top:8px;">
    <table><thead><tr><th>#</th><th>Nombre</th><th>Cédula</th><th>Ingreso</th><th>Salario</th><th>Cargo</th><th>Estado</th></tr></thead>
    <tbody>${rows}</tbody></table>
    </div>
    <button class="btn" id="btnConfirmarBulk" style="margin-top:14px;" ${validos - duplicados <= 0 ? 'disabled' : ''}>Importar ${Math.max(validos - duplicados, 0)} empleados válidos</button>
  `;
  const btnConfirmarBulk = document.getElementById('btnConfirmarBulk');
  if (btnConfirmarBulk) btnConfirmarBulk.addEventListener('click', () => confirmarImportacionBulk(rerender));
}

async function confirmarImportacionBulk(rerender) {
  let importados = 0;
  BULK_REGISTROS.forEach((r) => {
    const { errores, duplicado } = validarRegistroBulk(r);
    if (errores.length || duplicado) return;
    state.EMPLEADOS.push({
      id: uid(), nombre: r.nombre, cedula: r.cedula, cargo: r.cargo, fechaIngreso: r.fechaIngreso,
      salarioBase: Number(r.salarioBase), monedaSalario: r.monedaSalario, activo: r.activo, historial: [],
      fechaNacimiento: r.fechaNacimiento, nacionalidad: r.nacionalidad, sexo: r.sexo, direccion: r.direccion,
      telefono: r.telefono, correo: r.correo, departamento: r.departamento, tipoContrato: r.tipoContrato,
      formaPago: r.formaPago, banco: r.banco, numeroCuenta: r.numeroCuenta,
      contactoEmergenciaNombre: r.contactoEmergenciaNombre, contactoEmergenciaTelefono: r.contactoEmergenciaTelefono,
      diasUtilidadesAnual: (r.diasUtilidadesAnual !== '' && !isNaN(r.diasUtilidadesAnual)) ? Number(r.diasUtilidadesAnual) : '',
      cestaticket: (r.cestaticket !== '' && !isNaN(r.cestaticket)) ? Number(r.cestaticket) : '',
      cestaticketMoneda: r.cestaticketMoneda || 'VES'
    });
    importados++;
  });
  await persistAll();
  toast(`Se importaron ${importados} empleados.`, 'success');
  closeBulkModal();
  rerender();
}

function closeBulkModal() {
  const ov = document.getElementById('bulkModalOverlay');
  if (ov) ov.remove();
  BULK_REGISTROS = [];
}
