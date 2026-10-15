import { state, syncConfigured } from '../state/store.js';
import { fmtNum } from '../lib/formato.js';

/** Chip de tasa BCV en la barra superior. */
export function updateTasaHeaderLabel(status) {
  const el = document.getElementById('tasaHeaderLabel');
  if (!el) return;
  const dot = status === 'online' ? '🟢' : status === 'loading' ? '🟡' : status === 'cache' ? '🔵' : status === 'cache-fail' ? '🔵' : '🔴';
  const valorTxt = state.TASA.valor ? fmtNum(state.TASA.valor, 2) : '—';
  el.textContent = `${dot} Tasa: ${valorTxt} Bs./USD${state.TASA.manual ? ' (manual)' : ''}`;
}

/** Botón "Guardar cambios" + chip de estado de sincronización en la barra superior. */
export function updateSyncLabel() {
  const el = document.getElementById('syncHeaderLabel');
  const btn = document.getElementById('btnGuardarNube');
  const btnCargar = document.getElementById('btnCargarNube');
  if (btn) {
    if (!syncConfigured()) { btn.style.display = 'none'; }
    else {
      btn.style.display = '';
      btn.classList.toggle('pendiente', state.CAMBIOS_SIN_SINCRONIZAR);
      btn.title = state.CAMBIOS_SIN_SINCRONIZAR ? 'Guardar cambios en la nube (hay cambios sin guardar)' : 'Todo guardado en la nube';
    }
  }
  if (btnCargar) btnCargar.style.display = syncConfigured() ? '' : 'none';
  if (!el) return;
  if (!syncConfigured()) { el.style.display = 'none'; return; }
  el.style.display = '';
  const st = state.SYNC.status;
  const dot = st === 'ok' ? '🟢' : st === 'sincronizando' ? '🟡' : st === 'error' ? '🔴' : st === 'conflicto' ? '🟠' : '⚪';
  const cuando = state.SYNC.lastSyncedAt ? new Date(state.SYNC.lastSyncedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '—';
  let texto = `Compartido · ${cuando}${state.SYNC.lastUpdatedBy ? ' · ' + state.SYNC.lastUpdatedBy : ''}`;
  if (st === 'sincronizando') texto = 'Sincronizando…';
  else if (st === 'conflicto' || state.SYNC.conflicto) texto = 'Cambios en conflicto — pulse Guardar para resolver';
  else if (st === 'error') texto = 'Sin conexión — se reintenta solo';
  else if (state.CAMBIOS_SIN_SINCRONIZAR) texto = 'Guardando en la nube…';
  el.textContent = `${dot} ${texto}`;
}
