import { toast } from './toast.js';

/**
 * Bloque estándar de "resultado con acciones" (imprimir / guardar / PDF) que
 * reemplaza los bloques repetidos de botones del archivo original y el viejo
 * flujo de html2pdf por la exportación nativa (window.api.pdf.export).
 */
export function resultadoConAcciones({ contenidoHtml, filename, pdfTitle, guardarLabel, onGuardar }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="resultado-print">${contenidoHtml}</div>
    <div class="btn-row no-print" style="margin-top:14px;">
      ${onGuardar ? `<button class="btn secondary" data-accion="guardar">${guardarLabel || 'Guardar en historial'}</button>` : ''}
      <button class="btn ghost" data-accion="imprimir">Imprimir</button>
      <button class="btn" data-accion="pdf">Descargar PDF</button>
    </div>`;

  wrap.querySelector('[data-accion="imprimir"]').addEventListener('click', () => window.print());

  wrap.querySelector('[data-accion="pdf"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Generando…';
    try {
      const res = await window.api.pdf.export(contenidoHtml, pdfTitle || 'Documento', filename);
      if (!res.canceled) toast('PDF guardado: ' + res.filePath, 'success');
    } catch (err) {
      toast('No se pudo generar el PDF: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  });

  if (onGuardar) {
    wrap.querySelector('[data-accion="guardar"]').addEventListener('click', onGuardar);
  }
  return wrap;
}
