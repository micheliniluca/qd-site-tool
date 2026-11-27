/* Lettura e scrittura dell'inventario in Excel (SheetJS). */
import * as XLSX from 'xlsx';
import { magazineLoad, type Magazine, type Project } from '../site/model';
import { parseInventory, TEMPLATE_HEADERS, TEMPLATE_ROWS, type ParseResult } from '../site/inventoryImport';

export async function readInventoryFile(f: File): Promise<ParseResult & { sheet: string }> {
  const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
  const sheet = wb.SheetNames[0];
  const table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: true, defval: '' });
  return { ...parseInventory(table), sheet };
}

function download(wb: XLSX.WorkBook, name: string) {
  XLSX.writeFile(wb, name, { compression: true });
}

export function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_ROWS]);
  ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
  const help = XLSX.utils.aoa_to_sheet([
    ['Istruzioni'],
    ['Una riga per tipo di munizionamento. "Magazzino" deve coincidere con il nome del magazzino nel progetto.'],
    ['HD/SsD: 1.1, 1.2.1, 1.2.2, 1.2.3, 1.3.1, 1.3.2, 1.4, 1.5, 1.6 — oppure il codice di classificazione (es. 1.1D).'],
    ['HD 1.2 senza SsD: si deduce dall\'HE per colpo (> 0,136 kg → 1.2.1). HD 1.3 senza SsD: si assume 1.3.1.'],
    ['NEQ: "NEQ unitario" per pezzo oppure "NEQ totale" della riga. MCE (kg) per 1.2.1, 1.2.3 e 1.6: se manca si usa il NEQ della riga.'],
    ['Riferimenti: AASTP-1 Ed. D V1, Part I Ch.2 Tables 2–5; Part I Ch.3 §1.3.2.3–1.3.2.4.'],
  ]);
  XLSX.utils.book_append_sheet(wb, help, 'Istruzioni');
  download(wb, 'modello_inventario_QD.xlsx');
}

export function exportInventory(p: Project) {
  const rows: (string | number)[][] = [];
  for (const m of p.objects.filter((o): o is Magazine => o.kind === 'magazine')) {
    if (m.contentMode === 'inventory') for (const it of m.items ?? []) rows.push([m.name, it.descr, '', it.hd, it.cg, it.qty, it.neqUnit, it.mce ?? '', '']);
    else if (m.neq > 0) rows.push([m.name, 'Contenuto semplice', '', m.hd, '', 1, m.neq, ['1.2.1', '1.2.3', '1.6'].includes(m.hd) ? m.mce : '', '']);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows]), 'Inventario');
  const sum = p.objects.filter((o): o is Magazine => o.kind === 'magazine').map((m) => {
    const l = magazineLoad(m);
    return [m.name, l.neqQd, l.neq14, l.cases.map((c) => `${c.hd}: ${Math.round(c.neq)} kg`).join('; '), l.applied.join(', ')];
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Magazzino', 'NEQ per QD (kg)', 'NEQ HD 1.4 (kg)', 'Casi di calcolo (Table 4)', 'Regole applicate'], ...sum]), 'Riepilogo');
  download(wb, `${p.name.replace(/[^\w\-]+/g, '_') || 'sito'}_inventario.xlsx`);
}
