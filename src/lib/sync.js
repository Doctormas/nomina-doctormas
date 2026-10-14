// Sincronización en la nube con el Worker propio de Cloudflare del equipo —
// misma API y mismo protocolo (X-Access-Pin) del archivo original.
import { state, syncConfigured, collectFullState, applyFullState, persistAll } from '../state/store.js';
import { cifrarParalela, descifrarParalela, combinarParalela } from './paralelaCrypto.js';

// Guardar el estado local como consecuencia de sincronizar no cuenta como
// "cambio nuevo sin subir" — si no, el botón quedaría siempre pendiente.
async function persistSinMarcar() {
  state.APPLYING_REMOTE = true;
  try { await persistAll(); } finally { state.APPLYING_REMOTE = false; }
}

function syncEndpoint() {
  return state.SYNC.url.replace(/\/$/, '') + '/api/state';
}

// Lo que se sube de la nómina paralela: SIEMPRE cifrado. Antes de subir se trae
// lo que haya en la nube y se combina, para no borrar los pagos que otro equipo
// (o el teléfono) haya registrado. Un equipo sin la clave deja intacto lo que
// ya está en la nube.
async function paralelaParaSubir() {
  const res = await fetch(syncEndpoint(), { headers: { 'X-Access-Pin': state.SYNC.pin } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const remoto = j && j.data ? j.data.PARALELA_CIFRADA : null;
  if (!state.PARALELA_CLAVE) return remoto || undefined;
  if (remoto) {
    try {
      const datos = await descifrarParalela(remoto, state.PARALELA_CLAVE);
      state.PARALELA = Object.assign(state.PARALELA || {}, combinarParalela(state.PARALELA, datos));
    } catch (e) {
      // La clave de este equipo no abre lo que hay en la nube: no se toca.
      state.PARALELA_ESTADO = 'clave';
      return remoto;
    }
  }
  return cifrarParalela(state.PARALELA, state.PARALELA_CLAVE);
}

export async function syncPush(onStatus) {
  if (!syncConfigured()) return;
  state.SYNC.status = 'sincronizando';
  if (onStatus) onStatus();
  try {
    // Primero se arma todo (incluye traer y combinar la paralela cifrada)...
    const cuerpo = JSON.stringify({
      data: Object.assign(collectFullState(), { PARALELA_CIFRADA: await paralelaParaSubir() }),
      updatedBy: (state.SESION && state.SESION.nombre) || state.SYNC.actor || 'Sin nombre'
    });
    // ...y recién después corre el reloj del envío.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(syncEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Access-Pin': state.SYNC.pin },
      body: cuerpo,
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
  await persistSinMarcar();
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
  await persistSinMarcar();
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
  await persistSinMarcar();
}
