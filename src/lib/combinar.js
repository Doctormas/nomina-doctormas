// Combinación de dos copias del estado de la app (la de este equipo y la de la
// nube) sin perder ningún cambio, REGISTRO POR REGISTRO.
//
// Se usa una combinación de tres vías: además de lo local y lo remoto se
// conoce la BASE (cómo estaba todo la última vez que este equipo sincronizó).
// Con la base se sabe quién cambió qué:
//   - lo que cambió solo en un lado, se toma de ese lado;
//   - lo que solo uno eliminó, se elimina (si el otro no lo tocó);
//   - lo que ambos agregaron, se suman;
//   - un mismo campo cambiado por los dos a la vez es el único choque real:
//     se conserva el valor de este equipo y se deja constancia.
//
// Funciones puras (no tocan el estado): sencillas de probar.

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function iguales(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!iguales(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!iguales(a[k], b[k])) return false;
  return true;
}

// Cómo se identifica cada registro de una lista. Las tasas no tienen id: su
// identidad es la fecha (y la fuente).
const CLAVES_ESPECIALES = {
  HISTORICO_TASAS: (r) => `${r.fecha}|${r.fuente || ''}`
};

function clavePor(nombre) {
  return CLAVES_ESPECIALES[nombre] || ((r) => r.id);
}

const listaConClave = (arr, kf) => Array.isArray(arr) && arr.every((r) => esObjeto(r) && kf(r) !== undefined && kf(r) !== null);

function mapa(arr, kf) {
  const m = new Map();
  (arr || []).forEach((r) => m.set(String(kf(r)), r));
  return m;
}

/** Combinación de valores arbitrarios (objetos, listas con id, escalares). */
function fusionar(b, l, r, ruta, info, kf) {
  if (iguales(l, r)) return l;
  if (b !== undefined && iguales(l, b)) return r;      // solo cambió el remoto
  if (b !== undefined && iguales(r, b)) return l;      // solo cambió el local
  if (esObjeto(l) && esObjeto(r)) {
    const base = esObjeto(b) ? b : {};
    const out = {};
    const claves = new Set([...Object.keys(r), ...Object.keys(l)]);
    claves.forEach((k) => {
      const v = fusionar(base[k], l[k], r[k], `${ruta}.${k}`, info);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }
  const fn = kf || ((x) => x.id);
  if (Array.isArray(l) && Array.isArray(r) && listaConClave(l, fn) && listaConClave(r, fn) && (b === undefined || listaConClave(b, fn))) {
    return fusionarLista(b || [], l, r, ruta, info, fn);
  }
  // Dos cambios distintos sobre el mismo valor: se queda el de este equipo.
  if (l === undefined) return r;
  if (r === undefined) return l;
  info.conflictos.push(ruta);
  return l;
}

/** Combinación de una lista de registros con identificador. */
function fusionarLista(B, L, R, ruta, info, kf) {
  const mb = mapa(B, kf); const ml = mapa(L, kf); const mr = mapa(R, kf);
  const orden = [];
  const visto = new Set();
  [R, L, B].forEach((lista) => (lista || []).forEach((x) => {
    const id = String(kf(x));
    if (!visto.has(id)) { visto.add(id); orden.push(id); }
  }));

  const out = [];
  orden.forEach((id) => {
    const b = mb.get(id); const l = ml.get(id); const r = mr.get(id);
    let res;
    if (b === undefined) {
      // Nuevo: lo agregó uno o ambos.
      if (l !== undefined && r !== undefined) res = iguales(l, r) ? l : fusionar(undefined, l, r, `${ruta}[${id}]`, info);
      else { res = l !== undefined ? l : r; if (l !== undefined) info.nuevosLocales++; else info.nuevosRemotos++; }
    } else {
      const cambioL = l === undefined || !iguales(l, b);
      const cambioR = r === undefined || !iguales(r, b);
      if (!cambioL && !cambioR) res = b;
      else if (!cambioL) { res = r; if (r === undefined) info.eliminadosRemotos++; else info.cambiadosRemotos++; }
      else if (!cambioR) { res = l; if (l === undefined) info.eliminadosLocales++; else info.cambiadosLocales++; }
      else if (l === undefined && r === undefined) res = undefined;
      else if (l === undefined) { res = r; info.conservados++; }      // yo lo eliminé, el otro lo modificó: se conserva
      else if (r === undefined) { res = l; info.conservados++; }      // el otro lo eliminó, yo lo modifiqué: se conserva
      else res = fusionar(b, l, r, `${ruta}[${id}]`, info);
    }
    if (res !== undefined) out.push(res);
  });
  return out;
}

const COLECCIONES_LISTA = [
  'EMPLEADOS', 'PERIODOS', 'VAC_DISFRUTE', 'PERMISOS_REMUNERADOS', 'UTILIDADES_PAGADAS', 'LIQUIDACIONES',
  'HISTORICO_TASAS', 'BONO_VAC_PAGADO', 'BONO_ALIM_PAGADO', 'HISTORIAL_CAMBIOS', 'USUARIOS', 'ROLES'
];

const MAX_HISTORIAL = 300;

/**
 * Combina local y remoto. `base` puede ser null (primera vez): entonces es una
 * unión simple donde, ante diferencia, gana lo local.
 * Devuelve { estado, resumen }.
 */
export function combinarEstado(base, local, remoto) {
  const info = { nuevosLocales: 0, nuevosRemotos: 0, cambiadosLocales: 0, cambiadosRemotos: 0, eliminadosLocales: 0, eliminadosRemotos: 0, conservados: 0, conflictos: [] };
  const b = base || {};
  const estado = {};

  const claves = new Set([...Object.keys(local || {}), ...Object.keys(remoto || {})]);
  claves.forEach((k) => {
    const lv = local ? local[k] : undefined;
    const rv = remoto ? remoto[k] : undefined;
    const bv = b[k];
    if (k === 'PARALELA_CIFRADA') { estado[k] = rv !== undefined ? rv : lv; return; } // se combina aparte (cifrada)
    if (k === 'PROXIMO_NUMERO_RECIBO') { estado[k] = Math.max(Number(lv) || 1, Number(rv) || 1); return; }
    if (COLECCIONES_LISTA.includes(k)) {
      const kf = clavePor(k);
      if (listaConClave(lv || [], kf) && listaConClave(rv || [], kf)) {
        // El historial y las tasas se unen, pero no cuentan como "cambios" para el resumen.
        const infoK = (k === 'HISTORIAL_CAMBIOS' || k === 'HISTORICO_TASAS')
          ? { nuevosLocales: 0, nuevosRemotos: 0, cambiadosLocales: 0, cambiadosRemotos: 0, eliminadosLocales: 0, eliminadosRemotos: 0, conservados: 0, conflictos: [] }
          : info;
        estado[k] = fusionarLista(Array.isArray(bv) && listaConClave(bv, kf) ? bv : [], lv || [], rv || [], k, infoK, kf);
      } else {
        estado[k] = lv !== undefined ? lv : rv;
      }
      return;
    }
    const v = fusionar(bv, lv, rv, k, info);
    if (v !== undefined) estado[k] = v;
  });

  // El historial de cambios es solo de lectura: más nuevo primero y con tope.
  if (Array.isArray(estado.HISTORIAL_CAMBIOS)) {
    estado.HISTORIAL_CAMBIOS.sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0));
    if (estado.HISTORIAL_CAMBIOS.length > MAX_HISTORIAL) estado.HISTORIAL_CAMBIOS.length = MAX_HISTORIAL;
  }

  saneoDeNumeracion(estado, info);
  return { estado, resumen: info };
}

