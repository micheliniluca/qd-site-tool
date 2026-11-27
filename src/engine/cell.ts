/* Selezione della cella e valutazione di una coppia PES→ES (porting di legacy/engine/qd_app.js, logica pura). */
import * as QDF from './formulas';
import { EFFMAP, MATRIX, type Cond, type Effect, type Hd, type Opt, type QType, type TableId } from './matrix';

export interface PairInput {
  table: TableId;
  col: number;             // indice colonna nella tabella PES
  es: string;              // riga ES ('1'…'28c')
  hd: Hd;
  neq: number;             // kg
  mce: number;             // kg (usato solo per 1.2.1, 1.2.3, 1.6)
  vol: 'gt' | 'le';        // volume interno PES > / ≤ 20 m³
  D?: number | null;       // distanza effettiva (m), opzionale
  choice?: Record<string, number>;  // chiave cella → indice alternativa scelta
  /** alternative da preferire alla più cautelativa quando valide (es. IBD ridotte §1.3.6.6.2 se le condizioni sono soddisfatte) */
  prefer?: (o: Opt) => boolean;
}

export interface OptEval {
  d: number | null;        // distanza esatta (m), null se fuori range
  dr: number | null;       // arrotondata per eccesso
  none?: boolean;          // nessuna QD / non applicabile
  oor?: boolean;           // fuori campo di validità della formula
  rg?: [number, number];
  label: string;
  seg?: string | null;
  capped?: boolean;
}

export type RevEval = { inf: true } | { zero: true } | { q: number; capped: boolean };

export interface EffectResult {
  eff: Effect;
  qtype: QType;
  Q: number;
  key: string;
  merged: boolean;
  raw: string;
  opts: { o: Opt; i: number }[];   // opzioni valide (dopo filtro cond)
  sel: number;                      // indice in opts
  o?: Opt;
  r?: OptEval;
  rv?: RevEval | null;
}

export interface PairResult {
  rows: EffectResult[];
  gov: EffectResult | null;        // effetto che governa (distanza maggiore)
  unknown: boolean;                // almeno un effetto fuori campo
  required: number | null;         // QD di progetto (m); 0 = nessuna QD; null = non determinabile
  ok: boolean | null;              // esito se D è dato
  maxQ: { NEQ: RevEval | null; MCE: RevEval | null } | null;
}

export function condOk(c: Cond | null | undefined, inp: { mce: number; vol: 'gt' | 'le' }): boolean {
  if (!c) return true;
  if (c.k === 'mce') return c.op === 'le' ? inp.mce <= c.v : inp.mce > c.v;
  if (c.k === 'vol') return c.op === 'gt' ? inp.vol === 'gt' : inp.vol === 'le';
  return true;
}

export function optLabel(o: Opt): string {
  if (o.t === 'f') return o.ref + (o.cap != null ? ` (≤ ${o.cap} m)` : '');
  if (o.t === 'fixed') return `${o.d} m (fisso)`;
  if (o.t === 'noqd') return 'Nessuna QD';
  return 'Non applicabile';
}

export function evalOpt(o: Opt, Q: number): OptEval {
  if (o.t === 'na') return { d: 0, dr: 0, none: true, label: 'Non applicabile' };
  if (o.t === 'noqd') return { d: 0, dr: 0, none: true, label: 'Nessuna QD' };
  if (o.t === 'fixed') return { d: o.d!, dr: o.d!, label: `${o.d} m (fisso)` };
  const ref = o.ref!;
  const rg = QDF.range(ref);
  if (Q < rg[0] || Q > rg[1]) return { d: null, dr: null, oor: true, label: ref, rg };
  let d = QDF.dExact(ref, Q) as number;
  const seg = QDF.segText(ref, Q);
  let capped = false;
  if (o.cap != null && d > o.cap) { d = o.cap; capped = true; }
  return { d, dr: Math.ceil(d - 1e-9), label: optLabel(o), seg, capped };
}

