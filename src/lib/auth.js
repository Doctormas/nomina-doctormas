// Usuarios, claves y permisos por tipo de usuario.
//
// - Cada usuario tiene un "tipo" (rol). El tipo define qué módulos de la barra
//   lateral puede ver. El tipo "Master" ve todo y es el único que administra
//   usuarios y tipos (Configuración → Usuarios).
// - Las claves se guardan con sal + PBKDF2-SHA256, nunca en claro.
// - Es control de acceso de la interfaz: protege contra el uso casual de la
//   app, no contra alguien con acceso al archivo de datos del computador.
import { state } from '../state/store.js';

// Módulos de la barra lateral que se pueden conceder o quitar a un tipo.
export const MODULOS_SISTEMA = [
  { id: 'dashboard', label: 'Resumen' },
  { id: 'empleados', label: 'Empleados' },
  { id: 'nomina', label: 'Nómina' },
  { id: 'parafiscales', label: 'Parafiscales' },
  { id: 'vacaciones', label: 'Vacaciones' },
  { id: 'prestaciones', label: 'Prestaciones sociales' },
  { id: 'liquidacion', label: 'Liquidación' },
  { id: 'paralela', label: 'Nómina paralela', detalle: 'Confidencial' },
  { id: 'config', label: 'Configuración', detalle: 'Tasas, nube, parámetros, historial' }
];

export const ROL_MASTER = 'master';

/* ---------- Claves ---------- */
const enHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

// SHA-256(sal|texto) — lo usa el PIN de la nómina paralela.
export async function hashPin(pin, salt) {
  const texto = salt + '|' + pin;
  try {
    if (window.crypto && window.crypto.subtle) {
      return enHex(await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
    }
  } catch (e) { /* cae al respaldo */ }
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  return 'x' + h.toString(16);
}

// PBKDF2-SHA256 (120.000 vueltas) para las claves de usuario.
export async function hashClave(clave, salt) {
  try {
    if (window.crypto && window.crypto.subtle) {
      const enc = new TextEncoder();
      const key = await window.crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
      const bits = await window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
      return enHex(bits);
    }
  } catch (e) { /* cae al respaldo */ }
  return hashPin(clave, salt);
}

export function saltAleatoria() {
  const a = new Uint8Array(16);
  (window.crypto || { getRandomValues: (x) => x.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(a);
  return enHex(a);
}

// Código de recuperación del master (se muestra una sola vez al crearlo).
export function codigoRecuperacion() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(16);
  window.crypto.getRandomValues(a);
  const s = Array.from(a).map((b) => alfabeto[b % alfabeto.length]).join('');
  return s.match(/.{4}/g).join('-');
}

/* ---------- Permisos ---------- */
export function usuarioActual() {
  return state.SESION || null;
}

export function esMaster(u) {
  u = u || state.SESION;
  return !!u && u.rolId === ROL_MASTER;
}

export function nombreDeRol(rolId) {
  if (rolId === ROL_MASTER) return 'Master';
  const r = (state.ROLES || []).find((x) => x.id === rolId);
  return r ? r.nombre : '(tipo eliminado)';
}

export function puedeVer(moduloId, u) {
  u = u || state.SESION;
  if (!u) return false;
  if (u.rolId === ROL_MASTER) return true;
  const r = (state.ROLES || []).find((x) => x.id === u.rolId);
  return !!(r && r.modulos.includes(moduloId));
}
