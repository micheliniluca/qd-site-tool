/* Confronto delle formule con le tabelle di consultazione Annex I-A Tables 10–12 (data/lookup.json).
   Equivalente a legacy/tests/test.js, con la classificazione delle differenze di qd_app.js validate(). */
import * as QDF from './formulas';

export type Lookup = Record<string, Record<string, string>>;

export type DiffReason = 'refuso4000' | 'dfd8' | 'raccordo' | 'non-spiegata';
export const DIFF_TEXT: Record<DiffReason, string> = {
  refuso4000: 'Refuso di Table 10: la riga 4 000 kg contiene i valori di 4 500 kg',
  dfd8: 'DFD8: coefficiente stampato 0.141 (+1 m rispetto a Table 11, cautelativo)',
  raccordo: 'Raccordo tra tratti: la tabella usa il tratto inferiore, il motore la distanza maggiore',
  'non-spiegata': 'Da verificare',
};

export interface Diff { ref: string; q: number; table: number; engine: number | null; exact: number | null; reason: DiffReason }
export interface ValidationReport { checked: number; identical: number; diffs: Diff[]; outOfRangeMismatch: [string, number][] }

/** true se q è l'estremo superiore di un tratto e quel tratto (inferiore) dà il valore di tabella
    (tolleranza 0,05 m: es. DFD15 a 5 kg vale 47,002 m e la tabella riporta 47). */
function lowerSegmentGives(ref: string, q: number, v: number): boolean {
  return QDF.F[ref].some((g) => g[2] === q && g[4](q) > v - 1 && g[4](q) <= v + 0.05);
}

export function classify(ref: string, q: number, v: number, d: number | null): DiffReason {
  if (/^BD/.test(ref) && q === 4000 &&
      QDF.F[ref].some((g) => 4500 >= g[0] && 4500 <= g[2] && Math.ceil(g[4](4500) - 1e-9) === v)) return 'refuso4000';
  if (ref === 'DFD8' && d === v + 1) return 'dfd8';
  if (d != null && d > v && lowerSegmentGives(ref, q, v)) return 'raccordo';
  return 'non-spiegata';
}

export function validate(look: Lookup): ValidationReport {
  let checked = 0, identical = 0;
  const diffs: Diff[] = [];
  const outOfRangeMismatch: [string, number][] = [];
  for (const ref of Object.keys(look)) {
    if (!QDF.F[ref]) throw new Error(`formula mancante: ${ref}`);
    for (const [qs, v] of Object.entries(look[ref])) {
      const q = +qs;
      if (!/^\d+$/.test(v)) {   // "-" in tabella: la formula deve essere fuori campo
        if (QDF.distance(ref, q) !== null) outOfRangeMismatch.push([ref, q]);
        continue;
      }
      checked++;
      const d = QDF.distance(ref, q);
      if (d === +v) identical++;
      else diffs.push({ ref, q, table: +v, engine: d, exact: QDF.dExact(ref, q), reason: classify(ref, q, +v, d) });
    }
  }
  return { checked, identical, diffs, outOfRangeMismatch };
}
