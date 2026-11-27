/* Miscelazione e aggregazione delle HD (Part I Table 4) e compatibilità dei gruppi (Part I Table 5). */
import tables from '../../data/part1_tables45.json';
import type { Hd } from './matrix';
import { numLocale, t } from '../i18n';

export type HdFull = Hd | '1.4' | '1.5';
export const HD_FULL: HdFull[] = ['1.1', '1.2.1', '1.2.2', '1.2.3', '1.3.1', '1.3.2', '1.4', '1.5', '1.6'];
export type Cg = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L' | 'N' | 'S';
export const CGS: Cg[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'N', 'S'];

export const TABLE4 = tables.table4 as { title: string; hd: HdFull[]; cells: string[][]; notes: Record<string, string> };
export const TABLE5 = tables.table5 as { title: string; cg: Cg[]; cells: string[][]; notes: Record<string, string> };
export const TABLES45_SOURCE = tables.source;

export function table4Cell(a: HdFull, b: HdFull): string {
  return TABLE4.cells[TABLE4.hd.indexOf(a)][TABLE4.hd.indexOf(b)];
}
export function table5Cell(a: Cg, b: Cg): string {
  return TABLE5.cells[TABLE5.cg.indexOf(a)][TABLE5.cg.indexOf(b)];
}
/** "2), 6)" → ['2','6'] */
export const noteIds = (cell: string) => [...cell.matchAll(/(\d)\)/g)].map((m) => m[1]);

/* ---------------- Table 4 ---------------- */

/** Quantità per HD/SsD (NEQ sommato, MCE = evento singolo più grande). */
export interface HdLoad { hd: HdFull; neq: number; mce: number }

/** Un caso di calcolo: la QD del magazzino è il massimo tra i casi. */
export interface LoadCase { hd: Hd; neq: number; mce: number; label: string; rule: string }

export interface MixResult {
  totals: HdLoad[];            // per HD, prima delle regole
  cases: LoadCase[];           // casi da valutare (QD = massimo)
  applied: string[];           // regole applicate: note '1'…'6', 'agg11' (cella "1.1"), '1.2.3.3.3', 'as11-15'
  info: string[];              // spiegazioni
  warnings: string[];
  neqQd: number;               // NEQ che entra nei calcoli QD (esclusa HD 1.4)
  neq14: number;               // NEQ di HD 1.4 (distanze antincendio, §1.3.1.8)
}

export function sumByHd(items: { hd: HdFull; neq: number; mce?: number }[]): HdLoad[] {
  const m = new Map<HdFull, HdLoad>();
  for (const it of items) {
    if (!(it.neq > 0)) continue;
    const cur = m.get(it.hd) ?? { hd: it.hd, neq: 0, mce: 0 };
    cur.neq += it.neq;
    cur.mce = Math.max(cur.mce, it.mce ?? 0);
    m.set(it.hd, cur);
  }
  return HD_FULL.filter((h) => m.has(h)).map((h) => m.get(h)!);
}

/** Applica Table 4 e le sue note, con §1.2.3.3.3 per la miscela di HD 1.1, 1.2 e 1.3.
    `note6As11`: considera anche il caso cautelativo della nota 6 (1.2.1/1.2.2 con 1.3 → HD 1.1 aggregata). */
