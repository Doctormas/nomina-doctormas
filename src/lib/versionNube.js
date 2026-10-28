// La nube puede exigir una versión mínima de la app (para que una versión vieja no
// pise los datos de los demás). Cada petición declara la versión de esta app, y si
// el servidor responde 426 se avisa con un cuadro para actualizar.
let versionCache = null;

async function versionApp() {
  if (versionCache) return versionCache;
  try { versionCache = await window.api.app.getVersion(); } catch (e) { versionCache = ''; }
  return versionCache;
}

/** Cabeceras para hablar con la nube: PIN + versión de la app. */
export async function cabecerasNube(pin, extra) {
  return Object.assign({ 'X-Access-Pin': pin, 'X-App-Version': await versionApp() }, extra || {});
}

let ultimoAviso = 0;

function mostrarAvisoActualizar(mensaje, minima) {
  if (Date.now() - ultimoAviso < 10 * 60 * 1000 || document.querySelector('.aviso-actualizar')) return;
  ultimoAviso = Date.now();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay aviso-actualizar';
  overlay.innerHTML = `
    <div class="modal modal-confirm" style="max-width:480px;">
      <h3>Debe actualizar la app</h3>
      <p class="confirm-message">${mensaje || 'Esta versión de la app es antigua y ya no puede sincronizar con la nube.'}${minima ? `<br><br>Versión mínima: <b>${minima}</b> · la suya: <b>${versionCache || '—'}</b>` : ''}</p>
      <p class="legal">Sus datos de este equipo están a salvo. Hasta que actualice, la nube no se modificará desde aquí.</p>
      <div class="btn-row" style="margin-top:14px;">
        <button class="btn" data-op="buscar">Buscar actualización</button>
        <button class="btn ghost" data-op="cerrar">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-op="cerrar"]').addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-op="buscar"]').addEventListener('click', () => {
    try { window.api.updater.check(); } catch (e) { /* sin actualizador en este modo */ }
    overlay.remove();
  });
}

/** Si la respuesta es 426 (versión antigua) avisa y lanza un error; si no, no hace nada. */
export async function revisarVersionExigida(res) {
  if (res.status !== 426) return;
  let j = {};
  try { j = await res.json(); } catch (e) { /* sin cuerpo */ }
  mostrarAvisoActualizar(j.mensaje, j.minima);
  throw new Error('Versión antigua: actualice la app');
}
