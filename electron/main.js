'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const { renderHtmlToPdfBuffer } = require('./pdf');
const XLSX = require('xlsx');
const updater = require('./updater');

const isDev = process.argv.includes('--dev');
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#F7F3EF',
    title: 'Nómina Doctormás',
    icon: path.join(__dirname, '..', 'assets', 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    mainWindow.webContents.on('console-message', (evt, level, message, line, sourceId) => {
      console.log(`[renderer] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.on('did-fail-load', (evt, code, desc, url) => {
      console.log(`[renderer] did-fail-load ${code} ${desc} ${url}`);
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function sendMenuAction(action) {
  if (mainWindow) mainWindow.webContents.send('menu-action', action);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'Archivo',
      submenu: [
        { label: 'Guardar respaldo como…', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('backup-export') },
        { label: 'Restaurar respaldo…', click: () => sendMenuAction('backup-import') },
        { type: 'separator' },
        { label: 'Abrir carpeta de datos', click: () => shell.openPath(store.dataDir()) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de Nómina Doctormás',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Nómina Doctormás',
              message: 'Nómina Doctormás',
              detail: `Versión ${app.getVersion()}\nSistema de nómina conforme a la LOTTT (Venezuela).\nHerramienta de apoyo administrativo interno — no sustituye asesoría legal, laboral o contable profesional.`
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  updater.setup(() => mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- IPC: almacenamiento local ---------- */
ipcMain.handle('store:load', () => store.loadData());
ipcMain.handle('store:save', (evt, data) => store.saveData(data));
ipcMain.handle('store:dataDir', () => store.dataDir());

/* ---------- IPC: respaldo (exportar / importar) ---------- */
ipcMain.handle('backup:saveAs', async (evt, { jsonString, suggestedName }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar respaldo',
    defaultPath: suggestedName,
    filters: [{ name: 'Respaldo JSON', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, jsonString, 'utf-8');
  return { canceled: false, filePath: res.filePath };
});

ipcMain.handle('backup:open', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Restaurar respaldo',
    properties: ['openFile'],
    filters: [{ name: 'Respaldo JSON', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const content = fs.readFileSync(res.filePaths[0], 'utf-8');
  return { canceled: false, filePath: res.filePaths[0], jsonString: content };
});

/* ---------- IPC: exportar CSV ---------- */
ipcMain.handle('file:saveAs', async (evt, { content, suggestedName, extensionName, extensions }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar archivo',
    defaultPath: suggestedName,
    filters: [{ name: extensionName || 'Archivo', extensions: extensions || ['csv'] }]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, content, 'utf-8');
  return { canceled: false, filePath: res.filePath };
});

/* ---------- IPC: PDF ---------- */
ipcMain.handle('pdf:export', async (evt, { html, title, suggestedName }) => {
  const buffer = await renderHtmlToPdfBuffer(html, title);
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar PDF',
    defaultPath: suggestedName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, buffer);
  return { canceled: false, filePath: res.filePath };
});

/* ---------- IPC: Excel (carga masiva de empleados) ---------- */
ipcMain.handle('xlsx:parseFile', (evt, arrayBuffer) => {
  const buf = Buffer.from(arrayBuffer);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false });
  // Las celdas de fecha llegan como Date; se normalizan a AAAA-MM-DD aquí para
  // que el renderer no necesite entender el formato binario de Excel.
  return rows.map((row) => row.map((cell) => (cell instanceof Date ? cell.toISOString().slice(0, 10) : cell)));
});

ipcMain.handle('xlsx:downloadTemplate', async (evt, { headers, ejemplo, notas, defaultFilename }) => {
  const ws = XLSX.utils.aoa_to_sheet([headers, ejemplo, [], notas]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar plantilla',
    defaultPath: defaultFilename,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, buffer);
  return { canceled: false, filePath: res.filePath };
});

// Genérico: una hoja de cálculo a partir de filas (array de arrays), para
// hojas de trabajo puntuales (ej. calculadora AR-I) que no encajan en el
// formato fijo de xlsx:downloadTemplate.
ipcMain.handle('xlsx:downloadSheet', async (evt, { sheetName, rows, colWidths, defaultFilename }) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (colWidths) ws['!cols'] = colWidths.map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheetName || 'Hoja1').slice(0, 31));
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar Excel',
    defaultPath: defaultFilename,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  fs.writeFileSync(res.filePath, buffer);
  return { canceled: false, filePath: res.filePath };
});

/* ---------- IPC: abrir archivo/carpeta con el explorador del sistema ---------- */
ipcMain.handle('shell:openPath', (evt, targetPath) => shell.openPath(targetPath));
ipcMain.handle('shell:openExternal', (evt, url) => {
  // Solo http(s) — evita que se pueda abrir un esquema arbitrario (file:, etc.)
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.handle('app:getVersion', () => app.getVersion());
