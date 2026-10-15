// Configuración → Usuarios (solo master): cuentas de usuario y tipos de
// usuario con los módulos que cada tipo puede ver.
import { state, persistAll } from '../state/store.js';
import { MODULOS_SISTEMA, ROL_MASTER, hashClave, saltAleatoria, nombreDeRol } from '../lib/auth.js';
import { uid } from '../lib/formato.js';
import { confirmDialog } from '../components/confirm.js';
import { toast } from '../components/toast.js';

const esc = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MIN_CLAVE = 6;
let EDITANDO = null; // id de usuario en edición, 'nuevo' o null

const mastersActivos = () => state.USUARIOS.filter((u) => u.rolId === ROL_MASTER && u.activo !== false);

export function usuariosHTML() {
  const filas = state.USUARIOS.map((u) => {
    const esYo = state.SESION && state.SESION.id === u.id;
    return `<tr>
      <td>${esc(u.nombre)}${esYo ? ' <span class="tag ok">usted</span>' : ''}</td>
      <td>${esc(u.usuario)}</td>
      <td>${esc(nombreDeRol(u.rolId))}</td>
      <td>${u.activo === false ? '<span class="tag err">Desactivado</span>' : '<span class="tag ok">Activo</span>'}</td>
      <td><div class="row-actions-inner">
        <button class="btn small ghost" data-u-edit="${u.id}">Editar</button>
        ${esYo ? '' : `<button class="btn small ghost" data-u-toggle="${u.id}">${u.activo === false ? 'Activar' : 'Desactivar'}</button>
        <button class="btn small danger ghost" data-u-del="${u.id}">Eliminar</button>`}
      </div></td>
    </tr>`;
  }).join('');

  const opcionesRol = [{ id: ROL_MASTER, nombre: 'Master (todo)' }, ...state.ROLES]
    .map((r) => `<option value="${r.id}">${esc(r.nombre)}</option>`).join('');

  const u = EDITANDO && EDITANDO !== 'nuevo' ? state.USUARIOS.find((x) => x.id === EDITANDO) : null;
  const form = EDITANDO ? `
    <div class="card" style="background:var(--cream);">
      <h2>${u ? 'Editar usuario' : 'Nuevo usuario'}</h2>
      <div class="grid cols-2">
        <div class="field"><label>Nombre completo</label><input type="text" id="usNombre" value="${esc(u ? u.nombre : '')}"></div>
        <div class="field"><label>Usuario (para entrar)</label><input type="text" id="usUsuario" value="${esc(u ? u.usuario : '')}" autocapitalize="off"></div>
        <div class="field"><label>Tipo de usuario</label><select id="usRol" data-valor="${u ? esc(u.rolId) : (state.ROLES[0] ? state.ROLES[0].id : ROL_MASTER)}">${opcionesRol}</select></div>
        <div class="field"><label>${u ? 'Clave nueva (vacío = no cambiar)' : `Clave (mínimo ${MIN_CLAVE})`}</label><input type="password" id="usClave" autocomplete="new-password"></div>
      </div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn" id="btnUsGuardar">Guardar</button>
        <button class="btn ghost" id="btnUsCancelar">Cancelar</button>
      </div>
    </div>` : '';

  const rolesHtml = state.ROLES.map((r) => `
    <div class="card" style="margin-bottom:12px;" data-rol="${r.id}">
      <div class="field" style="max-width:320px;"><label>Nombre del tipo</label><input type="text" class="rolNombre" value="${esc(r.nombre)}"></div>
      <div style="margin:10px 0 4px;font-size:.8rem;color:var(--charcoal-muted);">Módulos que puede ver:</div>
      <div class="perm-grid">
        ${MODULOS_SISTEMA.map((m) => `<label class="perm-item">
          <input type="checkbox" class="rolMod" value="${m.id}" ${r.modulos.includes(m.id) ? 'checked' : ''}>
          <span><b>${esc(m.label)}</b>${m.detalle ? `<small>${esc(m.detalle)}</small>` : ''}</span></label>`).join('')}
      </div>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn small" data-rol-guardar="${r.id}">Guardar tipo</button>
        <button class="btn small danger ghost" data-rol-borrar="${r.id}">Eliminar tipo</button>
      </div>
    </div>`).join('');

  return `
  <div class="card">
    <h2>Usuarios</h2>
    <div class="desc">Quién puede entrar a la app. Cada usuario tiene un <b>tipo</b>, y el tipo decide qué módulos ve. Solo el master (usted) administra esto. Las cuentas se comparten con el resto de los equipos al sincronizar.</div>
    <table>
      <thead><tr><th>Nombre</th><th>Usuario</th><th>Tipo</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="btn-row" style="margin-top:12px;"><button class="btn" id="btnUsNuevo">Nuevo usuario</button></div>
  </div>
  ${form}
  <div class="card">
    <h2>Tipos de usuario</h2>
    <div class="desc">Marque los módulos que cada tipo puede ver. El tipo <b>Master</b> ve todo y es el único que administra usuarios; no se puede limitar. Un cambio aquí se aplica a los usuarios de ese tipo la próxima vez que se muestre la pantalla.</div>
    ${rolesHtml}
    <div class="btn-row"><button class="btn secondary" id="btnRolNuevo">Nuevo tipo de usuario</button></div>
  </div>`;
}

