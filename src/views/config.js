import { state, persistAll, registrarTasaHistorica, syncConfigured } from '../state/store.js';
import { fetchTasaBCV, fetchTasaPorFecha, importarHistoricoCompleto } from '../lib/tasa.js';
import { syncConnect, syncPull, syncPush } from '../lib/sync.js';
import { fmtNum, fmtDate, todayStr } from '../lib/formato.js';
import { downloadCSV } from '../lib/csv.js';
import { tablaToCSV } from '../lib/formato.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/confirm.js';
import { updateTasaHeaderLabel, updateSyncLabel } from '../components/statusbar.js';

const MODULOS = [
  { id: 'tasas', label: 'Tasas' },
  { id: 'nube', label: 'Nube' },
  { id: 'parametros', label: 'Parámetros' },
  { id: 'nomina', label: 'Nómina' },
  { id: 'actualizaciones', label: 'Actualizaciones' }
];
let MODULO_ACTIVO = 'tasas';

export function render(root, rerender) {
  const pillsHtml = MODULOS.map((m) => `<button data-modulo="${m.id}" class="${MODULO_ACTIVO === m.id ? 'active' : ''}">${m.label}</button>`).join('');

  root.innerHTML = `
  <div class="pill-toggle" id="configPillToggle" style="margin-bottom:18px;">${pillsHtml}</div>
  <div id="configModuloArea">${moduloHTML(MODULO_ACTIVO)}</div>`;

  root.querySelector('#configPillToggle').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      MODULO_ACTIVO = b.dataset.modulo;
      render(root, rerender);
    });
  });

  wire(root, rerender);
}

function moduloHTML(modulo) {
  if (modulo === 'tasas') return tasasHTML();
  if (modulo === 'nube') return nubeHTML();
  if (modulo === 'parametros') return parametrosHTML();
  if (modulo === 'nomina') return nominaHTML();
  if (modulo === 'actualizaciones') return actualizacionesHTML();
  return '';
}

function actualizacionesHTML() {
  const u = state.UPDATER_STATUS || { status: 'idle' };
  const estadoHtml = {
    idle: '<div class="legal">Sin buscar todavía en esta sesión.</div>',
    checking: '<div class="note">🔄 Buscando actualizaciones…</div>',
    'not-available': '<div class="note" style="background:var(--green-tint);color:var(--green);border-color:transparent;">✓ Ya tiene la última versión.</div>',
    available: `<div class="note">Hay una versión nueva (v${u.version || '?'}) — descargando…</div>`,
    downloading: `<div class="note">⬇ Descargando v${u.version || ''} — ${u.percent || 0}%</div>`,
    downloaded: `<div class="note" style="background:var(--green-tint);color:var(--green);border-color:transparent;">✓ Versión v${u.version || ''} descargada y lista. Reinicie para instalarla.</div>`,
    error: `<div class="note" style="background:var(--red-tint);color:var(--red);border-color:transparent;">No se pudo buscar actualizaciones: ${u.message || 'error desconocido'}.</div>`
  }[u.status] || '';

  return `
  <div class="card">
    <h2>Actualizaciones</h2>
    <div class="desc">Cuando se publique una versión nueva en el repositorio de la app, este botón la busca, la descarga sola y le avisa cuando esté lista para instalar (se aplica al reiniciar).</div>
    <div class="btn-row" style="align-items:center;">
      <span class="legal">Versión instalada: <b id="updVersionActual">—</b></span>
      <button class="btn" id="btnBuscarActualizacion" ${u.status === 'checking' || u.status === 'downloading' ? 'disabled' : ''}>🔄 Buscar actualizaciones</button>
      ${u.status === 'downloaded' ? '<button class="btn secondary" id="btnInstalarActualizacion">Reiniciar e instalar ahora</button>' : ''}
    </div>
    <div style="margin-top:12px;">${estadoHtml}</div>
    <div class="legal" style="margin-top:10px;">Solo funciona en la app ya instalada (no en modo desarrollo). En Windows se instala sola; en Mac, por ahora, solo avisa que hay una versión nueva.</div>
  </div>`;
}

