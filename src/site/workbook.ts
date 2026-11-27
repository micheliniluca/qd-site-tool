/* File Excel di verifica con formule aperte: la distanza richiesta, il margine e l'esito sono formule Excel
   che l'utente può ricontrollare; i valori del motore sono scritti come valori in cache. */
import * as XLSX from 'xlsx';
import { optLabel } from '../engine/cell';
import { distanceExcel, segmentExcel, usedSegment } from '../engine/excelFormula';
import { F, formulaTable, segText } from '../engine/formulas';
import { COLCODE, EFFNAME, MATRIX } from '../engine/matrix';
import { TABLE4 } from '../engine/mixing';
import { evaluateSite, SECTOR_IT, type PairCase, type PairEval, type SiteEval } from './evaluate';
import { magazineLoad, STRUCT_NAME, type Magazine, type Project } from './model';

const DRAFT = 'BOZZA — da verificare e firmare a cura di personale qualificato';
const EDITION = 'AASTP-1 Edition D Version 1 (nov. 2025)';

type Cell = XLSX.CellObject;
const s = (v: string): Cell => ({ t: 's', v });
const n = (v: number): Cell => ({ t: 'n', v });
const f = (formula: string, v: number | string): Cell => (typeof v === 'number' ? { t: 'n', f: formula, v } : { t: 's', f: formula, v });

function sheet(rows: (Cell | string | number | null)[][], widths: number[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  rows.forEach((r, i) => r.forEach((c, j) => {
    if (c == null) return;
    ws[XLSX.utils.encode_cell({ r: i, c: j })] = typeof c === 'object' ? c : typeof c === 'number' ? n(c) : s(c);
  }));
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: Math.max(0, ...rows.map((r) => r.length - 1)) } });
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  return ws;
}

const CASE_HEAD = ['Coppia', 'PES', 'ES', 'Sito unico', 'Caso (Table 4)', 'Q (kg)', 'Grandezza', 'Effetto', 'Settore PES', 'Tabella', 'Col.', 'Riga ES', 'Pag. PDF',
  'Cella (testo)', 'Formula', 'Tratto usato', 'D richiesta (m)', 'D misurata (m)', 'Margine (m)', 'Esito', 'Rischio accettato'];

/** Righe di un caso: la colonna F (Q) e Q (D misurata) sono valori; Q richiesta, margine ed esito sono formule. */
function caseRow(p: Project, pr: PairEval, c: PairCase, row: number, name: (id: string) => string): (Cell | string | number | null)[] {
  const r = row + 1;   // riga Excel (1-based)
  const q = `F${r}`, dreq = `Q${r}`, dmis = `R${r}`;
  const o = c.res.o;
  const fx = o ? distanceExcel(o, c.res.Q, q) : null;
  let reqCell: Cell | string;
  if (!o || c.res.r?.none) reqCell = n(0);
  else if (fx) reqCell = f(fx, c.req ?? 0);
  else reqCell = s('fuori campo');
  const pageRow = c.col >= 0 ? MATRIX.tables[pr.table].rows[c.es.row] : null;
  const segIdx = o?.ref && !c.res.r?.oor ? usedSegment(o.ref, c.res.Q) : -1;
  return [
    pr.key, name(pr.pesId), name(pr.esId), pr.groupId ? 'sì' : '', `HD ${c.load.hd} (${c.load.rule})`, n(Math.round(c.res.Q * 1000) / 1000), c.res.qtype,
    c.extra ? 'Terrapieno condiviso (§1.3.6.6.3)' : EFFNAME[c.eff], c.pesSector ? SECTOR_IT[c.pesSector] : '—',
    c.col >= 0 ? `Table ${pr.table}` : '—', c.col >= 0 ? `(${COLCODE[pr.table][c.col]})` : '—', c.col >= 0 ? c.es.row : '—', pageRow ? n(pageRow.page) : '—',
    c.res.raw, o ? optLabel(o) : '—', segIdx >= 0 ? segText(o!.ref!, c.res.Q) ?? '' : '',
    reqCell, n(Math.round(c.dist * 100) / 100),
    typeof reqCell === 'object' && reqCell.t === 'n' ? f(`${dmis}-${dreq}`, Math.round((c.dist - (c.req ?? 0)) * 100) / 100) : '—',
    typeof reqCell === 'object' && reqCell.t === 'n' ? f(`IF(${dmis}>=${dreq},"OK","NON CONFORME")`, c.status === 'ko' ? 'NON CONFORME' : 'OK') : 'DA VERIFICARE',
    p.risks[`pair:${pr.key}`] ? `sì: ${p.risks[`pair:${pr.key}`].text}` : '',
  ];
}

