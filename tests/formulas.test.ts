/* Equivalente di legacy/tests/test.js e test2.js, più il confronto diretto con il motore JS originale
   ("gli stessi test devono passare prima e dopo il porting"). */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import * as QDF from '../src/engine/formulas';
import { validate, type Lookup } from '../src/engine/validation';
import lookupJson from '../data/lookup.json';

// il file legacy è uno script classico (var QDF = …): lo si esegue in un contesto isolato
const legacySrc = readFileSync(new URL('../legacy/engine/qd_formulas.js', import.meta.url), 'utf8');
const ctx: Record<string, any> = {};
vm.runInNewContext(legacySrc + ';this.QDF = QDF;', ctx);
const LEGACY = ctx.QDF;
const look = lookupJson as Lookup;

describe('test.js — formule vs Tables 10–12', () => {
  const rep = validate(look);
  it('5 239 valori confrontati, 5 195 identici, 44 differenze', () => {
    expect(rep.checked).toBe(5239);
    expect(rep.identical).toBe(5195);
    expect(rep.diffs).toHaveLength(44);
  });
  it('tutte le differenze sono spiegate', () => {
    expect(rep.diffs.filter((d) => d.reason === 'non-spiegata')).toEqual([]);
    const by = (r: string) => rep.diffs.filter((d) => d.reason === r).length;
    expect(by('refuso4000')).toBe(33);   // BD3–BD5, BD7–BD36 a 4 000 kg
    expect(by('dfd8')).toBe(6);
    expect(by('raccordo')).toBe(5);      // BD1 a 30 t, DFD4/14/15 a 5 kg, DFD7 a 10 kg
  });
  it('nessun valore "-" di tabella è calcolato dal motore', () => {
    expect(rep.outOfRangeMismatch).toEqual([]);
  });
});

describe('test2.js — round-trip D(Q) → Q(D)', () => {
  it('20 769 controlli, solo i 6 casi legittimi non monotoni', () => {
    let n = 0;
    const fails: [string, number][] = [];
    for (const r of QDF.refs) {
      const [lo, hi] = QDF.range(r);
      for (let k = 0; k <= 300; k++) {
        const q = Math.round(lo * Math.pow(hi / lo, k / 300));
        if (q < lo || q > hi) continue;
        const D = QDF.distance(r, q)!;
        const res = QDF.quantity(r, D);
        n++;
        const dq = QDF.distance(r, Math.max(res.q, lo))!;
        if (res.q < q || dq > D) fails.push([r, q]);
      }
    }
    expect(n).toBe(20769);
    expect(fails).toEqual([['BD26', 2514], ['BD28', 4576], ['BD33', 4576], ['BD34', 4576], ['TD2', 6030], ['TD3', 2514]]);
  });
  it('esempi espliciti', () => {
    expect(QDF.quantity('BD31', 400)).toEqual({ q: 5849, capped: false });
    expect(QDF.quantity('TD4', 50)).toEqual({ q: 0, capped: false, below: true });
    expect(QDF.quantity('DFD4', 100)).toEqual({ q: 4, capped: false });
    expect(QDF.quantity('BD16', 300)).toEqual({ q: 45000, capped: true });
  });
});

describe('porting — identità con legacy/engine/qd_formulas.js', () => {
  it('stessi riferimenti e stessi range', () => {
    expect(QDF.refs).toEqual(LEGACY.refs);
    for (const r of QDF.refs) expect(QDF.range(r)).toEqual(LEGACY.range(r));
  });
  it('dExact, distance, quantity e segText identici su una griglia densa', () => {
    for (const r of QDF.refs) {
      const [lo, hi] = QDF.range(r);
      for (let k = 0; k <= 400; k++) {
        const q = lo * Math.pow(hi / lo, k / 400);
        expect(QDF.dExact(r, q)).toBe(LEGACY.dExact(r, q));
        expect(QDF.distance(r, Math.round(q))).toBe(LEGACY.distance(r, Math.round(q)));
        expect(QDF.segText(r, q)).toBe(LEGACY.segText(r, q));
      }
      for (const D of [1, 10, 25, 60, 100, 250, 500, 1000, 3000]) expect(QDF.quantity(r, D)).toEqual(LEGACY.quantity(r, D));
      // tutti i raccordi tra tratti
      for (const g of QDF.F[r]) for (const q of [g[0], g[2]]) expect(QDF.dExact(r, q)).toBe(LEGACY.dExact(r, q));
    }
  });
});