function nubeHTML() {
  return `
  <div class="card">
    <h2>Sincronización en la nube</h2>
    <div class="desc">Comparte estos mismos datos con tu equipo (por ejemplo tú y el contador), usando tu propio servidor pequeño en Cloudflare. Es manual: nada se sube ni se trae solo — tú decides cuándo con los botones "☁️ Guardar cambios" (arriba) y "Traer cambios del servidor" (aquí abajo). Cada persona configura esto una sola vez en su computador, con la misma URL y el mismo PIN.</div>
    <div class="grid cols-3">
      <div class="field"><label>URL del servidor (Worker)</label><input type="text" id="syncUrl" value="${state.SYNC.url}" placeholder="https://tu-worker.workers.dev"></div>
      <div class="field"><label>PIN de acceso</label><input type="password" id="syncPin" value="${state.SYNC.pin}" placeholder="PIN compartido con tu equipo"></div>
      <div class="field"><label>Tu nombre</label><input type="text" id="syncActor" value="${state.SYNC.actor}" placeholder="Ej. José"></div>
    </div>
    <div class="btn-row" style="margin-top:6px;align-items:center;">
      <button class="btn" id="btnGuardarSync">Guardar configuración</button>
      ${syncConfigured() ? '<button class="btn ghost" id="btnSincronizarAhora">⬇ Traer cambios del servidor</button><button class="btn ghost" id="btnDesconectarSync">Desconectar</button>' : ''}
      <span class="legal" id="syncConfigStatus">${syncConfigured() ? (state.SYNC.lastSyncedAt ? 'Última sincronización: ' + fmtDate(state.SYNC.lastSyncedAt.slice(0, 10)) + ' ' + new Date(state.SYNC.lastSyncedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) + (state.SYNC.lastUpdatedBy ? ' · por ' + state.SYNC.lastUpdatedBy : '') : 'Configurado, aún sin sincronizar.') : 'Sin configurar — cada quien ve solo sus propios datos guardados en este computador.'}</span>
    </div>
    <div class="note" style="margin-top:12px;">Necesitas desplegar primero un pequeño Worker de Cloudflare (instrucciones aparte). Una vez desplegado, pega aquí su URL y el PIN que hayas elegido.</div>
  </div>`;
}

