/* Modello del progetto di sito (salvato in JSON). Coordinate in metri, y verso nord. */
import type { EsRow, Hd } from '../engine/matrix';
import { N_, t } from '../i18n';
import { mixHd, sumByHd, type Cg, type HdFull, type MixResult } from '../engine/mixing';
import type { BarricadeSectionInput } from './barricade';
import type { Revision } from './revisions';
import type { Rect, Vec } from './geometry';

export type StructKind = 'ecm' | 'heavy' | 'medium' | 'light';
/** Classe ECM come ES (righe 1–11). */
export type EcmClass = '7bar' | '3bar' | 'nc-hv' | 'nc-barr' | 'nc';

/** Riga d'inventario: NEQ della riga = qty × neqUnit; MCE = evento singolo massimo della riga (kg). */
export interface Item {
  id: string;
  descr: string;
  hd: HdFull;
  cg: Cg;
  qty: number;
  neqUnit: number;         // kg per pezzo
  mce?: number | null;     // kg; per 1.2.1, 1.2.3, 1.6 (se manca: NEQ della riga, cautelativo)
}

export interface Magazine extends Rect {
  id: string; kind: 'magazine'; name: string;
  struct: StructKind;
  ecmClass: EcmClass;      // solo struct = 'ecm'
  roof: boolean;           // solo 'heavy': tetto protettivo 150 mm c.a.
  frontDoor: boolean;      // solo 'heavy': porta o grande apertura sulla facciata frontale
  barricaded: boolean;     // 'medium' e 'light'
  hd: Hd;
  neq: number;             // kg
  mce: number;             // kg
  vol: 'gt' | 'le';        // volume interno > / ≤ 20 m³
  contentMode?: 'simple' | 'inventory';   // simple = hd/neq/mce sopra; inventory = items
  items?: Item[];
  vol500?: boolean;        // ECM conforme a §1.3.6.6.1 con volume interno > 500 m³ (IBD ridotte §1.3.6.6.2)
  note6As11?: boolean;     // Table 4 nota 6: considera anche il caso HD 1.1 aggregata
  /** solo non ECM: riga ES quando l'edificio è esposto, se diversa da quella del tipo strutturale (officina esplosivi ES 18–20) */
  esAs?: '18' | '19' | '20' | null;
  note?: string;
}

export const ES_AS_NAME: Record<'18' | '19' | '20', string> = {
  '18': N_('ES 18 — officina esplosivi con tetto protettivo, barricata'),
  '19': N_('ES 19 — officina esplosivi senza tetto protettivo, barricata'),
  '20': N_('ES 20 — officina esplosivi non barricata'),
};

export interface Building extends Rect {
  id: string; kind: 'building'; name: string;
  es: EsRow;               // 12–28c (righe di Annex I-A)
  note?: string;
}

/** 'road' = viabilità interna del sito (non è un ES: le strade pubbliche si inseriscono come ES 21–23). */
export type LineRole = 'es' | 'fence' | 'barricade' | 'road';
export interface Line {
  id: string; kind: 'line'; name: string;
  pts: Vec[];
  role: LineRole;
  es: EsRow | null;        // per role = 'es': 21–23, 27a–c, 28a–c
  note?: string;
}

export type SiteObject = Magazine | Building | Line;

export interface Background {
  dataUrl: string;
  name: string;
  pxW: number; pxH: number;   // dimensioni in pixel
  x: number; y: number;       // coordinate (m) dell'angolo in alto a sinistra
  mPerPx: number;             // scala
  opacity: number;
  locked: boolean;
}

export interface PairChoice { idx: Record<string, number>; note: string }

/** Terrapieno condiviso tra due ECM (Part I §1.3.6.6.3): '34' = intersezione ≥ 3/4 dell'altezza → BD5; '12' = tra 1/2 e 3/4 → BD4. */
export interface SharedCover { a: string; b: string; level: '34' | '12' }

/** Voce del registro dei rischi accettati. Chiave: `pair:<pesId>><esId>` o `compat:<magId>:<cg>-<cg>`. */
export interface Risk { text: string; by: string; date: string }

export interface ProjectOptions {
  aggregate: boolean;      // siti unici automatici (§1.3.2.3.4)
  fillWarn: number;        // soglia "da controllare" (frazione del NEQ ammesso)
}

