/* Gestione: riempimento dei magazzini (% del NEQ ammesso) e "dove ci sta" (magazzini che possono ricevere una consegna).
   Metodo: bisezione sulla quantità, rieseguendo siti unici e verifica delle coppie del magazzino. */
import { checkCompat, type Cg, type CompatIssue, type HdFull } from '../engine/mixing';
import { computeGroups, evaluateGroupPairs, type PairEval } from './evaluate';
import { magazineCgs, magazineLoad, newItem, type Item, type Magazine, type Project } from './model';

/** true se nessuna coppia con PES nel sito unico del magazzino è non conforme o fuori dal campo delle formule
    (i rischi accettati non contano come capacità; oltre il campo di validità la norma non ammette la quantità). */
export function magazineOk(p: Project, magId: string): { ok: boolean; worst: PairEval | null } {
  const { groupOf } = computeGroups(p);
  const g = groupOf.get(magId);
  if (!g || !g.load.cases.length || g.load.neqQd < 1) return { ok: true, worst: null };
  const pairs = evaluateGroupPairs(p, g, groupOf);
  const bad = pairs.filter((x) => (x.rawStatus === 'ko' || x.rawStatus === 'nd') && x.status !== 'agg');
  bad.sort((a, b) => (a.gov?.margin ?? 0) - (b.gov?.margin ?? 0));
  return { ok: bad.length === 0, worst: bad[0] ?? null };
}

const replaceMag = (p: Project, m: Magazine): Project => ({ ...p, objects: p.objects.map((o) => (o.id === m.id ? m : o)) });

/** Contenuto del magazzino moltiplicato per s (NEQ scalato, MCE invariato: è l'evento singolo). */
export function scaled(m: Magazine, s: number): Magazine {
  if (m.contentMode === 'inventory') return { ...m, items: (m.items ?? []).map((it) => ({ ...it, qty: it.qty * s })) };
  return { ...m, neq: m.neq * s };
}

export interface Fill {
  magId: string;
  neq: number;                  // NEQ attuale (esclusa HD 1.4)
  maxNeq: number | null;        // NEQ ammesso con la stessa composizione; null = oltre il limite di ricerca
  fill: number | null;          // neq / maxNeq
  limitedByMce: boolean;        // non conforme anche a quantità quasi nulla (resto del sito unico, effetti in MCE o distanze fisse)
  worst: PairEval | null;       // coppia limitante alla quantità ammessa
}

const SMAX = 64;

/** Riempimento: fattore massimo s con cui scalare il contenuto restando conformi; NEQ ammesso = s · NEQ. */
export function fillOf(p: Project, m: Magazine): Fill {
  const neq = magazineLoad(m).neqQd;
  if (!(neq >= 1)) return { magId: m.id, neq: 0, maxNeq: null, fill: null, limitedByMce: false, worst: null };
  const okAt = (s: number) => magazineOk(replaceMag(p, scaled(m, s)), m.id);
  const tiny = Math.max(1 / neq, 1e-4);
  const r0 = okAt(tiny);
  if (!r0.ok) return { magId: m.id, neq, maxNeq: 0, fill: Infinity, limitedByMce: true, worst: r0.worst };
  if (okAt(SMAX).ok) return { magId: m.id, neq, maxNeq: null, fill: 0, limitedByMce: false, worst: null };
  let lo = tiny, hi = SMAX;
  // bisezione geometrica finche' l'incertezza sul NEQ ammesso e' sotto 1 kg
  for (let i = 0; i < 60 && (hi - lo) * neq > 1; i++) { const mid = Math.sqrt(lo * hi); if (okAt(mid).ok) lo = mid; else hi = mid; }
  const maxNeq = Math.floor(lo * neq);
  return { magId: m.id, neq, maxNeq, fill: neq / Math.max(1, maxNeq), limitedByMce: false, worst: okAt(hi).worst };
}

/* ---------------- dove ci sta ---------------- */

export interface Delivery { descr: string; hd: HdFull; cg: Cg; neq: number; mce: number | null }

export interface Placement {
  magId: string;
  compat: CompatIssue[];        // problemi di compatibilità (Table 5) con il contenuto attuale
  alreadyKo: boolean;           // il magazzino è già non conforme col contenuto attuale
  maxAdd: number;               // NEQ massimo aggiungibile (kg), fino a 4 volte la consegna
  fits: boolean;                // l'intera consegna ci sta (QD) e la compatibilità non la vieta
  worst: PairEval | null;       // coppia che limita (alla quantità richiesta)
}

export function withDelivery(m: Magazine, d: Delivery, neq: number): Magazine {
  const base: Item[] = m.contentMode === 'inventory' ? (m.items ?? [])
    : m.neq >= 1 ? [newItem({ id: 'base', descr: 'Contenuto attuale', hd: m.hd, cg: 'D', qty: 1, neqUnit: m.neq, mce: m.mce })] : [];
  return { ...m, contentMode: 'inventory', items: [...base, newItem({ id: 'delivery', descr: d.descr || 'Consegna', hd: d.hd, cg: d.cg, qty: 1, neqUnit: neq, mce: d.mce })] };
}

export function placeDelivery(p: Project, m: Magazine, d: Delivery): Placement {
  const cgs = magazineCgs(m);
  const compat = m.contentMode === 'inventory' ? checkCompat([...cgs, d.cg]).filter((c) => c.a === d.cg || c.b === d.cg) : [];
  const alreadyKo = magazineLoad(m).neqQd >= 1 && !magazineOk(p, m.id).ok;
  const okAt = (q: number) => magazineOk(replaceMag(p, withDelivery(m, d, q)), m.id).ok;
  let maxAdd = 0;
  if (!alreadyKo) {
    const cap = d.neq * 4;
    if (okAt(cap)) maxAdd = cap;
    else if (okAt(1)) {
      let lo = 1, hi = cap;
      for (let i = 0; i < 30 && hi - lo > 1; i++) { const mid = (lo + hi) / 2; if (okAt(mid)) lo = mid; else hi = mid; }
      maxAdd = Math.floor(lo);
    }
  }
  const fits = !alreadyKo && maxAdd >= d.neq && !compat.some((c) => c.level === 'vietato');
  const worst = alreadyKo ? magazineOk(p, m.id).worst : maxAdd < d.neq ? magazineOk(replaceMag(p, withDelivery(m, d, d.neq)), m.id).worst : null;
  return { magId: m.id, compat, alreadyKo, maxAdd, fits, worst };
}
