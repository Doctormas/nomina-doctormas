import { state } from '../state/store.js';
import { salarioVigente, estadoVacaciones } from '../lib/calculos.js';
import { fmt } from '../lib/moneda.js';
import { todayStr } from '../lib/formato.js';
import { exportBackup, importBackup } from '../lib/backup.js';
import { toast } from '../components/toast.js';

export function render(root, rerender) {
  const activos = state.EMPLEADOS.filter((e) => e.activo !== false);
  const nominaMensualEstimada = activos.reduce((a, e) => a + Number(salarioVigente(e, todayStr())), 0);
  let alertasVac = 0;
  activos.forEach((e) => { const v = estadoVacaciones(e); if (v.pendientesTotal > 0) alertasVac++; });

  root.innerHTML = `
  <div class="grid cols-3">
    <div class="card"><div class="desc">Empleados activos</div><h2 style="font-size:2rem;">${activos.length}</h2></div>
    <div class="card"><div class="desc">Nómina mensual estimada (salario base)</div><h2 style="font-size:1.6rem;">${fmt(nominaMensualEstimada)}</h2></div>
    <div class="card"><div class="desc">Empleados con vacaciones pendientes</div><h2 style="font-size:2rem;">${alertasVac}</h2></div>
  </div>
  <div class="card">
    <h2>Bienvenido</h2>
    <div class="desc">Sistema de nómina de Doctormás basado en la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras (LOTTT).</div>
    <p style="font-size:.88rem;line-height:1.6;">
      Empiece por revisar los parámetros en <b>Configuración</b> (salario mínimo vigente, tasas IVSS/FAOV/INCES/RPE, tasa de interés)
      y luego registre a su personal en <b>Empleados</b>. Desde ahí puede generar recibos de <b>Nómina</b>, controlar <b>Vacaciones</b>,
      calcular <b>Utilidades</b>, ver el acumulado de <b>Prestaciones sociales</b> y simular una <b>Liquidación</b> final.
    </p>
    <div class="note">Los datos se guardan en un archivo local en este computador. Exporte respaldos con frecuencia — sobre todo antes de reinstalar o cambiar de equipo.</div>
  </div>
  <div class="card">
    <h2>Respaldo de datos</h2>
    <div class="desc">Exporte periódicamente un respaldo de toda la información, o restaure uno anterior.</div>
    <div class="btn-row">
      <button class="btn secondary" id="btnExport">Exportar respaldo (.json)</button>
      <button class="btn ghost" id="btnImport">Importar respaldo</button>
      <button class="btn ghost" id="btnOpenDataDir">Abrir carpeta de datos</button>
    </div>
  </div>
  `;

  root.querySelector('#btnExport').addEventListener('click', exportBackup);
  root.querySelector('#btnImport').addEventListener('click', () => importBackup(rerender));
  root.querySelector('#btnOpenDataDir').addEventListener('click', async () => {
    const dir = await window.api.store.dataDir();
    await window.api.shell.openPath(dir);
  });
}
