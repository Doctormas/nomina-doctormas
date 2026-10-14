// Constancia de trabajo — la usa la ficha del empleado (cualquier momento) y
// la liquidación (última hoja del documento). Todo sale de los datos que ya
// están en la ficha y en Configuración (representante legal y su cargo).
import { state, empresaConRif } from '../state/store.js';
import { logoHeaderHTML } from './logo.js';
import { parseDate, todayStr, escapeHtml } from './formato.js';

function fechaLarga(iso) {
  return parseDate(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * @param {object} d
 *  nombre, cedula, nacionalidad, cargo, fechaIngreso (ISO),
 *  fechaEgreso (ISO o '' si sigue trabajando), salarioTexto ('' = no incluir sueldo),
 *  destinatario, observaciones, fechaEmision (ISO), lugar
 */
export function constanciaTrabajoHTML(d) {
  const c = state.CONFIG;
  const emision = d.fechaEmision || todayStr();
  const egresado = !!d.fechaEgreso;
  const termino = egresado ? `hasta el ${fechaLarga(d.fechaEgreso)}` : 'hasta la presente fecha';
  const sueldo = d.salarioTexto
    ? `, siendo ${egresado ? 'su último' : 'su'} sueldo básico mensual ${escapeHtml(d.salarioTexto)}, más los beneficios de ley`
    : '';
  const repNombre = c.repLegalNombre || '________________';
  const repCedula = c.repLegalCedula || '________';
  const repCargo = c.repLegalCargo || 'Representante legal';
  const destinatario = (d.destinatario || '').trim();

  return `
  <div style="font-size:13px;line-height:1.75;">
    <div style="display:flex;justify-content:center;">${logoHeaderHTML()}</div>
    <div style="text-align:center;font-weight:700;">${escapeHtml(empresaConRif())}</div>
    <h2 style="text-align:center;margin:26px 0 22px;font-size:1.3rem;letter-spacing:.06em;">CONSTANCIA DE TRABAJO</h2>
    ${destinatario ? `<p style="margin:0 0 14px;"><b>Dirigida a:</b> ${escapeHtml(destinatario)}</p>` : ''}
    <p style="text-align:justify;margin:0 0 14px;">
      Quien suscribe, <b>${escapeHtml(repNombre)}</b>, titular de la cédula de identidad N° ${escapeHtml(repCedula)}, en su carácter de
      <b>${escapeHtml(repCargo)}</b> de la empresa <b>${escapeHtml(c.nombreEmpresa)}</b>, RIF ${escapeHtml(c.rif || '—')},
      por medio de la presente HACE CONSTAR que el(la) ciudadano(a) <b>${escapeHtml(d.nombre)}</b>,
      de nacionalidad ${escapeHtml(d.nacionalidad || 'venezolana').toLowerCase()}, titular de la cédula de identidad N° ${escapeHtml(d.cedula || '—')},
      ${egresado ? 'prestó' : 'presta'} sus servicios en esta empresa desde el ${fechaLarga(d.fechaIngreso)} ${termino},
      desempeñándose en el cargo de <b>${escapeHtml(d.cargo || '—')}</b>${sueldo}.
    </p>
    ${d.observaciones ? `<p style="text-align:justify;margin:0 0 14px;">${escapeHtml(d.observaciones)}</p>` : ''}
    <p style="text-align:justify;margin:0 0 14px;">
      Constancia que se expide a petición de la parte interesada, en ${escapeHtml(d.lugar || 'Caracas')}, a los ${fechaLarga(emision)}.
    </p>
    <div style="margin-top:90px;text-align:center;page-break-inside:avoid;break-inside:avoid;">
      <div style="display:inline-block;min-width:260px;border-top:1px solid #3F4249;padding-top:6px;">
        <b>${escapeHtml(repNombre)}</b><br>${escapeHtml(repCargo)}<br>${escapeHtml(c.nombreEmpresa)}
      </div>
    </div>
  </div>`;
}
