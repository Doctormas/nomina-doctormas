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
  if (btn) {
    if (!syncConfigured()) { btn.style.display = 'none'; }
    else {
      btn.style.display = '';
      btn.classList.toggle('pendiente', state.CAMBIOS_SIN_SINCRONIZAR);
      btn.textContent = state.CAMBIOS_SIN_SINCRONIZAR ? '☁️ Guardar cambios' : '☁️ Todo guardado';
    }
  }
  if (!el) return;
  if (!syncConfigured()) { el.style.display = 'none'; return; }
  el.style.display = '';
  const dot = state.SYNC.status === 'ok' ? '🟢' : state.SYNC.status === 'sincronizando' ? '🟡' : state.SYNC.status === 'error' ? '🔴' : '⚪';
  const cuando = state.SYNC.lastSyncedAt ? new Date(state.SYNC.lastSyncedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '—';
  el.textContent = `${dot} Compartido · ${cuando}${state.SYNC.lastUpdatedBy ? ' · ' + state.SYNC.lastUpdatedBy : ''}`;
}
