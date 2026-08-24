// Cálculo del % de retención de ISLR (formulario AR-I) — Art. 50 LISLR y
// Art. 4 del Reglamento Parcial del Decreto 1.808 en materia de retenciones.
//
// La Tarifa N° 1 (tramos, % y sustraendo en U.T.) es la misma desde 1999 —
// lo único que cambia con el tiempo es el valor en bolívares de la Unidad
// Tributaria. Verificado un tramo (3.000-4.000 U.T. → 24%, sustraendo 375
// U.T.) contra una fuente pública antes de usar la tabla completa; aun así,
// antes de aplicar un % real a un pago, verifíquelo con su contador.
export const UT_VALOR_BS_REF = 43; // Bs./U.T. — Gaceta Oficial 43.140, 02/06/2025. Ajústelo si cambia.

export const TARIFA_1 = [
  { hasta: 1000, pct: 6, sustraendoUT: 0 },
  { hasta: 1500, pct: 9, sustraendoUT: 30 },
  { hasta: 2000, pct: 12, sustraendoUT: 75 },
  { hasta: 2500, pct: 16, sustraendoUT: 155 },
  { hasta: 3000, pct: 20, sustraendoUT: 255 },
  { hasta: 4000, pct: 24, sustraendoUT: 375 },
  { hasta: 6000, pct: 29, sustraendoUT: 575 },
  { hasta: Infinity, pct: 34, sustraendoUT: 875 }
];

export const DESGRAVAMEN_UNICO_UT = 774; // Art. 60 LISLR — opción simplificada, sin comprobantes.
export const REBAJA_PERSONAL_UT = 10;    // Art. 61 LISLR — por el propio contribuyente.
export const REBAJA_CARGA_UT = 10;       // Art. 61 LISLR — por cada carga familiar (cónyuge, ascendientes/descendientes directos).

function tramoDe(enriquecimientoNetoUT) {
  return TARIFA_1.find((t) => enriquecimientoNetoUT <= t.hasta) || TARIFA_1[TARIFA_1.length - 1];
}

/**
 * Calcula el % de ISLR a retener sobre cada pago, siguiendo el mismo método
 * que usa el formulario AR-I: se proyecta el ingreso anual, se le resta el
 * desgravamen, se ubica el tramo de la Tarifa 1, se restan las rebajas
 * personales, y el impuesto resultante se expresa como % del ingreso anual.
 */
export function calcularPorcentajeARI({ ingresoAnualBs, desgravamenUT, cargasFamiliares, utValorBs }) {
  const ut = utValorBs || UT_VALOR_BS_REF;
  const ingresoAnualUT = ingresoAnualBs / ut;
  const enriquecimientoNetoUT = Math.max(ingresoAnualUT - desgravamenUT, 0);
  const tramo = tramoDe(enriquecimientoNetoUT);
  const impuestoUT = Math.max(enriquecimientoNetoUT * (tramo.pct / 100) - tramo.sustraendoUT, 0);
  const rebajasUT = REBAJA_PERSONAL_UT + REBAJA_CARGA_UT * (cargasFamiliares || 0);
  const impuestoNetoUT = Math.max(impuestoUT - rebajasUT, 0);
  const impuestoNetoBs = impuestoNetoUT * ut;
  const porcentaje = ingresoAnualBs > 0 ? (impuestoNetoBs / ingresoAnualBs) * 100 : 0;
  return {
    ut, ingresoAnualUT, enriquecimientoNetoUT, tramo, impuestoUT, rebajasUT, impuestoNetoUT, impuestoNetoBs,
    porcentaje: Math.round(porcentaje * 100) / 100
  };
}
