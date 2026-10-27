// Carga masiva de empleados desde Excel/CSV — misma lógica de mapeo de
// columnas y normalización del archivo original.
import { state } from '../state/store.js';

export const BULK_FIELD_DEFS = [
  { key: 'nombre', headers: ['nombre completo', 'nombre'], required: true },
  { key: 'cedula', headers: ['cedula', 'cédula', 'ci'] },
  { key: 'fechaIngreso', headers: ['fecha de ingreso', 'fecha ingreso'], required: true, isDate: true },
  { key: 'cargo', headers: ['cargo'] },
  { key: 'departamento', headers: ['departamento', 'area', 'área'] },
  { key: 'tipoContrato', headers: ['tipo de contrato', 'tipo contrato'] },
  { key: 'monedaSalario', headers: ['moneda del salario', 'moneda salario', 'moneda'] },
  { key: 'salarioBase', headers: ['salario base mensual', 'salario base', 'salario'], required: true, isNumber: true },
  { key: 'diasUtilidadesAnual', headers: ['dias de utilidades anuales (opcional)', 'dias de utilidades anuales', 'dias utilidades'], isNumber: true },
  { key: 'cestaticket', headers: ['bono de alimentacion mensual (opcional)', 'bono de alimentacion mensual', 'bono de alimentacion', 'bono alimenticio mensual (opcional)', 'bono alimenticio mensual', 'bono alimenticio', 'cestaticket'], isNumber: true },
  { key: 'cestaticketMoneda', headers: ['moneda del bono de alimentacion', 'moneda bono de alimentacion', 'moneda del bono alimenticio', 'moneda bono alimenticio', 'moneda cestaticket'] },
  { key: 'nacionalidad', headers: ['nacionalidad'] },
  { key: 'fechaNacimiento', headers: ['fecha de nacimiento', 'fecha nacimiento'], isDate: true },
  { key: 'sexo', headers: ['sexo'] },
  { key: 'telefono', headers: ['telefono', 'teléfono'] },
  { key: 'correo', headers: ['correo', 'email', 'correo electronico'] },
  { key: 'direccion', headers: ['direccion', 'dirección'] },
  { key: 'formaPago', headers: ['forma de pago', 'forma pago'] },
  { key: 'banco', headers: ['banco'] },
  { key: 'numeroCuenta', headers: ['numero de cuenta', 'número de cuenta', 'cuenta / telefono pago movil', 'cuenta'] },
  { key: 'contactoEmergenciaNombre', headers: ['contacto de emergencia - nombre', 'contacto emergencia nombre'] },
  { key: 'contactoEmergenciaTelefono', headers: ['contacto de emergencia - telefono', 'contacto emergencia telefono'] },
  { key: 'activo', headers: ['estado', 'activo'] },
  // Para personal que ya egresó (cargarlo para que quede todo en nómina)
  { key: 'fechaEgreso', headers: ['fecha de egreso', 'fecha egreso'], isDate: true },
  { key: 'motivoEgreso', headers: ['motivo de egreso', 'motivo egreso', 'causa de egreso'] },
  { key: 'inscritoIVSS', headers: ['inscrito en el ivss', 'inscrito ivss'] },
  { key: 'islrPorcentaje', headers: ['% islr', 'porcentaje islr', 'islr %', '% de islr'], isNumber: true },
  { key: 'tramiteIvss', headers: ['desincorporado del ivss', 'desincorporado ivss'] },
  { key: 'tramiteFaov', headers: ['desincorporado del faov', 'desincorporado faov'] },
  { key: 'tramiteInces', headers: ['desincorporado del inces', 'desincorporado inces'] },
  { key: 'tramiteRpe', headers: ['desincorporado del rpe', 'desincorporado rpe'] }
];

const esSi = (v) => ['si', 's', 'x', '1', 'true', 'yes', 'y'].includes(normalizarTexto(v));

export function mapearMotivoEgreso(s) {
  const n = normalizarTexto(s);
  if (!n) return '';
  if (n.includes('renuncia')) return 'renuncia';
  if (n.includes('injustific')) return 'despido_injustificado';
  if (n.includes('despido')) return 'despido_justificado';
  if (n.includes('mutuo')) return 'mutuo_acuerdo';
  if (n.includes('ajena')) return 'causa_ajena';
  if (n.includes('fallec')) return 'fallecimiento';
  return '';
}

