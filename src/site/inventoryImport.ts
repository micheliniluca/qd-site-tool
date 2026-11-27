/* Interpretazione delle righe di un inventario (da Excel/CSV) in righe di magazzino. Puro: i file li legge ui/inventoryExcel.ts. */
import { CGS, HD_FULL, type Cg, type HdFull } from '../engine/mixing';
import { newItem, type Item } from './model';
import { N_, t } from '../i18n';

export type Col = 'mag' | 'descr' | 'code' | 'hd' | 'cg' | 'qty' | 'neqUnit' | 'neqTot' | 'mce' | 'he';

/** Intestazioni riconosciute (minuscolo, senza accenti né punteggiatura). */
const HEADERS: Record<Col, string[]> = {
  mag: ['magazzino', 'magazine', 'deposito', 'pes', 'edificio', 'locale'],
  descr: ['descrizione', 'descr', 'articolo', 'item', 'denominazione', 'nome', 'materiale', 'munizionamento'],
  code: ['codice di classificazione', 'classificazione', 'classification code', 'codice classificazione', 'codice', 'code'],
  hd: ['hd', 'divisione', 'hazard division', 'divisione di rischio', 'hd ssd', 'ssd'],
  cg: ['cg', 'gruppo', 'gruppo di compatibilita', 'compatibilita', 'compatibility group'],
  qty: ['quantita', 'qty', 'quantity', 'pezzi', 'n pezzi', 'numero', 'colpi'],
  neqUnit: ['neq unitario', 'neq per pezzo', 'neq pz', 'neq unit', 'neq unitario kg', 'neq per colpo', 'neq per unit', 'neq per item', 'neq per round'],
  neqTot: ['neq', 'neq totale', 'neq tot', 'neq kg', 'neq totale kg'],
  mce: ['mce', 'mce kg'],
  he: ['he per colpo', 'he', 'he kg', 'esplosivo per colpo', 'he per round', 'he per item'],
};

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').replace(/\s*\.\s*/g, '').trim();

export function mapHeaders(headers: string[]): Partial<Record<Col, number>> {
  const out: Partial<Record<Col, number>> = {};
  const hs = headers.map((h) => norm(String(h ?? '')));
  // prima le corrispondenze esatte, poi i prefissi
  for (const exact of [true, false]) {
    for (const col of Object.keys(HEADERS) as Col[]) {
      if (out[col] != null) continue;
      const i = hs.findIndex((h, j) => !Object.values(out).includes(j) &&
        HEADERS[col].some((k) => (exact ? h === norm(k) : h.startsWith(norm(k)))));
      if (i >= 0) out[col] = i;
    }
  }
  return out;
}

const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s/g, '');
  if (!s) return NaN;
  // 1.234,5 → 1234.5 ; 1234.5 → 1234.5
  const u = /,\d{1,3}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  return parseFloat(u);
};

export interface ParsedRow { mag: string; item: Item; warnings: string[] }
export interface ParseResult { rows: ParsedRow[]; errors: string[]; mapped: Partial<Record<Col, number>> }

/** HD/SsD e gruppo da colonne HD, CG o codice di classificazione ("1.1D", "1.2.1 E", "1.3G"). */
export function parseClass(hdRaw: string, cgRaw: string, codeRaw: string, unitHe: number): { hd?: HdFull; cg?: Cg; warn: string[] } {
  const warn: string[] = [];
  let hd = String(hdRaw ?? '').trim().replace(',', '.');
  let cg = String(cgRaw ?? '').trim().toUpperCase();
  const code = String(codeRaw ?? '').trim().toUpperCase().replace(',', '.').replace(/\s+/g, '');
  const m = /^(1\.[1-6](?:\.[1-3])?)([A-S])?$/.exec(code);
  if (m) { if (!hd) hd = m[1]; if (!cg && m[2]) cg = m[2]; }
  const hm = /^(1\.[1-6](?:\.[1-3])?)\s*([A-S])?$/i.exec(hd);
  if (hm) { hd = hm[1]; if (!cg && hm[2]) cg = hm[2].toUpperCase(); }
  if (hd === '1.2') {
    if (unitHe > 0) { hd = unitHe > 0.136 ? '1.2.1' : '1.2.2'; warn.push(t("SsD {hd} dedotta dall'HE per colpo ({he} kg; soglia 0,136 kg)", { hd, he: unitHe })); }
    else { hd = '1.2.1'; warn.push(t('HD 1.2 senza SsD né HE per colpo: assunta SsD 1.2.1 (da verificare)')); }
  }
  if (hd === '1.3') { hd = '1.3.1'; warn.push(t('HD 1.3 senza SsD: assunta SsD 1.3.1 (da verificare)')); }
  return {
    hd: (HD_FULL as string[]).includes(hd) ? (hd as HdFull) : undefined,
    cg: (CGS as string[]).includes(cg) ? (cg as Cg) : undefined,
    warn,
  };
}