export function revOpt(o: Opt, D: number): RevEval {
  if (o.t === 'na' || o.t === 'noqd') return { inf: true };
  if (o.t === 'fixed') return D >= o.d! ? { inf: true } : { zero: true };
  if (o.cap != null && D >= o.cap) return { inf: true };
  const r = QDF.quantity(o.ref!, D);
  if (r.below || r.q <= 0) return { zero: true };
  return { q: r.q, capped: r.capped };
}

export const cellKey = (table: TableId, col: number, es: string, eff: Effect | 'blast') => `${table}|${col}|${es}|${eff}`;

/** Valuta un singolo effetto: selezione della cella, filtro delle condizioni, scelta dell'alternativa. */
export function evaluateEffect(inp: PairInput, eff: Effect, qtype: QType): EffectResult {
  const row = MATRIX.tables[inp.table].rows[inp.es];
  if (!row) throw new Error(`ES ${inp.es} non presente in Table ${inp.table}`);
  const Q = qtype === 'NEQ' ? inp.neq : inp.mce;
  let cell = row.cells[eff][inp.col];
  let merged = false;
  if (cell.merged) { cell = row.cells.blast[inp.col]; merged = true; }
  const c = cell as { raw: string; opts: Opt[] };
  const opts = (c.opts || []).map((o, i) => ({ o, i })).filter((x) => condOk(x.o.cond, inp));
  const key = cellKey(inp.table, inp.col, inp.es, merged ? 'blast' : eff);
  const base: EffectResult = { eff, qtype, Q, key, merged, raw: c.raw, opts, sel: 0 };
  if (!opts.length) return base;
  let sel: number;
  const ch = inp.choice?.[key];
  const pref = inp.prefer ? opts.findIndex((x) => inp.prefer!(x.o) && !evalOpt(x.o, Q).oor) : -1;
  if (ch != null && ch < opts.length) sel = ch;
  else if (pref >= 0) sel = pref;
  else {   // default: l'alternativa valida più cautelativa (distanza maggiore)
    sel = 0; let best = -1;
    opts.forEach((x, j) => { const ev = evalOpt(x.o, Q); const v = ev.oor ? -1 : (ev.d as number); if (v > best) { best = v; sel = j; } });
  }
  const o = opts[sel].o;
  const r = evalOpt(o, Q);
  const rv = inp.D != null ? revOpt(o, inp.D) : null;
  return { ...base, sel, o, r, rv };
}

/** Valuta tutti gli effetti di una coppia PES→ES (stessa logica di compute() della scheda attuale). */
export function evaluatePair(inp: PairInput): PairResult {
  const rows: EffectResult[] = EFFMAP[inp.hd].map(([eff, qtype]) => evaluateEffect(inp, eff, qtype));

  let gov: EffectResult | null = null;
  let unknown = false;
  for (const r of rows) {
    if (!r.r) continue;
    if (r.r.oor) { unknown = true; continue; }
    if (gov === null || (r.r.dr as number) > (gov.r!.dr as number)) gov = r;
  }
  const required = unknown && !gov ? null : gov ? (gov.r!.dr as number) : 0;

  let ok: boolean | null = null;
  let maxQ: PairResult['maxQ'] = null;
  if (inp.D != null) {
    if (gov && !unknown) ok = inp.D >= (gov.r!.dr as number);
    else if (!gov && !unknown) ok = true;
    else if (unknown && gov && inp.D < (gov.r!.dr as number)) ok = false;   // già non conforme sugli effetti noti
    else ok = null;
    maxQ = { NEQ: null, MCE: null };
    for (const r of rows) {
      if (!r.rv) continue;
      const cur = maxQ[r.qtype];
      if ('inf' in r.rv) { if (cur === null) maxQ[r.qtype] = r.rv; continue; }
      const v = 'zero' in r.rv ? 0 : r.rv.q;
      const cv = cur === null || 'inf' in cur ? Infinity : 'zero' in cur ? 0 : cur.q;
      if (v < cv || (v === cv && !('capped' in r.rv && r.rv.capped))) maxQ[r.qtype] = r.rv;
    }
  }
  return { rows, gov, unknown, required, ok, maxQ };
}
