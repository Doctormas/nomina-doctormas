// Pantalla de acceso a pantalla completa: crear el usuario master (primera
// vez), iniciar sesión, o recuperar la clave del master con su código.
import { state, persistAll } from '../state/store.js';
import { hashClave, saltAleatoria, codigoRecuperacion, ROL_MASTER } from '../lib/auth.js';
import { uid } from '../lib/formato.js';

const esc = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MIN_CLAVE = 6;
let intentosFallidos = 0;
let bloqueadoHasta = 0;

function marco(contenido) {
  const el = document.createElement('div');
  el.className = 'login-overlay';
  el.innerHTML = `<div class="login-card">
    <img class="login-logo" src="assets/img/logo-doctormas-wordmark-white.png" alt="Doctormás">
    <div class="login-body">${contenido}</div>
  </div>`;
  document.body.appendChild(el);
  return el;
}

function msg(el, texto) {
  const m = el.querySelector('.login-msg');
  if (m) { m.textContent = texto || ''; m.style.display = texto ? '' : 'none'; }
}

/** Resuelve cuando hay una sesión iniciada (state.SESION). */
export function pedirAcceso() {
  return new Promise((resolve) => {
    const entrar = (u) => {
      state.SESION = { id: u.id, usuario: u.usuario, nombre: u.nombre, rolId: u.rolId };
      intentosFallidos = 0;
      document.querySelectorAll('.login-overlay').forEach((x) => x.remove());
      resolve();
    };
    if (!state.USUARIOS.length) crearMaster(entrar);
    else iniciarSesion(entrar);
  });
}

/* ---------- Primera vez: crear al master ---------- */
function crearMaster(entrar) {
  const el = marco(`
    <h2>Crear usuario master</h2>
    <p class="login-desc">Aún no hay usuarios. El usuario <b>master</b> administra a los demás y define qué módulos ve cada tipo de usuario (Configuración → Usuarios).</p>
    <div class="field"><label>Nombre completo</label><input type="text" id="lgNombre" autocomplete="off"></div>
    <div class="field"><label>Usuario</label><input type="text" id="lgUsuario" autocomplete="off" autocapitalize="off"></div>
    <div class="field"><label>Clave (mínimo ${MIN_CLAVE} caracteres)</label><input type="password" id="lgClave" autocomplete="off"></div>
    <div class="field"><label>Repetir clave</label><input type="password" id="lgClave2" autocomplete="off"></div>
    <div class="login-msg" style="display:none;"></div>
    <button class="btn" id="lgCrear" style="width:100%;margin-top:12px;">Crear y continuar</button>`);
  const q = (s) => el.querySelector(s);
  q('#lgNombre').focus();
  const crear = async () => {
    const nombre = q('#lgNombre').value.trim();
    const usuario = q('#lgUsuario').value.trim().toLowerCase();
    const c1 = q('#lgClave').value; const c2 = q('#lgClave2').value;
    if (!nombre || !usuario) return msg(el, 'Escriba el nombre y el usuario.');
    if (c1.length < MIN_CLAVE) return msg(el, `La clave debe tener al menos ${MIN_CLAVE} caracteres.`);
    if (c1 !== c2) return msg(el, 'Las claves no coinciden.');
    q('#lgCrear').disabled = true;
    const salt = saltAleatoria();
    const recSalt = saltAleatoria();
    const codigo = codigoRecuperacion();
    const u = {
      id: uid(), usuario, nombre, rolId: ROL_MASTER, activo: true,
      salt, hash: await hashClave(c1, salt),
      recSalt, recHash: await hashClave(codigo, recSalt),
      creado: new Date().toISOString()
    };
    state.USUARIOS.push(u);
    await persistAll('Usuarios: se creó el usuario master ' + usuario);
    mostrarCodigo(el, codigo, () => entrar(u));
  };
  q('#lgCrear').addEventListener('click', crear);
  q('#lgClave2').addEventListener('keydown', (e) => { if (e.key === 'Enter') crear(); });
}

function mostrarCodigo(el, codigo, continuar) {
  el.querySelector('.login-body').innerHTML = `
    <h2>Código de recuperación</h2>
    <p class="login-desc">Anótelo y guárdelo en un lugar seguro. Es la <b>única</b> forma de recuperar la clave del master si la olvida, y no se vuelve a mostrar.</p>
    <div class="login-codigo">${esc(codigo)}</div>
    <label style="display:flex;gap:8px;align-items:center;font-size:.85rem;margin-top:14px;"><input type="checkbox" id="lgAnote"> Ya lo anoté</label>
    <button class="btn" id="lgSeguir" style="width:100%;margin-top:12px;" disabled>Continuar</button>`;
  const chk = el.querySelector('#lgAnote');
  const btn = el.querySelector('#lgSeguir');
  chk.addEventListener('change', () => { btn.disabled = !chk.checked; });
  btn.addEventListener('click', continuar);
}

