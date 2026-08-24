import { state, loadState, syncConfigured, persistAll } from './state/store.js';
import { fetchTasaBCV } from './lib/tasa.js';
import { syncPull, syncPush } from './lib/sync.js';
import { ICONS } from './components/icons.js';
import { toast } from './components/toast.js';
import { exportBackup, importBackup } from './lib/backup.js';
import { updateTasaHeaderLabel, updateSyncLabel } from './components/statusbar.js';

import { render as renderDashboard } from './views/dashboard.js';
import { render as renderConfig } from './views/config.js';
import { render as renderEmpleados } from './views/empleados.js';
import { render as renderNomina } from './views/nomina.js';
import { render as renderParafiscales } from './views/parafiscales.js';
import { render as renderVacaciones } from './views/vacaciones.js';
import { render as renderPrestaciones } from './views/prestaciones.js';
import { render as renderLiquidacion } from './views/liquidacion.js';

// La pestaña "Informes" ya no existe como tal: cada informe vive dentro del
// segmento "Informes" de la pestaña con la que se relaciona. Tampoco existe
// "Utilidades" como pestaña propia: utilidades y bono vacacional son otro
// tipo de nómina más, y se corren/consultan desde la pestaña Nómina.
const TABS = [
  { id: 'dashboard', label: 'Resumen', icon: 'dashboard', view: renderDashboard },
  { id: 'empleados', label: 'Empleados', icon: 'empleados', view: renderEmpleados },
  { id: 'nomina', label: 'Nómina', icon: 'nomina', view: renderNomina },
  { id: 'parafiscales', label: 'Parafiscales', icon: 'parafiscales', view: renderParafiscales },
  { id: 'vacaciones', label: 'Vacaciones', icon: 'vacaciones', view: renderVacaciones },
  { id: 'prestaciones', label: 'Prestaciones sociales', icon: 'prestaciones', view: renderPrestaciones },
  { id: 'liquidacion', label: 'Liquidación', icon: 'liquidacion', view: renderLiquidacion }
];

// Configuración vive fuera de la barra de pestañas: se abre desde el ícono
// de engranaje junto al número de versión, en el pie del sidebar.
const CONFIG_ROUTE = { id: 'config', label: 'Configuración', icon: 'config', view: renderConfig };

let ACTIVE_TAB = 'dashboard';

export function render() {
  renderSidebar();
  const tab = ACTIVE_TAB === 'config' ? CONFIG_ROUTE : TABS.find((t) => t.id === ACTIVE_TAB);
  document.getElementById('topbarTitle').textContent = tab.label;
  const el = document.getElementById('mainArea');
  el.innerHTML = '';
  tab.view(el, render);
}

function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = TABS.map((t) => `
    <button data-tab="${t.id}" class="${ACTIVE_TAB === t.id ? 'active' : ''}">
      ${ICONS[t.icon] || ''}<span>${t.label}</span>
    </button>`).join('');
  nav.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    ACTIVE_TAB = b.dataset.tab;
    render();
  }));

  const btnConfig = document.getElementById('btnConfigGear');
  if (btnConfig) btnConfig.classList.toggle('active', ACTIVE_TAB === 'config');
}

/* ---------- Reloj ---------- */
function tickClock() {
  const el = document.getElementById('clockLabel');
  if (el) el.textContent = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/* ---------- Selector de moneda ---------- */
function wireCurrencyToggle() {
  const wrap = document.getElementById('currencyToggle');
  wrap.querySelectorAll('button').forEach((b) => {
    if (b.dataset.cur === state.DISPLAY_CURRENCY) b.classList.add('active'); else b.classList.remove('active');
    b.addEventListener('click', () => {
      state.DISPLAY_CURRENCY = b.dataset.cur;
      persistAll();
      wrap.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      render();
    });
  });
}

/* ---------- Menú nativo (Archivo → respaldo) ---------- */
function wireMenuActions() {
  if (!window.api || !window.api.onMenuAction) return;
  window.api.onMenuAction(async (action) => {
    if (action === 'backup-export') await exportBackup();
    else if (action === 'backup-import') { await importBackup(); render(); }
  });
}

/* ---------- Actualizaciones (electron-updater) ---------- */
function wireUpdater() {
  if (!window.api || !window.api.updater) return;
  window.api.updater.onStatus((data) => {
    state.UPDATER_STATUS = data;
    if (ACTIVE_TAB === 'config') render();
  });
}

async function boot() {
  await loadState();
  document.getElementById('sidebarVersion').textContent =
    'v' + (await (window.api ? window.api.app.getVersion() : Promise.resolve('1.0.0'))) + ' · escritorio';
  document.getElementById('btnConfigGear').innerHTML = ICONS.config;
  document.getElementById('btnConfigGear').addEventListener('click', () => {
    ACTIVE_TAB = 'config';
    render();
  });

  document.getElementById('btnGuardarNube').addEventListener('click', async () => {
    await syncPush(updateSyncLabel);
    toast(state.SYNC.status === 'ok' ? 'Cambios guardados en la nube.' : 'No se pudo sincronizar. Verifique su conexión.', state.SYNC.status === 'ok' ? 'success' : 'error');
  });

  tickClock();
  setInterval(tickClock, 60 * 1000);
  wireCurrencyToggle();
  wireMenuActions();
  wireUpdater();

  updateTasaHeaderLabel(state.TASA.valor ? 'cache' : 'loading');
  updateSyncLabel();

  render();

  fetchTasaBCV(false, (status) => {
    updateTasaHeaderLabel(status);
    if (ACTIVE_TAB === 'config') render();
  });

  if (syncConfigured()) {
    syncPull(true, updateSyncLabel).then(() => render());
  }
}

boot().catch((err) => console.error('[app] boot failed:', err && err.stack ? err.stack : err));