/** `table`: prima riga = intestazioni. */
export function parseInventory(table: unknown[][]): ParseResult {
  const errors: string[] = [];
  if (!table.length) return { rows: [], errors: [t('Foglio vuoto.')], mapped: {} };
  const mapped = mapHeaders(table[0] as string[]);
  if (mapped.mag == null) errors.push(t('Manca la colonna del magazzino ("Magazzino").'));
  if (mapped.hd == null && mapped.code == null) errors.push(t('Manca la colonna HD o il codice di classificazione.'));
  if (mapped.neqUnit == null && mapped.neqTot == null) errors.push(t('Manca la colonna NEQ ("NEQ unitario" o "NEQ totale").'));
  if (errors.length) return { rows: [], errors, mapped };
  const rows: ParsedRow[] = [];
  const get = (r: unknown[], c: Col) => (mapped[c] != null ? r[mapped[c]!] : undefined);
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (!r || r.every((x) => x == null || String(x).trim() === '')) return;
    const mag = String(get(r, 'mag') ?? '').trim();
    if (!mag) { errors.push(t('Riga {line}: magazzino mancante.', { line })); return; }
    let qty = num(get(r, 'qty'));
    const nu = num(get(r, 'neqUnit')), nt = num(get(r, 'neqTot'));
    if (!(qty > 0)) qty = mapped.qty == null ? 1 : NaN;
    if (!(qty > 0)) { errors.push(t('Riga {line}: quantità non valida.', { line })); return; }
    const neqUnit = nu > 0 ? nu : nt > 0 ? nt / qty : NaN;
    if (!(neqUnit > 0)) { errors.push(t('Riga {line}: NEQ non valido.', { line })); return; }
    const he = num(get(r, 'he'));
    const cls = parseClass(String(get(r, 'hd') ?? ''), String(get(r, 'cg') ?? ''), String(get(r, 'code') ?? ''), he > 0 ? he : nu > 0 ? nu : NaN);
    if (!cls.hd) { errors.push(t('Riga {line}: HD non riconosciuta ("{hd}").', { line, hd: String(get(r, 'hd') ?? get(r, 'code') ?? '') })); return; }
    const warnings = [...cls.warn];
    let cg = cls.cg;
    if (!cg) { cg = 'D'; warnings.push(t('gruppo di compatibilità mancante: assunto D (da verificare)')); }
    const mce = num(get(r, 'mce'));
    rows.push({
      mag,
      item: newItem({ descr: String(get(r, 'descr') ?? '').trim(), hd: cls.hd, cg, qty, neqUnit, mce: mce > 0 ? mce : null }),
      warnings: warnings.map((w) => t('Riga {line}: {w}', { line, w })),
    });
  });
  return { rows, errors, mapped };
}

export const TEMPLATE_HEADERS = [N_('Magazzino'), N_('Descrizione'), N_('Codice di classificazione'), 'HD', 'CG', N_('Quantità'), N_('NEQ unitario (kg)'), 'MCE (kg)', N_('HE per colpo (kg)')];
export const TEMPLATE_ROWS: (string | number)[][] = [
  ['M1', N_('Granate 155 mm'), '1.1D', '', '', 200, 6.6, '', ''],
  ['M3', N_('Colpi 40 mm'), '', '1.2.1', 'E', 5000, 0.12, 12, 0.12],
  ['M3', N_('Cariche di lancio'), '1.3C', '', '', 300, 10, '', ''],
];