/* ---------- Iniciar sesión ---------- */
function iniciarSesion(entrar) {
  const el = marco(`
    <h2>Iniciar sesión</h2>
    <div class="field"><label>Usuario</label><input type="text" id="lgUsuario" autocomplete="off" autocapitalize="off"></div>
    <div class="field"><label>Clave</label><input type="password" id="lgClave" autocomplete="off"></div>
    <div class="login-msg" style="display:none;"></div>
    <button class="btn" id="lgEntrar" style="width:100%;margin-top:12px;">Entrar</button>
    <div style="text-align:center;margin-top:12px;"><a href="#" id="lgOlvido" class="login-link">Olvidé mi clave (master)</a></div>`);
  const q = (s) => el.querySelector(s);
  q('#lgUsuario').focus();

  const ingresar = async () => {
    const ahora = Date.now();
    if (ahora < bloqueadoHasta) return msg(el, `Demasiados intentos. Espere ${Math.ceil((bloqueadoHasta - ahora) / 1000)} s.`);
    const usuario = q('#lgUsuario').value.trim().toLowerCase();
    const clave = q('#lgClave').value;
    const u = state.USUARIOS.find((x) => x.usuario === usuario);
    // Se calcula el hash aunque el usuario no exista (mismo tiempo de respuesta).
    const h = await hashClave(clave, u ? u.salt : 'x');
    if (!u || h !== u.hash) {
      intentosFallidos += 1;
      if (intentosFallidos >= 5) { bloqueadoHasta = Date.now() + 30000; intentosFallidos = 0; }
      q('#lgClave').value = '';
      return msg(el, 'Usuario o clave incorrectos.');
    }
    if (u.activo === false) return msg(el, 'Este usuario está desactivado. Consulte al master.');
    entrar(u);
  };
  q('#lgEntrar').addEventListener('click', ingresar);
  q('#lgClave').addEventListener('keydown', (e) => { if (e.key === 'Enter') ingresar(); });

  q('#lgOlvido').addEventListener('click', (e) => { e.preventDefault(); recuperar(el, entrar); });
}

function recuperar(el, entrar) {
  el.querySelector('.login-body').innerHTML = `
    <h2>Recuperar clave del master</h2>
    <p class="login-desc">Escriba el código de recuperación que se le mostró al crear el usuario master y elija una clave nueva.</p>
    <div class="field"><label>Usuario master</label><input type="text" id="rcUsuario" autocomplete="off" autocapitalize="off"></div>
    <div class="field"><label>Código de recuperación</label><input type="text" id="rcCodigo" autocomplete="off" placeholder="XXXX-XXXX-XXXX-XXXX"></div>
    <div class="field"><label>Clave nueva (mínimo ${MIN_CLAVE})</label><input type="password" id="rcClave" autocomplete="off"></div>
    <div class="login-msg" style="display:none;"></div>
    <button class="btn" id="rcOk" style="width:100%;margin-top:12px;">Cambiar clave</button>
    <div style="text-align:center;margin-top:12px;"><a href="#" id="rcVolver" class="login-link">Volver</a></div>`;
  const q = (s) => el.querySelector(s);
  q('#rcVolver').addEventListener('click', (e) => {
    e.preventDefault();
    el.remove();
    iniciarSesion(entrar);
  });
  q('#rcOk').addEventListener('click', async () => {
    const usuario = q('#rcUsuario').value.trim().toLowerCase();
    const codigo = q('#rcCodigo').value.trim().toUpperCase();
    const nueva = q('#rcClave').value;
    const u = state.USUARIOS.find((x) => x.usuario === usuario && x.rolId === ROL_MASTER);
    if (nueva.length < MIN_CLAVE) return msg(el, `La clave debe tener al menos ${MIN_CLAVE} caracteres.`);
    if (!u || !u.recHash || (await hashClave(codigo, u.recSalt)) !== u.recHash) return msg(el, 'Usuario master o código incorrectos.');
    u.salt = saltAleatoria();
    u.hash = await hashClave(nueva, u.salt);
    await persistAll();
    el.remove();
    iniciarSesion(entrar);
  });
}