function tasasHTML() {
  const fuentesCards = (state.TASA.fuentes || []).filter((f) => f.fuente !== 'paralelo').map((f) => {
    const activa = state.TASA.fuente === f.nombre;
    return `<div class="card" style="margin-bottom:0;padding:14px 16px;${activa ? 'border-color:var(--burgundy);' : ''}">
      <div class="desc" style="margin-bottom:4px;">${f.nombre}</div>
      <div style="font-size:1.3rem;font-weight:700;color:var(--burgundy);">${fmtNum(f.venta || f.promedio, 2)}</div>
      <div class="legal">Compra ${fmtNum(f.compra, 2)} · Promedio ${fmtNum(f.promedio, 2)}</div>
      <div class="legal">Actualizado: ${f.fechaActualizacion ? fmtDate(f.fechaActualizacion.slice(0, 10)) : '—'}</div>
      <button type="button" class="btn ${activa ? '' : 'ghost'} small" data-usar-tasa="${f.nombre}" data-valor="${f.venta || f.promedio}" style="margin-top:8px;">${activa ? '✓ Aplicada actualmente' : 'Usar esta tasa'}</button>
    </div>`;
  }).join('');

  return `
  <div class="card">
    <h2>Tasa del día</h2>
    <div class="desc">Se usa para convertir salarios fijados en USD a bolívares, y para mostrar cualquier monto en dólares con el selector de la barra superior.</div>
    <div class="btn-row" style="align-items:center;margin-bottom:14px;">
      <button class="btn secondary small" id="btnRefreshTasa">🔄 Actualizar</button>
      <div class="field" style="max-width:220px;margin:0;"><label>Tasa manual (Bs./USD)</label><input type="number" step="0.01" id="tasaManualInput" value="${state.TASA.manual ? state.TASA.valor : ''}" placeholder="Opcional"></div>
      <button class="btn ghost small" id="btnAplicarManual">Aplicar tasa manual</button>
      ${state.TASA.manual ? '<button class="btn ghost small" id="btnQuitarManual">Volver a tasa automática</button>' : ''}
    </div>
    <div class="grid cols-3">${fuentesCards || '<div class="note">Consultando fuentes de tasa de cambio…</div>'}</div>
  </div>
  <div class="card">
    <h2>Histórico de tasas por fecha</h2>
    <div class="desc">Se registra automáticamente cada vez que aplica una tasa desde el panel anterior. Este botón trae todo el histórico diario publicado por el BCV y lo actualiza hasta hoy.</div>
    <div class="btn-row" style="margin-bottom:14px;">
      <button type="button" class="btn secondary" id="btnImportarHistOficial">🔄 Actualizar histórico de tasas</button>
      <button type="button" class="btn danger" id="btnEliminarHistTasas" ${state.HISTORICO_TASAS.length ? '' : 'disabled'}>🗑 Eliminar todo el histórico</button>
    </div>
    <div class="grid cols-3" style="align-items:end;">
      <div class="field"><label>Fecha</label><input type="date" id="histTasaFecha" value="${todayStr()}"></div>
      <div class="field"><label>Tasa (Bs./USD)</label><input type="number" step="0.01" id="histTasaValor"></div>
      <div class="field"><button type="button" class="btn ghost" id="btnAddHistTasa">+ Agregar una tasa suelta</button></div>
    </div>
    <div class="legal" style="margin-top:8px;">${state.HISTORICO_TASAS.length} fechas registradas en total${state.HISTORICO_TASAS.length > 90 ? ' — se muestran las 90 más recientes en esta tabla, el CSV trae todas' : ''}.${state.HISTORICO_TASAS.length ? ' Rango cargado: ' + fmtDate(state.HISTORICO_TASAS.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1))[0].fecha) + ' — ' + fmtDate(state.HISTORICO_TASAS.slice().sort((a, b) => (a.fecha > b.fecha ? -1 : 1))[0].fecha) + '.' : ''}</div>
    <div style="margin-top:8px;"><button type="button" class="btn ghost small" id="btnDescargarHistTasas" ${state.HISTORICO_TASAS.length ? '' : 'disabled'}>⬇ Descargar histórico completo (CSV)</button></div>
    <div class="table-wrap" style="margin-top:8px;max-height:280px;overflow-y:auto;">
    <table>
      <thead><tr><th>Fecha</th><th>Tasa</th><th>Fuente</th><th></th></tr></thead>
      <tbody>${(state.HISTORICO_TASAS.slice().sort((a, b) => (a.fecha > b.fecha ? -1 : 1)).slice(0, 90).map((h) => `<tr><td>${fmtDate(h.fecha)}</td><td>${fmtNum(h.valor, 2)}</td><td>${h.fuente || '—'}</td><td><button type="button" class="btn ghost small" data-del-histtasa="${h.fecha}">Quitar</button></td></tr>`).join('')) || '<tr class="empty-row"><td colspan="4">Aún no hay tasas históricas registradas.</td></tr>'}</tbody>
    </table>
    </div>
    <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px;">
      <h3 style="font-size:.95rem;margin:0 0 6px;">Diagnóstico: probar una fecha directamente contra la API</h3>
      <div class="desc" style="margin-bottom:8px;">Si el botón de arriba no completa alguna fecha, pruébela aquí — le muestra exactamente qué respondió el servidor.</div>
      <div class="grid cols-3" style="align-items:end;">
        <div class="field"><label>Fecha a probar</label><input type="date" id="diagFecha" value="${todayStr()}"></div>
        <div class="field"><button type="button" class="btn ghost" id="btnDiagFecha">Probar esta fecha</button></div>
      </div>
      <pre id="diagResultado" style="margin-top:10px;background:var(--cream);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:.76rem;white-space:pre-wrap;word-break:break-word;display:none;"></pre>
    </div>
  </div>`;
}

