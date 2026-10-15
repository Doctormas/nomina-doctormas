import { state, loadState, syncConfigured, persistAll, actorDeSesion } from './state/store.js';
import { fetchTasaBCV, importarHistoricoCompleto } from './lib/tasa.js';
import { todayStr } from './lib/formato.js';
import { syncPull, syncPush } from './lib/sync.js';
import { iniciarAutoSync, resolverConflicto } from './lib/autoSync.js';
import { confirmDialog } from './components/confirm.js';
import { ICONS } from './components/icons.js';
import { toast } from './components/toast.js';
import { exportBackup, importBackup } from './lib/backup.js';
import { updateTasaHeaderLabel, updateSyncLabel } from './components/statusbar.js';
import { calcularNotificaciones } from './lib/notificaciones.js';
import { puedeVer, nombreDeRol } from './lib/auth.js';
import { pedirAcceso } from './views/login.js';

import { render as renderDashboard } from './views/dashboard.js';
import { render as renderConfig } from './views/config.js';
import { render as renderEmpleados } from './views/empleados.js';
import { render as renderNomina } from './views/nomina.js';
import { render as renderParafiscales } from './views/parafiscales.js';
import { render as renderVacaciones } from './views/vacaciones.js';
import { render as renderPrestaciones } from './views/prestaciones.js';
import { render as renderLiquidacion } from './views/liquidacion.js';
import { render as renderParalela } from './views/paralela.js';

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
  { id: 'liquidacion', label: 'Liquidación', icon: 'liquidacion', view: renderLiquidacion },
  // Sección privada (solo el master por defecto): bonos aparte, sin efecto en la nómina normal.
  { id: 'paralela', label: 'Nómina paralela', icon: 'candado', view: renderParalela }
];

// Configuración vive fuera de la barra de pestañas: se abre desde el ícono
// de engranaje junto al número de versión, en el pie del sidebar.
const CONFIG_ROUTE = { id: 'config', label: 'Configuración', icon: 'config', view: renderConfig };

let ACTIVE_TAB = 'dashboard';

// La sesión puede dejar de ser válida si el master la desactivó o la borró y
// ese cambio llegó con la sincronización — se vuelve a pedir acceso.
function sesionVigente() {
  const s = state.SESION;
  if (!s) return false;
  const u = state.USUARIOS.find((x) => x.id === s.id);
  if (!u || u.activo === false) return false;
  // El master pudo cambiar su nombre o tipo: se refresca en vivo.
  state.SESION = { id: u.id, usuario: u.usuario, nombre: u.nombre, rolId: u.rolId };
  // El nombre que firma los cambios y la sincronización es el del usuario con sesión.
  if (state.SYNC && state.SYNC.actor !== actorDeSesion()) state.SYNC.actor = actorDeSesion();
  return true;
}

let PIDIENDO_ACCESO = false;
async function exigirAcceso() {
  if (PIDIENDO_ACCESO) return;
  PIDIENDO_ACCESO = true;
  state.SESION = null;
  ACTIVE_TAB = 'dashboard';
  document.getElementById('sidebarNav').innerHTML = '';
  document.getElementById('mainArea').innerHTML = '';
  await pedirAcceso();
  PIDIENDO_ACCESO = false;
  render();
}

export function render() {
  document.getElementById('appShell')?.classList.remove('menu-abierto');
  if (!sesionVigente()) { exigirAcceso(); return; }
  // Si el tipo de usuario no incluye el módulo, se cae al primero permitido.
  if (!puedeVer(ACTIVE_TAB)) {
    const primero = TABS.find((t) => puedeVer(t.id));
    ACTIVE_TAB = primero ? primero.id : 'sinacceso';
  }
  renderSidebar();
  if (ACTIVE_TAB === 'sinacceso') {
    document.getElementById('topbarTitle').textContent = 'Sin módulos asignados';
    document.getElementById('mainArea').innerHTML = '<div class="card"><h2>Sin módulos asignados</h2><div class="desc">Su tipo de usuario no tiene módulos habilitados. Pida al usuario master que se los asigne en Configuración → Usuarios.</div></div>';
    return;
  }
  const tab = ACTIVE_TAB === 'config' ? CONFIG_ROUTE : TABS.find((t) => t.id === ACTIVE_TAB);
  document.getElementById('topbarTitle').textContent = tab.label;
  const el = document.getElementById('mainArea');
  el.innerHTML = '';
  tab.view(el, render);
  renderNotifBadge();
}

