/* File Excel di verifica con formule aperte: la distanza richiesta, il margine e l'esito sono formule Excel
   che l'utente può ricontrollare; i valori del motore sono scritti come valori in cache. */
import * as XLSX from 'xlsx';
import { optLabel } from '../engine/cell';
import { distanceExcel, segmentExcel, usedSegment } from '../engine/excelFormula';
import { F, formulaTable, segText, txText } from '../engine/formulas';
import { COLCODE, EFFNAME, MATRIX } from '../engine/matrix';
import { TABLE4 } from '../engine/mixing';
import { evaluateSite, SECTOR_IT, type PairCase, type PairEval, type SiteEval } from './evaluate';
import { magazineLoad, STRUCT_NAME, type Magazine, type Project } from './model';
import { N_, t } from '../i18n';

const DRAFT = N_('BOZZA — da verificare e firmare a cura di personale qualificato');
const EDITION = N_('AASTP-1 Edition D Version 1 (nov. 2025)');

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

const CASE_HEAD = [N_('Coppia'), 'PES', 'ES', N_('Sito unico'), N_('Caso (Table 4)'), 'Q (kg)', N_('Grandezza'), N_('Effetto'), N_('Settore PES'), N_('Tabella'), N_('Col.'), N_('Riga ES'), N_('Pag. PDF'),
  N_('Cella (testo)'), N_('Formula'), N_('Tratto usato'), N_('D richiesta (m)'), N_('D misurata (m)'), N_('Margine (m)'), N_('Esito'), N_('Rischio accettato')];
const caseHead = () => CASE_HEAD.map((h) => t(h));

/** Righe di un caso: la colonna F (Q) e Q (D misurata) sono valori; Q richiesta, margine ed esito sono formule. */
function caseRow(p: Project, pr: PairEval, c: PairCase, row: number, name: (id: string) => string): (Cell | string | number | null)[] {
  const r = row + 1;   // riga Excel (1-based)
  const q = `F${r}`, dreq = `Q${r}`, dmis = `R${r}`;
  const o = c.res.o;
  const fx = o ? distanceExcel(o, c.res.Q, q) : null;
  let reqCell: Cell | string;
  if (!o || c.res.r?.none) reqCell = n(0);
  else if (fx) reqCell = f(fx, c.req ?? 0);
  else reqCell = s(t('fuori campo'));
  const pageRow = c.col >= 0 ? MATRIX.tables[pr.table].rows[c.es.row] : null;
  const segIdx = o?.ref && !c.res.r?.oor ? usedSegment(o.ref, c.res.Q) : -1;
  return [
    pr.key, name(pr.pesId), name(pr.esId), pr.groupId ? t('sì') : '', `HD ${c.load.hd} (${c.load.rule})`, n(Math.round(c.res.Q * 1000) / 1000), c.res.qtype,
    c.extra ? t('Terrapieno condiviso (§1.3.6.6.3)') : t(EFFNAME[c.eff]), c.pesSector ? t(SECTOR_IT[c.pesSector]) : '—',
    c.col >= 0 ? `Table ${pr.table}` : '—', c.col >= 0 ? `(${COLCODE[pr.table][c.col]})` : '—', c.col >= 0 ? c.es.row : '—', pageRow ? n(pageRow.page) : '—',
    c.res.raw, o ? optLabel(o) : '—', segIdx >= 0 ? segText(o!.ref!, c.res.Q) ?? '' : '',
    reqCell, n(Math.round(c.dist * 100) / 100),
    typeof reqCell === 'object' && reqCell.t === 'n' ? f(`${dmis}-${dreq}`, Math.round((c.dist - (c.req ?? 0)) * 100) / 100) : '—',
    typeof reqCell === 'object' && reqCell.t === 'n' ? f(`IF(${dmis}>=${dreq},"OK","${t('NON CONFORME')}")`, c.status === 'ko' ? t('NON CONFORME') : 'OK') : t('DA VERIFICARE'),
    p.risks[`pair:${pr.key}`] ? t('sì: {text}', { text: p.risks[`pair:${pr.key}`].text }) : '',
  ];
}