function parametrosHTML() {
  const c = state.CONFIG;
  return `
  <div class="card">
    <h2>Parámetros legales y de empresa</h2>
    <div class="desc">Ajuste estos valores según los decretos y providencias vigentes (Gaceta Oficial). Los porcentajes estructurales (IVSS, FAOV, INCES, RPE) han sido estables durante años; el salario mínimo, el bono de alimentación y la tasa de interés deben actualizarse con frecuencia en Venezuela.</div>
    <form id="formConfig">
      <div class="grid cols-3">
        <div class="field"><label>Nombre de la empresa</label><input name="nombreEmpresa" value="${c.nombreEmpresa}"></div>
        <div class="field"><label>RIF</label><input name="rif" value="${c.rif || ''}"></div>
        <div class="field"><label>Salario mínimo mensual (Bs.)</label><input type="number" step="0.01" name="salarioMinimo" value="${c.salarioMinimo}"></div>
      </div>
      <h3>Nómina ordinaria</h3>
      <div class="grid cols-4">
        <div class="field"><label>Bono de alimentación mensual general</label><input type="number" step="0.01" name="cestaticket" value="${c.cestaticket}"><div class="legal">Valor por defecto. Cada empleado puede tener su propio monto en su ficha.</div></div>
        <div class="field"><label>Moneda del bono de alimentación general</label>
          <select name="cestaticketMoneda"><option value="VES" ${c.cestaticketMoneda !== 'USD' ? 'selected' : ''}>Bolívares (Bs.)</option><option value="USD" ${c.cestaticketMoneda === 'USD' ? 'selected' : ''}>Dólares (USD, según tasa del día)</option></select>
        </div>
        <div class="field"><label>IVSS trabajador (%)</label><input type="number" step="0.01" name="ivssTrabajador" value="${c.ivssTrabajador}"><div class="legal">Art. 66 Ley del Seguro Social — fijo, no varía por riesgo</div></div>
        <div class="field"><label>IVSS patrono (%)</label><input type="number" step="0.01" name="ivssPatrono" value="${c.ivssPatrono}"><div class="legal">9% riesgo mínimo · 10% medio · 11% máximo (LOPCYMAT)</div></div>
        <div class="field"><label>Tope cotización IVSS/RPE (en salarios mínimos)</label><input type="number" step="0.5" name="ivssTopeSalariosMinimos" value="${c.ivssTopeSalariosMinimos}"></div>
        <div class="field"><label>FAOV trabajador (%)</label><input type="number" step="0.01" name="faovTrabajador" value="${c.faovTrabajador}"></div>
        <div class="field"><label>FAOV patrono (%)</label><input type="number" step="0.01" name="faovPatrono" value="${c.faovPatrono}"></div>
        <div class="field"><label>RPE / paro forzoso trabajador (%)</label><input type="number" step="0.01" name="rpeTrabajador" value="${c.rpeTrabajador}"></div>
        <div class="field"><label>RPE / paro forzoso patrono (%)</label><input type="number" step="0.01" name="rpePatrono" value="${c.rpePatrono}"></div>
        <div class="field"><label>INCES trabajador (% solo sobre utilidades)</label><input type="number" step="0.01" name="incesTrabajador" value="${c.incesTrabajador}"></div>
        <div class="field"><label>INCES patrono (% trimestral sobre nómina)</label><input type="number" step="0.01" name="incesPatrono" value="${c.incesPatrono}"></div>
        <div class="field"><label>Ley de Protección de las Pensiones / DPP patrono (%)</label><input type="number" step="0.01" name="dppPatrono" value="${c.dppPatrono}"><div class="legal">100% patronal, recaudada por el SENIAT — la ley permite hasta 15%, actualmente fijada en 9%. Verifique la alícuota vigente antes de declarar.</div></div>
        <div class="field"><label>Base mínima de cálculo DPP (por trabajador)</label><input type="number" step="0.01" name="dppBaseMinima" value="${c.dppBaseMinima}"><div class="legal">Art. 7 Ley DPP — si el trabajador gana menos que esto en el mes, el aporte de esa persona se calcula igual sobre este mínimo. Cifra vigente ≈ USD 240 (USD 40 cestaticket + USD 200 bono). Cambia con frecuencia.</div></div>
        <div class="field"><label>Moneda de la base mínima DPP</label>
          <select name="dppBaseMinimaMoneda"><option value="USD" ${c.dppBaseMinimaMoneda !== 'VES' ? 'selected' : ''}>Dólares (USD, según tasa del día de cada nómina)</option><option value="VES" ${c.dppBaseMinimaMoneda === 'VES' ? 'selected' : ''}>Bolívares (Bs.)</option></select>
        </div>
      </div>
      <h3>Utilidades, vacaciones y prestaciones sociales</h3>
      <div class="grid cols-4">
        <div class="field"><label>Días de utilidades por año (política de empresa)</label><input type="number" step="1" name="diasUtilidadesAnual" value="${c.diasUtilidadesAnual}"><div class="legal">Mínimo legal: 30 días (Art. 131 LOTTT)</div></div>
        <div class="field"><label>Tope legal utilidades (días)</label><input type="number" step="1" name="diasUtilidadesTopeMax" value="${c.diasUtilidadesTopeMax}"><div class="legal">4 meses = 120 días (Art. 131 LOTTT)</div></div>
        <div class="field"><label>Días base de vacaciones (1er año)</label><input type="number" step="1" name="diasVacacionesBase" value="${c.diasVacacionesBase}"><div class="legal">Art. 190 LOTTT</div></div>
        <div class="field"><label>Tope días de vacaciones</label><input type="number" step="1" name="diasVacacionesTope" value="${c.diasVacacionesTope}"></div>
        <div class="field"><label>Días base bono vacacional</label><input type="number" step="1" name="diasBonoVacBase" value="${c.diasBonoVacBase}"><div class="legal">Art. 192 LOTTT</div></div>
        <div class="field"><label>Tope días bono vacacional</label><input type="number" step="1" name="diasBonoVacTope" value="${c.diasBonoVacTope}"></div>
        <div class="field"><label>Días garantía trimestral prestaciones</label><input type="number" step="1" name="diasGarantiaTrimestral" value="${c.diasGarantiaTrimestral}"><div class="legal">Art. 142 lit. a LOTTT</div></div>
        <div class="field"><label>Días adicionales por año (desde el 2do)</label><input type="number" step="1" name="diasAdicionalAnualPorAno" value="${c.diasAdicionalAnualPorAno}"><div class="legal">Art. 142 lit. b LOTTT</div></div>
        <div class="field"><label>Tope días adicionales acumulado</label><input type="number" step="1" name="diasAdicionalTope" value="${c.diasAdicionalTope}"></div>
        <div class="field"><label>Días retroactivos por año de antigüedad</label><input type="number" step="1" name="diasRetroactivoPorAno" value="${c.diasRetroactivoPorAno}"><div class="legal">Art. 142 lit. c LOTTT — se paga el mayor entre lo acumulado y este cálculo</div></div>
        <div class="field"><label>Tasa de interés anual estimada (%)</label><input type="number" step="0.1" name="tasaInteresAnual" value="${c.tasaInteresAnual}"><div class="legal">Promedio activa/pasiva BCV — actualizar periódicamente</div></div>
      </div>
      <div style="margin-top:16px;"><button class="btn" type="submit">Guardar parámetros</button></div>
    </form>
  </div>`;
}