export function buildWorkbook(p: Project, site: SiteEval = evaluateSite(p)): XLSX.WorkBook {
  const name = (id: string) => p.objects.find((o) => o.id === id)?.name ?? '?';
  const wb = XLSX.utils.book_new();
  const now = new Date().toISOString().slice(0, 10);

  XLSX.utils.book_append_sheet(wb, sheet([
    [DRAFT], [EDITION], [], ['Sito', p.name], ['Data', now], ['Stato del sito', site.status], ['Coppie verificate', site.pairs.length],
    [], ['Come leggere il file'],
    ['“Casi”: ogni riga è un caso (effetto × settore × riga ES × caso di carico). D richiesta, margine ed esito sono formule Excel modificabili;'],
    ['la colonna “Q (kg)” è la quantità di riferimento (NEQ o MCE, Part I Ch.3 Table 1), “D misurata” la distanza tra i punti più vicini (Part I §1.3.2.2).'],
    ['“Coppie”: per ogni coppia il caso che governa. “Formule”: tutti i tratti di Annex I-A Tables 5–9 con la traduzione Excel.'],
    ['Distanze arrotondate per eccesso al metro (Annex I-A Sect. I §5). Al raccordo tra due tratti si usa quello con la distanza maggiore.'],
  ], [28, 60]), 'Leggimi');

  const mags = p.objects.filter((o): o is Magazine => o.kind === 'magazine');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['Magazzino', 'Costruzione', 'Table PES', 'NEQ per QD (kg)', 'NEQ HD 1.4 (kg)', 'Casi di calcolo (Table 4)', 'Regole applicate', 'Sito unico', 'Esito'],
    ...mags.map((m) => {
      const l = magazineLoad(m);
      const g = site.groupOf.get(m.id);
      return [m.name, STRUCT_NAME[m.struct], `Table ${m.struct === 'ecm' ? 1 : m.struct === 'heavy' ? 2 : m.struct === 'medium' ? 3 : 4}`, n(l.neqQd), n(l.neq14),
        l.cases.map((c) => `HD ${c.hd}: ${Math.round(c.neq)} kg${c.mce ? ` (MCE ${c.mce})` : ''}`).join('; '),
        l.applied.map((a) => (/^\d$/.test(a) ? `nota ${a}` : a)).join(', '),
        g && g.members.length > 1 ? g.members.map(name).join(' + ') : '', site.byObject[m.id] ?? ''];
    }),
  ], [12, 34, 10, 14, 14, 50, 22, 24, 10]), 'Magazzini');

  const rows: (Cell | string | number | null)[][] = [CASE_HEAD];
  for (const pr of site.pairs) for (const c of pr.cases) rows.push(caseRow(p, pr, c, rows.length, name));
  XLSX.utils.book_append_sheet(wb, sheet(rows, [18, 10, 16, 8, 30, 10, 8, 20, 9, 8, 6, 7, 7, 30, 12, 46, 12, 12, 10, 14, 30]), 'Casi');

  const grows: (Cell | string | number | null)[][] = [CASE_HEAD];
  for (const pr of site.pairs) if (pr.gov) grows.push(caseRow(p, pr, pr.gov, grows.length, name));
  XLSX.utils.book_append_sheet(wb, sheet(grows, [18, 10, 16, 8, 30, 10, 8, 20, 9, 8, 6, 7, 7, 30, 12, 46, 12, 12, 10, 14, 30]), 'Coppie');

  const frows: (Cell | string | number | null)[][] = [['Formula', 'Tabella', 'Tratto', 'Q da (kg)', 'Q a (kg)', 'Testo', 'Excel (Q in colonna F)']];
  for (const ref of Object.keys(F)) F[ref].forEach((g, i) => frows.push([ref, formulaTable(ref), i + 1,
    `${g[1] ? '≥' : '>'} ${g[0]}`, `${g[3] ? '≤' : '<'} ${g[2]}`, g[4].tx ?? '', segmentExcel(ref, i, 'F')]));
  XLSX.utils.book_append_sheet(wb, sheet(frows, [8, 30, 7, 12, 12, 60, 50]), 'Formule');

  XLSX.utils.book_append_sheet(wb, sheet([
    ['Chiave', 'Oggetto', 'Motivazione', 'Accettato da', 'Data'],
    ...Object.entries(p.risks).map(([k, r]) => [k, k.startsWith('pair:') ? k.slice(5).split('>').map(name).join(' → ') : k, r.text, r.by, r.date]),
  ], [30, 30, 60, 24, 12]), 'Rischi accettati');

  XLSX.utils.book_append_sheet(wb, sheet([
    ['Part I Table 4 — note'], ...Object.entries(TABLE4.notes).map(([k, v]) => [`Nota ${k}`, v]),
  ], [10, 120]), 'Table 4');
  return wb;
}

export function downloadWorkbook(p: Project) {
  XLSX.writeFile(buildWorkbook(p), `${p.name.replace(/[^\w\-]+/g, '_') || 'sito'}_verifica_QD_BOZZA.xlsx`, { compression: true });
}
