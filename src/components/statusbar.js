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

/** Indicador de la sincronización con la nube en la barra superior (un solo chip). */
export function updateSyncLabel() {
  const el = document.getElementById('syncHeaderLabel');
  if (!el) return;
  if (!syncConfigured()) { el.style.display = 'none'; return; }
  el.style.display = '';
  const st = state.SYNC.status;
  const conflicto = st === 'conflicto' || state.SYNC.conflicto;
  const pendiente = state.CAMBIOS_SIN_SINCRONIZAR && st !== 'error' && !conflicto;
  const dot = st === 'sincronizando' || pendiente ? '🟡' : st === 'error' ? '🔴' : conflicto ? '🟠' : '🟢';
  const cuando = state.SYNC.lastSyncedAt ? new Date(state.SYNC.lastSyncedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '—';
  let texto = `Sincronizado · ${cuando}`;
  if (st === 'sincronizando') texto = 'Sincronizando…';
  else if (conflicto) texto = 'Hay cambios por resolver';
  else if (st === 'error') texto = 'Sin conexión — se reintenta solo';
  else if (pendiente) texto = 'Guardando en la nube…';
  el.classList.toggle('pendiente', pendiente || st === 'sincronizando');
  el.innerHTML = `<span class="sync-dot">${dot}</span><span class="sync-txt">${texto}</span>`;
  el.title = `${texto}${state.SYNC.lastUpdatedBy ? ' · último cambio de ' + state.SYNC.lastUpdatedBy : ''}. Toque para sincronizar ahora.`;
}