/* ---------- Centro de notificaciones ---------- */
function renderNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const n = calcularNotificaciones().length;
  badge.textContent = String(n);
  badge.style.display = n ? '' : 'none';
}

function renderNotifPanel() {
  const list = document.getElementById('notifPanelList');
  if (!list) return;
  const notifs = calcularNotificaciones();
  list.innerHTML = notifs.length
    ? notifs.map((n) => `<div class="notif-item notif-${n.severidad}">${n.texto}</div>`).join('')
    : '<div class="notif-empty">Sin notificaciones pendientes.</div>';
}

function wireNotifCenter() {
  const btn = document.getElementById('btnNotifBell');
  const panel = document.getElementById('notifPanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderNotifPanel();
  });
  document.addEventListener('click', (ev) => {
    if (!panel.hidden && !panel.contains(ev.target) && ev.target !== btn) panel.hidden = true;
  });
}

/* ---------- Barra lateral contraída (solo íconos, para ganar espacio) ---------- */
function applySidebarCollapsed() {
  const shell = document.querySelector('.app-shell');
  if (!shell) return;
  shell.classList.toggle('sidebar-collapsed', !!state.SIDEBAR_COLLAPSED);
  const btn = document.getElementById('btnSidebarToggle');
  if (btn) {
    const label = state.SIDEBAR_COLLAPSED ? 'Expandir barra lateral' : 'Contraer barra lateral';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
}

function wireSidebarToggle() {
  const btn = document.getElementById('btnSidebarToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.SIDEBAR_COLLAPSED = !state.SIDEBAR_COLLAPSED;
    applySidebarCollapsed();
    persistAll();
  });
  applySidebarCollapsed();
}

// Las pantallas piden ir a otro módulo con un evento (ej. tocar una alerta del Resumen).
window.addEventListener('nomina-ir', (ev) => {
  const destino = ev.detail;
  if (!puedeVer(destino)) return;
  ACTIVE_TAB = destino;
  render();
});

/* ---------- Menú tipo cajón (teléfono) ---------- */
function wireMenuMovil() {
  const shell = document.getElementById('appShell');
  const abrir = document.getElementById('btnMenuMovil');
  const fondo = document.getElementById('menuBackdrop');
  if (!shell || !abrir) return;
  abrir.addEventListener('click', () => shell.classList.toggle('menu-abierto'));
  if (fondo) fondo.addEventListener('click', () => shell.classList.remove('menu-abierto'));
}

function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = TABS.filter((t) => puedeVer(t.id)).map((t) => `
    <button data-tab="${t.id}" class="${ACTIVE_TAB === t.id ? 'active' : ''}">
      ${ICONS[t.icon] || ''}<span>${t.label}</span>
    </button>`).join('');
  nav.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    ACTIVE_TAB = b.dataset.tab;
    render();
  }));

  const btnConfig = document.getElementById('btnConfigGear');
  if (btnConfig) {
    btnConfig.classList.toggle('active', ACTIVE_TAB === 'config');
    // Configuración solo para quien tiene ese módulo (el master siempre).
    btnConfig.style.display = puedeVer('config') ? '' : 'none';
  }

  const box = document.getElementById('sidebarUser');
  if (box && state.SESION) {
    box.style.display = '';
    box.innerHTML = `<span class="su-name" title="${state.SESION.nombre} · ${nombreDeRol(state.SESION.rolId)}">${state.SESION.nombre}<br><span style="opacity:.65;">${nombreDeRol(state.SESION.rolId)}</span></span><button id="btnCerrarSesion" title="Cerrar sesión">Salir</button>`;
    box.querySelector('#btnCerrarSesion').addEventListener('click', () => {
      state.SESION = null;
      state.SESION_RECORDADA = null; // al salir se olvida "Recordarme"
      persistAll();
      render();
    });
  }
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

