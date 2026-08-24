import { toast } from '../components/toast.js';

const BOM = String.fromCharCode(0xFEFF);

export async function downloadCSV(csv, filename) {
  const res = await window.api.file.saveAs(BOM + csv, filename, 'CSV', ['csv']);
  if (!res.canceled) toast('CSV guardado: ' + res.filePath, 'success');
  return res;
}
