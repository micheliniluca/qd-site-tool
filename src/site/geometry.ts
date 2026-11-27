/* Geometria piana in metri, asse y verso nord (y in alto). */

export interface Vec { x: number; y: number }
export type Poly = Vec[];

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const deg = Math.PI / 180;

/** Rettangolo orientato: centro, larghezza w (lungo la facciata), profondità d (fronte–retro),
    azimut az della direzione "fronte" (porta) in gradi da nord in senso orario. */
export interface Rect { cx: number; cy: number; w: number; d: number; az: number }

/** Versori locali: uy = fronte (verso la porta), ux = destra guardando fuori dalla porta. */
export function frame(az: number): { ux: Vec; uy: Vec } {
  const a = az * deg;
  return { uy: v(Math.sin(a), Math.cos(a)), ux: v(Math.cos(a), -Math.sin(a)) };
}
export function toWorld(r: Rect, lx: number, ly: number): Vec {
  const { ux, uy } = frame(r.az);
  return v(r.cx + lx * ux.x + ly * uy.x, r.cy + lx * ux.y + ly * uy.y);
}
export function toLocal(r: Rect, p: Vec): Vec {
  const { ux, uy } = frame(r.az);
  const q = sub(p, v(r.cx, r.cy));
  return v(dot(q, ux), dot(q, uy));
}
/** Vertici in senso antiorario: retro-sinistra, retro-destra, fronte-destra, fronte-sinistra. */
export function rectCorners(r: Rect): Poly {
  const w = r.w / 2, d = r.d / 2;
  // ordine antiorario nel sistema locale (ux, uy) che è destrorso: (−w,−d) → (w,−d) → (w,d) → (−w,d)
  return [toWorld(r, -w, -d), toWorld(r, w, -d), toWorld(r, w, d), toWorld(r, -w, d)];
}

export function pointSegDist(p: Vec, a: Vec, b: Vec): { d: number; q: Vec } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 > 0 ? dot(sub(p, a), ab) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = add(a, mul(ab, t));
  return { d: dist(p, q), q };
}

function segIntersect(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const r = sub(b, a), s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(c, a), s) / den;
  const u = cross(sub(c, a), r) / den;
  if (t < -1e-12 || t > 1 + 1e-12 || u < -1e-12 || u > 1 + 1e-12) return null;
  return add(a, mul(r, t));
}

export function pointInPolygon(p: Vec, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Una geometria è una lista di segmenti, più (opz.) l'area chiusa per il test di contenimento. */
export interface Shape { segs: [Vec, Vec][]; area?: Poly }
export function polyShape(p: Poly): Shape {
  return { segs: p.map((a, i) => [a, p[(i + 1) % p.length]] as [Vec, Vec]), area: p };
}
export function lineShape(p: Vec[]): Shape {
  const segs: [Vec, Vec][] = [];
  for (let i = 0; i + 1 < p.length; i++) segs.push([p[i], p[i + 1]]);
  if (p.length === 1) segs.push([p[0], p[0]]);
  return { segs };
}

/** Distanza minima tra due geometrie (punto più vicino → punto più vicino, AASTP-1 Part I §1.3.2.2). */
export function shapeDistance(A: Shape, B: Shape): { d: number; pa: Vec; pb: Vec } {
  let best = { d: Infinity, pa: v(0, 0), pb: v(0, 0) };
  for (const [a1, a2] of A.segs) for (const [b1, b2] of B.segs) {
    const x = segIntersect(a1, a2, b1, b2);
    if (x) return { d: 0, pa: x, pb: x };
    for (const [p, s1, s2, flip] of [[a1, b1, b2, false], [a2, b1, b2, false], [b1, a1, a2, true], [b2, a1, a2, true]] as [Vec, Vec, Vec, boolean][]) {
      const r = pointSegDist(p, s1, s2);
      if (r.d < best.d) best = flip ? { d: r.d, pa: r.q, pb: p } : { d: r.d, pa: p, pb: r.q };
    }
  }
  // contenimento
  if (A.area && B.segs.length && pointInPolygon(B.segs[0][0], A.area)) return { d: 0, pa: B.segs[0][0], pb: B.segs[0][0] };
  if (B.area && A.segs.length && pointInPolygon(A.segs[0][0], B.area)) return { d: 0, pa: A.segs[0][0], pb: A.segs[0][0] };
  return best;
}

/* ---- ritaglio con regione convessa (antioraria) ---- */
/** p a sinistra di (o sulla) retta a→b, con tolleranza 1 µm sulla distanza. */
const inside = (p: Vec, a: Vec, b: Vec) => { const e = sub(b, a); return cross(e, sub(p, a)) >= -1e-6 * len(e); };

/** Sutherland–Hodgman: poligono soggetto qualsiasi, regione di ritaglio convessa antioraria. */
export function clipPolygon(subject: Poly, clip: Poly): Poly {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const inp = out;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length];
      const pin = inside(p, a, b), qin = inside(q, a, b);
      if (pin) out.push(p);
      if (pin !== qin) {
        const r = sub(q, p), s = sub(b, a);
        const den = cross(r, s);
        if (Math.abs(den) > 1e-12) out.push(add(p, mul(r, cross(sub(a, p), s) / den)));
      }
    }
  }
  return out;
}

