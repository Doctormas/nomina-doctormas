// Nómina → Envíos: mandar por correo el recibo de cada persona (a su propio correo de la ficha),
// ver qué corridas ya se enviaron y probar que el envío funciona.
import { state, persistAll } from '../state/store.js';
import { fmtDate } from '../lib/formato.js';
import { toast } from '../components/toast.js';
import { abrirEnvioRecibos, resumenEnvio, enviarCorreoPrueba, registroDeEnvios } from '../lib/enviarRecibos.js';

let FILTRO = { ano: '', soloPendientes: true };
// Las corridas anteriores a esta fecha ya no se ofrecen para enviar (se empezó a enviar desde aquí).
const ENVIOS_DESDE_INICIAL = '2026-10-29';
const desdeEnvios = () => (state.CONFIG && state.CONFIG.enviosDesde) || ENVIOS_DESDE_INICIAL;
const fmtHora = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }); };
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function enviosHTML(corridas, tipoLabelDe) {
  const nube = !!(state.SYNC && state.SYNC.url && state.SYNC.pin);
  const anos = [...new Set(corridas.filter((c) => c.fecha >= desdeEnvios()).map((c) => c.fecha.slice(0, 4)))].sort().reverse();
  const lista = corridas.filter((c) => {
    if (c.fecha < desdeEnvios()) return false;
    if (FILTRO.ano && c.fecha.slice(0, 4) !== FILTRO.ano) return false;
    if (FILTRO.soloPendientes) { const r = resumenEnvio(c); if (r.conCorreo === 0 || r.enviados >= r.conCorreo) return false; }
    return true;
  });
  const filas = lista.map((c) => {
    const r = resumenEnvio(c);
    const key = `${c.kind}|${c.tipoPeriodo}|${c.fecha}`;
    const estado = r.enviados >= r.conCorreo && r.conCorreo > 0 ? '<span class="tag ok">Enviada</span>' : (r.enviados ? '<span class="tag warn">Parcial</span>' : '<span class="tag">Sin enviar</span>');
    return `<tr>
      <td>${tipoLabelDe(c.kind, c.tipoPeriodo)}</td><td>${fmtDate(c.fecha)}</td><td>${r.total}</td><td>${r.conCorreo}</td><td>${r.enviados}</td><td>${estado}</td>
      <td class="row-actions"><div class="row-actions-inner"><button type="button" class="btn small" data-env-corrida="${key}" ${r.total ? '' : 'disabled'}>✉ Enviar…</button></div></td>
    </tr>`;
  }).join('');
  return `
  <div class="card">
    <h2>Envío de recibos por correo</h2>
    <div class="desc">Mande a cada persona su recibo de pago, solo a su correo (el de su ficha). Elija la corrida, revise a quién va y envíe. Lo ya enviado queda marcado para no repetirlo.${nube ? '' : ' <b>Primero conecte la nube</b> (Configuración → Nube): el envío sale por el servidor.'}</div>
    <div class="emp-filtros" style="grid-template-columns:minmax(120px,1fr) minmax(150px,1fr) minmax(220px,2fr);margin-top:12px;">
      <div class="field"><label>Año</label><select id="envAno"><option value="">Todos</option>${anos.map((a) => `<option value="${a}" ${FILTRO.ano === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="field"><label>Corridas desde</label><input type="date" id="envDesde" value="${desdeEnvios()}"></div>
      <div class="field"><label>Mostrar</label><select id="envSolo"><option value="1" ${FILTRO.soloPendientes ? 'selected' : ''}>Solo las que faltan por enviar</option><option value="0" ${FILTRO.soloPendientes ? '' : 'selected'}>Todas las corridas</option></select></div>
    </div>
    <div class="table-wrap" style="margin-top:12px;">
      <table><thead><tr><th>Tipo</th><th>Fecha</th><th>Recibos</th><th>Con correo</th><th>Enviados</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filas || '<tr class="empty-row"><td colspan="7">No hay corridas por enviar con estos filtros.</td></tr>'}</tbody></table>
    </div>
  </div>
  ${registroHTML(tipoLabelDe)}
  <div class="card">
    <h2>Correo de prueba</h2>
    <div class="desc">Antes de mandar recibos de verdad, envíese un correo de prueba para comprobar que el servidor puede enviar.</div>
    <div class="btn-row"><input type="email" id="envPruebaPara" placeholder="su-correo@ejemplo.com" style="max-width:320px;"><button type="button" class="btn secondary" id="btnEnvPrueba">Enviar prueba</button></div>
  </div>`;
}

// Los envíos se agrupan por corrida: un mismo usuario que mandó la misma corrida seguida (menos de 10 min entre
// un correo y otro) es UN envío; al abrirlo se ve a quién se le mandó.
function agruparEnvios(filas) {
  const grupos = [];
  filas.slice().sort((a, b) => (a.cuando < b.cuando ? -1 : 1)).forEach((f) => {
    const g = grupos.find((x) => x.tipo === f.tipo && x.fechaCorrida === f.fechaCorrida && x.por === f.por
      && new Date(f.cuando) - new Date(x.hasta) < 10 * 60 * 1000 && new Date(f.cuando) >= new Date(x.hasta));
    if (g) { g.personas.push(f); g.hasta = f.cuando; } else grupos.push({ tipo: f.tipo, fechaCorrida: f.fechaCorrida, por: f.por, desde: f.cuando, hasta: f.cuando, personas: [f] });
  });
  return grupos.reverse();
}

function registroHTML(tipoLabelDe) {
  const envios = registroDeEnvios(tipoLabelDe);
  const grupos = agruparEnvios(envios);
  const cuerpo = grupos.slice(0, 100).map((g, i) => `
    <tr class="reg-envio" data-reg-fila="${i}" style="cursor:pointer;">
      <td style="width:28px;"><span data-reg-flecha="${i}">▸</span></td>
      <td><b>${esc(g.tipo)}</b> · ${fmtDate(g.fechaCorrida)}</td>
      <td>${esc(fmtHora(g.desde))}</td><td><b>${esc(g.por)}</b></td>
      <td>${g.personas.length} ${g.personas.length === 1 ? 'persona' : 'personas'}</td>
    </tr>
    <tr data-reg-detalle="${i}" hidden><td></td><td colspan="4">
      <table style="width:100%;"><thead><tr><th>Persona</th><th>Correo</th><th>Hora</th><th>N° de recibo</th></tr></thead><tbody>
        ${g.personas.slice().sort((a, b) => (a.cuando < b.cuando ? -1 : 1)).map((p) => `<tr><td>${esc(p.nombre)}</td><td>${esc(p.correo)}</td><td>${esc(new Date(p.cuando).toLocaleTimeString('es-VE', { timeStyle: 'short' }))}</td><td>${esc(p.numero)}</td></tr>`).join('')}
      </tbody></table>
    </td></tr>`).join('');
  return `
  <div class="card">
    <h2>Registro de envíos</h2>
    <div class="desc">Cada vez que se envía una corrida queda anotado: cuándo, quién la envió y a cuántas personas. Toque una fila para ver a quién se le envió. ${envios.length} recibo(s) enviado(s) en total.</div>
    <div class="table-wrap" style="margin-top:10px;max-height:460px;overflow-y:auto;">
      <table><thead><tr><th></th><th>Corrida</th><th>Cuándo</th><th>Enviado por</th><th>Enviados</th></tr></thead>
      <tbody>${cuerpo || '<tr class="empty-row"><td colspan="5">Aún no se ha enviado ningún recibo.</td></tr>'}</tbody></table>
    </div>
  </div>`;
}

export function wireEnvios(root, rerender, corridas, tipoLabelDe) {
  const a = root.querySelector('#envAno'); if (a) a.addEventListener('change', () => { FILTRO.ano = a.value; rerender(); });
  root.querySelectorAll('[data-reg-fila]').forEach((tr) => tr.addEventListener('click', () => {
    const i = tr.dataset.regFila;
    const det = root.querySelector(`[data-reg-detalle="${i}"]`);
    det.hidden = !det.hidden;
    root.querySelector(`[data-reg-flecha="${i}"]`).textContent = det.hidden ? '▸' : '▾';
  }));
  const dd = root.querySelector('#envDesde');
  if (dd) dd.addEventListener('change', async () => { if (!dd.value) return; state.CONFIG.enviosDesde = dd.value; await persistAll(`Envíos: corridas desde ${dd.value}`); rerender(); });
  const s = root.querySelector('#envSolo'); if (s) s.addEventListener('change', () => { FILTRO.soloPendientes = s.value === '1'; rerender(); });
  root.querySelectorAll('[data-env-corrida]').forEach((b) => b.addEventListener('click', () => {
    const [kind, tipoPeriodo, fecha] = b.dataset.envCorrida.split('|');
    const corrida = corridas.find((c) => c.kind === kind && c.tipoPeriodo === tipoPeriodo && c.fecha === fecha);
    if (corrida) abrirEnvioRecibos(corrida, tipoLabelDe(kind, tipoPeriodo), rerender);
  }));
  const btn = root.querySelector('#btnEnvPrueba');
  if (btn) btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { await enviarCorreoPrueba(root.querySelector('#envPruebaPara').value); toast('Correo de prueba enviado. Revise su bandeja (y el spam).', 'success', 6000); }
    catch (e) { toast('No se pudo enviar: ' + e.message, 'error', 7000); }
    btn.disabled = false;
  });
}
