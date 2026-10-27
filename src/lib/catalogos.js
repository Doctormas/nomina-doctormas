// Listas estándar de Áreas y Cargos: se eligen de una lista plegable en vez de
// escribirse a mano, para que no existan "RECEPCIÓN", "Recepcion" y "RECEPCIONISTA"
// como si fueran tres cosas distintas. Se administran en Configuración → Áreas y cargos.
import { state, claveCatalogo, asegurarCatalogos } from '../state/store.js';

export const TIPOS_CATALOGO = {
  cargos: { titulo: 'Cargos', campo: 'cargo', singular: 'cargo' },
  areas: { titulo: 'Áreas', campo: 'departamento', singular: 'área' }
};

const limpiar = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('es');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function listaCatalogo(tipo) {
  asegurarCatalogos();
  return state.CONFIG[tipo];
}

/** El nombre oficial de un valor (si ya está en la lista, con su escritura estándar), o null. */
export function canonico(tipo, valor) {
  const k = claveCatalogo(valor);
  if (!k) return null;
  return listaCatalogo(tipo).find((x) => claveCatalogo(x) === k) || null;
}

/** Agrega a la lista (si no estaba) y devuelve el nombre estándar. '' si el texto está vacío. */
export function agregarACatalogo(tipo, valor) {
  const v = limpiar(valor);
  if (!v) return '';
  const ya = canonico(tipo, v);
  if (ya) return ya;
  const lista = listaCatalogo(tipo);
  lista.push(v);
  lista.sort((a, b) => a.localeCompare(b, 'es'));
  return v;
}

export function usosCatalogo(tipo, valor) {
  const campo = TIPOS_CATALOGO[tipo].campo;
  const k = claveCatalogo(valor);
  return state.EMPLEADOS.filter((e) => claveCatalogo(e[campo]) === k);
}

/** Cambia el nombre en la lista y en todas las fichas que lo usan. Si el nuevo ya existe, los une. */
export function renombrarCatalogo(tipo, actual, nuevo) {
  const n = limpiar(nuevo);
  if (!n) return { ok: false, motivo: 'El nombre no puede quedar vacío.' };
  const campo = TIPOS_CATALOGO[tipo].campo;
  const lista = listaCatalogo(tipo);
  const kActual = claveCatalogo(actual);
  const destino = canonico(tipo, n);
  const fusion = !!destino && claveCatalogo(destino) !== kActual;
  const nombreFinal = destino || n;
  let afectados = 0;
  state.EMPLEADOS.forEach((e) => { if (claveCatalogo(e[campo]) === kActual) { e[campo] = nombreFinal; afectados++; } });
  state.CONFIG[tipo] = lista.filter((x) => claveCatalogo(x) !== kActual);
  if (!canonico(tipo, nombreFinal)) state.CONFIG[tipo].push(nombreFinal);
  state.CONFIG[tipo].sort((a, b) => a.localeCompare(b, 'es'));
  return { ok: true, afectados, fusion, nombreFinal };
}

export function eliminarDeCatalogo(tipo, valor) {
  if (usosCatalogo(tipo, valor).length) return false;
  const k = claveCatalogo(valor);
  state.CONFIG[tipo] = listaCatalogo(tipo).filter((x) => claveCatalogo(x) !== k);
  return true;
}

/* ---------- Lista plegable para las fichas ---------- */
const NUEVO = '__nuevo__';

/**
 * <select> con la lista estándar + "Agregar nuevo…". Si la ficha trae un valor que aún no
 * está en la lista (dato antiguo), se muestra igual, marcado, para no perderlo.
 */
export function selectorCatalogoHTML(tipo, name, valor) {
  const lista = listaCatalogo(tipo);
  const actual = String(valor || '').trim();
  const fuera = actual && !canonico(tipo, actual);
  const sel = canonico(tipo, actual) || (fuera ? actual : '');
  return `
    <div class="catalogo-campo" data-catalogo="${tipo}">
      <select name="${name}">
        <option value="">— sin especificar —</option>
        ${fuera ? `<option value="${esc(actual)}" selected>${esc(actual)} (no está en la lista)</option>` : ''}
        ${lista.map((x) => `<option value="${esc(x)}" ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('')}
        <option value="${NUEVO}">➕ Agregar nuevo…</option>
      </select>
      <div class="catalogo-nuevo" hidden>
        <input type="text" placeholder="Nombre del nuevo ${TIPOS_CATALOGO[tipo].singular}" maxlength="60">
        <button type="button" class="btn small" data-cat-ok>Agregar</button>
        <button type="button" class="btn ghost small" data-cat-cancelar>Cancelar</button>
      </div>
    </div>`;
}

export function wireSelectoresCatalogo(root) {
  root.querySelectorAll('.catalogo-campo').forEach((caja) => {
    const tipo = caja.dataset.catalogo;
    const select = caja.querySelector('select');
    const panel = caja.querySelector('.catalogo-nuevo');
    const input = panel.querySelector('input');
    let previo = select.value;
    const cerrar = () => { panel.hidden = true; select.value = previo; };
    const aceptar = () => {
      const nombre = agregarACatalogo(tipo, input.value);
      if (!nombre) { cerrar(); return; }
      if (![...select.options].some((o) => o.value === nombre)) {
        const op = document.createElement('option');
        op.value = nombre; op.textContent = nombre;
        select.insertBefore(op, select.querySelector(`option[value="${NUEVO}"]`));
      }
      select.value = nombre; previo = nombre; panel.hidden = true; input.value = '';
    };
    select.addEventListener('change', () => {
      if (select.value === NUEVO) { panel.hidden = false; input.focus(); } else { previo = select.value; panel.hidden = true; }
    });
    panel.querySelector('[data-cat-ok]').addEventListener('click', aceptar);
    panel.querySelector('[data-cat-cancelar]').addEventListener('click', cerrar);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); aceptar(); } if (e.key === 'Escape') cerrar(); });
  });
}