function nominaHTML() {
  const c = state.CONFIG;
  return `
  <div class="card">
    <h2>Tipo de nómina</h2>
    <div class="desc">Defina qué paga cada tipo de período. Por ejemplo, en Doctormás la primera quincena (1–15) es un anticipo con la mitad del sueldo base y sin descuentos; la segunda quincena (16–30) trae la otra mitad, el bono de alimentación y todas las deducciones/aportes del mes completo.</div>
    <form id="formTiposNomina">
      ${Object.entries(c.tiposNomina).map(([key, t]) => `
        <div class="grid cols-4" style="align-items:end;border-top:1px solid var(--line);padding-top:14px;margin-top:14px;">
          <div class="field" style="grid-column: span 2;"><label>Nombre del período</label><input name="tn_${key}_label" value="${t.label}"></div>
          <div class="field"><label>Días de sueldo que paga</label><input type="number" step="1" name="tn_${key}_dias" value="${t.diasSueldo}"></div>
          <div class="field">
            <label class="checkline"><input type="checkbox" name="tn_${key}_cesta" ${t.incluyeCestaticket ? 'checked' : ''}> Incluye bono de alimentación</label>
            <label class="checkline" style="margin-top:6px;"><input type="checkbox" name="tn_${key}_ded" ${t.incluyeDeducciones ? 'checked' : ''}> Incluye deducciones y aportes (mes completo)</label>
          </div>
        </div>
      `).join('')}
      <div style="margin-top:16px;"><button class="btn" type="submit">Guardar tipos de nómina</button></div>
    </form>
  </div>`;
}

