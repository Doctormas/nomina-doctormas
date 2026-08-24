// Actualizaciones automáticas vía GitHub Releases (electron-updater).
// El botón "Buscar actualizaciones" en Configuración dispara updater:check;
// el progreso/resultado se manda al renderer por el evento 'updater-status'.
'use strict';
const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;

function setup(getMainWindow) {
  function send(status, extra) {
    const win = getMainWindow();
    if (win) win.webContents.send('updater-status', Object.assign({ status }, extra || {}));
  }

  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => send('available', { version: info.version }));
  autoUpdater.on('update-not-available', (info) => send('not-available', { version: info.version }));
  autoUpdater.on('download-progress', (p) => send('downloading', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send('downloaded', { version: info.version }));
  autoUpdater.on('error', (err) => send('error', { message: err && err.message ? err.message : String(err) }));

  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      send('error', { message: 'La búsqueda de actualizaciones solo funciona en la app instalada (empaquetada), no en modo desarrollo.' });
      return;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      send('error', { message: err && err.message ? err.message : String(err) });
    }
  });

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall();
  });
}

module.exports = { setup };