export function mixHd(loads: HdLoad[], opts: { note6As11?: boolean } = {}): MixResult {
  const totals = loads.map((l) => ({ ...l }));
  const applied = new Set<string>();
  const info: string[] = [];
  const warnings: string[] = [];
  const m = new Map<HdFull, HdLoad>();
  for (const l of loads) if (l.neq > 0) m.set(l.hd, { ...l });
  const res = (cases: LoadCase[]): MixResult => ({
    totals, cases, applied: [...applied], info, warnings,
    neqQd: totals.filter((l) => l.hd !== '1.4').reduce((s, l) => s + l.neq, 0),
    neq14,
  });

  // HD 1.4: nessuna aggregazione (nota 3), distanze antincendio (§1.3.1.8)
  const neq14 = m.get('1.4')?.neq ?? 0;
  if (m.has('1.4')) {
    m.delete('1.4');
    if (m.size) { applied.add('3'); info.push(t('HD 1.4 non aggregata al resto del contenuto (Table 4, nota 3).')); }
    info.push(t('HD 1.4: le distanze non dipendono dal NEQ; si applicano le norme antincendio (Part I §1.3.1.8).'));
    if (!m.size) return res([]);
  }
  // HD 1.5: le righe 1.1 e 1.5 di Table 4 coincidono; 1.5 con 1.5 → 1.1
  if (m.has('1.5')) {
    const l15 = m.get('1.5')!;
    m.delete('1.5');
    const l11 = m.get('1.1') ?? { hd: '1.1' as HdFull, neq: 0, mce: 0 };
    l11.neq += l15.neq;
    m.set('1.1', l11);
    applied.add('agg11');
    info.push(t('HD 1.5 trattata come HD 1.1 (Table 4: 1.5 con 1.5 o con 1.1 → 1.1).'));
  }
  // HD 1.6
  if (m.has('1.6')) {
    const l16 = m.get('1.6')!;
    if (m.size === 1) return res([{ hd: '1.6', neq: l16.neq, mce: l16.mce, label: 'HD 1.6', rule: t('HD unica') }]);
    m.delete('1.6');
    if (m.has('1.1')) {
      m.get('1.1')!.neq += l16.neq;
      applied.add('agg11');
      info.push(t('HD 1.6 con HD 1.1: NEQ aggregato come HD 1.1 (Table 4: cella "1.1").'));
    } else {
      const l123 = m.get('1.2.3') ?? { hd: '1.2.3' as HdFull, neq: 0, mce: 0 };
      l123.neq += l16.neq;
      l123.mce = Math.max(l123.mce, l16.mce);
      m.set('1.2.3', l123);
      applied.add('4'); applied.add('2');
      info.push(t('HD 1.6 trattata come SsD 1.2.3 (Table 4, nota 4) e si applica la nota 2.'));
    }
  }

  const has11 = m.has('1.1');
  const s12 = (['1.2.1', '1.2.2', '1.2.3'] as const).filter((h) => m.has(h));
  const s13 = (['1.3.1', '1.3.2'] as const).filter((h) => m.has(h));
  const N = (h: HdFull) => m.get(h)?.neq ?? 0;
  const MCE = (h: HdFull) => m.get(h)?.mce ?? 0;
  const N12 = s12.reduce((s, h) => s + N(h), 0);
  const N13 = s13.reduce((s, h) => s + N(h), 0);
  const total = N('1.1') + N12 + N13;
  const cases: LoadCase[] = [];
  const own = (h: Hd, rule: string): LoadCase => ({ hd: h, neq: N(h), mce: MCE(h), label: t('SsD {h} ({q} kg)', { h, q: fmt(N(h)) }), rule });

  if (has11 && !s12.length && !s13.length) {
    cases.push({ hd: '1.1', neq: N('1.1'), mce: 0, label: 'HD 1.1', rule: m.size === 1 && !applied.size ? t('HD unica') : t('HD 1.1 aggregata') });
  } else if (has11 && !s12.length) {
    applied.add('agg11');
    info.push(t('HD 1.1 con HD 1.3: NEQ sommato e trattato come HD 1.1 (Table 4: cella "1.1").'));
    cases.push({ hd: '1.1', neq: N('1.1') + N13, mce: 0, label: t('HD 1.1 aggregata ({q} kg)', { q: fmt(N('1.1') + N13) }), rule: t('Table 4 cella "1.1"') });
  } else if (has11) {
    applied.add('1');
    const aggN = N('1.1') + N12 + (s13.length ? N13 : 0);
    if (s13.length) { applied.add('agg11'); applied.add('1.2.3.3.3'); }
    cases.push({ hd: '1.1', neq: aggN, mce: 0, label: t('HD 1.1 aggregata ({q} kg)', { q: fmt(aggN) }), rule: s13.length ? t('nota 1a + §1.2.3.3.3') : t('nota 1a') });
    for (const h of s12) cases.push(own(h, t('nota 1b: solo HD 1.2')));
    if (s12.length > 1) applied.add('2');
    info.push(t('HD 1.1 con HD 1.2: si prende la QD maggiore tra (a) tutto aggregato come HD 1.1 e (b) la sola HD 1.2 con i suoi criteri (Table 4, nota 1).'));
    if (s13.length) {
      info.push(t('HD 1.1, 1.2 e 1.3 insieme: QD maggiore tra NEQ aggregato trattato come HD 1.1, HD 1.2 o HD 1.3 (Part I §1.2.3.3.3).'));
      for (const h of [...s12, ...s13]) cases.push({ hd: h, neq: total, mce: MCE(h), label: t('NEQ aggregato come SsD {h} ({q} kg)', { h, q: fmt(total) }), rule: '§1.2.3.3.3' });
    }
  } else {
    for (const h of s12) cases.push(own(h, s12.length + s13.length > 1 ? t('nota 2: SsD singolarmente') : t('HD unica')));
    if (s12.length && s12.length + s13.length > 1) {
      applied.add('2');
      info.push(t('SsD diverse non si aggregano: la QD di ciascuna si calcola col proprio NEQ e governa la maggiore (Table 4, nota 2).'));
    }
    if (s13.length === 2) {
      applied.add('5');
      info.push(t('SsD 1.3.1 con 1.3.2: NEQ sommato, QD maggiore tra trattarlo come 1.3.1 o come 1.3.2 (Table 4, nota 5).'));
      for (const h of s13) cases.push({ hd: h, neq: N13, mce: 0, label: t('HD 1.3 sommata come SsD {h} ({q} kg)', { h, q: fmt(N13) }), rule: t('nota 5') });
    } else if (s13.length === 1) {
      cases.push(own(s13[0], s12.length ? t('nota 2: SsD singolarmente') : t('HD unica')));
    }
    if (s13.length && s12.some((h) => h === '1.2.1' || h === '1.2.2')) {
      applied.add('6');
      warnings.push(t('SsD 1.2.1/1.2.2 con HD 1.3: in certe circostanze la miscela può comportarsi come HD 1.1 aggregata (Table 4, nota 6).'));
      if (opts.note6As11) cases.push({ hd: '1.1', neq: N12 + N13, mce: 0, label: t('Nota 6: aggregato come HD 1.1 ({q} kg)', { q: fmt(N12 + N13) }), rule: t('nota 6 (scelta cautelativa)') });
    }
  }
  return res(cases);
}

