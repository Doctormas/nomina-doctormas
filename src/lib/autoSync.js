// Sincronización automática con la nube.
//
//  - SUBIR: unos segundos después de cada cambio local se guarda en la nube.
//  - BAJAR: al abrir, al volver a la app y cada ~45 s se consulta (liviano) si
//    hay una revisión más nueva; si no hay cambios locales pendientes se trae.
//  - CHOQUE: si otro equipo guardó mientras usted tenía cambios sin subir, el
//    servidor lo detecta (revisión) y NADA se pisa: los dos juegos de cambios se
//    COMBINAN registro por registro (ver combinar.js). Solo si no se logra
//    combinar se le pregunta qué hacer. Siempre queda una copia en
//    Configuración → Historial para volver atrás.
import { state, syncConfigured, collectFullState, applyFullState, persistAll, alHaberCambios, registrarCopia, fijarBaseSync } from '../state/store.js';
import { combinarEstado } from './combinar.js';
import { syncPush, syncPull, revisionEnNube } from './sync.js';
import { updateSyncLabel } from '../components/statusbar.js';
import { toast } from '../components/toast.js';

const ESPERA_SUBIDA_MS = 4000;
const INTERVALO_REVISION_MS = 45000;

let alActualizarVista = null;
let temporizadorSubida = null;
let ocupado = false;
let dialogoAbierto = false;

function puedeSincronizar() {
  return syncConfigured() && navigator.onLine !== false && !state.SYNC.pausado;
}

// ¿La persona está en medio de algo? Entonces no se le cambia la pantalla.
function editandoAhora() {
  if (document.querySelector('.modal-overlay, .login-overlay')) return true;
  const a = document.activeElement;
  return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('#mainArea'));
}

function etiqueta() { try { updateSyncLabel(); } catch (e) { /* aún no hay barra */ } }

/* ---------- Subir ---------- */
export function programarSubida() {
  if (!puedeSincronizar() || state.SYNC.conflicto) return;
  clearTimeout(temporizadorSubida);
  temporizadorSubida = setTimeout(subirAhora, ESPERA_SUBIDA_MS);
}

async function subirAhora() {
  if (ocupado || !puedeSincronizar() || !state.CAMBIOS_SIN_SINCRONIZAR || state.SYNC.conflicto) return;
  ocupado = true;
  try {
    // Antes de subir, ¿alguien guardó algo nuevo? (evita casi todos los choques)
    const r = await syncPush(etiqueta);
    if (r && r.conflicto) await manejarConflicto(r.remoto);
  } finally {
    ocupado = false;
    etiqueta();
  }
}

/* ---------- Bajar ---------- */
async function revisarNube() {
  if (ocupado || !puedeSincronizar()) return;
  const nube = await revisionEnNube();
  if (!nube) return;
  const mia = Number.isInteger(state.SYNC.revision) ? state.SYNC.revision : 0;
  if (nube.revision <= mia) {
    if (state.CAMBIOS_SIN_SINCRONIZAR && !state.SYNC.conflicto) programarSubida();
    else if (!state.CAMBIOS_SIN_SINCRONIZAR && !state.SYNC_BASE) { fijarBaseSync(); persistAll(); }
    return;
  }
  // Hay algo más nuevo en la nube.
  if (state.CAMBIOS_SIN_SINCRONIZAR) {
    // Tengo cambios propios sin subir: se intenta subir; el servidor dirá si choca.
    await subirAhora();
    return;
  }
  if (editandoAhora()) return; // se reintenta en el próximo ciclo
  ocupado = true;
  try {
    const r = await syncPull(true, etiqueta);
    if (r && r.aplicado) {
      if (alActualizarVista) alActualizarVista();
      toast(`Datos actualizados desde la nube${nube.updatedBy ? ' (' + nube.updatedBy + ')' : ''}.`, 'info', 3500);
    }
  } finally {
    ocupado = false;
    etiqueta();
  }
}

/* ---------- Choque ---------- */
function elegir(remoto) {
  return new Promise((resolve) => {
    const por = remoto.updatedBy ? ` (${remoto.updatedBy})` : '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal-confirm" style="max-width:520px;">
        <h3>Otro equipo guardó cambios${por}</h3>
        <p class="confirm-message">Mientras usted tenía cambios sin guardar, alguien más guardó en la nube. Para no perder nada, elija:</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">
          <button class="btn" data-op="nube">Traer lo de la nube <small style="opacity:.85;">— mis cambios sin guardar se descartan (queda copia)</small></button>
          <button class="btn secondary" data-op="mio">Subir lo mío <small style="opacity:.85;">— reemplaza lo de la nube (queda copia de lo suyo)</small></button>
          <button class="btn ghost" data-op="luego">Decidir después</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => {
      overlay.remove();
      resolve(b.dataset.op);
    }));
  });
}

/** Aplica el estado combinado en este equipo y deja lista la subida. */
async function aplicarCombinado(estado, remoto) {
  await applyFullState(Object.assign({}, estado, { PARALELA_CIFRADA: remoto.data ? remoto.data.PARALELA_CIFRADA : undefined }));
  state.SYNC.revision = remoto.revision;
  state.SYNC.lastSyncedAt = remoto.updatedAt;
  state.SYNC.lastUpdatedBy = remoto.updatedBy;
  state.CAMBIOS_SIN_SINCRONIZAR = true; // la combinación aún hay que subirla
}