export function buildWorkbook(p: Project, site: SiteEval = evaluateSite(p)): XLSX.WorkBook {
  const name = (id: string) => p.objects.find((o) => o.id === id)?.name ?? '?';
  const wb = XLSX.utils.book_new();
  const now = new Date().toISOString().slice(0, 10);

  XLSX.utils.book_append_sheet(wb, sheet([
    [t(DRAFT)], [t(EDITION)], [], [t('Sito'), p.name], [t('Data'), now], [t('Stato del sito'), site.status], [t('Coppie verificate'), site.pairs.length],
    [], [t('Come leggere il file')],
    [t('“Casi”: ogni riga è un caso (effetto × settore × riga ES × caso di carico). D richiesta, margine ed esito sono formule Excel modificabili;')],
    [t('la colonna “Q (kg)” è la quantità di riferimento (NEQ o MCE, Part I Ch.3 Table 1), “D misurata” la distanza tra i punti più vicini (Part I §1.3.2.2).')],
    [t('“Coppie”: per ogni coppia il caso che governa. “Formule”: tutti i tratti di Annex I-A Tables 5–9 con la traduzione Excel.')],
    [t('Distanze arrotondate per eccesso al metro (Annex I-A Sect. I §5). Al raccordo tra due tratti si usa quello con la distanza maggiore.')],
  ], [28, 60]), t('Leggimi'));

  const mags = p.objects.filter((o): o is Magazine => o.kind === 'magazine');
  XLSX.utils.book_append_sheet(wb, sheet([
    [t('Magazzino'), t('Costruzione'), 'Table PES', t('NEQ per QD (kg)'), 'NEQ HD 1.4 (kg)', t('Casi di calcolo (Table 4)'), t('Regole applicate'), t('Sito unico'), t('Esito')],
    ...mags.map((m) => {
      const l = magazineLoad(m);
      const g = site.groupOf.get(m.id);
      return [m.name, t(STRUCT_NAME[m.struct]), `Table ${m.struct === 'ecm' ? 1 : m.struct === 'heavy' ? 2 : m.struct === 'medium' ? 3 : 4}`, n(l.neqQd), n(l.neq14),
        l.cases.map((c) => `HD ${c.hd}: ${Math.round(c.neq)} kg${c.mce ? ` (MCE ${c.mce})` : ''}`).join('; '),
        l.applied.map((a) => (/^\d$/.test(a) ? t('nota {n}', { n: a }) : a)).join(', '),
        g && g.members.length > 1 ? g.members.map(name).join(' + ') : '', site.byObject[m.id] ?? ''];
    }),
  ], [12, 34, 10, 14, 14, 50, 22, 24, 10]), t('Magazzini'));

  const rows: (Cell | string | number | null)[][] = [caseHead()];
  for (const pr of site.pairs) for (const c of pr.cases) rows.push(caseRow(p, pr, c, rows.length, name));
  XLSX.utils.book_append_sheet(wb, sheet(rows, [18, 10, 16, 8, 30, 10, 8, 20, 9, 8, 6, 7, 7, 30, 12, 46, 12, 12, 10, 14, 30]), t('Casi'));

  const grows: (Cell | string | number | null)[][] = [caseHead()];
  for (const pr of site.pairs) if (pr.gov) grows.push(caseRow(p, pr, pr.gov, grows.length, name));
  XLSX.utils.book_append_sheet(wb, sheet(grows, [18, 10, 16, 8, 30, 10, 8, 20, 9, 8, 6, 7, 7, 30, 12, 46, 12, 12, 10, 14, 30]), t('Coppie'));

  const frows: (Cell | string | number | null)[][] = [[t('Formula'), t('Tabella'), t('Tratto'), t('Q da (kg)'), t('Q a (kg)'), t('Testo'), t('Excel (Q in colonna F)')]];
  for (const ref of Object.keys(F)) F[ref].forEach((g, i) => frows.push([ref, formulaTable(ref), i + 1,
    `${g[1] ? '≥' : '>'} ${g[0]}`, `${g[3] ? '≤' : '<'} ${g[2]}`, txText(g[4].tx), segmentExcel(ref, i, 'F')]));
  XLSX.utils.book_append_sheet(wb, sheet(frows, [8, 30, 7, 12, 12, 60, 50]), t('Formule'));

  XLSX.utils.book_append_sheet(wb, sheet([
    [t('Chiave'), t('Oggetto'), t('Motivazione'), t('Accettato da'), t('Data')],
    ...Object.entries(p.risks).map(([k, r]) => [k, k.startsWith('pair:') ? k.slice(5).split('>').map(name).join(' → ') : k, r.text, r.by, r.date]),
  ], [30, 30, 60, 24, 12]), t('Rischi accettati'));

  XLSX.utils.book_append_sheet(wb, sheet([
    [t('Part I Table 4 — note')], ...Object.entries(TABLE4.notes).map(([k, v]) => [t('Nota {n}', { n: k }), v]),
  ], [10, 120]), 'Table 4');
  return wb;
}

export function downloadWorkbook(p: Project) {
  XLSX.writeFile(buildWorkbook(p), t('{name}_verifica_QD_BOZZA.xlsx', { name: p.name.replace(/[^\w\-]+/g, '_') || t('sito') }), { compression: true });
}
