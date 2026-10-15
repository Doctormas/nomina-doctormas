// Sincronización en la nube con el Worker propio de Cloudflare del equipo —
// misma API y mismo protocolo (X-Access-Pin) del archivo original.
import { state, syncConfigured, collectFullState, applyFullState, persistAll, actorDeSesion, fijarBaseSync } from '../state/store.js';
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

/**
 * Sube el estado a la nube. Si se conoce la revisión con la que se trabajó
 * (state.SYNC.revision) se envía como baseRevision: si otro equipo guardó antes,
 * el servidor responde 409 y NO se pisa nada — se devuelve { conflicto, remoto }.
 */
export async function syncPush(onStatus) {
  if (!syncConfigured()) return { omitido: true };
  state.SYNC.status = 'sincronizando';
  if (onStatus) onStatus();
  let resultado = { ok: false };
  try {
    // Primero se arma todo (incluye traer y combinar la paralela cifrada)...
    const base = Number.isInteger(state.SYNC.revision) ? state.SYNC.revision : undefined;
    const cuerpo = JSON.stringify({
      data: Object.assign(collectFullState(), { PARALELA_CIFRADA: await paralelaParaSubir() }),
      updatedBy: actorDeSesion() || state.SYNC.actor || 'Sin nombre',
      baseRevision: base
    });
    // ...y recién después corre el reloj del envío.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(syncEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Access-Pin': state.SYNC.pin },
      body: cuerpo,
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.status === 409) {
      const remoto = await res.json();
      state.SYNC.status = 'conflicto';
      resultado = { ok: false, conflicto: true, remoto };
    } else {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      state.SYNC.lastSyncedAt = j.updatedAt || new Date().toISOString();
      state.SYNC.lastUpdatedBy = actorDeSesion() || state.SYNC.actor || 'Sin nombre';
      if (Number.isInteger(j.revision)) state.SYNC.revision = j.revision;
      state.SYNC.status = 'ok';
      state.CAMBIOS_SIN_SINCRONIZAR = false;
      fijarBaseSync();
      resultado = { ok: true };
    }
  } catch (err) {
    state.SYNC.status = 'error';
    resultado = { ok: false, error: err.message };
  }
  await persistSinMarcar();
  if (onStatus) onStatus();
  return resultado;
}

/** Revisión vigente en la nube (consulta liviana, sin bajar el documento). null si no se pudo. */
export async function revisionEnNube() {
  if (!syncConfigured()) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(state.SYNC.url.replace(/\/$/, '') + '/api/revision', { headers: { 'X-Access-Pin': state.SYNC.pin }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const j = await res.json();
    return Number.isInteger(j.revision) ? j : null;
  } catch (e) {
    return null;
  }
}

export async function syncPull(silent, onStatus) {
  if (!syncConfigured()) return { aplicado: false };
  let aplicado = false;
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
      if (Number.isInteger(j.revision)) state.SYNC.revision = j.revision;
      state.CAMBIOS_SIN_SINCRONIZAR = false;
      fijarBaseSync();
      aplicado = true;
    } else if (j && Number.isInteger(j.revision)) {
      state.SYNC.revision = j.revision;
    }
    state.SYNC.status = 'ok';
  } catch (err) {
    state.SYNC.status = 'error';
  }
  await persistSinMarcar();
  if (onStatus) onStatus();
  return { aplicado };
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
    if (Number.isInteger(j.revision)) state.SYNC.revision = j.revision;
    fijarBaseSync();
  } else {
    await syncPush();
  }
  state.SYNC.status = 'ok';
  await persistSinMarcar();
}