function textoResumen(resumen, por) {
  const partes = [];
  if (resumen.nuevosRemotos + resumen.cambiadosRemotos + resumen.eliminadosRemotos > 0) {
    partes.push(`${resumen.nuevosRemotos + resumen.cambiadosRemotos + resumen.eliminadosRemotos} de ${por || 'otro equipo'}`);
  }
  if (resumen.nuevosLocales + resumen.cambiadosLocales + resumen.eliminadosLocales > 0) {
    partes.push(`${resumen.nuevosLocales + resumen.cambiadosLocales + resumen.eliminadosLocales} suyos`);
  }
  let t = `Se combinaron los cambios${partes.length ? ' (' + partes.join(' y ') + ')' : ''}.`;
  if (resumen.conflictos.length) t += ` ${resumen.conflictos.length} dato(s) coincidían: se mantuvo su versión.`;
  if (resumen.duplicadosQuitados) t += ` ${resumen.duplicadosQuitados} duplicado(s) quitado(s).`;
  return t;
}

/** Combina lo local con lo que hay en la nube y lo sube. true si quedó sincronizado. */
async function combinarYSubir(remoto) {
  registrarCopia('Copia de la nube antes de combinar', remoto.data);
  let actual = remoto;
  for (let intento = 0; intento < 3; intento++) {
    const { estado, resumen } = combinarEstado(state.SYNC_BASE, collectFullState(), actual.data);
    await aplicarCombinado(estado, actual);
    const r = await syncPush(etiqueta);
    if (r && r.ok) {
      if (alActualizarVista) alActualizarVista();
      toast(textoResumen(resumen, actual.updatedBy), resumen.conflictos.length ? 'info' : 'success', 6000);
      return true;
    }
    if (r && r.conflicto) { actual = r.remoto; continue; } // alguien guardó otra vez: se reintenta
    if (alActualizarVista) alActualizarVista();
    return false; // sin conexión: quedó combinado en este equipo, se sube cuando vuelva
  }
  return false;
}

async function manejarConflicto(remoto) {
  if (dialogoAbierto) return;
  dialogoAbierto = true;
  try {
    if (remoto && remoto.data) {
      const listo = await combinarYSubir(remoto);
      if (listo || state.SYNC.status === 'error') return;
    }
    const op = await elegir(remoto || {});
    if (op === 'nube') {
      registrarCopia('Copia de mis cambios antes de traer lo de la nube', collectFullState());
      await applyFullState(remoto.data);
      state.SYNC.revision = remoto.revision;
      state.SYNC.lastSyncedAt = remoto.updatedAt;
      state.SYNC.lastUpdatedBy = remoto.updatedBy;
      state.SYNC.conflicto = null;
      state.CAMBIOS_SIN_SINCRONIZAR = false;
      state.SYNC.status = 'ok';
      state.APPLYING_REMOTE = true;
      try { await persistAll(); } finally { state.APPLYING_REMOTE = false; }
      if (alActualizarVista) alActualizarVista();
      toast('Se trajo lo de la nube. Sus cambios anteriores quedaron en Configuración → Historial.', 'success', 6000);
    } else if (op === 'mio') {
      registrarCopia('Copia de la nube antes de subir mis cambios', remoto.data);
      state.SYNC.revision = remoto.revision;
      state.SYNC.conflicto = null;
      await persistAll();
      const r = await syncPush(etiqueta);
      if (r && r.ok) toast('Sus cambios se subieron a la nube.', 'success');
      else if (r && r.conflicto) toast('La nube volvió a cambiar. Intente de nuevo.', 'error');
    } else {
      state.SYNC.conflicto = { revision: remoto.revision, por: remoto.updatedBy || '' };
      toast('Queda pendiente: toque el indicador de la nube (arriba) cuando decida.', 'info', 5000);
    }
  } finally {
    dialogoAbierto = false;
    etiqueta();
  }
}

/** Indicador de la nube (o "Sincronizar ahora"): sincroniza en ambos sentidos (combina si hay cambios propios). */
export async function sincronizarManual() {
  if (ocupado) return { ocupado: true };
  ocupado = true;
  try {
    state.SYNC.conflicto = null;
    if (state.CAMBIOS_SIN_SINCRONIZAR) {
      const r = await syncPush(etiqueta);
      if (r && r.conflicto) await manejarConflicto(r.remoto);
      return r || {};
    }
    const r = await syncPull(false, etiqueta);
    if (r && r.aplicado && alActualizarVista) alActualizarVista();
    return r || {};
  } finally {
    ocupado = false;
    etiqueta();
  }
}

/** Si un guardado manual chocó, se combina (y si no se puede, se pregunta). */
export async function resolverConflicto(remoto) {
  state.SYNC.conflicto = null;
  await manejarConflicto(remoto);
}

/* ---------- Arranque ---------- */
export function iniciarAutoSync({ alActualizar }) {
  alActualizarVista = alActualizar;
  alHaberCambios(programarSubida);
  setInterval(revisarNube, INTERVALO_REVISION_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarNube(); });
  window.addEventListener('focus', revisarNube);
  window.addEventListener('online', () => { revisarNube(); if (state.CAMBIOS_SIN_SINCRONIZAR) programarSubida(); });
  // Al arrancar: si quedaron cambios de la sesión anterior, se suben.
  setTimeout(() => { if (state.CAMBIOS_SIN_SINCRONIZAR) programarSubida(); else revisarNube(); }, 6000);
}