export interface Project {
  format: 'qd-site-tool';
  version: 2;
  edition: string;
  name: string;
  author?: string;
  created: string;
  modified: string;
  objects: SiteObject[];
  background: Background | null;
  /** scelte tra alternative di cella per coppia: chiave `${pesId}>${esId}` */
  choices: Record<string, PairChoice>;
  sharedCover: SharedCover[];
  risks: Record<string, Risk>;
  options: ProjectOptions;
  barricadeSections?: BarricadeSectionInput[];
  revisions?: Revision[];
  view?: { x: number; y: number; k: number };
}

export const DEFAULT_OPTIONS: ProjectOptions = { aggregate: true, fillWarn: 0.9 };

export const isRect = (o: SiteObject): o is Magazine | Building => o.kind !== 'line';

let seq = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function emptyProject(): Project {
  const now = new Date().toISOString();
  return {
    format: 'qd-site-tool', version: 2, edition: 'AASTP-1 Ed. D V1', name: t('Nuovo sito'),
    created: now, modified: now, objects: [], background: null, choices: {},
    sharedCover: [], risks: {}, options: { ...DEFAULT_OPTIONS }, barricadeSections: [], revisions: [],
  };
}

/* ---- menù di selezione rapida (preset AASTP-1) ---- */
export interface Preset {
  id: string; group: string; label: string; hint: string;
  make: (at: Vec, name: string) => SiteObject;
}

const mag = (at: Vec, name: string, w: number, d: number, p: Partial<Magazine>): Magazine => ({
  id: newId('m'), kind: 'magazine', name, cx: at.x, cy: at.y, w, d, az: 0,
  struct: 'ecm', ecmClass: '7bar', roof: true, frontDoor: false, barricaded: false,
  hd: '1.1', neq: 10000, mce: 50, vol: 'gt', ...p,
});
const bld = (at: Vec, name: string, es: EsRow, w = 20, d = 12): Building => ({
  id: newId('b'), kind: 'building', name, cx: at.x, cy: at.y, w, d, az: 0, es,
});
const lin = (at: Vec, name: string, role: LineRole, es: EsRow | null): Line => ({
  id: newId('l'), kind: 'line', name, role, es, pts: [at, { x: at.x + 100, y: at.y }],
});

