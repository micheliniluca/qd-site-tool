/* AASTP-1 Ed. D V1 (Nov 2025), Annex I-A, Tables 5-9: QD formulas.
   Porting 1:1 di legacy/engine/qd_formulas.js (stesse costanti, stessi tratti, stessi arrotondamenti).
   D in m, Q in kg (NEQ o MCE come da Part I, Ch.3, Table 1).

   Scelte implementative (vedi HANDOFF.md §3.1):
   - raccordo tra tratti: si prende la distanza MAGGIORE (nota a Table 5);
   - distanza arrotondata per eccesso al metro, quantità per difetto al kg (Annex I-A, Sect. I §5);
   - fuori range: null, nessuna estrapolazione;
   - P1D3/P2D3 con 0.67, DFD20 tratti 400–3375 e 5000–7020 kg dalle formule inverse (coerenti con Tables 11/12);
   - DFD8 con il coefficiente stampato 0.141 (+1 m rispetto a Table 11, cautelativo). */

import { numLocale, t } from '../i18n';

export type SegFn = ((q: number) => number) & { tx?: string };
/** [qlo, loInclusive, qhi, hiInclusive, f(Q)] */
export type Segment = [number, boolean, number, boolean, SegFn];

const L = Math.log;
const P = Math.pow;

function T(fn: (q: number) => number, tx: string): SegFn {
  const f = fn as SegFn;
  f.tx = tx;
  return f;
}
const c3 = (k: number) => T((Q) => k * P(Q, 1 / 3), `${k}·Q^(1/3)`);
const cube = (k: number): Segment[] => [[1, true, 500000, true, c3(k)]];
function three(a: number, b: number, c: number, qmax: number): Segment[] {
  return [
    [1, true, 2500, false, T((Q) => a * P(Q, 2 / 3), `${a}·Q^(2/3)`)],
    [2500, true, 4500, false, T((Q) => b * P(Q, 0.5), `${b}·Q^(1/2)`)],
    [4500, true, qmax, true, c3(c)],
  ];
}
const poly = (a: number, b: number, c: number) =>
  T((Q) => { const l = L(Q); return a + b * l + c * l * l; }, `${a} + ${b}·ln(Q) + ${c}·ln(Q)²`);
const lin = (a: number, b: number) => T((Q) => a + b * Q, `${a} + ${b}·Q`);
const lnf = (a: number, b: number) => T((Q) => a * L(Q) + b, `${a}·ln(Q) − ${-b}`);
const pw = (k: number, e: number) => T((Q) => k * P(Q, e), `${k}·Q^${e}`);
const cst = (d: number) => T(() => d, `D = ${d} m (fisso)`);

export const F: Record<string, Segment[]> = {};

/* ---- Table 5 - Blast ---- */
F.BD1 = [[1, true, 30000, false, c3(0.35)], [30000, true, 120000, true, c3(0.44)]];
F.BD2 = [[1, true, 1500, false, c3(0.4)], [1500, true, 500000, true, c3(0.6)]];
F.BD3 = cube(0.5); F.BD4 = cube(0.8); F.BD5 = cube(1.1); F.BD6 = cube(1.2); F.BD7 = cube(1.8);
F.BD8 = cube(2.0); F.BD9 = cube(2.4); F.BD10 = cube(3.2); F.BD11 = cube(3.6); F.BD12 = cube(4.0);
F.BD13 = cube(4.4); F.BD14 = cube(4.8); F.BD15 = cube(6.0);
F.BD16 = three(0.47, 1.73, 7, 45000); F.BD17 = cube(7.2); F.BD18 = cube(8.0);
F.BD19 = three(0.61, 2.23, 9, 45000); F.BD20 = three(0.63, 2.30, 9.3, 45000); F.BD21 = cube(9.6);
F.BD22 = three(0.75, 2.75, 11.1, 500000); F.BD23 = three(0.81, 2.97, 12, 45000); F.BD24 = cube(13);
F.BD25 = three(0.95, 3.47, 14, 45000); F.BD26 = three(1, 3.6, 14.8, 500000); F.BD27 = cube(16);
F.BD28 = three(1.22, 4.46, 18, 45000); F.BD29 = cube(20); F.BD30 = cube(22.2);
F.BD31 = three(1.5, 5.5, 22.2, 500000); F.BD32 = cube(25); F.BD33 = three(1.89, 6.94, 28, 45000);
F.BD34 = three(2.43, 8.92, 36, 45000); F.BD35 = cube(44.4); F.BD36 = three(3, 11, 44.4, 500000);

