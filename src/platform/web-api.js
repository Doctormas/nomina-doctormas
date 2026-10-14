/* Capa de plataforma para el teléfono (APK) y el navegador.
 *
 * La app de escritorio (Electron) le inyecta a la página un objeto `window.api`
 * (guardar datos, exportar PDF, guardar archivos…). En el teléfono no existe
 * Electron, así que este script —que corre ANTES que la app— define ese mismo
 * objeto con equivalentes del teléfono:
 *   - datos: IndexedDB (dentro de la app, no visibles para otras apps)
 *   - PDF: el diálogo de impresión de Android ("Guardar como PDF")
 *   - archivos (CSV, respaldos): hoja de "compartir" de Android
 *   - actualizaciones: consulta las versiones publicadas en GitHub
 * Si ya existe `window.api` (Electron), no hace nada.
 */
(function () {
  'use strict';
  if (window.api) return;

  var cap = window.Capacitor;
  var esNativo = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  window.__esMovil = esNativo;
  document.documentElement.classList.add(esNativo ? 'plataforma-android' : 'plataforma-web');

  var REPO = 'Doctormas/nomina-doctormas';
  var VERSION_ACTUAL = '0.0.0';

  function plugin(nombre) {
    if (!cap) return null;
    if (cap.Plugins && cap.Plugins[nombre]) return cap.Plugins[nombre];
    return typeof cap.registerPlugin === 'function' ? cap.registerPlugin(nombre) : null;
  }

  function avisar(texto, tipo) {
    import('../components/toast.js').then(function (m) { m.toast(texto, tipo || 'info', 6000); })
      .catch(function () { window.alert(texto); });
  }

  /* ---------- Almacenamiento: IndexedDB ---------- */
  var DB_NAME = 'nomina-doctormas';
  var STORE = 'kv';
  function abrirDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function kvGet(key) {
    return abrirDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function kvSet(key, value) {
    return abrirDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* opcional */ }

  /* ---------- Entregar un archivo al usuario ---------- */
  function aBase64Utf8(texto) {
    var bytes = new TextEncoder().encode(texto);
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function entregarArchivo(nombre, contenido, mime) {
    var Filesystem = plugin('Filesystem');
    var Share = plugin('Share');
    if (esNativo && Filesystem && Share) {
      // Se escribe en la carpeta temporal y se abre "Compartir": desde ahí
      // se guarda en Archivos/Drive o se manda por WhatsApp/correo.
      return Filesystem.writeFile({ path: nombre, data: aBase64Utf8(contenido), directory: 'CACHE' })
        .then(function (r) {
          return Share.share({ title: nombre, url: r.uri, dialogTitle: 'Guardar o enviar ' + nombre });
        })
        .then(function () { return { canceled: false, filePath: nombre + ' (compartido)' }; })
        .catch(function (err) {
          if (err && /cancel/i.test(String(err.message || err))) return { canceled: true };
          throw err;
        });
    }
    // Navegador: descarga normal.
    var blob = new Blob([contenido], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    return Promise.resolve({ canceled: false, filePath: nombre });
  }

  function elegirArchivoTexto() {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json';
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (!f) return resolve({ canceled: true });
        f.text().then(function (t) { resolve({ canceled: false, jsonString: t, filePath: f.name }); });
      };
      input.click();
    });
  }

  /* ---------- PDF ---------- */
  var PRINT_CSS = '@page{margin:14mm 12mm;}*{box-sizing:border-box;}' +
    "body{margin:0;font-family:'Roboto',Arial,sans-serif;color:#3F4249;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}" +
    "h1,h2,h3{font-family:'Cormorant Garamond',Georgia,serif;color:#800020;}" +
    'table{width:100%;border-collapse:collapse;font-size:11px;}' +
    'th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3dcd4;}' +
    'th{font-size:9px;text-transform:uppercase;letter-spacing:.03em;color:#8a7f77;}' +
    '.desc{font-size:11px;color:#71757c;margin-bottom:4px;}.legal{font-size:10px;color:#9a8f86;font-style:italic;}' +
    '.totals{display:flex;justify-content:flex-end;gap:24px;margin-top:10px;flex-wrap:wrap;}.totals .item{text-align:right;}' +
    '.totals .item .lbl{font-size:10px;text-transform:uppercase;color:#8a7f77;}.totals .item .val{font-size:16px;font-weight:700;color:#800020;}' +
    '.tag{display:inline-block;padding:1px 8px;border-radius:20px;font-size:9px;font-weight:700;}.tag.warn{background:#fbf0dc;color:#8a5a00;}';

  function documentoCompleto(html, titulo) {
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + String(titulo || 'Documento').replace(/</g, '&lt;') +
      '</title><style>' + PRINT_CSS + '</style></head><body>' + html + '</body></html>';
  }

  function exportarPdf(html, titulo, nombreSugerido) {
    var PdfPrint = plugin('PdfPrint');
    var doc = documentoCompleto(html, titulo);
    if (esNativo && PdfPrint) {
      return PdfPrint.print({ html: doc, jobName: (nombreSugerido || titulo || 'Documento').replace(/\.pdf$/i, '') })
        .then(function () { return { canceled: false, filePath: 'Diálogo de impresión → "Guardar como PDF"' }; });
    }
    // Navegador: iframe oculto + imprimir.
    return new Promise(function (resolve) {
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(f);
      f.contentDocument.open(); f.contentDocument.write(doc); f.contentDocument.close();
      setTimeout(function () {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* ignorar */ }
        setTimeout(function () { f.remove(); resolve({ canceled: false, filePath: 'Impresión (elija "Guardar como PDF")' }); }, 1500);
      }, 300);
    });
  }

  /* ---------- Actualizaciones: versiones publicadas en GitHub ---------- */
  var estadoCb = null;
  var apkUrl = null;
  function emitir(data) { if (estadoCb) estadoCb(data); }
  function normalizarVersion(v) { return String(v || '').replace(/^v/i, '').split('.').map(function (x) { return parseInt(x, 10) || 0; }); }
  function esMayor(a, b) {
    var A = normalizarVersion(a); var B = normalizarVersion(b);
    for (var i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) > (B[i] || 0); }
    return false;
  }

  /* ---------- Objeto window.api ---------- */
  function noDisponible(texto) {
    return function () {
      avisar(texto, 'info');
      return Promise.resolve({ canceled: true });
    };
  }

  window.api = {
    store: {
      load: function () {
        return kvGet('data').then(function (raw) {
          if (!raw) return {};
          try { return JSON.parse(raw); } catch (e) { return {}; }
        });
      },
      save: function (data) { return kvSet('data', JSON.stringify(data)); },
      dataDir: function () { return Promise.resolve('Memoria interna de la app (teléfono)'); }
    },
    backup: {
      saveAs: function (json, nombre) { return entregarArchivo(nombre, json, 'application/json'); },
      open: elegirArchivoTexto
    },
    file: {
      saveAs: function (contenido, nombre) { return entregarArchivo(nombre, contenido, 'text/csv;charset=utf-8'); }
    },
    pdf: { export: exportarPdf },
    contrato: { export: noDisponible('El contrato en Word se genera desde la computadora por ahora.') },
    xlsx: {
      parseFile: function () { return Promise.reject(new Error('La carga masiva por Excel se hace desde la computadora.')); },
      downloadTemplate: noDisponible('La plantilla de Excel se descarga desde la computadora.'),
      downloadSheet: noDisponible('La exportación a Excel se hace desde la computadora.')
    },
    shell: {
      openPath: function () { return Promise.resolve(false); },
      openExternal: function (url) { window.open(url, '_blank'); return Promise.resolve(true); }
    },
    documentos: {
      attach: noDisponible('Los documentos físicos del expediente se adjuntan desde la computadora por ahora.'),
      removeArchivo: function () { return Promise.resolve(true); },
      removeCarpeta: function () { return Promise.resolve(true); },
      existeArchivo: function () { return Promise.resolve(false); }
    },
    expediente: { export: noDisponible('El expediente en PDF con documentos adjuntos se genera desde la computadora.') },
    app: { getVersion: function () { return Promise.resolve(VERSION_ACTUAL); } },
    updater: {
      check: function () {
        emitir({ status: 'checking' });
        fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (rel) {
            var ver = String(rel.tag_name || '').replace(/^v/i, '');
            var apk = (rel.assets || []).filter(function (a) { return /\.apk$/i.test(a.name); })[0];
            if (!esMayor(ver, VERSION_ACTUAL)) return emitir({ status: 'not-available' });
            if (!apk) return emitir({ status: 'error', message: 'La versión ' + ver + ' aún no tiene el archivo del teléfono publicado' });
            apkUrl = apk.browser_download_url;
            emitir({ status: 'downloaded', version: ver, movil: true });
          })
          .catch(function (e) { emitir({ status: 'error', message: e.message }); });
      },
      install: function () {
        if (!apkUrl) return;
        var B = esNativo ? plugin('Browser') : null;
        if (B) B.open({ url: apkUrl }); else window.open(apkUrl, '_blank');
      },
      onStatus: function (cb) { estadoCb = cb; }
    },
    onMenuAction: function () { /* no hay menú nativo en el teléfono */ }
  };

  // La versión instalada va en version.json, que genera el empaquetado del APK.
  fetch('version.json').then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.version) VERSION_ACTUAL = j.version; })
    .catch(function () { /* en el navegador de pruebas no existe */ });
})();
