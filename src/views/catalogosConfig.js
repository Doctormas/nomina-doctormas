// Configuración → Áreas y cargos: administra las listas estándar que se eligen en la ficha.
import { state, persistAll } from '../state/store.js';
import { TIPOS_CATALOGO, listaCatalogo, agregarACatalogo, renombrarCatalogo, eliminarDeCatalogo, usosCatalogo } from '../lib/catalogos.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/confirm.js';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function tarjetaHTML(tipo) {
  const t = TIPOS_CATALOGO[tipo];
  const filas = listaCatalogo(tipo).map((nombre) => {
    const n = usosCatalogo(tipo, nombre).length;
    return `<tr data-cat-fila="${esc(nombre)}">
      <td class="cat-nombre">${esc(nombre)}</td>
      <td style="width:120px;color:var(--charcoal-soft);">${n} ${n === 1 ? 'persona' : 'personas'}</td>
      <td class="row-actions" style="width:90px;"><div class="row-actions-inner">
        <button type="button" class="btn ghost small icon-only" data-cat-edit="${esc(nombre)}" title="Renombrar o unir con otro">✎</button>
        <button type="button" class="btn danger ghost small icon-only" data-cat-del="${esc(nombre)}" title="${n ? 'En uso: no se puede quitar' : 'Quitar'}" ${n ? 'disabled' : ''}>✕</button>
      </div></td>
    </tr>`;
  }).join('');
  return `
  <div class="card" data-cat-card="${tipo}">
    <h2>${t.titulo}</h2>
    <div class="table-wrap"><table><tbody>${filas || `<tr class="empty-row"><td colspan="3">Aún no hay ${t.titulo.toLowerCase()}.</td></tr>`}</tbody></table></div>
    <div class="btn-row" style="margin-top:12px;">
      <input type="text" data-cat-nuevo="${tipo}" placeholder="Nuevo ${t.singular}" maxlength="60" style="max-width:280px;">
      <button type="button" class="btn secondary" data-cat-add="${tipo}">+ Agregar</button>
    </div>
  </div>`;
}

export function catalogosHTML() {
  return `
  <div class="card">
    <h2>Áreas y cargos</h2>
    <div class="desc">Listas estándar que se eligen en la ficha del empleado y en la carga masiva (así no hay "Recepción", "Recepcionista" y "RECEPCION" como cosas distintas). Con ✎ puede cambiar un nombre en todas las fichas a la vez, o unirlo con otro escribiendo el nombre que ya existe. Solo se puede quitar lo que nadie usa.</div>
  </div>
  <div class="grid cols-2">${tarjetaHTML('areas')}${tarjetaHTML('cargos')}</div>`;
}

export function wireCatalogos(root, rerender) {
  root.querySelectorAll('[data-cat-add]').forEach((b) => b.addEventListener('click', async () => {
    const tipo = b.dataset.catAdd;
    const input = root.querySelector(`[data-cat-nuevo="${tipo}"]`);
    const nombre = agregarACatalogo(tipo, input.value);
    if (!nombre) return;
    await persistAll(`${TIPOS_CATALOGO[tipo].titulo}: se agregó ${nombre}`);
    rerender();
  }));
  root.querySelectorAll('[data-cat-nuevo]').forEach((i) => i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); root.querySelector(`[data-cat-add="${i.dataset.catNuevo}"]`).click(); }
  }));

  root.querySelectorAll('[data-cat-del]').forEach((b) => b.addEventListener('click', async () => {
    const tipo = b.closest('[data-cat-card]').dataset.catCard;
    const nombre = b.dataset.catDel;
    const ok = await confirmDialog({ title: 'Quitar de la lista', message: `¿Quitar "${nombre}" de la lista?`, confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    if (eliminarDeCatalogo(tipo, nombre)) { await persistAll(`${TIPOS_CATALOGO[tipo].titulo}: se quitó ${nombre}`); rerender(); }
  }));

  root.querySelectorAll('[data-cat-edit]').forEach((b) => b.addEventListener('click', () => {
    const tipo = b.closest('[data-cat-card]').dataset.catCard;
    const actual = b.dataset.catEdit;
    const celda = b.closest('tr').querySelector('.cat-nombre');
    celda.innerHTML = `<input type="text" value="${esc(actual)}" maxlength="60" style="max-width:260px;"> <button type="button" class="btn small" data-ok>Guardar</button> <button type="button" class="btn ghost small" data-no>Cancelar</button>`;
    const input = celda.querySelector('input'); input.focus(); input.select();
    celda.querySelector('[data-no]').addEventListener('click', rerender);
    const guardar = async () => {
      const r = renombrarCatalogo(tipo, actual, input.value);
      if (!r.ok) { toast(r.motivo, 'error'); return; }
      await persistAll(`${TIPOS_CATALOGO[tipo].titulo}: "${actual}" → "${r.nombreFinal}" (${r.afectados} ficha(s))`);
      toast(r.fusion ? `Se unió con "${r.nombreFinal}" (${r.afectados} ficha(s)).` : `Listo: ${r.afectados} ficha(s) actualizada(s).`, 'success');
      rerender();
    };
    celda.querySelector('[data-ok]').addEventListener('click', guardar);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') rerender(); });
  }));
}