/* ---- Table 6 - Debris and fragments ---- */
F.DFD1 = [[1, true, 31000, true, pw(41, 0.21)], [31000, false, 100400, true, pw(0.21, 0.72)], [100400, false, 500000, true, lnf(87.261, -166.56)]];
F.DFD2 = [[1, true, 23, true, lin(91, 2.687)], [23, false, 350, true, poly(64.995, 7.249, 6.693)], [350, false, 73571, true, lin(334.3, 0.0081)],
  [73571, false, 100400, true, c3(22.2)], [100400, false, 500000, true, lnf(107.386, -204.97)]];
F.DFD3 = [[1, true, 14, true, cst(61)], [14, false, 500000, true, lnf(87.261, -166.56)]];
F.DFD4 = [[1, true, 5, false, poly(64.995, 7.249, 6.693)], [5, true, 223, true, poly(97.493, 10.874, 10.04)], [223, false, 1170, true, cst(450)],
  [1170, false, 500000, true, lnf(87.261, -166.56)]];
F.DFD5 = [[1, true, 15, false, cst(61)], [15, true, 13150, true, lnf(68, -121)], [13150, false, 39800, true, c3(22.2)], [39800, false, 500000, true, lnf(87.261, -166.56)]];
F.DFD6 = [[1, true, 500000, true, pw(121, 0.164)]];
F.DFD7 = [[1, true, 10, false, cst(61)], [10, true, 400, false, T((Q) => 61 + 0.1 * (Q - 9), '61 + 0.1·(Q − 9)')],
  [400, true, 3375, true, T((Q) => 100 + 5.5 * P(Q - 400, 0.5), '100 + 5.5·(Q − 400)^0.5')], [3375, false, 5000, true, cst(400)],
  [5000, false, 7020, true, lin(110, 0.058)], [7020, false, 500000, true, pw(121, 0.164)]];
F.DFD8 = [[1, true, 31000, true, pw(27.47, 0.21)], [31000, false, 100400, true, pw(0.141, 0.72)], [100400, false, 500000, true, lnf(58.465, -111.595)]];
F.DFD9 = [[1, true, 31000, true, pw(20.5, 0.21)], [31000, false, 100400, true, pw(0.105, 0.72)], [100400, false, 500000, true, lnf(43.631, -83.28)]];
F.DFD10 = [[1, true, 23, true, lin(60.97, 1.8)], [23, false, 350, true, poly(43.547, 4.857, 4.484)], [350, false, 73571, true, lin(223.981, 0.005427)],
  [73571, false, 100400, true, c3(14.874)], [100400, false, 500000, true, lnf(71.949, -137.33)]];
F.DFD11 = [[1, true, 23, true, lin(45.5, 1.344)], [23, false, 350, true, poly(32.498, 3.625, 3.347)], [350, false, 73571, true, lin(167.15, 0.00405)],
  [73571, false, 100400, true, c3(11.1)], [100400, false, 500000, true, lnf(53.693, -102.485)]];
F.DFD12 = [[1, true, 14, true, cst(41)], [14, false, 500000, true, lnf(58.465, -111.595)]];
F.DFD13 = [[1, true, 14, true, cst(31)], [14, false, 500000, true, lnf(43.631, -83.28)]];
F.DFD14 = [[1, true, 5, false, poly(43.547, 4.857, 4.484)], [5, true, 223, true, poly(65.32, 7.286, 6.727)], [223, false, 1170, true, cst(302)],
  [1170, false, 500000, true, lnf(58.465, -111.595)]];