const fmt = (x: number) => Math.round(x).toLocaleString(numLocale());

/* ---------------- Table 5 ---------------- */

export interface CompatIssue { a: Cg; b: Cg; level: 'vietato' | 'condizionato'; notes: string[]; text: string }

/** Verifica tutte le coppie di gruppi presenti (anche A con A, L con L: note 4). */
export function checkCompat(cgs: Cg[]): CompatIssue[] {
  const u = CGS.filter((c) => cgs.includes(c));
  const out: CompatIssue[] = [];
  for (let i = 0; i < u.length; i++) for (let j = i; j < u.length; j++) {
    const a = u[i], b = u[j];
    if (a === b && a !== 'L' && a !== 'N') continue;   // stesso gruppo: X (L e N hanno note proprie)
    const cell = table5Cell(a, b);
    if (cell === 'X') continue;
    if (cell === '') { out.push({ a, b, level: 'vietato', notes: [], text: t('{a} con {b}: miscelazione non ammessa (Table 5).', { a, b }) }); continue; }
    const ids = noteIds(cell);
    const strict = ids.includes('4');   // L: sempre separato
    out.push({ a, b, level: strict && a !== b ? 'vietato' : 'condizionato', notes: ids,
      text: t('{a} con {b}: ammessa solo alle condizioni della nota {notes} di Table 5.', { a, b, notes: ids.join(', ') }) });
  }
  return out;
}
