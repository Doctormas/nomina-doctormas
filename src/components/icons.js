// Set mínimo de iconos de línea (24x24, stroke=currentColor) para la barra lateral.
const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const ICONS = {
  dashboard: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>'),
  config: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>'),
  empleados: svg('<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c.6-3.3 3.2-5.5 6.5-5.5s5.9 2.2 6.5 5.5"/><circle cx="17.5" cy="8.5" r="2.6"/><path d="M15.5 14.4c2.5.3 4.4 2.2 4.9 4.9"/>'),
  nomina: svg('<rect x="2.5" y="6" width="19" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.6"/><path d="M2.5 10.5h4M17.5 10.5h4"/>'),
  vacaciones: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 15l2 2 4-4"/>'),
  utilidades: svg('<path d="M20 8H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1z"/><path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/><path d="M12 8v12M12 8c-1.7 0-3.2-1.5-3.2-3.2S10.3 1.5 12 3.2c1.7-1.7 3.2-.1 3.2 1.6S13.7 8 12 8z"/>'),
  prestaciones: svg('<path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8"/><path d="M4 12l-1.5 1.5M4 12l1.8-.6"/><circle cx="12" cy="12" r="3.2"/>'),
  liquidacion: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
  informes: svg('<path d="M4 20V10M11 20V4M18 20v-7"/><path d="M2 20h20"/>'),
  parafiscales: svg('<path d="M3 21h18"/><path d="M4 21V10M20 21V10"/><path d="M2 10l10-6 10 6"/><path d="M8 10v11M12 10v11M16 10v11"/>'),
  cloud: svg('<path d="M7 18a4.5 4.5 0 0 1-.5-8.98A5.5 5.5 0 0 1 17.2 8.2 4 4 0 0 1 17 18H7z"/>'),
  refresh: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v6h-6"/>')
};
