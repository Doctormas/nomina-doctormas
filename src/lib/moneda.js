import { state, tasaEnFecha, getTasaActualValor } from '../state/store.js';

export function fmt(n, fechaISO) {
  n = Number(n) || 0;
  if (state.DISPLAY_CURRENCY === 'USD') {
    const tasa = fechaISO ? tasaEnFecha(fechaISO) : getTasaActualValor();
    const usd = tasa ? n / tasa : 0;
    return '$' + usd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return 'Bs. ' + n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
