// Envío de recibos de nómina por correo, uno por persona, a su propio correo de la ficha.
// El mensaje y el PDF se arman aquí; el servidor de la nube (Worker) solo los reenvía con Resend.
// En la computadora el recibo va como PDF adjunto; en el teléfono (sin generador de PDF) va dentro del correo.
import { state, persistAll, empresaConRif, actorDeSesion } from '../state/store.js';
import { construirRecibosCorridaHTML } from './plantillasPdf.js';
import { cabecerasNube, revisarVersionExigida } from './versionNube.js';
import { fmtDate } from './formato.js';
import { toast } from '../components/toast.js';

const ESPERA_ENTRE_ENVIOS_MS = 700; // Resend permite ~2 por segundo
const CORREO_OK = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Estilos mínimos para que el recibo se lea bien dentro de un correo (sin depender de la hoja de la app).
const CSS_CORREO = 'body{font-family:Arial,Helvetica,sans-serif;color:#3F4249;font-size:14px;}table{border-collapse:collapse;width:100%;}' +
  'th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3dcd4;}th{font-size:11px;text-transform:uppercase;color:#8a7f77;}' +
  '.desc{font-size:12px;color:#71757c;}.legal{font-size:11px;color:#9a8f86;font-style:italic;}';

export function correoValido(c) { return CORREO_OK.test(String(c || '').trim()); }

/** El registro guardado (nómina, utilidades…) al que pertenece una fila de corrida, para marcarlo como enviado. */
function registroDe(kind, fila) {
  const lista = kind === 'nomina' ? state.PERIODOS : kind === 'utilidades' ? state.UTILIDADES_PAGADAS : kind === 'bonovacacional' ? state.BONO_VAC_PAGADO : state.BONO_ALIM_PAGADO;
  return lista.find((x) => x.empId === (fila.emp && fila.emp.id) && String(x.numeroRecibo) === String(fila.numeroRecibo)) || null;
}

/** Cuántos recibos de la corrida tienen correo y cuántos ya se enviaron. */
export function resumenEnvio(corrida) {
  const filas = corrida.filas.filter((f) => f.emp);
  const conCorreo = filas.filter((f) => correoValido(f.emp.correo)).length;
  const enviados = filas.filter((f) => { const r = registroDe(corrida.kind, f); return r && r.correoEnviado; }).length;
  return { total: filas.length, conCorreo, enviados };
}

/** Quién envió: el usuario guardado en el registro; los envíos anteriores a que se guardara se leen del historial de cambios. */
function quienEnvio(correoEnviado) {
  if (correoEnviado.por) return correoEnviado.por;
  const t = new Date(correoEnviado.fecha).getTime();
  const h = (state.HISTORIAL_CAMBIOS || []).filter((x) => /^Recibos enviados por correo/.test(x.seccion || '')
    && new Date(x.fecha).getTime() >= t && new Date(x.fecha).getTime() - t < 10 * 60 * 1000)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))[0];
  return h ? h.actor : '—';
}

/** Registro de todos los recibos enviados por correo: cuándo, quién, a quién y de qué corrida (más reciente primero). */
export function registroDeEnvios(tipoLabelDe) {
  const colecciones = [['nomina', state.PERIODOS, (r) => r.tipoPeriodo], ['utilidades', state.UTILIDADES_PAGADAS, () => 'utilidades'], ['bonovacacional', state.BONO_VAC_PAGADO, () => 'bonovacacional'], ['bonoalimentacion', state.BONO_ALIM_PAGADO, () => 'bonoalimentacion']];
  const filas = [];
  colecciones.forEach(([kind, lista, tipoDe]) => (lista || []).forEach((r) => {
    if (!r.correoEnviado) return;
    const emp = state.EMPLEADOS.find((e) => e.id === r.empId);
    filas.push({
      cuando: r.correoEnviado.fecha, por: quienEnvio(r.correoEnviado), nombre: emp ? emp.nombre : '(empleado eliminado)',
      correo: r.correoEnviado.a, tipo: tipoLabelDe(kind, tipoDe(r)), fechaCorrida: r.fecha, numero: r.numeroRecibo
    });
  }));
  return filas.sort((a, b) => (a.cuando < b.cuando ? 1 : -1));
}

