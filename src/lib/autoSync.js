// Sincronización automática con la nube.
//
//  - SUBIR: unos segundos después de cada cambio local se guarda en la nube.
//  - BAJAR: al abrir, al volver a la app y cada ~45 s se consulta (liviano) si
//    hay una revisión más nueva; si no hay cambios locales pendientes se trae.
//  - CHOQUE: si otro equipo guardó mientras usted tenía cambios sin subir, el
//    servidor lo detecta (revisión) y NADA se pisa: se le pregunta qué hacer, y
//    siempre queda una copia en Configuración → Historial para volver atrás.
import { state, syncConfigured, collectFullState, applyFullState, persistAll, alHaberCambios, registrarCopia } from '../state/store.js';
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

async function manejarConflicto(remoto) {
  if (dialogoAbierto) return;
  dialogoAbierto = true;
  try {
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
      toast('Queda pendiente: use "Cargar" o "Guardar" cuando decida.', 'info', 5000);
    }
  } finally {
    dialogoAbierto = false;
    etiqueta();
  }
}

/** Para los botones manuales: si Guardar chocó, se muestra la misma pregunta. */
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