F.DFD15 = [[1, true, 5, false, poly(32.498, 3.625, 3.347)], [5, true, 223, true, poly(48.747, 5.437, 5.02)], [223, false, 1170, true, cst(225)],
  [1170, false, 500000, true, lnf(43.631, -83.28)]];
F.DFD16 = [[1, true, 15, false, cst(41)], [15, true, 13150, true, lnf(45.56, -81.07)], [13150, false, 39800, true, c3(14.874)], [39800, false, 500000, true, lnf(58.465, -111.595)]];
F.DFD17 = [[1, true, 15, false, cst(31)], [15, true, 13150, true, lnf(34, -60.5)], [13150, false, 39800, true, c3(11.1)], [39800, false, 500000, true, lnf(43.631, -83.28)]];
F.DFD18 = [[1, true, 500000, true, pw(81.07, 0.164)]];
F.DFD19 = [[1, true, 500000, true, pw(60.5, 0.164)]];
F.DFD20 = [[1, true, 10, false, cst(41)], [10, true, 400, false, lin(40.267, 0.067)],
  [400, true, 3375, true, T((Q) => 67 + 3.685 * P(Q - 400, 0.5), '67 + 3.685·(Q − 400)^0.5  [da formula inversa / Table 11]')], [3375, false, 5000, true, cst(268)],
  [5000, false, 7020, true, T((Q) => 73.7 + 0.03886 * Q, '73.7 + 0.03886·Q  [da formula inversa / Table 11]')], [7020, false, 500000, true, pw(81.07, 0.164)]];
F.DFD21 = [[1, true, 10, false, cst(31)], [10, true, 400, false, lin(30.05, 0.05)],
  [400, true, 3375, true, T((Q) => 0.5 * (100 + 5.5 * P(Q - 400, 0.5)), '0.5·(100 + 5.5·(Q − 400)^0.5)')], [3375, false, 5000, true, cst(200)],
  [5000, false, 7020, true, lin(55, 0.029)], [7020, false, 500000, true, pw(60.5, 0.164)]];

/* ---- Table 7 - Progressive SsD 1.2.1 ---- */
const f1 = (Q: number) => { const l = L(Q); return -1.303 * l * l + 70.345 * l - 167.648; };
const k1 = (k: number) => T((Q) => k * f1(Q), (k === 1 ? '' : k + '·') + '(−1.303·ln(Q)² + 70.345·ln(Q) − 167.648)');
F.P1D1 = [[1, true, 29, false, cst(20)], [29, true, 500000, true, k1(0.36)]];
F.P1D2 = [[1, true, 85, false, cst(60)], [85, true, 500000, true, k1(0.5)]];
F.P1D3 = [[1, true, 50, true, cst(60)], [50, false, 500000, true, k1(0.67)]];
F.P1D4 = [[1, true, 31, true, cst(60)], [31, false, 500000, true, k1(1)]];

/* ---- Table 8 - Progressive SsD 1.2.2 ---- */
const f2 = (Q: number) => { const l = L(Q); return 1.577 * l * l - 2.364 * l + 28.127; };
const k2 = (k: number) => T((Q) => k * f2(Q), (k === 1 ? '' : k + '·') + '(1.577·ln(Q)² − 2.364·ln(Q) + 28.127)');
F.P2D1 = [[1, true, 125, false, cst(20)], [125, true, 500000, true, k2(0.36)]];
F.P2D2 = [[1, true, 200, false, cst(30)], [200, true, 500000, true, k2(0.5)]];
F.P2D3 = [[1, true, 59, false, cst(30)], [59, true, 500000, true, k2(0.67)]];
F.P2D4 = [[1, true, 7, false, cst(30)], [7, true, 500000, true, k2(1)]];

/* ---- Table 9 - Thermal ---- */
F.TD1 = [[1, true, 12000, false, cst(25)], [12000, true, 500000, true, pw(0.22, 0.5)]];
F.TD2 = [[1, true, 6000, false, cst(60)], [6000, true, 500000, true, c3(3.2)]];
F.TD3 = [[1, true, 2500, false, cst(60)], [2500, true, 500000, true, c3(4.3)]];
F.TD4 = [[1, true, 800, false, cst(60)], [800, true, 500000, true, c3(6.4)]];

