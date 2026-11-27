/* Matrici PES/ES di Annex I-A Tables 1–4 (artefatto generato da extraction/parse.py: non modificare a mano). */
import matrixJson from '../../data/matrix.json';

export type Effect = 'blast' | 'debris' | 'p121' | 'p122' | 't131' | 't132';
export type QType = 'NEQ' | 'MCE';
export type Hd = '1.1' | '1.2.1' | '1.2.2' | '1.2.3' | '1.3.1' | '1.3.2' | '1.6';
export type TableId = '1' | '2' | '3' | '4';
export type Lvl = 'V' | 'H' | 'L';

export interface Cond { k: 'mce' | 'vol'; op: 'le' | 'gt'; v: number }
export interface Opt {
  t: 'f' | 'fixed' | 'noqd' | 'na';
  ref?: string;
  d?: number;
  cap?: number;
  lvl?: Lvl | null;
  pers?: boolean;
  cond?: Cond | null;
  notes?: string[];
}
export type Cell = { merged: true } | { merged?: false; raw: string; opts: Opt[] };
export interface Row { page: number; annex: string; label: string; cells: Record<Effect, Cell[]> }
export interface Table { title: string; cols: string[]; rows: Record<string, Row> }
export interface Matrix { tables: Record<TableId, Table>; es: Record<string, string> }

export const MATRIX = matrixJson as unknown as Matrix;

export const ES_ROWS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26a', '26b', '27a', '27b', '27c', '28a', '28b', '28c',
] as const;
export type EsRow = (typeof ES_ROWS)[number];

/** Part I, Ch.3, Table 1: effetti applicabili per HD/SsD e quantità di riferimento. */
export const EFFMAP: Record<Hd, [Effect, QType][]> = {
  '1.1': [['blast', 'NEQ'], ['debris', 'NEQ']],
  '1.2.1': [['blast', 'MCE'], ['debris', 'MCE'], ['p121', 'NEQ']],
  '1.2.2': [['p122', 'NEQ']],
  '1.2.3': [['blast', 'MCE'], ['debris', 'MCE'], ['t132', 'NEQ']],
  '1.3.1': [['t131', 'NEQ']],
  '1.3.2': [['t132', 'NEQ']],
  '1.6': [['blast', 'MCE'], ['debris', 'MCE'], ['t132', 'NEQ']],
};
export const HDS = Object.keys(EFFMAP) as Hd[];
export const needsMce = (hd: Hd) => EFFMAP[hd].some((e) => e[1] === 'MCE');

export const EFFNAME: Record<Effect, string> = {
  blast: 'Blast', debris: 'Detriti e frammenti', p121: 'Progressivo SsD 1.2.1',
  p122: 'Progressivo SsD 1.2.2', t131: 'Termico SsD 1.3.1', t132: 'Termico SsD 1.3.2',
};
export const LVLNAME: Record<Lvl, string> = { V: 'Virtualmente completa', H: 'Elevata', L: 'Limitata' };

/** Colonne PES: tabella + indice colonna → codice (a–j). */
export const COLCODE: Record<TableId, string[]> = { '1': ['a', 'b', 'c'], '2': ['d', 'e', 'f'], '3': ['g', 'h'], '4': ['i', 'j'] };