/** Cyrus–Beck: segmento ritagliato da una regione convessa antioraria (null se esterno). */
export function clipSegment(p: Vec, q: Vec, clip: Poly): [Vec, Vec] | null {
  let t0 = 0, t1 = 1;
  const dvec = sub(q, p);
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const e = sub(b, a);
    const num = cross(e, sub(p, a));     // >= 0 dentro
    const den = cross(e, dvec);
    if (Math.abs(den) < 1e-12) { if (num < -1e-9) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1 + 1e-12) return null;
  }
  return [add(p, mul(dvec, t0)), add(p, mul(dvec, t1))];
}

export function clipShape(s: Shape, clip: Poly): Shape | null {
  if (s.area) {
    const p = clipPolygon(s.area, clip);
    return p.length >= 1 ? polyShape(p) : null;
  }
  const segs: [Vec, Vec][] = [];
  for (const [a, b] of s.segs) { const c = clipSegment(a, b, clip); if (c) segs.push(c); }
  return segs.length ? { segs } : null;
}

export function polyArea(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += cross(p[i], p[(i + 1) % p.length]);
  return s / 2;
}

/* ---- settori (Annex I-A, Sect. I §7–11, Fig. A-1 / A-2) ---- */
export type SectorName = 'front' | 'side' | 'rear';
export interface SectorRegion { name: SectorName; side?: 'left' | 'right'; poly: Poly }

/** Regioni convesse fronte / lato sx / lato dx / retro di un rettangolo orientato.
    frontAngle / rearAngle = angolo (°) tra la facciata e la retta tracciata dallo spigolo
    (150° o 100° per il fronte, 135° per il retro): la retta forma (angolo − 90°) con la normale alla facciata. */
export function sectorRegions(r: Rect, frontAngle: number, rearAngle = 135, R = 1e5): SectorRegion[] {
  const w = r.w / 2, d = r.d / 2;
  const of = (frontAngle - 90) * deg, orr = (rearAngle - 90) * deg;
  const L = (lx: number, ly: number) => toWorld(r, lx, ly);
  const FL = L(-w, d), FR = L(w, d), RL = L(-w, -d), RR = L(w, -d);
  const fL = L(-w - R * Math.sin(of), d + R * Math.cos(of));
  const fR = L(w + R * Math.sin(of), d + R * Math.cos(of));
  const rL = L(-w - R * Math.sin(orr), -d - R * Math.cos(orr));
  const rR = L(w + R * Math.sin(orr), -d - R * Math.cos(orr));
  return [
    { name: 'front', poly: ccw([FL, FR, fR, fL]) },
    { name: 'rear', poly: ccw([RR, RL, rL, rR]) },
    { name: 'side', side: 'left', poly: ccw([FL, fL, rL, RL]) },
    { name: 'side', side: 'right', poly: ccw([FR, RR, rR, fR]) },
  ];
}
function ccw(p: Poly): Poly { return polyArea(p) < 0 ? [...p].reverse() : p; }

/** Raggi di confine dei settori (per il disegno): [origine, punto lontano]. */
export function sectorRays(r: Rect, frontAngle: number, rearAngle: number, length: number): [Vec, Vec][] {
  const w = r.w / 2, d = r.d / 2;
  const of = (frontAngle - 90) * deg, orr = (rearAngle - 90) * deg;
  const L = (lx: number, ly: number) => toWorld(r, lx, ly);
  return [
    [L(-w, d), L(-w - length * Math.sin(of), d + length * Math.cos(of))],
    [L(w, d), L(w + length * Math.sin(of), d + length * Math.cos(of))],
    [L(-w, -d), L(-w - length * Math.sin(orr), -d - length * Math.cos(orr))],
    [L(w, -d), L(w + length * Math.sin(orr), -d - length * Math.cos(orr))],
  ];
}

/** Regioni (anche più d'una, sul confine) che contengono il punto. */
export function regionsAt(regions: SectorRegion[], p: Vec): SectorRegion[] {
  return regions.filter((g) => g.poly.every((a, i) => inside(p, a, g.poly[(i + 1) % g.poly.length])));
}
