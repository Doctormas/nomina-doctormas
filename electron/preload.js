'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  store: {
    load: () => ipcRenderer.invoke('store:load'),
    save: (data) => ipcRenderer.invoke('store:save', data),
    dataDir: () => ipcRenderer.invoke('store:dataDir')
  },
  backup: {
    saveAs: (jsonString, suggestedName) => ipcRenderer.invoke('backup:saveAs', { jsonString, suggestedName }),
    open: () => ipcRenderer.invoke('backup:open')
  },
  file: {
    saveAs: (content, suggestedName, extensionName, extensions) =>
      ipcRenderer.invoke('file:saveAs', { content, suggestedName, extensionName, extensions })
  },
  pdf: {
    export: (html, title, suggestedName) => ipcRenderer.invoke('pdf:export', { html, title, suggestedName })
  },
  xlsx: {
    parseFile: (arrayBuffer) => ipcRenderer.invoke('xlsx:parseFile', arrayBuffer),
    downloadTemplate: (payload) => ipcRenderer.invoke('xlsx:downloadTemplate', payload),
    downloadSheet: (payload) => ipcRenderer.invoke('xlsx:downloadSheet', payload)
  },
  shell: {
    openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion')
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback) => {
      ipcRenderer.on('updater-status', (_evt, data) => callback(data));
    }
  },
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (_evt, action) => callback(action));
  }
});