function wire(root, rerender) {
  /* Actualizaciones */
  const updVersionActual = root.querySelector('#updVersionActual');
  if (updVersionActual && window.api && window.api.app) {
    window.api.app.getVersion().then((v) => { updVersionActual.textContent = 'v' + v; });
  }
  const btnBuscarActualizacion = root.querySelector('#btnBuscarActualizacion');
  if (btnBuscarActualizacion) btnBuscarActualizacion.addEventListener('click', () => {
    if (!window.api || !window.api.updater) { toast('Actualizaciones no disponibles en este modo.', 'error'); return; }
    window.api.updater.check();
  });
  const btnInstalarActualizacion = root.querySelector('#btnInstalarActualizacion');
  if (btnInstalarActualizacion) btnInstalarActualizacion.addEventListener('click', () => {
    window.api.updater.install();
  });

  /* Sincronización */
  const btnGuardarSync = root.querySelector('#btnGuardarSync');
  if (btnGuardarSync) btnGuardarSync.addEventListener('click', async () => {
    state.SYNC.url = root.querySelector('#syncUrl').value.trim();
    state.SYNC.pin = root.querySelector('#syncPin').value.trim();
    state.SYNC.actor = root.querySelector('#syncActor').value.trim();
    await persistAll();
    if (!syncConfigured()) { toast('Complete la URL y el PIN.', 'error'); rerender(); return; }
    const status = root.querySelector('#syncConfigStatus');
    if (status) status.textContent = 'Conectando…';
    try {
      await syncConnect();
      toast('Conectado con el servidor.', 'success');
    } catch (err) {
      toast('No se pudo conectar con el servidor. Verifique la URL, el PIN y su conexión.', 'error');
    }
    updateSyncLabel();
    rerender();
  });
  const btnSincronizarAhora = root.querySelector('#btnSincronizarAhora');
  if (btnSincronizarAhora) btnSincronizarAhora.addEventListener('click', async () => { await syncPull(false, updateSyncLabel); rerender(); });
  const btnDesconectarSync = root.querySelector('#btnDesconectarSync');
  if (btnDesconectarSync) btnDesconectarSync.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Desconectar sincronización', message: '¿Desconectar la sincronización en este computador? Sus datos locales no se borran, solo dejan de compartirse.', confirmLabel: 'Desconectar', danger: true });
    if (!ok) return;
    state.SYNC = { url: '', pin: '', actor: '', lastSyncedAt: null, lastUpdatedBy: null, status: 'sin-configurar' };
    await persistAll();
    updateSyncLabel();
    rerender();
  });

  /* Tasa de cambio */
  const btnRefreshTasa = root.querySelector('#btnRefreshTasa');
  if (btnRefreshTasa) btnRefreshTasa.addEventListener('click', async () => { await fetchTasaBCV(true, updateTasaHeaderLabel); rerender(); });
  const btnAplicarManual = root.querySelector('#btnAplicarManual');
  if (btnAplicarManual) btnAplicarManual.addEventListener('click', async () => {
    const v = Number(root.querySelector('#tasaManualInput').value);
    if (!v) { toast('Ingrese una tasa válida.', 'error'); return; }
    state.TASA.valor = v; state.TASA.manual = true; state.TASA.fuente = 'Manual';
    await persistAll();
    updateTasaHeaderLabel('online');
    await registrarTasaHistorica(todayStr(), state.TASA.valor, state.TASA.fuente);
    rerender();
  });
  const btnQuitarManual = root.querySelector('#btnQuitarManual');
  if (btnQuitarManual) btnQuitarManual.addEventListener('click', async () => {
    state.TASA.manual = false;
    await persistAll();
    await fetchTasaBCV(true, updateTasaHeaderLabel);
    rerender();
  });
  root.querySelectorAll('[data-usar-tasa]').forEach((b) => {
    b.addEventListener('click', async () => {
      state.TASA.valor = Number(b.dataset.valor); state.TASA.fuente = b.dataset.usarTasa; state.TASA.manual = false;
      await persistAll();
      updateTasaHeaderLabel('online');
      await registrarTasaHistorica(todayStr(), state.TASA.valor, state.TASA.fuente);
      rerender();
    });
  });

  /* Histórico de tasas */
  const btnAddHistTasa = root.querySelector('#btnAddHistTasa');
  if (btnAddHistTasa) btnAddHistTasa.addEventListener('click', async () => {
    const f = root.querySelector('#histTasaFecha').value;
    const v = Number(root.querySelector('#histTasaValor').value);
    if (!f || !v) { toast('Complete fecha y tasa.', 'error'); return; }
    await registrarTasaHistorica(f, v, 'Manual');
    rerender();
  });
  root.querySelectorAll('[data-del-histtasa]').forEach((b) => {
    b.addEventListener('click', async () => {
      state.HISTORICO_TASAS = state.HISTORICO_TASAS.filter((h) => h.fecha !== b.dataset.delHisttasa);
      await persistAll();
      rerender();
    });
  });
  const btnDescargarHistTasas = root.querySelector('#btnDescargarHistTasas');
  if (btnDescargarHistTasas) btnDescargarHistTasas.addEventListener('click', () => {
    const ordenadas = state.HISTORICO_TASAS.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const csv = tablaToCSV(['Fecha', 'Tasa', 'Fuente'], ordenadas.map((h) => [h.fecha, fmtNum(h.valor, 2), h.fuente || '']));
    downloadCSV(csv, 'historico-tasas-cambio-' + todayStr() + '.csv');
  });
  const btnEliminarHistTasas = root.querySelector('#btnEliminarHistTasas');
  if (btnEliminarHistTasas) btnEliminarHistTasas.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Eliminar histórico de tasas',
      message: `¿Eliminar las ${state.HISTORICO_TASAS.length} fechas del histórico de tasas? Esta acción no se puede deshacer. Los cálculos de fechas pasadas en USD volverán a usar la tasa vigente más cercana disponible.`,
      confirmLabel: 'Eliminar todo', danger: true
    });
    if (!ok) return;
    state.HISTORICO_TASAS = [];
    await persistAll();
    rerender();
  });
  const btnDiagFecha = root.querySelector('#btnDiagFecha');
  if (btnDiagFecha) btnDiagFecha.addEventListener('click', async () => {
    const fecha = root.querySelector('#diagFecha').value;
    const pre = root.querySelector('#diagResultado');
    pre.style.display = 'block';
    pre.textContent = 'Consultando…';
    const fechaApi = fecha.replace(/-/g, '/');
    const cb = '?_=' + Date.now();
    const urlA = `https://ve.dolarapi.com/v1/historicos/dolares/${fechaApi}${cb}`;
    const urlB = `https://ve.dolarapi.com/v1/historicos/dolares/oficial/${fechaApi}${cb}`;
    const urlC = `https://ve.dolarapi.com/v1/historicos/dolares/oficial${cb}`;
    let salida = '';
    for (const [nombre, url] of [['/v1/historicos/dolares/{fecha}', urlA], ['/v1/historicos/dolares/oficial/{fecha}', urlB], ['/v1/historicos/dolares/oficial (bulk completo)', urlC]]) {
      salida += `→ ${nombre}\n  URL: ${url}\n`;
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(t);
        const texto = await res.text();
        const esBulk = nombre.includes('bulk');
        const muestraTexto = esBulk ? (() => { try { const arr = JSON.parse(texto); return `(${arr.length} registros) últimos 5: ` + JSON.stringify(arr.slice(-5)); } catch (e) { return texto.slice(0, 500); } })() : texto.slice(0, 500);
        salida += `  Estado HTTP: ${res.status} ${res.ok ? 'OK' : 'ERROR'}\n  Respuesta: ${muestraTexto}\n\n`;
      } catch (err) {
        salida += `  Error de red: ${err.message}\n\n`;
      }
    }
    pre.textContent = salida;
  });
  const btnImportarHistOficial = root.querySelector('#btnImportarHistOficial');
  if (btnImportarHistOficial) btnImportarHistOficial.addEventListener('click', async () => {
    btnImportarHistOficial.disabled = true;
    btnImportarHistOficial.textContent = 'Actualizando…';
    try {
      const { total, sinCompletar } = await importarHistoricoCompleto('oficial', 'Oficial (BCV)', null, todayStr());
      if (syncConfigured()) { await syncPush(); }
      if (sinCompletar.length) {
        toast(`Histórico actualizado (${total} fechas). La fuente aún no publica: ${sinCompletar.slice().sort().join(', ')}.`, 'info', 7000);
      } else {
        toast('Histórico actualizado hasta hoy. ' + total + ' fechas registradas en total.', 'success');
      }
      rerender();
    } catch (err) {
      toast('No se pudo actualizar el histórico (verifique su conexión a internet). ' + err.message, 'error');
      btnImportarHistOficial.disabled = false;
      btnImportarHistOficial.textContent = '🔄 Actualizar histórico de tasas';
    }
  });

  /* Formularios de configuración */
  const formConfig = root.querySelector('#formConfig');
  if (formConfig) {
    formConfig.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(formConfig);
      for (const [k, v] of fd.entries()) {
        if (k === 'nombreEmpresa' || k === 'rif' || k === 'cestaticketMoneda' || k === 'dppBaseMinimaMoneda') state.CONFIG[k] = v;
        else state.CONFIG[k] = Number(v);
      }
      await persistAll();
      toast('Parámetros guardados.', 'success');
      rerender();
    });
  }

  const formTiposNomina = root.querySelector('#formTiposNomina');
  if (formTiposNomina) {
    formTiposNomina.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(formTiposNomina);
      Object.keys(state.CONFIG.tiposNomina).forEach((key) => {
        state.CONFIG.tiposNomina[key] = {
          label: fd.get(`tn_${key}_label`) || state.CONFIG.tiposNomina[key].label,
          diasSueldo: Number(fd.get(`tn_${key}_dias`)) || 0,
          incluyeCestaticket: fd.get(`tn_${key}_cesta`) === 'on',
          incluyeDeducciones: fd.get(`tn_${key}_ded`) === 'on'
        };
      });
      await persistAll();
      toast('Tipos de nómina guardados.', 'success');
      rerender();
    });
  }
}