export function wireUsuarios(root, rerender) {
  const q = (s) => root.querySelector(s);

  const selRol = q('#usRol');
  if (selRol) selRol.value = selRol.dataset.valor;

  q('#btnUsNuevo').addEventListener('click', () => { EDITANDO = 'nuevo'; rerender(); });
  root.querySelectorAll('[data-u-edit]').forEach((b) => b.addEventListener('click', () => { EDITANDO = b.dataset.uEdit; rerender(); }));
  const cancelar = q('#btnUsCancelar');
  if (cancelar) cancelar.addEventListener('click', () => { EDITANDO = null; rerender(); });

  const guardar = q('#btnUsGuardar');
  if (guardar) guardar.addEventListener('click', async () => {
    const nombre = q('#usNombre').value.trim();
    const usuario = q('#usUsuario').value.trim().toLowerCase();
    const rolId = q('#usRol').value;
    const clave = q('#usClave').value;
    const existente = EDITANDO !== 'nuevo' ? state.USUARIOS.find((x) => x.id === EDITANDO) : null;
    if (!nombre || !usuario) return toast('Escriba el nombre y el usuario.', 'error');
    if (state.USUARIOS.some((x) => x.usuario === usuario && x !== existente)) return toast('Ya existe un usuario con ese nombre de acceso.', 'error');
    if (!existente && clave.length < MIN_CLAVE) return toast(`La clave debe tener al menos ${MIN_CLAVE} caracteres.`, 'error');
    if (clave && clave.length < MIN_CLAVE) return toast(`La clave debe tener al menos ${MIN_CLAVE} caracteres.`, 'error');
    if (existente && existente.rolId === ROL_MASTER && rolId !== ROL_MASTER && mastersActivos().length <= 1) {
      return toast('Debe quedar al menos un usuario master activo.', 'error');
    }
    const u = existente || { id: uid(), activo: true, creado: new Date().toISOString() };
    u.nombre = nombre; u.usuario = usuario; u.rolId = rolId;
    if (clave) { u.salt = saltAleatoria(); u.hash = await hashClave(clave, u.salt); }
    if (!existente) state.USUARIOS.push(u);
    await persistAll(`Usuarios: ${existente ? 'se editó' : 'se creó'} "${usuario}" (${nombreDeRol(rolId)})`);
    toast('Usuario guardado.', 'success');
    EDITANDO = null;
    rerender();
  });

  root.querySelectorAll('[data-u-toggle]').forEach((b) => b.addEventListener('click', async () => {
    const u = state.USUARIOS.find((x) => x.id === b.dataset.uToggle);
    if (!u) return;
    if (u.activo !== false && u.rolId === ROL_MASTER && mastersActivos().length <= 1) return toast('Debe quedar al menos un usuario master activo.', 'error');
    u.activo = u.activo === false;
    await persistAll(`Usuarios: se ${u.activo ? 'activó' : 'desactivó'} "${u.usuario}"`);
    rerender();
  }));

  root.querySelectorAll('[data-u-del]').forEach((b) => b.addEventListener('click', async () => {
    const u = state.USUARIOS.find((x) => x.id === b.dataset.uDel);
    if (!u) return;
    if (u.rolId === ROL_MASTER && mastersActivos().filter((m) => m.id !== u.id).length < 1) return toast('Debe quedar al menos un usuario master activo.', 'error');
    const ok = await confirmDialog({ title: 'Eliminar usuario', message: `Se eliminará el usuario <b>${esc(u.usuario)}</b> (${esc(u.nombre)}). No se puede deshacer.`, confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    state.USUARIOS = state.USUARIOS.filter((x) => x.id !== u.id);
    await persistAll(`Usuarios: se eliminó "${u.usuario}"`);
    rerender();
  }));

  /* ---- Tipos ---- */
  q('#btnRolNuevo').addEventListener('click', async () => {
    state.ROLES.push({ id: 'rol-' + uid(), nombre: 'Nuevo tipo', modulos: ['dashboard'] });
    await persistAll('Usuarios: se creó un tipo de usuario');
    rerender();
  });
  root.querySelectorAll('[data-rol-guardar]').forEach((b) => b.addEventListener('click', async () => {
    const r = state.ROLES.find((x) => x.id === b.dataset.rolGuardar);
    const card = root.querySelector(`[data-rol="${b.dataset.rolGuardar}"]`);
    if (!r || !card) return;
    const nombre = card.querySelector('.rolNombre').value.trim();
    if (!nombre) return toast('El tipo necesita un nombre.', 'error');
    r.nombre = nombre;
    r.modulos = Array.from(card.querySelectorAll('.rolMod:checked')).map((c) => c.value);
    await persistAll(`Usuarios: se actualizó el tipo "${nombre}"`);
    toast('Tipo de usuario guardado.', 'success');
    rerender();
  }));
  root.querySelectorAll('[data-rol-borrar]').forEach((b) => b.addEventListener('click', async () => {
    const r = state.ROLES.find((x) => x.id === b.dataset.rolBorrar);
    if (!r) return;
    const enUso = state.USUARIOS.filter((u) => u.rolId === r.id).length;
    if (enUso) return toast(`Hay ${enUso} usuario(s) con este tipo; cámbieles el tipo primero.`, 'error');
    const ok = await confirmDialog({ title: 'Eliminar tipo', message: `Se eliminará el tipo <b>${esc(r.nombre)}</b>.`, confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    state.ROLES = state.ROLES.filter((x) => x.id !== r.id);
    await persistAll(`Usuarios: se eliminó el tipo "${r.nombre}"`);
    rerender();
  }));
}