export const refs: string[] = Object.keys(F);

/** Tabella di Annex I-A in cui è definita la formula (per la spiegazione). */
export function formulaTable(ref: string): string {
  if (ref.startsWith('BD')) return 'Table 5 (Blast)';
  if (ref.startsWith('DFD')) return 'Table 6 (Debris and fragments)';
  if (ref.startsWith('P1D')) return 'Table 7 (Progressive SsD 1.2.1)';
  if (ref.startsWith('P2D')) return 'Table 8 (Progressive SsD 1.2.2)';
  if (ref.startsWith('TD')) return 'Table 9 (Thermal)';
  return '';
}

export function range(ref: string): [number, number] {
  const s = F[ref];
  return [s[0][0], s[s.length - 1][2]];
}

export function segOf(ref: string, Q: number): number {
  const s = F[ref];
  for (let i = 0; i < s.length; i++) {
    const g = s[i];
    const okLo = g[1] ? Q >= g[0] : Q > g[0];
    const okHi = g[3] ? Q <= g[2] : Q < g[2];
    if (okLo && okHi) return i;
  }
  return -1;
}

/** Distanza esatta (non arrotondata); null fuori range. Al raccordo governa la distanza maggiore. */
export function dExact(ref: string, Q: number): number | null {
  const s = F[ref];
  if (segOf(ref, Q) < 0) return null;
  let best: number | null = null;
  for (const g of s) {
    if (Q >= g[0] - 1e-9 && Q <= g[2] + 1e-9) {
      const d = g[4](Q);
      if (best === null || d > best) best = d;
    }
  }
  return best;
}

/** Distanza arrotondata per eccesso al metro (Annex I-A, Sect. I §5). */
export function distance(ref: string, Q: number): number | null {
  const d = dExact(ref, Q);
  return d == null ? null : Math.ceil(d - 1e-9);
}

export interface QuantityResult { q: number; capped: boolean; below?: boolean }

/** Q massima alla distanza D, per difetto al kg: la più grande Q tale che ogni q ≤ Q richieda ≤ D. */
export function quantity(ref: string, D: number): QuantityResult {
  const [lo, hi] = range(ref);
  if ((dExact(ref, lo) as number) > D + 1e-9) return { q: 0, capped: false, below: true };
  const N = 4000;
  const step = Math.log(hi / lo) / N;
  let prev = lo;
  let viol: number | null = null;
  for (let k = 1; k <= N; k++) {
    const q = k === N ? hi : lo * Math.exp(step * k);
    if ((dExact(ref, q) as number) > D + 1e-9) { viol = q; break; }
    prev = q;
  }
  if (viol === null) return { q: Math.floor(hi), capped: true };
  let a = prev;
  let b = viol;
  for (let it = 0; it < 200 && b - a > 1e-7; it++) {
    const m = (a + b) / 2;
    if ((dExact(ref, m) as number) > D + 1e-9) b = m; else a = m;
  }
  let qf = Math.floor(a + 1e-6);
  while (qf > lo && (dExact(ref, qf) as number) > D + 1e-9) qf--;
  return { q: qf, capped: false };
}

/** Testo del tratto usato, per la spiegazione. */
export function segText(ref: string, Q: number): string | null {
  const i = segOf(ref, Q);
  if (i < 0) return null;
  const g = F[ref][i];
  return g[0].toLocaleString(numLocale()) + (g[1] ? ' ≤ ' : ' < ') + 'Q' + (g[3] ? ' ≤ ' : ' < ') +
    g[2].toLocaleString(numLocale()) + ' kg:  D = ' + (txText(g[4].tx) || '?');
}

/** Testo della formula di un tratto (SegFn.tx) nella lingua corrente: traduce "(fisso)" e la nota sulle formule inverse. */
export function txText(tx: string | undefined): string {
  return (tx ?? '').replace('(fisso)', t('(fisso)')).replace('[da formula inversa / Table 11]', t('[da formula inversa / Table 11]'));
}