/** Hoja "Cambios de sueldo": [Cédula, Fecha desde, Monto mensual, Moneda] → lista de cambios. */
export function mapearCambiosSueldo(filas) {
  if (!filas || filas.length < 2) return [];
  const cab = filas[0].map(normalizarTexto);
  const idx = (alts) => cab.findIndex((h) => alts.some((a) => h === normalizarTexto(a)));
  const iCed = idx(['cedula', 'cédula']); const iFecha = idx(['fecha desde', 'desde', 'fecha']);
  const iMonto = idx(['monto mensual', 'monto', 'salario']); const iMon = idx(['moneda']);
  if (iCed < 0 || iFecha < 0 || iMonto < 0) return [];
  const out = [];
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f || f.every((c) => c === '' || c === undefined || c === null)) continue;
    const monto = Number(String(f[iMonto]).replace(/[^0-9.-]/g, ''));
    const fecha = normalizarFechaCelda(f[iFecha]);
    out.push({
      cedula: String(f[iCed] || '').trim(), fecha, monto,
      moneda: normalizarTexto(iMon >= 0 ? f[iMon] : '').includes('usd') ? 'USD' : 'VES',
      valido: !!(String(f[iCed] || '').trim() && fecha && monto > 0)
    });
  }
  return out;
}

export const soloDigitos = (c) => String(c || '').replace(/\D/g, '');

