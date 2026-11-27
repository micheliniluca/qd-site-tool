/* Barricate di terra: verifica in sezione (Part II §2.2.3.2, Fig. 2-2/2-3) e in pianta (lunghezza, §2.2.3.2 "Length of Barricade").
   Coordinate della sezione: x lungo la congiungente delle due cataste, z quota (m).
   Catasta A occupa x ∈ [−wA, 0], catasta B x ∈ [gap, gap + wB]; terreno piano sotto le cataste, lineare tra le due. */
import { N_, t } from '../i18n';
import { add, cross, mul, rectCorners, sub, v, type Rect, type Vec } from './geometry';

export interface StackSection { w: number; h: number; z: number; roof: boolean }
export interface BarricadeSectionInput {
  name: string;
  gap: number;                 // distanza tra le facce affacciate delle cataste (m)
  a: StackSection;
  b: StackSection;
  x0: number;                  // distanza dalla faccia di A al piede della barricata (m)
  base: number;                // larghezza alla base (m)
  top: number;                 // larghezza in sommità (m)
  h: number;                   // altezza sopra il piede (m)
  wall: { t: number; h: number; at: number } | null;   // muro in c.a./mattoni: spessore, altezza, ascissa della faccia lato A
  neq: number;                 // NEQ della catasta A (kg), per 5·Q^(1/3) e cratere
}

export const DEFAULT_SECTION: BarricadeSectionInput = {
  name: N_('Sezione 1'), gap: 12, a: { w: 6, h: 3, z: 0, roof: false }, b: { w: 6, h: 3, z: 0, roof: false },
  x0: 2.4, base: 7.2, top: 1.0, h: 4.0, wall: null, neq: 1000,
};

export interface LineCheck { p: Vec; q: Vec; length: number; required: number; ok: boolean | null; note: string }
export interface SectionResult {
  ground: (x: number) => number;
  barricade: Vec[];            // poligono (antiorario)
  wallPoly: Vec[] | null;
  checks: { from: 'A' | 'B'; ab: LineCheck; cd: LineCheck | null }[];
  sep5: number;                // 5·Q^(1/3)
  individual: boolean;         // separazione ≥ 5·Q^(1/3): verifica per ciascuna catasta
  sloping: boolean;
  crater: { r: number; reach: number; undermined: number; allowed: number; ok: boolean };
  ok: boolean;
  notes: string[];
}

export function groundFn(s: BarricadeSectionInput) {
  return (x: number) => (x <= 0 ? s.a.z : x >= s.gap ? s.b.z : s.a.z + ((s.b.z - s.a.z) * x) / s.gap);
}

export function barricadePoly(s: BarricadeSectionInput): Vec[] {
  const g = groundFn(s);
  const zb = g(s.x0 + s.base / 2);
  const off = (s.base - s.top) / 2;
  return [v(s.x0, zb), v(s.x0 + s.base, zb), v(s.x0 + s.base - off, zb + s.h), v(s.x0 + off, zb + s.h)];
}

function inConvex(p: Vec, poly: Vec[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (cross(sub(b, a), sub(p, a)) < -1e-9) return false;
  }
  return true;
}

/** Lunghezza "equivalente di terra" attraversata dal segmento: terra di barricata o terreno naturale ×1, muro ×4 (§2.2.3.3.1). */
export function materialLength(s: BarricadeSectionInput, p: Vec, q: Vec, N = 6000): number {
  const g = groundFn(s);
  const bar = barricadePoly(s);
  const wall = wallPoly(s);
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  const d = sub(q, p);
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const tp = (i + 0.5) / N;
    const x = add(p, mul(d, tp));
    // le cataste non sono materiale di barricata
    if ((x.x < 0 && x.x > -s.a.w) || (x.x > s.gap && x.x < s.gap + s.b.w)) continue;
    if (wall && inConvex(x, wall)) sum += 4;
    else if (inConvex(x, bar) || x.y < g(x.x) - 1e-9) sum += 1;
  }
  return (sum * L) / N;
}

