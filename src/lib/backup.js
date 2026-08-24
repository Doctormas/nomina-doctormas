import { state, persistAll, defaultConfig } from '../state/store.js';
import { todayStr } from './formato.js';
import { toast } from '../components/toast.js';

export function backupPayload() {
  return JSON.stringify({
    CONFIG: state.CONFIG, EMPLEADOS: state.EMPLEADOS, PERIODOS: state.PERIODOS,
    VAC_DISFRUTE: state.VAC_DISFRUTE, UTILIDADES_PAGADAS: state.UTILIDADES_PAGADAS,
    LIQUIDACIONES: state.LIQUIDACIONES, HISTORICO_TASAS: state.HISTORICO_TASAS,
    BONO_VAC_PAGADO: state.BONO_VAC_PAGADO
  }, null, 2);
}

export async function exportBackup() {
  const res = await window.api.backup.saveAs(backupPayload(), `respaldo-nomina-doctormas-${todayStr()}.json`);
  if (res.canceled) return false;
  toast('Respaldo guardado: ' + res.filePath, 'success');
  return true;
}

export async function importBackup(onDone) {
  const res = await window.api.backup.open();
  if (res.canceled) return false;
  try {
    const data = JSON.parse(res.jsonString);
    state.CONFIG = Object.assign(defaultConfig(), data.CONFIG || {});
    state.CONFIG.tiposNomina = data.CONFIG && data.CONFIG.tiposNomina
      ? Object.assign(defaultConfig().tiposNomina, data.CONFIG.tiposNomina)
      : defaultConfig().tiposNomina;
    state.EMPLEADOS = data.EMPLEADOS || [];
    state.PERIODOS = data.PERIODOS || [];
    state.VAC_DISFRUTE = data.VAC_DISFRUTE || [];
    state.UTILIDADES_PAGADAS = data.UTILIDADES_PAGADAS || [];
    state.LIQUIDACIONES = data.LIQUIDACIONES || [];
    state.BONO_VAC_PAGADO = data.BONO_VAC_PAGADO || [];
    state.HISTORICO_TASAS = data.HISTORICO_TASAS || [];
    await persistAll();
    toast('Respaldo importado correctamente.', 'success');
    if (onDone) onDone();
    return true;
  } catch (err) {
    toast('Archivo inválido: ' + err.message, 'error');
    return false;
  }
}