export const PRESETS: Preset[] = [
  { id: 'ecm7', group: N_('Magazzini (PES / ES)'), label: N_('ECM 7 bar (Part II)'), hint: N_('Table 1 (a/b/c) · come ES: righe 1–3'), make: (a, n) => mag(a, n, 9, 26, { struct: 'ecm', ecmClass: '7bar' }) },
  { id: 'ecm3', group: N_('Magazzini (PES / ES)'), label: N_('ECM 3 bar (Part II)'), hint: N_('Table 1 · come ES: righe 4–6'), make: (a, n) => mag(a, n, 9, 26, { struct: 'ecm', ecmClass: '3bar' }) },
  { id: 'ecmhv', group: N_('Magazzini (PES / ES)'), label: N_('ECM non conforme, testata/porte HV'), hint: N_('Table 1 · come ES: riga 7 (porta verso il PES), altrimenti 9/10'), make: (a, n) => mag(a, n, 9, 26, { struct: 'ecm', ecmClass: 'nc-hv' }) },
  { id: 'ecmbar', group: N_('Magazzini (PES / ES)'), label: N_('ECM non conforme, porta barricata'), hint: N_('Table 1 · come ES: riga 8 (porta verso il PES), altrimenti 9/10'), make: (a, n) => mag(a, n, 9, 26, { struct: 'ecm', ecmClass: 'nc-barr' }) },
  { id: 'ecmnc', group: N_('Magazzini (PES / ES)'), label: N_('ECM non conforme'), hint: N_('Table 1 · come ES: righe 9–11'), make: (a, n) => mag(a, n, 9, 26, { struct: 'ecm', ecmClass: 'nc' }) },
  { id: 'heavy', group: N_('Magazzini (PES / ES)'), label: N_('Pareti pesanti, tetto protettivo'), hint: N_('Table 2 (d) · come ES: riga 12'), make: (a, n) => mag(a, n, 15, 25, { struct: 'heavy', roof: true, frontDoor: false }) },
  { id: 'heavyd', group: N_('Magazzini (PES / ES)'), label: N_('Pareti pesanti, porta sul fronte'), hint: N_('Table 2 (e) verso il fronte, (d) altrove · ES: riga 12'), make: (a, n) => mag(a, n, 15, 25, { struct: 'heavy', roof: true, frontDoor: true }) },
  { id: 'heavynr', group: N_('Magazzini (PES / ES)'), label: N_('Pareti pesanti, senza tetto'), hint: N_('Table 2 (f) · come ES: riga 13'), make: (a, n) => mag(a, n, 15, 25, { struct: 'heavy', roof: false }) },
  { id: 'medb', group: N_('Magazzini (PES / ES)'), label: N_('Pareti medie, barricato'), hint: N_('Table 3 (g) · come ES: riga 14'), make: (a, n) => mag(a, n, 12, 20, { struct: 'medium', barricaded: true }) },
  { id: 'med', group: N_('Magazzini (PES / ES)'), label: N_('Pareti medie, non barricato'), hint: N_('Table 3 (h) · come ES: riga 15'), make: (a, n) => mag(a, n, 12, 20, { struct: 'medium', barricaded: false }) },
  { id: 'stackb', group: N_('Magazzini (PES / ES)'), label: N_('Catasta / struttura leggera / veicolo, barricato'), hint: N_('Table 4 (i) · come ES: riga 16'), make: (a, n) => mag(a, n, 10, 10, { struct: 'light', barricaded: true, neq: 1000 }) },
  { id: 'stack', group: N_('Magazzini (PES / ES)'), label: N_('Catasta / struttura leggera / veicolo, non barricato'), hint: N_('Table 4 (j) · come ES: riga 17'), make: (a, n) => mag(a, n, 10, 10, { struct: 'light', barricaded: false, neq: 1000 }) },
  { id: 'ws18', group: N_('Edifici (ES)'), label: N_('Officina esplosivi, tetto protettivo, barricata'), hint: 'ES 18', make: (a, n) => bld(a, n, '18') },
  { id: 'ws19', group: N_('Edifici (ES)'), label: N_('Officina esplosivi, senza tetto, barricata'), hint: 'ES 19', make: (a, n) => bld(a, n, '19') },
  { id: 'ws20', group: N_('Edifici (ES)'), label: N_('Officina esplosivi, non barricata'), hint: 'ES 20', make: (a, n) => bld(a, n, '20') },
  { id: 'ibd', group: N_('Edifici (ES)'), label: N_('Edificio abitato / luogo di aggregazione'), hint: N_('ES 24 (IBD)'), make: (a, n) => bld(a, n, '24') },
  { id: 'vuln', group: N_('Edifici (ES)'), label: N_('Costruzione vulnerabile'), hint: 'ES 25', make: (a, n) => bld(a, n, '25', 40, 25) },
  { id: 'off', group: N_('Edifici (ES)'), label: N_('Uffici / mensa di supporto, < 20 persone'), hint: 'ES 26a', make: (a, n) => bld(a, n, '26a') },
  { id: 'offb', group: N_('Edifici (ES)'), label: N_('Uffici / mensa di supporto, ≥ 20 persone'), hint: 'ES 26b', make: (a, n) => bld(a, n, '26b') },
  { id: 'pol', group: N_('Edifici (ES)'), label: N_('Deposito POL fuori terra, vitale'), hint: 'ES 28b', make: (a, n) => bld(a, n, '28b', 15, 15) },
  { id: 'polnv', group: N_('Edifici (ES)'), label: N_('Deposito POL fuori terra, non vitale'), hint: 'ES 28c', make: (a, n) => bld(a, n, '28c', 15, 15) },
  { id: 'r21', group: N_('Linee (ES)'), label: N_('Strada/ferrovia, bassa densità'), hint: N_('ES 21 (< 1000 veicoli/g)'), make: (a, n) => lin(a, n, 'es', '21') },
  { id: 'r22', group: N_('Linee (ES)'), label: N_('Strada/ferrovia, media densità'), hint: N_('ES 22 (1000–5000 veicoli/g)'), make: (a, n) => lin(a, n, 'es', '22') },
  { id: 'r23', group: N_('Linee (ES)'), label: N_('Strada/ferrovia, alta densità'), hint: N_('ES 23 (≥ 5000 veicoli/g)'), make: (a, n) => lin(a, n, 'es', '23') },
  { id: 'p27a', group: N_('Linee (ES)'), label: N_('Elettrodotto, rete primaria'), hint: 'ES 27a', make: (a, n) => lin(a, n, 'es', '27a') },
  { id: 'p27b', group: N_('Linee (ES)'), label: N_('Elettrodotto, rete normale'), hint: 'ES 27b', make: (a, n) => lin(a, n, 'es', '27b') },
  { id: 'p27c', group: N_('Linee (ES)'), label: N_('Elettrodotto, rete minore'), hint: 'ES 27c', make: (a, n) => lin(a, n, 'es', '27c') },
  { id: 'pipe', group: N_('Linee (ES)'), label: N_('Oleodotto protetto o interrato'), hint: 'ES 28a', make: (a, n) => lin(a, n, 'es', '28a') },
  { id: 'road', group: N_('Altro'), label: N_('Strada interna'), hint: N_('viabilità del sito, non è un ES'), make: (a, n) => lin(a, n, 'road', null) },
  { id: 'fence', group: N_('Altro'), label: N_('Recinzione / confine'), hint: N_('non è un ES'), make: (a, n) => lin(a, n, 'fence', null) },
  { id: 'barr', group: N_('Altro'), label: N_('Barricata (grafica)'), hint: N_('Fase 1: solo disegno; l’effetto si imposta sul magazzino'), make: (a, n) => lin(a, n, 'barricade', null) },
];

