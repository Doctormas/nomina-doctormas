import { state, persistAll } from '../state/store.js';
import { antiguedad, salarioVigente, diasUtilidadesEmp, cestaticketEmp } from '../lib/calculos.js';
import { getTasaActualValor, tasaEnFecha } from '../state/store.js';
import { fmt } from '../lib/moneda.js';
import { fmtDate, todayStr, uid } from '../lib/formato.js';
import { confirmDialog } from '../components/confirm.js';
import { toast } from '../components/toast.js';
import { plantillaEmpleadosPayload, mapearFilasBulk, validarRegistroBulk } from '../lib/bulkEmpleados.js';
import { construirListadoEmpleadosHTML, informeConAcciones } from '../lib/informes.js';

const MODULOS = [
  { id: 'listado', label: 'Listado' },
  { id: 'informes', label: 'Informes' }
];
let MODULO_ACTIVO = 'listado';

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
      <td>${e.activo === false ? '<span class="tag err">Inactivo</span>' : '<span class="tag ok">Activo</span>'}</td>
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

function empleadoFormModal(emp) {
  emp = emp || {
    id: null, nombre: '', cedula: '', cargo: '', fechaIngreso: todayStr(), salarioBase: state.CONFIG.salarioMinimo, monedaSalario: 'VES', activo: true, historial: [],
    fechaNacimiento: '', nacionalidad: 'Venezolana', sexo: '', direccion: '', telefono: '', correo: '',
    departamento: '', tipoContrato: 'indefinido', formaPago: 'transferencia', banco: '', numeroCuenta: '',
    contactoEmergenciaNombre: '', contactoEmergenciaTelefono: '', diasUtilidadesAnual: '', cestaticket: '', cestaticketMoneda: 'VES', islrPorcentaje: ''
  };
  const histRows = (emp.historial || []).map((h, i) => {
    const monedaTxt = h.moneda === 'USD' ? `$${h.monto} @ ${h.tasa}` : '—';
    return `<tr><td>${fmtDate(h.fecha)}</td><td>${h.moneda === 'USD' ? 'USD' : 'Bs.'}</td><td>${monedaTxt}</td><td>${fmt(h.montoBs)}</td><td><button type="button" class="btn ghost small" data-del-hist="${i}">Quitar</button></td></tr>`;
  }).join('');
  return `
  <div class="modal-overlay" id="empModalOverlay">
    <div class="modal" style="max-width:760px;">
      <h3>${emp.id ? 'Editar empleado' : 'Nuevo empleado'}</h3>
      <form id="formEmpleado">
        <input type="hidden" name="id" value="${emp.id || ''}">

        <h3 style="font-size:1rem;margin-top:4px;">Datos personales</h3>
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
        </div>
        <div class="field"><label>Dirección</label><input name="direccion" value="${emp.direccion || ''}"></div>

        <h3 style="font-size:1rem;margin-top:16px;">Datos laborales</h3>
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
            <select name="activo"><option value="true" ${emp.activo !== false ? 'selected' : ''}>Activo</option><option value="false" ${emp.activo === false ? 'selected' : ''}>Inactivo</option></select>
          </div>
          <div class="field"><label>Días de utilidades anuales (este empleado)</label><input type="number" step="1" name="diasUtilidadesAnual" value="${emp.diasUtilidadesAnual !== undefined && emp.diasUtilidadesAnual !== null ? emp.diasUtilidadesAnual : ''}" placeholder="Vacío = usar ${state.CONFIG.diasUtilidadesAnual} (Configuración)"></div>
          <div class="field"><label>Bono de alimentación mensual (este empleado)</label><input type="number" step="0.01" name="cestaticket" value="${emp.cestaticket !== undefined && emp.cestaticket !== null ? emp.cestaticket : ''}" placeholder="Vacío = usar el general de Configuración"></div>
          <div class="field"><label>Moneda del bono de alimentación</label>
            <select name="cestaticketMoneda"><option value="VES" ${emp.cestaticketMoneda !== 'USD' ? 'selected' : ''}>Bolívares (Bs.)</option><option value="USD" ${emp.cestaticketMoneda === 'USD' ? 'selected' : ''}>Dólares (USD, según tasa del día)</option></select>
          </div>
          <div class="field"><label>% ISLR a retener (formulario AR-I)</label><input type="number" step="0.01" name="islrPorcentaje" value="${emp.islrPorcentaje !== undefined && emp.islrPorcentaje !== null ? emp.islrPorcentaje : ''}" placeholder="Vacío = 0% (sin retención)"><div class="legal">Solo aplica a quien esté obligado a declarar (ingresos anuales &gt; 1.000 U.T.). Calcule el % con la planilla AR-I que llena el trabajador; sin ella, se retiene 0%.</div></div>
        </div>

        <h3 style="font-size:1rem;margin-top:16px;">Salario</h3>
        <div class="grid cols-3">
          <div class="field"><label>Moneda del salario</label>
            <select name="monedaSalario" id="empMonedaSel"><option value="VES" ${emp.monedaSalario !== 'USD' ? 'selected' : ''}>Bolívares (Bs.)</option><option value="USD" ${emp.monedaSalario === 'USD' ? 'selected' : ''}>Dólares (USD)</option></select>
          </div>
          <div class="field"><label id="empSalarioLabel">Salario base mensual actual ${emp.monedaSalario === 'USD' ? '(USD)' : '(Bs.)'}</label><input type="number" step="0.01" name="salarioBase" id="empSalarioInput" value="${emp.salarioBase}" required></div>
        </div>
        <div class="note" id="empUsdNote" style="${emp.monedaSalario === 'USD' ? '' : 'display:none;'}margin-top:8px;">
          Si el salario está fijado en USD, el equivalente en bolívares se recalcula automáticamente con la tasa de cambio vigente cada vez que se procese nómina, vacaciones, utilidades o prestaciones.
        </div>

        <h3 style="font-size:1rem;margin-top:16px;">Datos bancarios (pago de nómina)</h3>
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

        <h3 style="font-size:1rem;margin-top:16px;">Contacto de emergencia</h3>
        <div class="grid cols-2">
          <div class="field"><label>Nombre</label><input name="contactoEmergenciaNombre" value="${emp.contactoEmergenciaNombre || ''}"></div>
          <div class="field"><label>Teléfono</label><input name="contactoEmergenciaTelefono" value="${emp.contactoEmergenciaTelefono || ''}"></div>
        </div>

        <h3 style="font-size:1rem;margin-top:18px;">Historial salarial (para cálculos retroactivos precisos)</h3>
        <table style="margin-bottom:8px;"><thead><tr><th>Fecha desde</th><th>Moneda</th><th>Monto/tasa</th><th>Equivalente Bs.</th><th></th></tr></thead>
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
  const wrapper = document.createElement('div');
  wrapper.innerHTML = empleadoFormModal(emp);
  document.body.appendChild(wrapper.firstElementChild);

  function refreshHistTable() {
    const tbody = document.getElementById('histTbody');
    tbody.innerHTML = TEMP_HIST.map((h, i) => `<tr><td>${fmtDate(h.fecha)}</td><td>${fmt(h.montoBs !== undefined ? h.montoBs : h.salario)}</td><td><button type="button" class="btn ghost small" data-del-hist="${i}">Quitar</button></td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--charcoal-soft);">Sin cambios registrados aún.</td></tr>';
    tbody.querySelectorAll('[data-del-hist]').forEach((b) => b.addEventListener('click', () => {
      TEMP_HIST.splice(Number(b.dataset.delHist), 1); refreshHistTable();
    }));
  }
  refreshHistTable();

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

  document.getElementById('btnCancelEmp').addEventListener('click', closeEmpModal);
  document.getElementById('formEmpleado').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const id = fd.get('id') || uid();
    const nuevo = {
      id, nombre: fd.get('nombre'), cedula: fd.get('cedula'), cargo: fd.get('cargo'),
      fechaIngreso: fd.get('fechaIngreso'), salarioBase: Number(fd.get('salarioBase')),
      monedaSalario: fd.get('monedaSalario') || 'VES',
      activo: fd.get('activo') === 'true', historial: TEMP_HIST,
      fechaNacimiento: fd.get('fechaNacimiento') || '', nacionalidad: fd.get('nacionalidad') || '',
      sexo: fd.get('sexo') || '', direccion: fd.get('direccion') || '', telefono: fd.get('telefono') || '',
      correo: fd.get('correo') || '', departamento: fd.get('departamento') || '',
      tipoContrato: fd.get('tipoContrato') || 'indefinido',
      formaPago: fd.get('formaPago') || 'transferencia', banco: fd.get('banco') || '', numeroCuenta: fd.get('numeroCuenta') || '',
      contactoEmergenciaNombre: fd.get('contactoEmergenciaNombre') || '', contactoEmergenciaTelefono: fd.get('contactoEmergenciaTelefono') || '',
      diasUtilidadesAnual: fd.get('diasUtilidadesAnual') !== '' ? Number(fd.get('diasUtilidadesAnual')) : '',
      cestaticket: fd.get('cestaticket') !== '' ? Number(fd.get('cestaticket')) : '',
      cestaticketMoneda: fd.get('cestaticketMoneda') || 'VES',
      islrPorcentaje: fd.get('islrPorcentaje') !== '' ? Number(fd.get('islrPorcentaje')) : ''
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