/**
 * Dos equipos pudieron generar a la vez la MISMA nómina (duplicada) o tomar el
 * mismo N° de recibo. Se quitan los duplicados exactos de nómina y se
 * renumeran los recibos repetidos, para que cada N° sea único.
 */
function saneoDeNumeracion(estado, info) {
  const colecciones = [
    ['PERIODOS', (r) => `${r.empId}|${r.tipoPeriodo}|${r.fecha}`],
    ['UTILIDADES_PAGADAS', (r) => `${r.empId}|${r.ano}`],
    ['BONO_VAC_PAGADO', (r) => `${r.empId}|${r.anoServicio}`],
    ['BONO_ALIM_PAGADO', (r) => `${r.empId}|${String(r.fecha).slice(0, 7)}`]
  ];
  colecciones.forEach(([nombre, claveNegocio]) => {
    const lista = estado[nombre];
    if (!Array.isArray(lista)) return;
    const vistos = new Set();
    estado[nombre] = lista.filter((r) => {
      const c = claveNegocio(r);
      if (vistos.has(c)) { info.duplicadosQuitados = (info.duplicadosQuitados || 0) + 1; return false; }
      vistos.add(c);
      return true;
    });
  });

  const usados = new Set();
  let max = Number(estado.PROXIMO_NUMERO_RECIBO) || 1;
  ['PERIODOS', 'UTILIDADES_PAGADAS', 'BONO_VAC_PAGADO', 'BONO_ALIM_PAGADO'].forEach((nombre) => {
    (estado[nombre] || []).forEach((r) => {
      if (r.numeroRecibo === undefined || r.numeroRecibo === null) return;
      const n = String(r.numeroRecibo);
      if (usados.has(n)) {
        r.numeroRecibo = String(max);
        max += 1;
        info.recibosRenumerados = (info.recibosRenumerados || 0) + 1;
      }
      usados.add(String(r.numeroRecibo));
    });
  });
  estado.PROXIMO_NUMERO_RECIBO = Math.max(max, Number(estado.PROXIMO_NUMERO_RECIBO) || 1);
}