function wallPoly(s: BarricadeSectionInput): Vec[] | null {
  if (!s.wall) return null;
  const g = groundFn(s);
  const z = g(s.wall.at + s.wall.t / 2);
  return [v(s.wall.at, z), v(s.wall.at + s.wall.t, z), v(s.wall.at + s.wall.t, z + s.wall.h), v(s.wall.at, z + s.wall.h)];
}

/** Punti A e B: A sulla catasta più bassa (in sommità), sulla faccia remota (o vicina se c'è tetto protettivo); B sullo spigolo
    superiore della faccia vicina dell'altra catasta (Fig. 2-2 / 2-3). `from` forza la catasta di A (verifica individuale). */
function pointsAB(s: BarricadeSectionInput, from?: 'A' | 'B'): { A: Vec; B: Vec; on: 'A' | 'B' } {
  const topA = s.a.z + s.a.h, topB = s.b.z + s.b.h;
  const on = from ?? (topB < topA ? 'B' : 'A');
  if (on === 'A') return { on, A: v(s.a.roof ? 0 : -s.a.w, topA), B: v(s.gap, topB) };
  return { on, A: v(s.gap + (s.b.roof ? 0 : s.b.w), topB), B: v(0, topA) };
}

export function checkSection(s: BarricadeSectionInput): SectionResult {
  const notes: string[] = [];
  const sep5 = 5 * Math.cbrt(Math.max(s.neq, 0));
  const individual = s.gap >= sep5;
  const sloping = Math.abs(s.a.z - s.b.z) > 1e-6;
  const contiguous = s.gap <= 1e-6;
  const mk = (from?: 'A' | 'B') => {
    const { A, B, on } = pointsAB(s, from);
    const ab = materialLength(s, A, B);
    const abc: LineCheck = { p: A, q: B, length: ab, required: 2.4, ok: ab >= 2.4 - 1e-6, note: t('AB ≥ 2,4 m (§2.2.3.2.2.a.(4))') };
    let cd: LineCheck | null = null;
    if (!individual) {
      if (sloping && !contiguous) notes.push(t('Terreno in pendenza, cataste non contigue a distanza < 5·Q^(1/3): lo scostamento di 0,30 m non si applica (§2.2.3.2.2.b.(5)).'));
      else {
        const C = v(A.x, A.y + 0.3), D = v(B.x, B.y + 0.3);
        const l = materialLength(s, C, D);
        cd = { p: C, q: D, length: l, required: 1.0, ok: l >= 1.0 - 1e-6, note: t('CD (0,30 m sopra AB) ≥ 1,0 m (§2.2.3.2.2.b.(3)/(4))') };
      }
    }
    return { from: on, ab: abc, cd };
  };
  const checks = individual ? [mk('A'), mk('B')] : [mk()];
  if (individual) notes.push(t('Separazione {gap} m ≥ 5·Q^(1/3) = {sep} m: verifica rispetto a ciascuna catasta (§2.2.3.2.2.c).', { gap: s.gap.toFixed(1), sep: sep5.toFixed(1) }));
  // cratere (§2.2.3.3.3): r = ½·NEQ^(1/3) dal centro dell'esplosivo (catasta A); la barricata non va scalzata oltre 1/3 della base
  const r = 0.5 * Math.cbrt(Math.max(s.neq, 0));
  const reach = -s.a.w / 2 + r;
  const undermined = Math.max(0, Math.min(s.base, reach - s.x0));
  const allowed = s.base / 3;
  const crater = { r, reach, undermined, allowed, ok: undermined <= allowed + 1e-9 };
  if (s.x0 < 0 || s.x0 + s.base > s.gap) notes.push(t('La barricata non sta tra le due cataste: controllare x0 e larghezza di base.'));
  if (s.top > s.base) notes.push(t('Larghezza in sommità maggiore della base.'));
  const ok = checks.every((c) => c.ab.ok && (c.cd?.ok ?? true)) && crater.ok;
  return { ground: groundFn(s), barricade: barricadePoly(s), wallPoly: wallPoly(s), checks, sep5, individual, sloping, crater, ok, notes };
}

