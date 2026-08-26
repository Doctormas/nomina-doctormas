// Exportación a los formatos CSV que pide el banco para pagar: uno para el
// bono de alimentación (Tipo/Nro Documento, Nombre, Apellido, Teléfono,
// Correo, Monto) y otro para la nómina/transferencia salarial a la cuenta de
// cada trabajador (Tipo/Nro Documento, Cuenta, Nombre, Monto). Separador ";"
// y decimales con coma en ambos, igual que las plantillas reales del banco.

// Divide un nombre completo en "nombre" y "apellido" al estilo de esa
// plantilla: con 3 palabras o más, las últimas 2 son el apellido y el resto
// el nombre; con 2 palabras se reparte una y una; con 1 sola, va toda en
// el nombre.
function dividirNombreApellido(nombreCompleto) {
  const palabras = (nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length <= 1) return { nombre: palabras[0] || '', apellido: '' };
  if (palabras.length === 2) return { nombre: palabras[0], apellido: palabras[1] };
  return { nombre: palabras.slice(0, -2).join(' '), apellido: palabras.slice(-2).join(' ') };
}

// "V-16.760.440", "16760440", "E-12345" → { tipo: 'V', numero: '16760440' }
function dividirCedula(cedula) {
  const s = (cedula || '').trim();
  const m = s.match(/^([VEJGPveijgp])/);
  const tipo = m ? m[1].toUpperCase() : 'V';
  const numero = s.replace(/\D/g, '');
  return { tipo, numero };
}

// El banco usa coma como separador decimal (no punto) y sin separador de miles.
function montoCSV(n) {
  return Number(n || 0).toFixed(2).replace('.', ',');
}

// El delimitador de columnas es ";" — solo se escapan comillas/; /saltos de
// línea, NUNCA la coma (es el separador decimal del monto, no del banco).
function escCampo(v) {
  v = (v === undefined || v === null) ? '' : String(v);
  return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function filaCSV(cols) {
  return cols.map(escCampo).join(';');
}

// montoDeFila: función opcional (fila) => monto — por defecto toma fila.r.monto
// (el caso de la corrida "Bono de alimentación" en solitario). Cuando el bono
// viene incluido dentro de una nómina normal, se le pasa fila.r.cestaticketPeriodo
// en su lugar, para no confundirlo con el salario de esa misma fila.
export function bonoAlimentacionBancoCSV(filas, montoDeFila) {
  montoDeFila = montoDeFila || ((f) => f.r.monto);
  const lineas = [filaCSV(['Tipo Documento', 'Nro Documento', 'Nombre Beneficiario', 'Apellido', 'Nro. Teléfono', 'Correo', 'Monto'])];
  filas.filter((f) => f.emp).forEach((fila) => {
    const { emp } = fila;
    const { tipo, numero } = dividirCedula(emp.cedula);
    const { nombre, apellido } = dividirNombreApellido(emp.nombre);
    lineas.push(filaCSV([tipo, numero, nombre, apellido, emp.telefono || '', emp.correo || '', montoCSV(montoDeFila(fila))]));
  });
  return lineas.join('\n');
}

// CSV de transferencia bancaria para pagar el salario (o cualquier neto de
// carácter salarial) a la cuenta de cada trabajador — formato con "Cuenta"
// que pide el banco para la nómina. montoDeFila decide qué monto va en cada
// fila: para nómina normal es el salario neto DESPUÉS de deducciones, sin
// incluir el bono de alimentación (eso va aparte, en bonoAlimentacionBancoCSV,
// porque las deducciones solo se le aplican a lo salarial, nunca al bono).
export function nominaBancoCSV(filas, montoDeFila) {
  const lineas = [filaCSV(['Tipo Documento', 'Nro Documento', 'Cuenta', 'Nombre Beneficiario', 'Monto'])];
  filas.filter((f) => f.emp).forEach((fila) => {
    const { emp } = fila;
    const { tipo, numero } = dividirCedula(emp.cedula);
    lineas.push(filaCSV([tipo, numero, emp.numeroCuenta || '', (emp.nombre || '').toUpperCase(), montoCSV(montoDeFila(fila))]));
  });
  return lineas.join('\n');
}
