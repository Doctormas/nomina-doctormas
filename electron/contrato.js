// Generador del contrato de trabajo en Word (.docx), a partir de los datos
// que llena el usuario en el modal de "Generar contrato" (src/views/empleados.js).
// La estructura sigue el Art. 59 de la LOTTT (contenido mínimo del contrato
// de trabajo escrito) y las modalidades de los Art. 60-64 (tiempo
// indeterminado / determinado / obra determinada) y Art. 173 (jornada).
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak
} = require('docx');

function p(text, opts) {
  opts = opts || {};
  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: 200 },
    children: [new TextRun({ text, bold: !!opts.bold, size: opts.size || 22 })]
  });
}

// Párrafo con partes en negrita (para "CLÁUSULA PRIMERA: texto normal").
function pMixed(parts, opts) {
  opts = opts || {};
  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: 200 },
    children: parts.map((seg) => new TextRun({ text: seg.text, bold: !!seg.bold, size: 22 }))
  });
}

function heading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    alignment: AlignmentType.CENTER,
    spacing: { before: 300, after: 200 },
    children: [new TextRun({ text, bold: true, size: 24 })]
  });
}

const MODALIDAD_LABEL = {
  indeterminado: 'a tiempo indeterminado',
  determinado: 'a tiempo determinado',
  obra: 'para una obra determinada'
};

const MOTIVO_ART64 = {
  naturaleza: 'lo exige la naturaleza del servicio a prestar (Art. 64, literal a, LOTTT)',
  sustitucion: 'tiene por objeto sustituir provisional y lícitamente a un trabajador o trabajadora (Art. 64, literal b, LOTTT)',
  exterior: 'se trata de un trabajador venezolano que prestará servicios fuera del territorio de la República (Art. 64, literal c, LOTTT)',
  labor_pendiente: 'no ha terminado la labor para la que fue contratado y se sigue requiriendo el servicio (Art. 64, literal d, LOTTT)'
};

const JORNADA_LABEL = {
  diurna: 'diurna (5:00 a.m. a 7:00 p.m.), que no podrá exceder de ocho (8) horas diarias ni de cuarenta (40) horas semanales (Art. 173.1 LOTTT)',
  nocturna: 'nocturna (7:00 p.m. a 5:00 a.m.), que no podrá exceder de siete (7) horas diarias ni de treinta y cinco (35) horas semanales (Art. 173.2 LOTTT)',
  mixta: 'mixta (con períodos diurnos y nocturnos), que no podrá exceder de siete horas y media (7,5) diarias ni de treinta y siete horas y media (37,5) semanales (Art. 173.3 LOTTT)'
};

const MODALIDAD_PRESTACION_LABEL = {
  presencial: 'de forma presencial, en el lugar de trabajo indicado',
  remoto: 'de forma remota (teletrabajo)',
  hibrido: 'de forma híbrida, combinando prestación presencial y remota según lo acuerden las partes'
};

function firmaBlock(empresaTxt, repNombre, repCedula, trabNombre, trabCedula) {
  return [
    new Paragraph({ spacing: { before: 800 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 100 },
      children: [new TextRun({ text: 'Leído y conforme, las partes suscriben el presente contrato en dos (2) ejemplares de un mismo tenor y a un solo efecto, en la fecha indicada.', size: 22 })]
    }),
    new Paragraph({ spacing: { before: 600 }, children: [new TextRun({ text: '_______________________________', size: 22 })] }),
    new Paragraph({ children: [new TextRun({ text: 'EL PATRONO', bold: true, size: 22 })] }),
    new Paragraph({ children: [new TextRun({ text: empresaTxt, size: 20 })] }),
    new Paragraph({ children: [new TextRun({ text: repNombre ? `Representado por: ${repNombre}${repCedula ? ' — C.I. ' + repCedula : ''}` : '', size: 20 })] }),
    new Paragraph({ spacing: { before: 600 }, children: [new TextRun({ text: '_______________________________', size: 22 })] }),
    new Paragraph({ children: [new TextRun({ text: 'EL TRABAJADOR / LA TRABAJADORA', bold: true, size: 22 })] }),
    new Paragraph({ children: [new TextRun({ text: `${trabNombre}${trabCedula ? ' — C.I. ' + trabCedula : ''}`, size: 20 })] })
  ];
}

