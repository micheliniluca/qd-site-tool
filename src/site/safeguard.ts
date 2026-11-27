/* Linee di salvaguardia (IBD = ES 24, costruzioni vulnerabili = ES 25, PTRD = ES 21–23) attorno a un PES,
   con la distanza propria di ciascun settore. */
import { evaluateEffect } from '../engine/cell';
import { EFFMAP, type Effect, type EsRow } from '../engine/matrix';
import type { LoadCase } from '../engine/mixing';
import { regionsAt, toLocal, v, type Vec } from './geometry';
import { pesColumns, pesTable, reducedIbdPrefer, SECTOR_IT, type ColumnRegion } from './evaluate';
import { magazineLoad, type Magazine } from './model';
import { t } from '../i18n';

export interface SafeguardPiece { eff: Effect; region: ColumnRegion; req: number | null; ref: string }
export interface Safeguard { esRow: EsRow; pts: Vec[]; pieces: SafeguardPiece[]; unknown: boolean; maxReq: number; label: string }

function rectDist(m: Magazine, p: Vec): number {
  const l = toLocal(m, p);
  return Math.hypot(Math.max(Math.abs(l.x) - m.w / 2, 0), Math.max(Math.abs(l.y) - m.d / 2, 0));
}

/** `cases`: casi di carico (default: contenuto del magazzino; per un sito unico quelli aggregati). */
export function safeguardPieces(m: Magazine, esRow: EsRow, cases?: LoadCase[]): SafeguardPiece[] {
  const table = pesTable(m);
  const out: SafeguardPiece[] = [];
  for (const load of cases ?? magazineLoad(m).cases) {
    for (const [eff, qtype] of EFFMAP[load.hd]) {
      for (const region of pesColumns(m, eff)) {
        const r = evaluateEffect({ table, col: region.col, es: esRow, hd: load.hd, neq: load.neq, mce: load.mce, vol: m.vol, prefer: reducedIbdPrefer(m, load) }, eff, qtype);
        const req = !r.r ? 0 : r.r.oor ? null : (r.r.dr as number);
        out.push({ eff, region, req, ref: r.o ? (r.o.ref ?? `${r.r?.label}`) : '—' });
      }
    }
  }
  return out;
}

/** Contorno per raggi dal centro: per ogni direzione il punto più lontano con dist(p, PES) ≤ QD del settore di p. */
export function safeguard(m: Magazine, esRow: EsRow, nRays = 360, cases?: LoadCase[]): Safeguard {
  const pieces = safeguardPieces(m, esRow, cases);
  const unknown = pieces.some((p) => p.req == null);
  const maxReq = Math.max(0, ...pieces.map((p) => p.req ?? 0));
  const byEff = new Map<Effect, SafeguardPiece[]>();
  for (const p of pieces) { if (!byEff.has(p.eff)) byEff.set(p.eff, []); byEff.get(p.eff)!.push(p); }

  const reqAt = (p: Vec): number => {
    let best = 0;
    for (const list of byEff.values()) {
      const directional = list.filter((x) => x.region.poly);
      if (!directional.length) { for (const x of list) best = Math.max(best, x.req ?? 0); continue; }
      const regs = regionsAt(directional.map((x) => ({ name: x.region.sector!, poly: x.region.poly! })), p);
      for (const x of directional) if (regs.some((g) => g.poly === x.region.poly)) best = Math.max(best, x.req ?? 0);
    }
    return best;
  };
  const insideAt = (p: Vec) => rectDist(m, p) <= reqAt(p) + 1e-9;

  const pts: Vec[] = [];
  if (maxReq > 0) {
    const Rmax = maxReq + Math.hypot(m.w, m.d) / 2 + 1;
    const N = 150, step = Rmax / N;
    for (let i = 0; i < nRays; i++) {
      const a = (i / nRays) * 2 * Math.PI;
      const dir = v(Math.sin(a), Math.cos(a));
      const at = (r: number) => v(m.cx + dir.x * r, m.cy + dir.y * r);
      let last = 0;
      for (let k = 1; k <= N; k++) if (insideAt(at(k * step))) last = k;
      let lo = last * step, hi = Math.min(Rmax, (last + 1) * step);
      for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (insideAt(at(mid))) lo = mid; else hi = mid; }
      pts.push(at(lo));
    }
  }
  // etichetta: per ogni settore la distanza massima tra gli effetti (i settori di Fig. A-1 e A-2 sono accorpati per nome)
  const bySector = new Map<string, number>();
  for (const p of pieces) {
    const k = p.region.sector ?? '';
    bySector.set(k, Math.max(bySector.get(k) ?? 0, p.req ?? 0));
  }
  const order = ['front', 'side', 'rear', ''];
  const vals = [...bySector.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  const label = vals.every((x) => x[1] === vals[0][1])
    ? `${vals[0]?.[1] ?? 0} m`
    : vals.map(([k, d]) => `${t(SECTOR_IT[k as keyof typeof SECTOR_IT])} ${d} m`).join(' · ');
  return { esRow, pts, pieces, unknown, maxReq, label };
}
