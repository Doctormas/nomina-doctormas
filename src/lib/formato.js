// Utilidades de formato y fechas — portadas del original sin cambios de comportamiento.

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function fmtNum(n, dec) {
  dec = dec === undefined ? 2 : dec;
  return Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function parseDate(s) {
  return s ? new Date(s + 'T00:00:00') : null;
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function fmtDate(s) {
  if (!s) return '—';
  const d = parseDate(s);
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function tablaToCSV(headers, rows) {
  const esc = (v) => {
    v = (v === undefined || v === null) ? '' : String(v);
    return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  return [headers.map(esc).join(';')].concat(rows.map((r) => r.map(esc).join(';'))).join('\n');
}

export function escapeHtml(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
