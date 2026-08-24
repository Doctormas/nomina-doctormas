// Sincronización en la nube con el Worker propio de Cloudflare del equipo —
// misma API y mismo protocolo (X-Access-Pin) del archivo original.
import { state, syncConfigured, collectFullState, applyFullState, persistAll } from '../state/store.js';

function syncEndpoint() {
  return state.SYNC.url.replace(/\/$/, '') + '/api/state';
}

export async function syncPush(onStatus) {
  if (!syncConfigured()) return;
  state.SYNC.status = 'sincronizando';
  if (onStatus) onStatus();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(syncEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Access-Pin': state.SYNC.pin },
      body: JSON.stringify({ data: collectFullState(), updatedBy: state.SYNC.actor || 'Sin nombre' }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    state.SYNC.lastSyncedAt = j.updatedAt || new Date().toISOString();
    state.SYNC.lastUpdatedBy = state.SYNC.actor || 'Sin nombre';
    state.SYNC.status = 'ok';
    state.CAMBIOS_SIN_SINCRONIZAR = false;
  } catch (err) {
    state.SYNC.status = 'error';
  }
  await persistAll();
  if (onStatus) onStatus();
}

export async function syncPull(silent, onStatus) {
  if (!syncConfigured()) return;
  if (!silent) { state.SYNC.status = 'sincronizando'; if (onStatus) onStatus(); }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(syncEndpoint(), { headers: { 'X-Access-Pin': state.SYNC.pin }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (j && j.data) {
      await applyFullState(j.data);
      state.SYNC.lastSyncedAt = j.updatedAt;
      state.SYNC.lastUpdatedBy = j.updatedBy;
      state.CAMBIOS_SIN_SINCRONIZAR = false;
    }
    state.SYNC.status = 'ok';
  } catch (err) {
    state.SYNC.status = 'error';
  }
  await persistAll();
  if (onStatus) onStatus();
}

/** Conectar por primera vez: trae lo del servidor si ya hay algo, o sube lo local si el servidor está vacío. */
export async function syncConnect() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const res = await fetch(syncEndpoint(), { headers: { 'X-Access-Pin': state.SYNC.pin }, signal: controller.signal });
  clearTimeout(timeout);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  if (j && j.data) {
    await applyFullState(j.data);
    state.SYNC.lastSyncedAt = j.updatedAt;
    state.SYNC.lastUpdatedBy = j.updatedBy;
  } else {
    await syncPush();
  }
  state.SYNC.status = 'ok';
  await persistAll();
}