/** Correo de prueba para comprobar que el servidor puede enviar (antes de mandar recibos de verdad). */
export async function enviarCorreoPrueba(para) {
  if (!correoValido(para)) throw new Error('Escriba un correo válido.');
  await pedirAlServidor({
    para: para.trim(), asunto: 'Prueba de envío · Nómina Doctormás',
    html: `<p>Este es un correo de prueba del sistema de nómina de <b>${esc(empresaConRif())}</b>. Si lo está leyendo, el envío de recibos funciona.</p>`,
    adjuntos: []
  });
}

async function pedirAlServidor(cuerpo) {
  const res = await fetch(state.SYNC.url.replace(/\/$/, '') + '/api/enviar-correo', {
    method: 'POST',
    headers: await cabecerasNube(state.SYNC.pin, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(cuerpo)
  });
  await revisarVersionExigida(res);
  let j = {};
  try { j = await res.json(); } catch (e) { /* sin cuerpo */ }
  if (!res.ok) throw new Error(j.mensaje || j.error || ('HTTP ' + res.status));
  return j;
}

async function enviarUnRecibo(kind, fecha, fila, tituloTipo) {
  const html = construirRecibosCorridaHTML(fecha, [fila], kind);
  const nombreArchivo = `Recibo-${tituloTipo.replace(/\s+/g, '-')}-${fecha}-${fila.emp.nombre.split(' ')[0]}.pdf`;
  let adjuntos = [];
  if (window.api && window.api.pdf && window.api.pdf.toBase64) {
    adjuntos = [{ nombre: nombreArchivo, base64: await window.api.pdf.toBase64(html, 'Recibo de pago') }];
  }
  const nombre = esc(fila.emp.nombre.split(' ').slice(0, 2).join(' '));
  const cuerpo = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS_CORREO}</style></head><body>
    <p>Estimado/a <b>${nombre}</b>,</p>
    <p>${adjuntos.length ? 'Adjunto encontrará' : 'A continuación encontrará'} su recibo de pago de <b>${esc(tituloTipo)}</b> correspondiente al <b>${fmtDate(fecha)}</b>.</p>
    ${adjuntos.length ? '' : `<div style="border:1px solid #e3dcd4;padding:12px;border-radius:8px;">${html}</div>`}
    <p class="legal" style="margin-top:18px;">${esc(empresaConRif())}. Este mensaje contiene información personal y confidencial dirigida únicamente a usted. Si lo recibió por error, elimínelo y avísenos.</p>
  </body></html>`;
  await pedirAlServidor({ para: fila.emp.correo.trim(), asunto: `Recibo de pago · ${tituloTipo} · ${fmtDate(fecha)}`, html: cuerpo, adjuntos });
}

/** Cuadro para elegir a quiénes se les envía y mandar los recibos de una corrida guardada. */
export function abrirEnvioRecibos(corrida, tituloTipo, alTerminar) {
  if (!state.SYNC || !state.SYNC.url || !state.SYNC.pin) { toast('Para enviar correos hay que conectar la nube (Configuración → Nube).', 'error'); return; }
  const filas = corrida.filas.filter((f) => f.emp);
  const info = filas.map((f) => {
    const reg = registroDe(corrida.kind, f);
    const enviado = reg && reg.correoEnviado;
    const tieneCorreo = correoValido(f.emp.correo);
    return { fila: f, reg, tieneCorreo, enviado, marcado: tieneCorreo && !enviado };
  });
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const filasHtml = info.map((x, i) => `<tr>
      <td><input type="checkbox" data-env="${i}" ${x.marcado ? 'checked' : ''} ${x.tieneCorreo ? '' : 'disabled'}></td>
      <td>${esc(x.fila.emp.nombre)}</td>
      <td>${x.tieneCorreo ? esc(x.fila.emp.correo) : '<span class="tag err">sin correo en la ficha</span>'}</td>
      <td data-estado="${i}">${x.enviado ? `<span class="tag ok">enviado ${fmtDate(String(x.enviado.fecha).slice(0, 10))}</span>` : ''}</td>
    </tr>`).join('');
  overlay.innerHTML = `
    <div class="modal" style="max-width:760px;">
      <h3>Enviar recibos por correo</h3>
      <div class="desc">${esc(tituloTipo)} del ${fmtDate(corrida.fecha)}. Cada persona recibe solo su recibo, en su propio correo.${window.api && window.api.pdf && window.api.pdf.toBase64 ? ' Va como PDF adjunto.' : ' Va dentro del correo.'}</div>
      <div class="table-wrap" style="max-height:340px;overflow-y:auto;margin-top:10px;">
        <table><thead><tr><th></th><th>Nombre</th><th>Correo</th><th>Estado</th></tr></thead><tbody>${filasHtml}</tbody></table>
      </div>
      <div class="legal" id="envResumen" style="margin-top:8px;"></div>
      <div class="btn-row" style="margin-top:14px;">
        <button class="btn" id="envIniciar">Enviar</button>
        <button class="btn ghost" id="envCerrar">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const marcados = () => [...overlay.querySelectorAll('[data-env]')].filter((c) => c.checked).map((c) => Number(c.dataset.env));
  const actualizar = () => { overlay.querySelector('#envIniciar').textContent = `Enviar a ${marcados().length}`; overlay.querySelector('#envIniciar').disabled = !marcados().length; };
  overlay.querySelectorAll('[data-env]').forEach((c) => c.addEventListener('change', actualizar));
  actualizar();
  overlay.querySelector('#envCerrar').addEventListener('click', () => { overlay.remove(); if (alTerminar) alTerminar(); });

  let enCurso = false;
  overlay.querySelector('#envIniciar').addEventListener('click', async () => {
    if (enCurso) return;
    enCurso = true;
    const btn = overlay.querySelector('#envIniciar'); btn.disabled = true;
    const lista = marcados();
    let ok = 0; let fallos = 0; let detener = false;
    for (const i of lista) {
      if (detener) break;
      const celda = overlay.querySelector(`[data-estado="${i}"]`);
      celda.innerHTML = '<span class="tag warn">enviando…</span>';
      try {
        await enviarUnRecibo(corrida.kind, corrida.fecha, info[i].fila, tituloTipo);
        if (info[i].reg) info[i].reg.correoEnviado = { fecha: new Date().toISOString(), a: info[i].fila.emp.correo.trim(), por: actorDeSesion() || (state.SYNC && state.SYNC.actor) || 'Sin nombre' };
        celda.innerHTML = '<span class="tag ok">enviado</span>';
        overlay.querySelector(`[data-env="${i}"]`).checked = false;
        ok++;
      } catch (e) {
        fallos++;
        celda.innerHTML = `<span class="tag err" title="${esc(e.message)}">no se envió</span> <span class="legal">${esc(e.message)}</span>`;
        // Si el servidor no tiene el correo configurado o la versión es antigua, no tiene caso seguir intentando.
        if (/RESEND_API_KEY|configurado|Versión antigua/.test(e.message)) detener = true;
      }
      await pausa(ESPERA_ENTRE_ENVIOS_MS);
    }
    if (ok) await persistAll(`Recibos enviados por correo: ${ok} (${tituloTipo} ${corrida.fecha})`);
    overlay.querySelector('#envResumen').textContent = `${ok} enviado(s)${fallos ? ` · ${fallos} con error` : ''}.`;
    toast(`${ok} recibo(s) enviado(s)${fallos ? `, ${fallos} con error` : ''}.`, fallos ? 'error' : 'success', 5000);
    enCurso = false; actualizar();
  });
}
