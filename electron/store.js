// Persistencia local: un único archivo JSON en la carpeta de datos de la app
// (equivalente a lo que antes vivía en localStorage del navegador).
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DATA_FILENAME = 'nomina-data.json';

function dataDir() {
  return app.getPath('userData');
}

function dataFilePath() {
  return path.join(dataDir(), DATA_FILENAME);
}

function defaultData() {
  return {
    CONFIG: null,
    EMPLEADOS: [],
    PERIODOS: [],
    VAC_DISFRUTE: [],
    UTILIDADES_PAGADAS: [],
    LIQUIDACIONES: [],
    HISTORICO_TASAS: [],
    BONO_VAC_PAGADO: [],
    TASA: null,
    SYNC: null,
    DISPLAY_CURRENCY: 'VES'
  };
}

function loadData() {
  try {
    const raw = fs.readFileSync(dataFilePath(), 'utf-8');
    return Object.assign(defaultData(), JSON.parse(raw));
  } catch (err) {
    return defaultData();
  }
}

// Escritura atómica: se escribe a un archivo temporal y se renombra, para no
// dejar el archivo de datos corrupto si la app se cierra a la mitad de guardar.
function saveData(data) {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const target = dataFilePath();
  const tmp = target + '.tmp-' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, target);
  return true;
}

module.exports = { loadData, saveData, dataDir, dataFilePath };
