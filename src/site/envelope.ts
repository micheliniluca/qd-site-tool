/* Inviluppo delle linee di salvaguardia: contorno dell'unione dei poligoni (come la "combined safety zone contour"
   dei progetti). Il bordo dell'unione è fatto dai tratti di ciascun contorno che non stanno dentro nessun altro. */
import { pointInPolygon, type Poly, type Vec } from './geometry';

export interface Envelope {
  rings: Vec[][];          // anelli chiusi: contorni esterni e, se ci sono, "buchi" non coperti
  area: number;            // area coperta (m²)
}

interface Box { x0: number; y0: number; x1: number; y1: number }
const boxOf = (p: Poly): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of p) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  return { x0, y0, x1, y1 };
};
const overlap = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

function signedArea(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}

/** Intersezione propria dei segmenti ab e cd: parametri (t su ab, u su cd) o null. */
function segX(a: Vec, b: Vec, c: Vec, d: Vec): [number, number] | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9 ? [t, u] : null;
}

export function envelope(polys: Poly[]): Envelope {
  const P = polys.filter((p) => p.length >= 3).map((p) => (signedArea(p) < 0 ? [...p].reverse() : p));   // antiorari
  if (!P.length) return { rings: [], area: 0 };
  const boxes = P.map(boxOf);
  // punti di taglio di ogni lato: parametro t e punto (lo stesso oggetto è condiviso dai due lati che si incrociano)
  const cuts: { t: number; q: Vec }[][][] = P.map((p) => p.map(() => []));
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    if (!overlap(boxes[i], boxes[j])) continue;
    const A = P[i], B = P[j];
    for (let a = 0; a < A.length; a++) {
      const a0 = A[a], a1 = A[(a + 1) % A.length];
      const ex0 = Math.min(a0.x, a1.x), ex1 = Math.max(a0.x, a1.x), ey0 = Math.min(a0.y, a1.y), ey1 = Math.max(a0.y, a1.y);
      if (ex1 < boxes[j].x0 || ex0 > boxes[j].x1 || ey1 < boxes[j].y0 || ey0 > boxes[j].y1) continue;
      for (let b = 0; b < B.length; b++) {
        const b0 = B[b], b1 = B[(b + 1) % B.length];
        if (Math.max(b0.x, b1.x) < ex0 || Math.min(b0.x, b1.x) > ex1 || Math.max(b0.y, b1.y) < ey0 || Math.min(b0.y, b1.y) > ey1) continue;
        const x = segX(a0, a1, b0, b1);
        if (!x) continue;
        const q = { x: a0.x + (a1.x - a0.x) * x[0], y: a0.y + (a1.y - a0.y) * x[0] };
        cuts[i][a].push({ t: x[0], q });
        cuts[j][b].push({ t: x[1], q });
      }
    }
  }
  // tratti di bordo: sotto-segmenti il cui punto medio non è dentro nessun altro poligono
  const key = (q: Vec) => `${q.x.toFixed(6)},${q.y.toFixed(6)}`;
  const next = new Map<string, Vec[]>();   // da un estremo ai possibili successivi (verso antiorario conservato)
  const points = new Map<string, Vec>();
  let nSeg = 0;
  for (let i = 0; i < P.length; i++) {
    const A = P[i];
    for (let a = 0; a < A.length; a++) {
      const a0 = A[a], a1 = A[(a + 1) % A.length];
      const pts = [a0, ...cuts[i][a].sort((u, v) => u.t - v.t).map((c) => c.q), a1];
      for (let k = 0; k + 1 < pts.length; k++) {
        const s0 = pts[k], s1 = pts[k + 1];
        const mid = { x: (s0.x + s1.x) / 2, y: (s0.y + s1.y) / 2 };
        let covered = false;
        for (let j = 0; j < P.length && !covered; j++) {
          if (j === i) continue;
          const bx = boxes[j];
          if (mid.x < bx.x0 || mid.x > bx.x1 || mid.y < bx.y0 || mid.y > bx.y1) continue;
          covered = pointInPolygon(mid, P[j]);
        }
        if (covered) continue;
        const k0 = key(s0);
        points.set(k0, s0); points.set(key(s1), s1);
        if (!next.has(k0)) next.set(k0, []);
        next.get(k0)!.push(s1);
        nSeg++;
      }
    }
  }
  // concatenazione in anelli
  const rings: Vec[][] = [];
  let guard = nSeg + 10;
  for (const startKey of [...next.keys()]) {
    while ((next.get(startKey)?.length ?? 0) > 0 && guard-- > 0) {
      const ring: Vec[] = [points.get(startKey)!];
      let curKey = startKey;
      for (let steps = 0; steps <= nSeg; steps++) {
        const list = next.get(curKey);
        if (!list || !list.length) break;
        const nx = list.shift()!;
        const nk = key(nx);
        if (nk === startKey) break;
        ring.push(nx); curKey = nk;
      }
      if (ring.length >= 3) rings.push(ring);
    }
  }
  const area = rings.reduce((s, r) => s + signedArea(r), 0);   // esterni antiorari (+), buchi orari (−)
  return { rings, area: Math.abs(area) };
}