export const BUILDING_ES: EsRow[] = ['12', '13', '14', '15', '16', '17', '18', '19', '20', '24', '25', '26a', '26b', '28a', '28b', '28c'];
export const LINE_ES: EsRow[] = ['21', '22', '23', '27a', '27b', '27c', '28a', '28b', '28c'];

export const STRUCT_NAME: Record<StructKind, string> = {
  ecm: N_('ECM — magazzino coperto di terra (Table 1)'), heavy: N_('Pareti pesanti (Table 2)'),
  medium: N_('Pareti medie (Table 3)'), light: N_('Struttura leggera / catasta / veicolo (Table 4)'),
};
export const ECM_NAME: Record<EcmClass, string> = {
  '7bar': N_('Conforme Part II, 7 bar (ES 1–3)'), '3bar': N_('Conforme Part II, 3 bar (ES 4–6)'),
  'nc-hv': N_('Non conforme, testata/porte resistenti a proiezioni HV (ES 7 / 9–10)'),
  'nc-barr': N_('Non conforme, barricata alla porta (ES 8 / 9–10)'),
  nc: N_('Non conforme, testata/porte resistenti a fuoco e LV (ES 9–11)'),
};

/* ---- persistenza ---- */
export function serialize(p: Project): string {
  return JSON.stringify({ ...p, modified: new Date().toISOString() }, null, 1);
}
export function parseProject(text: string): Project {
  const o = JSON.parse(text);
  if (o?.format !== 'qd-site-tool') throw new Error(t('Il file non è un progetto QD (campo "format" mancante).'));
  if (o.version !== 1 && o.version !== 2) throw new Error(t('Versione di progetto non supportata: {v}', { v: o.version }));
  if (!Array.isArray(o.objects)) throw new Error(t('Progetto senza "objects".'));
  // v1 → v2: campi nuovi con i valori di default
  return {
    ...emptyProject(), ...o, version: 2,
    choices: o.choices ?? {}, sharedCover: o.sharedCover ?? [], risks: o.risks ?? {},
    barricadeSections: o.barricadeSections ?? [], revisions: o.revisions ?? [],
    options: { ...DEFAULT_OPTIONS, ...(o.options ?? {}) },
  };
}

/* ---- contenuto del magazzino ---- */

export const MCE_HD: HdFull[] = ['1.2.1', '1.2.3', '1.6'];

/** Righe {hd, neq, mce} del magazzino (dal contenuto semplice o dall'inventario). */
export function magazineLines(m: Magazine): { hd: HdFull; neq: number; mce: number }[] {
  if (m.contentMode === 'inventory') {
    return (m.items ?? []).map((it) => {
      const neq = Math.max(0, it.qty) * Math.max(0, it.neqUnit);
      const mce = MCE_HD.includes(it.hd) ? (it.mce != null && it.mce > 0 ? Math.min(it.mce, neq) : neq) : 0;
      return { hd: it.hd, neq, mce };
    });
  }
  return [{ hd: m.hd, neq: m.neq, mce: MCE_HD.includes(m.hd) ? m.mce : 0 }];
}

/** Contenuto del magazzino dopo Part I Table 4. */
export function magazineLoad(m: Magazine): MixResult {
  return mixHd(sumByHd(magazineLines(m)), { note6As11: m.note6As11 });
}

export function magazineCgs(m: Magazine): Cg[] {
  return m.contentMode === 'inventory' ? [...new Set((m.items ?? []).filter((i) => i.qty > 0).map((i) => i.cg))] : [];
}

export function newItem(p: Partial<Item> = {}): Item {
  return { id: newId('i'), descr: '', hd: '1.1', cg: 'D', qty: 1, neqUnit: 1, mce: null, ...p };
}