// Mantiene el histórico de tasas al día solo: rellena automáticamente los
// días que falten (hasta hoy) sin que el usuario tenga que entrar a
// Configuración → Tasas y darle al botón "Actualizar histórico" a mano. Se
// corre al abrir la app y, si la app se queda abierta, cada pocas horas —
// así, si un día no se abre la app, al abrirla de nuevo se rellena solo el
// hueco (la fuente ve.dolarapi.com guarda el histórico reciente).
async function actualizarHistoricoTasaAuto() {
  try {
    await importarHistoricoCompleto('oficial', 'Oficial (BCV)', null, todayStr());
    if (syncConfigured()) await syncPush();
    if (ACTIVE_TAB === 'config') render();
  } catch (err) {
    console.error('[app] no se pudo actualizar el histórico de tasas automáticamente:', err);
  }
}

async function boot() {
  await loadState();
  document.getElementById('sidebarVersion').textContent =
    'v' + (await (window.api ? window.api.app.getVersion() : Promise.resolve('1.0.0'))) +
    (window.__esMovil ? ' · teléfono' : (document.documentElement.classList.contains('plataforma-web') ? ' · web' : ' · escritorio'));
  document.getElementById('btnConfigGear').innerHTML = ICONS.config;
  document.getElementById('btnConfigGear').addEventListener('click', () => {
    ACTIVE_TAB = 'config';
    render();
  });

  document.getElementById('btnGuardarNube').addEventListener('click', async () => {
    const r = await syncPush(updateSyncLabel);
    if (r && r.conflicto) { await resolverConflicto(r.remoto); return; }
    toast(state.SYNC.status === 'ok' ? 'Cambios guardados en la nube.' : 'No se pudo sincronizar. Verifique su conexión.', state.SYNC.status === 'ok' ? 'success' : 'error');
  });

  document.getElementById('btnCargarNube').addEventListener('click', async () => {
    if (state.CAMBIOS_SIN_SINCRONIZAR) {
      const ok = await confirmDialog({
        title: 'Tiene cambios sin guardar',
        message: 'Traer lo de la nube <b>descarta</b> los cambios que aún no se han subido. ¿Continuar?',
        confirmLabel: 'Traer de la nube', danger: true
      });
      if (!ok) return;
    }
    state.SYNC.conflicto = null;
    await syncPull(false, updateSyncLabel);
    toast(state.SYNC.status === 'ok' ? 'Cambios traídos del servidor.' : 'No se pudo sincronizar. Verifique su conexión.', state.SYNC.status === 'ok' ? 'success' : 'error');
    render();
  });

  tickClock();
  setInterval(tickClock, 60 * 1000);
  wireCurrencyToggle();
  wireMenuActions();
  wireUpdater();
  wireNotifCenter();
  wireSidebarToggle();
  wireMenuMovil();
  setInterval(renderNotifBadge, 5 * 60 * 1000); // por si pasa un día abierta y se acerca el cierre de quincena

  updateTasaHeaderLabel(state.TASA.valor ? 'cache' : 'loading');
  updateSyncLabel();

  // Equipo nuevo en una empresa que ya usa la nube: se traen primero las
  // cuentas, para no pedir "crear master" si ya existen.
  if (!state.USUARIOS.length && syncConfigured()) {
    try { await syncPull(true, updateSyncLabel); } catch (e) { /* sin conexión: se crea localmente */ }
  }

  render();

  fetchTasaBCV(false, (status) => {
    updateTasaHeaderLabel(status);
    if (ACTIVE_TAB === 'config') render();
  });

  actualizarHistoricoTasaAuto();
  setInterval(actualizarHistoricoTasaAuto, 6 * 60 * 60 * 1000); // por si la app queda abierta y cruza de día

  iniciarAutoSync({ alActualizar: () => { updateSyncLabel(); render(); } });

  if (syncConfigured()) {
    // Si quedaron cambios locales sin subir a la nube (de la sesión anterior),
    // NO se trae lo del servidor: pisaría esos cambios. El botón "Guardar"
    // queda pendiente y usted decide cuándo subirlos.
    if (state.CAMBIOS_SIN_SINCRONIZAR) {
      // Quedaron cambios de la sesión anterior: no se trae lo de la nube (los
      // pisaría); la sincronización automática los sube en unos segundos.
      updateSyncLabel();
    } else {
      syncPull(true, updateSyncLabel).then(() => render());
    }
  }
}

boot().catch((err) => console.error('[app] boot failed:', err && err.stack ? err.stack : err));
