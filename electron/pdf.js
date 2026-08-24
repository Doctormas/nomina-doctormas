// Generación de PDF nativa de Electron (webContents.printToPDF), en reemplazo
// de html2canvas/html2pdf.js — esa librería fue la causa raíz, documentada en
// el historial de versiones de la app original, de meses de "PDF en blanco".
// Una ventana oculta carga el HTML tal cual y se imprime directo, sin capturar
// un canvas.
'use strict';
const { BrowserWindow } = require('electron');

const PRINT_CSS = `
  @page { margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body{
    margin:0;
    font-family:'Roboto', Arial, sans-serif;
    color:#3F4249;
    font-size:12px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1,h2,h3{ font-family:'Cormorant Garamond', Georgia, serif; color:#800020; }
  table{ width:100%; border-collapse:collapse; font-size:11px; }
  th,td{ text-align:left; padding:6px 8px; border-bottom:1px solid #e3dcd4; }
  th{ font-size:9px; text-transform:uppercase; letter-spacing:.03em; color:#8a7f77; }
  .desc{ font-size:11px; color:#71757c; margin-bottom:4px; }
  .legal{ font-size:10px; color:#9a8f86; font-style:italic; }
  .totals{ display:flex; justify-content:flex-end; gap:24px; margin-top:10px; flex-wrap:wrap; }
  .totals .item{ text-align:right; }
  .totals .item .lbl{ font-size:10px; text-transform:uppercase; color:#8a7f77; }
  .totals .item .val{ font-size:16px; font-weight:700; color:#800020; }
  .tag{ display:inline-block; padding:1px 8px; border-radius:20px; font-size:9px; font-weight:700; }
  .tag.warn{ background:#fbf0dc; color:#8a5a00; }
`;

function wrapHtmlDocument(innerHtml, title) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${title || 'Documento'}</title>
<style>${PRINT_CSS}</style>
</head>
<body>${innerHtml}</body>
</html>`;
}

/**
 * Renderiza un fragmento de HTML a un Buffer PDF (A4).
 * @param {string} innerHtml - contenido HTML del documento (sin <html>/<body>)
 * @param {string} title - título de la pestaña oculta (no aparece en el PDF)
 */
async function renderHtmlToPdfBuffer(innerHtml, title) {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true }
  });
  try {
    const html = wrapHtmlDocument(innerHtml, title);
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    // pequeña espera para que las fuentes/layout terminen de pintar
    await new Promise((resolve) => setTimeout(resolve, 150));
    const buffer = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'default' }
    });
    return buffer;
  } finally {
    win.destroy();
  }
}

module.exports = { renderHtmlToPdfBuffer };
