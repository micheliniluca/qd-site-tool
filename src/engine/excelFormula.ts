/* Traduzione delle formule di Annex I-A Tables 5–9 in formule Excel "aperte" per il foglio di verifica. */
import { dExact, F, range } from './formulas';
import type { Opt } from './matrix';

/** Indice del tratto usato a quantità Q (al raccordo: quello con la distanza maggiore, come dExact). */
export function usedSegment(ref: string, Q: number): number {
  const s = F[ref];
  let best = -1, bd = -Infinity;
  s.forEach((g, i) => {
    if (Q >= g[0] - 1e-9 && Q <= g[2] + 1e-9) { const d = g[4](Q); if (d > bd) { bd = d; best = i; } }
  });
  return best;
}

/** Espressione Excel del tratto i, con `q` al posto di Q (es. "$F5"). */
export function segmentExcel(ref: string, i: number, q: string): string {
  let tx = (F[ref][i][4].tx ?? '').replace(/\s*\[.*\]\s*$/, '').trim();
  const fixed = /^D = ([\d.]+) m/.exec(tx);
  if (fixed) return fixed[1];
  tx = tx.replace(/·/g, '*').replace(/−/g, '-').replace(/ln\(Q\)²/g, 'LN(Q)^2').replace(/ln\(/g, 'LN(').replace(/\s+/g, '');
  return tx.replace(/\bQ\b/g, q);
}

/** Formula Excel della distanza richiesta (arrotondata per eccesso) per l'opzione di cella, o null se non c'è formula. */
export function distanceExcel(o: Opt, Q: number, q: string): string | null {
  if (o.t === 'fixed') return String(o.d);
  if (o.t !== 'f' || !o.ref) return null;
  const [lo, hi] = range(o.ref);
  if (Q < lo || Q > hi) return null;
  const i = usedSegment(o.ref, Q);
  let e = segmentExcel(o.ref, i, q);
  if (o.cap != null) e = `MIN(${o.cap},${e})`;
  return `ROUNDUP(${e},0)`;
}

/** Valuta in JS un'espressione prodotta da segmentExcel (solo per i test di coerenza). */
export function evalExcel(expr: string, Q: number): number {
  const js = expr.replace(/ROUNDUP\((.*),0\)$/, 'Math.ceil(($1) - 1e-9)').replace(/MIN\(/g, 'Math.min(')
    .replace(/LN\(/g, 'Math.log(').replace(/\^/g, '**').replace(/\$?[A-Z]+\$?\d+/g, String(Q));
  return Function(`"use strict"; return (${js});`)() as number;
}

export { dExact };
