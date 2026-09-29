// Centro de notificaciones: no persiste nada, se recalcula cada vez que se
// abre el panel (o al re-renderizar) a partir del estado actual — así nunca
// queda desactualizado ni hay que migrar datos viejos.
import { state } from '../state/store.js';
import { estadoDe } from '../views/empleados.js';
import { periodoNominal } from './calculos.js';
import { todayStr, parseDate, fmtDate } from './formato.js';

function esBancamiga(banco) {
  return !!(banco && banco.toLowerCase().includes('bancamiga'));
}

// Quincena/cierre de mes en el que cae "hoy", con su rango completo (no solo
// la fecha de cierre) — "Fecha de corte" al correr nómina casi nunca es
// exacto el día 15 o el último del mes (por defecto es "hoy"), así que para
// saber si YA se corrió este período hay que comparar por rango, no por
// fecha exacta.
function periodoActual(hoyISO) {
  const tipoPeriodo = parseDate(hoyISO).getDate() <= 15 ? 'primera' : 'segunda';
  const label = tipoPeriodo === 'primera' ? 'primera quincena' : 'segunda quincena / cierre de mes';
  const { desde, hasta } = periodoNominal(tipoPeriodo, hoyISO);
  return { tipoPeriodo, label, desde, fecha: hasta };
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

    // Documentos físicos con fecha de vencimiento (pestaña Documentos de la
    // ficha) — solo se avisa de empleados activos, ya vencidos o a menos de
    // 30 días de vencer.
    if (estado === 'activo') {
      (e.documentos || []).forEach((d) => {
        if (!d.fechaVencimiento) return;
        const dias = Math.round((parseDate(d.fechaVencimiento) - parseDate(hoyISO)) / 86400000);
        if (dias > 30) return;
        const nombreDoc = d.tipo || 'un documento';
        const texto = dias < 0
          ? `${e.nombre}: "${nombreDoc}" venció el ${fmtDate(d.fechaVencimiento)} — actualícelo.`
          : dias === 0
            ? `${e.nombre}: "${nombreDoc}" vence hoy.`
            : `${e.nombre}: "${nombreDoc}" vence en ${dias} día${dias === 1 ? '' : 's'} (${fmtDate(d.fechaVencimiento)}).`;
        notifs.push({ id: `doc-${e.id}-${d.id}`, tipo: 'documento', severidad: dias < 0 ? 'alta' : 'media', texto });
      });

      // Expediente incompleto: hay documentos listados en la ficha (pestaña
      // Documentos) a los que todavía no se les adjunta el archivo — sin
      // esto completo no se puede generar el expediente en PDF.
      const faltantes = (e.documentos || []).filter((d) => !d.archivoRuta);
      if (faltantes.length) {
        notifs.push({
          id: `expediente-${e.id}`, tipo: 'expediente', severidad: 'baja',
          texto: `${e.nombre}: faltan ${faltantes.length} documento${faltantes.length === 1 ? '' : 's'} por adjuntar al expediente (${faltantes.map((d) => d.tipo || 'sin nombre').join(', ')}).`
        });
      }
    }
  });

  const periodo = periodoActual(hoyISO);
  const yaCorrida = state.PERIODOS.some((p) => p.tipoPeriodo === periodo.tipoPeriodo && p.fecha >= periodo.desde && p.fecha <= periodo.fecha);
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