/* ---------------- pianta: lunghezza della barricata ---------------- */

export interface LengthCheck {
  ok: boolean;
  sides: { line: [Vec, Vec]; hit: Vec | null; beyond: number }[];   // per ciascuna retta tra gli estremi: oltre quanto prosegue la barricata
  note: string;
}

function convexHull(pts: Vec[]): Vec[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Vec[] = [], upper: Vec[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(sub(lower[lower.length - 1], lower[lower.length - 2]), sub(q, lower[lower.length - 2])) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(sub(upper[upper.length - 1], upper[upper.length - 2]), sub(q, upper[upper.length - 2])) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Le due rette "tra gli estremi delle due cataste" sono i lati dell'inviluppo convesso che collegano un vertice di A a uno di B.
    La barricata (esclusa la scarpa di testa) deve superarle di almeno 1,0 m (§2.2.3.2, Fig. 2-4). */
export function checkLength(a: Rect, b: Rect, barricade: Vec[], margin = 1.0): LengthCheck {
  const ca = rectCorners(a), cb = rectCorners(b);
  const hull = convexHull([...ca, ...cb]);
  const isA = (p: Vec) => ca.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9);
  const bridges: [Vec, Vec][] = [];
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i], q = hull[(i + 1) % hull.length];
    if (isA(p) !== isA(q)) bridges.push([p, q]);
  }
  // lunghezze progressive lungo la barricata
  const cum = [0];
  for (let i = 1; i < barricade.length; i++) cum.push(cum[i - 1] + Math.hypot(barricade[i].x - barricade[i - 1].x, barricade[i].y - barricade[i - 1].y));
  const total = cum[cum.length - 1];
  const sides = bridges.map((line) => {
    // intersezione della retta (prolungata) con la barricata
    const [p, q] = line;
    const d = sub(q, p);
    let best: { s: number; hit: Vec; between: boolean } | null = null;
    for (let i = 0; i + 1 < barricade.length; i++) {
      const s1 = barricade[i], s2 = barricade[i + 1];
      const e = sub(s2, s1);
      const den = cross(d, e);
      if (Math.abs(den) < 1e-12) continue;
      const tl = cross(sub(s1, p), e) / den;     // parametro sulla retta tra le cataste
      const u = cross(sub(s1, p), d) / den;     // parametro sul tratto di barricata
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const hit = add(p, mul(d, tl));
      const sAlong = cum[i] + u * Math.hypot(e.x, e.y);
      if (!best || (tl >= 0 && tl <= 1 && !best.between)) best = { s: sAlong, hit, between: tl >= 0 && tl <= 1 };
    }
    if (!best) return { line, hit: null, beyond: -Infinity };
    return { line, hit: best.hit, beyond: NaN, s: best.s } as { line: [Vec, Vec]; hit: Vec; beyond: number; s: number };
  });
  // "oltre": distanza lungo la barricata dall'intersezione verso l'estremo esterno (quello lontano dall'altra intersezione)
  const ss = sides.map((x) => ('s' in x ? (x as { s: number }).s : NaN));
  const out = sides.map((x, i) => {
    if (!x.hit) return { line: x.line, hit: null, beyond: -Infinity };
    const other = ss[1 - i];
    const beyond = Number.isFinite(other) ? (ss[i] >= other ? total - ss[i] : ss[i]) : Math.max(ss[i], total - ss[i]);
    return { line: x.line, hit: x.hit, beyond };
  });
  const ok = out.length === 2 && out.every((x) => x.hit && x.beyond >= margin - 1e-9);
  const note = out.length !== 2 ? t('Le due cataste si sovrappongono: verifica non applicabile.')
    : out.some((x) => !x.hit) ? t('La barricata non intercetta entrambe le rette tra gli estremi delle cataste.')
    : ok ? t('La barricata supera entrambe le rette di almeno {m} m.', { m: margin.toFixed(1) }) : t('La barricata deve proseguire almeno {m} m oltre ciascuna retta.', { m: margin.toFixed(1) });
  return { ok, sides: out, note };
}
