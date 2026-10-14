// Cifrado y combinación de la nómina paralela para sincronizarla con la nube.
//
// La nómina paralela es confidencial, así que NO viaja en claro: se cifra en
// este equipo con AES-256-GCM, usando una clave derivada (PBKDF2) de una
// "clave de la nómina paralela" que el master define y que cada equipo guarda
// localmente. La nube solo ve texto cifrado.
//
// Funciones puras (no tocan el estado): las usa el store y la sincronización.

const enc = new TextEncoder();
const dec = new TextDecoder();

function aBase64(bytes) {
  let bin = '';
  const u8 = new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
function deBase64(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function derivarClave(clave, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

const MARCA = 'nomina-paralela-v1';

/** Cifra el objeto de la paralela. Devuelve { v, salt, iv, ct } (todo en base64). */
export async function cifrarParalela(paralela, clave) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivarClave(clave, salt);
  const texto = JSON.stringify({ marca: MARCA, datos: paralela });
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(texto));
  return { v: 1, salt: aBase64(salt), iv: aBase64(iv), ct: aBase64(ct), actualizado: new Date().toISOString() };
}

/** Descifra. Lanza Error('CLAVE') si la clave no corresponde. */
export async function descifrarParalela(blob, clave) {
  try {
    const key = await derivarClave(clave, deBase64(blob.salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64(blob.iv) }, key, deBase64(blob.ct));
    const obj = JSON.parse(dec.decode(pt));
    if (!obj || obj.marca !== MARCA) throw new Error('formato');
    return obj.datos;
  } catch (e) {
    throw new Error('CLAVE');
  }
}

/**
 * Combina dos copias de la nómina paralela (la de este equipo y la de la nube)
 * sin perder nada:
 *  - pagos: unión por id; un pago eliminado en cualquiera de las dos se quita.
 *  - personas y bonos: gana el registro modificado más recientemente (`mod`).
 */
export function combinarParalela(local, remoto) {
  local = local || {}; remoto = remoto || {};
  const eliminados = new Set([...(local.eliminados || []), ...(remoto.eliminados || [])]);

  const pagos = new Map((local.pagos || []).map((p) => [p.id, p]));
  (remoto.pagos || []).forEach((p) => { if (!pagos.has(p.id)) pagos.set(p.id, p); });
  const listaPagos = Array.from(pagos.values()).filter((p) => !eliminados.has(p.id));
  // Dos equipos pudieron crear "el pago N° 20" a la vez: se renumera el repetido.
  const usados = new Set();
  let max = listaPagos.reduce((a, p) => Math.max(a, p.numero || 0), 0);
  listaPagos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.numero || 0) - (b.numero || 0)));
  listaPagos.forEach((p) => {
    if (usados.has(p.numero)) { max += 1; p.numero = max; }
    usados.add(p.numero);
  });

  const personas = new Map((local.personas || []).map((x) => [x.id, x]));
  (remoto.personas || []).forEach((x) => {
    const l = personas.get(x.id);
    if (!l || (x.mod || '') > (l.mod || '')) personas.set(x.id, x);
  });

  const bonos = Object.assign({}, local.bonos || {});
  Object.entries(remoto.bonos || {}).forEach(([k, v]) => {
    const l = bonos[k];
    if (!l || (v.mod || '') > (l.mod || '')) bonos[k] = v;
  });

  return Object.assign({}, local, {
    pagos: listaPagos,
    personas: Array.from(personas.values()).filter((x) => !eliminados.has(x.id)),
    bonos,
    eliminados: Array.from(eliminados)
  });
}
