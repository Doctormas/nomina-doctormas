// Centro de notificaciones: no persiste nada, se recalcula cada vez que se
// abre el panel (o al re-renderizar) a partir del estado actual — así nunca
// queda desactualizado ni hay que migrar datos viejos.
import { state } from '../state/store.js';
import { estadoDe } from '../views/empleados.js';
import { todayStr, parseDate, fmtDate } from './formato.js';

function esBancamiga(banco) {
  return !!(banco && banco.toLowerCase().includes('bancamiga'));
}

// Quincena/cierre de mes en el que cae "hoy", y su fecha de fin — para poder
// avisar "se acerca nómina" sin tener que abrir la pestaña Nómina a revisar.
function periodoActual(hoyISO) {
  const hoy = parseDate(hoyISO);
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  if (hoy.getDate() <= 15) {
    return { tipoPeriodo: 'primera', label: 'primera quincena', fecha: new Date(anio, mes, 15).toISOString().slice(0, 10) };
  }
  const finMes = new Date(anio, mes + 1, 0);
  return { tipoPeriodo: 'segunda', label: 'segunda quincena / cierre de mes', fecha: finMes.toISOString().slice(0, 10) };
}

export function calcularNotificaciones() {
  const notifs = [];
  const hoyISO = todayStr();

  state.EMPLEADOS.forEach((e) => {
    const estado = estadoDe(e);

    if (estado === 'activo' && e.inscritoIVSS === false) {
      notifs.push({
        id: `ivss-${e.id}`, tipo: 'ivss', severidad: 'alta',
        texto: `${e.nombre} no está inscrito en el IVSS.`
      });
    }

    if (estado === 'egresado' && e.egreso) {
      const t = e.egreso.tramites || {};
      const nombres = { ivss: 'IVSS', faov: 'FAOV/BANAVIH', inces: 'INCES', rpe: 'RPE' };
      const faltantes = Object.keys(nombres).filter((k) => !(t[k] && t[k].hecho));
      if (faltantes.length) {
        notifs.push({
          id: `egreso-${e.id}`, tipo: 'egreso', severidad: 'alta',
          texto: `${e.nombre} egresó y falta desincorporarlo de: ${faltantes.map((k) => nombres[k]).join(', ')}.`
        });
      }
    }

    if (estado === 'activo' && !esBancamiga(e.banco) && !esBancamiga(e.banco2)) {
      notifs.push({
        id: `banco-${e.id}`, tipo: 'banco', severidad: 'media',
        texto: `${e.nombre} no tiene cuenta Bancamiga registrada.`
      });
    }

    const recibeCestaticket = e.cestaticket !== undefined && e.cestaticket !== null && e.cestaticket !== '' ? Number(e.cestaticket) > 0 : Number(state.CONFIG.cestaticket || 0) > 0;
    if (estado === 'activo' && recibeCestaticket && e.tieneTarjetaAlimentacion === false) {
      notifs.push({
        id: `cesta-${e.id}`, tipo: 'cestaticket', severidad: 'media',
        texto: `${e.nombre} no tiene tarjeta de bono de alimentación.`
      });
    }
  });

  const periodo = periodoActual(hoyISO);
  const yaCorrida = state.PERIODOS.some((p) => p.tipoPeriodo === periodo.tipoPeriodo && p.fecha === periodo.fecha);
  if (!yaCorrida) {
    const diasRestantes = Math.round((parseDate(periodo.fecha) - parseDate(hoyISO)) / 86400000);
    if (diasRestantes <= 3) {
      const texto = diasRestantes < 0
        ? `El cierre de la ${periodo.label} (${fmtDate(periodo.fecha)}) ya pasó y no se ha corrido esa nómina.`
        : diasRestantes === 0
          ? `Hoy cierra la ${periodo.label} y no se ha corrido esa nómina.`
          : `Se acerca el cierre de la ${periodo.label} (${fmtDate(periodo.fecha)}, en ${diasRestantes} día${diasRestantes === 1 ? '' : 's'}) y no se ha corrido esa nómina.`;
      notifs.push({ id: `nomina-${periodo.tipoPeriodo}-${periodo.fecha}`, tipo: 'nomina', severidad: diasRestantes < 0 ? 'alta' : 'media', texto });
    }
  }

  const orden = { alta: 0, media: 1, baja: 2 };
  notifs.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
  return notifs;
}
