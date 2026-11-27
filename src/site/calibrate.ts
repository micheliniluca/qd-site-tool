import type { Background } from './model';

/** Calibrazione su due punti: p1 resta fermo, la scala diventa tale che |p1p2| = realM. */
export function calibrate(bg: Background, p1: { x: number; y: number }, p2: { x: number; y: number }, realM: number): Background {
  const measured = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (!(measured > 0) || !(realM > 0)) return bg;
  const m2 = bg.mPerPx * (realM / measured);
  const px = (p1.x - bg.x) / bg.mPerPx, py = (bg.y - p1.y) / bg.mPerPx;
  return { ...bg, mPerPx: m2, x: p1.x - px * m2, y: p1.y + py * m2 };
}