export function normalizarTexto(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function plantillaEmpleadosPayload() {
  const headers = [
    'Nombre completo', 'Cédula', 'Fecha de ingreso', 'Cargo', 'Departamento', 'Tipo de contrato',
    'Moneda del salario', 'Salario base mensual', 'Días de utilidades anuales (opcional)',
    'Bono de alimentación mensual (opcional)', 'Moneda del bono de alimentación',
    'Nacionalidad', 'Fecha de nacimiento', 'Sexo', 'Teléfono', 'Correo', 'Dirección',
    'Forma de pago', 'Banco', 'Número de cuenta', 'Contacto de emergencia - Nombre',
    'Contacto de emergencia - Teléfono', 'Estado',
    'Fecha de egreso', 'Motivo de egreso', 'Inscrito en el IVSS', '% ISLR',
    'Desincorporado del IVSS', 'Desincorporado del FAOV', 'Desincorporado del INCES', 'Desincorporado del RPE'
  ];
  const ejemplo = [
    'María Pérez', 'V-12345678', '2024-03-01', 'Enfermera', 'Emergencia', 'Tiempo indeterminado',
    'VES', '15000', '', '', 'VES', 'Venezolana', '1990-05-12', 'F', '0414-1234567', 'maria@ejemplo.com', 'Caracas',
    'Transferencia', 'Banesco', '01340012345678901234', 'Juan Pérez', '0424-7654321', 'Activo',
    '', '', 'Sí', '', '', '', '', ''
  ];
  const notas = [
    'Formato de fechas: AAAA-MM-DD. Moneda: VES o USD. Tipo de contrato: Tiempo indeterminado / Tiempo determinado / Obra determinada / Pasantía. Forma de pago: Transferencia / Pago móvil / Efectivo / Zelle. Estado: Activo / Inactivo. Para personal que ya egresó: llene Fecha de egreso y Motivo de egreso (Renuncia / Despido justificado / Despido injustificado / Mutuo acuerdo); queda como Egresado. Solo Nombre, Fecha de ingreso y Salario base mensual son obligatorios. El bono de alimentación y los días de utilidades son propios de cada persona — si se dejan en blanco, se usa el valor general de Configuración.'
  ];
  return { headers, ejemplo, notas, defaultFilename: 'plantilla-carga-masiva-empleados.xlsx' };
}

function excelSerialAFecha(n) {
  const utcDays = Math.floor(n - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000);
}

export function normalizarFechaCelda(valor) {
  if (valor === undefined || valor === null || valor === '') return '';
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'number') return excelSerialAFecha(valor).toISOString().slice(0, 10);
  const s = String(valor).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

export function mapearTipoContrato(s) {
  const n = normalizarTexto(s);
  if (!n) return 'indefinido';
  if (n.includes('determinad') && !n.includes('indeterminad')) return 'determinado';
  if (n.includes('obra')) return 'obra_determinada';
  if (n.includes('pasant')) return 'pasantia';
  return 'indefinido';
}
export function mapearFormaPago(s) {
  const n = normalizarTexto(s);
  if (n.includes('movil')) return 'pago_movil';
  if (n.includes('efectivo')) return 'efectivo';
  if (n.includes('zelle') || n.includes('divisa')) return 'zelle';
  return 'transferencia';
}

/** Recibe las filas crudas (array de arrays) que devuelve window.api.xlsx.parseFile. */
export function mapearFilasBulk(filas) {
  if (!filas.length) return [];
  const headerRow = filas[0].map(normalizarTexto);
  const colIndexPorCampo = {};
  BULK_FIELD_DEFS.forEach((def) => {
    const idx = headerRow.findIndex((h) => def.headers.some((alt) => h === normalizarTexto(alt)));
    if (idx >= 0) colIndexPorCampo[def.key] = idx;
  });
  const registros = [];
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila || fila.every((c) => c === '' || c === undefined || c === null)) continue;
    const obj = {};
    const fechasIlegibles = [];
    // Filas que solo traen una fecha suelta (sin nombre ni cédula) son relleno de la plantilla.
    const idxNombre = colIndexPorCampo.nombre; const idxCedula = colIndexPorCampo.cedula;
    const sinIdentidad = !String(idxNombre !== undefined ? fila[idxNombre] : '').trim() && !String(idxCedula !== undefined ? fila[idxCedula] : '').trim();
    if (sinIdentidad && fila.filter((c) => c !== '' && c !== undefined && c !== null).length <= 1) continue;
    BULK_FIELD_DEFS.forEach((def) => {
      const idx = colIndexPorCampo[def.key];
      let val = idx !== undefined ? fila[idx] : '';
      if (def.isDate) {
        const crudo = val;
        val = normalizarFechaCelda(val);
        if (!val && crudo !== '' && crudo !== undefined && crudo !== null && String(crudo).trim() !== '') fechasIlegibles.push(`${def.headers[0]} "${String(crudo).trim()}"`);
      }
      else if (def.isNumber) val = (val === '' || val === undefined) ? '' : Number(String(val).replace(/[^0-9.-]/g, ''));
      else val = val === undefined ? '' : String(val).trim();
      obj[def.key] = val;
    });
    obj.monedaSalario = normalizarTexto(obj.monedaSalario).includes('usd') ? 'USD' : 'VES';
    obj.cestaticketMoneda = normalizarTexto(obj.cestaticketMoneda).includes('usd') ? 'USD' : 'VES';
    obj.tipoContrato = mapearTipoContrato(obj.tipoContrato);
    obj.formaPago = mapearFormaPago(obj.formaPago);
    obj.sexo = normalizarTexto(obj.sexo) === 'f' || normalizarTexto(obj.sexo).includes('femenino') ? 'F' : (normalizarTexto(obj.sexo) === 'm' || normalizarTexto(obj.sexo).includes('masculino') ? 'M' : '');
    obj.activo = !normalizarTexto(obj.activo).includes('inactivo');
    obj.motivoEgreso = mapearMotivoEgreso(obj.motivoEgreso);
    obj.inscritoIVSS = !['no', 'n', '0', 'false'].includes(normalizarTexto(obj.inscritoIVSS));
    ['tramiteIvss', 'tramiteFaov', 'tramiteInces', 'tramiteRpe'].forEach((k) => { obj[k] = esSi(obj[k]); });
    obj.fechasIlegibles = fechasIlegibles;
    if (obj.fechaEgreso) obj.activo = false; // con fecha de egreso queda como Egresado
    registros.push(obj);
  }
  return registros;
}

export function validarRegistroBulk(r) {
  const errores = [];
  if (!r.nombre) errores.push('falta nombre');
  if (!r.fechaIngreso) errores.push('fecha de ingreso inválida o vacía');
  if (r.salarioBase === '' || isNaN(r.salarioBase) || r.salarioBase <= 0) errores.push('salario base inválido');
  (r.fechasIlegibles || []).forEach((f) => errores.push(`fecha ilegible: ${f}`));
  if (r.fechaEgreso && r.fechaIngreso && r.fechaEgreso < r.fechaIngreso) errores.push('el egreso es anterior al ingreso');
  const duplicado = r.cedula && state.EMPLEADOS.some((e) => e.cedula && e.cedula.trim() === String(r.cedula).trim());
  return { errores, duplicado };
}