/**
 * datos: {
 *   empresaTxt, repNombre, repCedula, lugarCelebracion, fechaCelebracion,
 *   trabNombre, trabCedula, trabNacionalidad, trabFechaNacimiento, trabEstadoCivil, trabDireccion,
 *   cargo, descripcionServicio,
 *   modalidad: 'indeterminado'|'determinado'|'obra', fechaTermino, motivoDeterminado, motivoOtro, descripcionObra,
 *   fechaInicio,
 *   jornada: 'diurna'|'nocturna'|'mixta', horarioDesde, horarioHasta, diasLaborables,
 *   modalidadPrestacion: 'presencial'|'remoto'|'hibrido', lugarPrestacion,
 *   salarioMonto, salarioMoneda, periodicidadPago, formaPago,
 *   cestaticketMonto, cestaticketMoneda,
 *   beneficiosAdicionales, clausulasAdicionales
 * }
 */
async function construirContratoBuffer(datos) {
  const d = datos || {};
  const children = [];

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: 'CONTRATO DE TRABAJO', bold: true, size: 28 })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: (MODALIDAD_LABEL[d.modalidad] || 'a tiempo indeterminado').toUpperCase(), bold: true, size: 22 })]
  }));

  children.push(p(
    `Entre ${d.empresaTxt || '[EMPRESA]'}, en lo sucesivo denominada "EL PATRONO", representada en este acto por ${d.repNombre || '[representante legal]'}${d.repCedula ? ', titular de la cédula de identidad N° ' + d.repCedula : ''}; y por la otra parte, ${d.trabNombre || '[TRABAJADOR]'}, venezolano(a)${d.trabNacionalidad && d.trabNacionalidad !== 'Venezolana' ? ' de nacionalidad ' + d.trabNacionalidad : ''}, titular de la cédula de identidad N° ${d.trabCedula || '—'}${d.trabEstadoCivil ? ', ' + d.trabEstadoCivil : ''}, domiciliado(a) en ${d.trabDireccion || '—'}, en lo sucesivo denominado(a) "EL TRABAJADOR" o "LA TRABAJADORA", se ha convenido en celebrar, como en efecto se celebra, el presente Contrato de Trabajo, de conformidad con lo establecido en la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT), el cual se regirá por las cláusulas siguientes:`
  ));

  children.push(heading('CLÁUSULAS'));

  children.push(pMixed([
    { text: 'CLÁUSULA PRIMERA — Objeto y cargo. ', bold: true },
    { text: `EL TRABAJADOR se obliga a prestar sus servicios personales para EL PATRONO desempeñando el cargo de ${d.cargo || '—'}${d.descripcionServicio ? ', cuyas funciones consisten, con la mayor precisión posible, en: ' + d.descripcionServicio : ''}, de conformidad con el numeral 3 del Art. 59 de la LOTTT.` }
  ]));

  let clausulaSegunda = `El presente contrato se celebra ${MODALIDAD_LABEL[d.modalidad] || 'a tiempo indeterminado'}, de conformidad con los Art. 60 al 64 de la LOTTT.`;
  if (d.modalidad === 'determinado') {
    clausulaSegunda += ` Tendrá una duración hasta el ${d.fechaTermino || '[fecha de término]'}, por cuanto ${MOTIVO_ART64[d.motivoDeterminado] || (d.motivoOtro || 'así lo requiere la relación de trabajo')}. Las partes dejan constancia de que, conforme al Art. 62 de la LOTTT, los trabajadores no podrán obligarse a prestar servicios por más de un (1) año bajo esta modalidad, y que una segunda prórroga del contrato lo convertirá en un contrato a tiempo indeterminado.`;
  } else if (d.modalidad === 'obra') {
    clausulaSegunda += ` La obra a ejecutar consiste, con toda precisión, en: ${d.descripcionObra || '[descripción de la obra]'}. El contrato durará por todo el tiempo requerido para la ejecución de dicha obra y terminará con la conclusión de la misma, de conformidad con el Art. 63 de la LOTTT.`;
  } else {
    clausulaSegunda += ' Se presume que las relaciones de trabajo son a tiempo indeterminado, salvo las excepciones taxativas previstas en la Ley (Art. 61 LOTTT).';
  }
  children.push(pMixed([{ text: 'CLÁUSULA SEGUNDA — Naturaleza y duración del contrato. ', bold: true }, { text: clausulaSegunda }]));

  children.push(pMixed([
    { text: 'CLÁUSULA TERCERA — Fecha de inicio. ', bold: true },
    { text: `La relación de trabajo se inicia el ${d.fechaInicio || '—'}.` }
  ]));

  children.push(pMixed([
    { text: 'CLÁUSULA CUARTA — Jornada de trabajo. ', bold: true },
    { text: `EL TRABAJADOR cumplirá una jornada ${JORNADA_LABEL[d.jornada] || JORNADA_LABEL.diurna}${d.horarioDesde && d.horarioHasta ? `, en el horario comprendido entre las ${d.horarioDesde} y las ${d.horarioHasta}` : ''}${d.diasLaborables ? `, los días ${d.diasLaborables}` : ''}. Conforme al Art. 173 de la LOTTT, tendrá derecho a dos (2) días de descanso continuos y remunerados por cada semana de labor.` }
  ]));

  children.push(pMixed([
    { text: 'CLÁUSULA QUINTA — Modalidad y lugar de prestación del servicio. ', bold: true },
    { text: `El servicio se prestará ${MODALIDAD_PRESTACION_LABEL[d.modalidadPrestacion] || MODALIDAD_PRESTACION_LABEL.presencial}, en: ${d.lugarPrestacion || '—'}.${d.modalidadPrestacion !== 'presencial' ? ' Las partes dejan constancia de que, a la fecha de este contrato, el teletrabajo no cuenta con una ley especial que lo regule en Venezuela, por lo que esta modalidad se rige por las disposiciones generales de la LOTTT; EL TRABAJADOR conserva los mismos derechos y beneficios que un trabajador que preste servicios de forma presencial.' : ''}` }
  ]));

  // Si el salario se pacta en USD, la ley exige que el contrato quede
  // también expresado en bolívares — pero SIN imprimir un monto en Bs fijo
  // (se desactualiza casi de inmediato por la variación cambiaria). Se deja
  // solo el mecanismo de conversión: la tasa BCV vigente en cada pago.
  const equivalenteBs = d.salarioMoneda === 'USD'
    ? ' Su equivalente en bolívares se calculará, en cada oportunidad de pago, conforme a la tasa de cambio oficial publicada por el Banco Central de Venezuela (BCV) vigente para esa fecha.'
    : '';
  children.push(pMixed([
    { text: 'CLÁUSULA SEXTA — Salario. ', bold: true },
    { text: `EL PATRONO pagará a EL TRABAJADOR un salario de ${d.salarioMonto || '—'} ${d.salarioMoneda === 'USD' ? 'dólares de los Estados Unidos de América (USD)' : 'bolívares (Bs.)'} mensuales, pagadero de forma ${d.periodicidadPago || 'quincenal'}${d.formaPago ? ' mediante ' + d.formaPago : ''}, sin perjuicio de los aumentos que correspondan por ley.${equivalenteBs} El salario en ningún caso será inferior al salario mínimo nacional vigente.` }
  ]));

  // A partir de acá la numeración es dinámica (Bono de alimentación,
  // Beneficios adicionales y Cláusulas adicionales son todas opcionales/
  // condicionales), para no tener que llevar la cuenta a mano con ternarios.
  const ORDINALES = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA', 'UNDÉCIMA', 'DUODÉCIMA'];
  let ordinalIdx = 6; // ya se usaron PRIMERA..SEXTA arriba

  // Bono de alimentación: mismo tratamiento que el salario — si se fija en
  // USD, se agrega que el equivalente en bolívares se calcula a la tasa BCV
  // vigente en cada pago, SIN congelar un monto en Bs (se desactualiza casi
  // de inmediato por la variación cambiaria).
  if (d.cestaticketMonto) {
    const equivalenteBonoBs = d.cestaticketMoneda === 'USD'
      ? ' Su equivalente en bolívares se calculará, en cada oportunidad de pago, conforme a la tasa de cambio oficial publicada por el Banco Central de Venezuela (BCV) vigente para esa fecha.'
      : '';
    children.push(pMixed([
      { text: `CLÁUSULA ${ORDINALES[ordinalIdx++]} — Bono de alimentación. `, bold: true },
      { text: `EL PATRONO otorgará a EL TRABAJADOR el beneficio de alimentación de conformidad con la Ley de Alimentación para los Trabajadores y las Trabajadoras, por un monto de ${d.cestaticketMonto} ${d.cestaticketMoneda === 'USD' ? 'dólares de los Estados Unidos de América (USD)' : 'bolívares (Bs.)'} mensuales, el cual no tiene carácter salarial.${equivalenteBonoBs}` }
    ]));
  }

  if (d.beneficiosAdicionales) {
    children.push(pMixed([
      { text: `CLÁUSULA ${ORDINALES[ordinalIdx++]} — Beneficios adicionales. `, bold: true },
      { text: d.beneficiosAdicionales }
    ]));
  }

  children.push(pMixed([
    { text: `CLÁUSULA ${ORDINALES[ordinalIdx++]} — Beneficios de ley. `, bold: true },
    { text: 'EL TRABAJADOR gozará de todos los beneficios, prestaciones e indemnizaciones establecidos en la LOTTT y demás leyes de la seguridad social venezolana (vacaciones y bono vacacional, utilidades, prestaciones sociales, inscripción y cotización al Seguro Social Obligatorio, Régimen Prestacional de Empleo, Régimen Prestacional de Vivienda y Hábitat, INCES, y Ley de Protección de las Pensiones de la Seguridad Social, según corresponda), sin que la falta de mención expresa en este contrato de alguno de ellos implique su renuncia, la cual es nula de conformidad con el Art. 18 de la LOTTT.' }
  ]));

  if (d.clausulasAdicionales) {
    children.push(pMixed([
      { text: `CLÁUSULA ${ORDINALES[ordinalIdx++]} — Cláusulas adicionales. `, bold: true },
      { text: d.clausulasAdicionales }
    ]));
  }

  children.push(pMixed([
    { text: `CLÁUSULA FINAL — Legislación aplicable. `, bold: true },
    { text: 'Para todo lo no previsto expresamente en este contrato, las partes se someten a lo establecido en la LOTTT, su Reglamento y demás normativa laboral y de seguridad social de la República Bolivariana de Venezuela, así como a la jurisdicción de los tribunales laborales competentes.' }
  ]));

  children.push(p(`En ${d.lugarCelebracion || '—'}, a los ${d.fechaCelebracion || '—'}.`, { align: AlignmentType.LEFT }));

  children.push(...firmaBlock(d.empresaTxt, d.repNombre, d.repCedula, d.trabNombre, d.trabCedula));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(p('Nota: este documento es una plantilla base generada automáticamente a partir de los datos cargados, siguiendo el contenido mínimo exigido por el Art. 59 de la LOTTT y las modalidades de sus Art. 60 a 64. No sustituye la revisión de un abogado laboral antes de su firma — verifique especialmente la cláusula de tiempo determinado (si aplica) contra los supuestos taxativos del Art. 64, ya que fuera de esos casos la ley considera el contrato como de tiempo indeterminado.', { align: AlignmentType.LEFT, size: 18 }));

  const doc = new Document({
    sections: [{ properties: {}, children }]
  });
  return Packer.toBuffer(doc);
}

module.exports = { construirContratoBuffer };
