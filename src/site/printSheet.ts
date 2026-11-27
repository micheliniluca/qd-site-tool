/* Tavola stampabile in scala esatta (SVG in millimetri): planimetria, linee di salvaguardia, cartiglio, scala grafica, nord. */
import { isRect, magazineLoad, type Project } from './model';
import { rectCorners, type Vec } from './geometry';
import type { SiteEval } from './evaluate';
import type { Safeguard } from './safeguard';
import type { Envelope } from './envelope';

export const PAPERS: Record<string, [number, number]> = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
export const SCALES = [200, 500, 1000, 2000, 2500, 5000, 10000, 25000];

export interface PrintOptions {
  paper: keyof typeof PAPERS | string;
  landscape: boolean;
  scale: number;            // 1:scale
  center: Vec;              // centro della vista (m)
  title: string;
  sgLabel: string;          // es. "IBD (ES 24)"
  envelope?: Envelope | null; // inviluppo di tutte le linee
  author?: string;
  date?: string;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function sheetSize(o: Pick<PrintOptions, 'paper' | 'landscape'>): [number, number] {
  const [a, b] = PAPERS[o.paper] ?? PAPERS.A3;
  return o.landscape ? [a, b] : [b, a];
}

/** Scala "comoda" più piccola (denominatore più basso) con cui gli oggetti stanno nell'area utile. */
export function fitScale(p: Project, o: Pick<PrintOptions, 'paper' | 'landscape'>, safeguards: Map<string, Safeguard>, env?: Envelope | null): { scale: number; center: Vec } {
  const pts: Vec[] = [];
  for (const x of p.objects) pts.push(...(isRect(x) ? rectCorners(x) : x.pts));
  for (const s of safeguards.values()) pts.push(...s.pts);
  for (const r of env?.rings ?? []) pts.push(...r);
  if (!pts.length) return { scale: 1000, center: { x: 0, y: 0 } };
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const [W, H] = sheetSize(o);
  const mw = W - 20, mh = H - 20 - 32;
  const need = Math.max((Math.max(...xs) - Math.min(...xs)) * 1000 / mw, (Math.max(...ys) - Math.min(...ys)) * 1000 / mh) * 1.05;
  const scale = SCALES.find((s) => s >= need) ?? Math.ceil(need / 1000) * 1000;
  return { scale, center: { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 } };
}

export function buildPrintSvg(p: Project, site: SiteEval, safeguards: Map<string, Safeguard>, o: PrintOptions): string {
  const [W, H] = sheetSize(o);
  const k = 1000 / o.scale;                 // mm per metro
  const mx = 10, my = 10, tbH = 32;         // margini e altezza cartiglio
  const fw = W - 2 * mx, fh = H - 2 * my - tbH;
  const cx = mx + fw / 2, cy = my + fh / 2;
  const P = (q: Vec) => ({ x: cx + (q.x - o.center.x) * k, y: cy - (q.y - o.center.y) * k });
  const pts = (ps: Vec[]) => ps.map((q) => { const s = P(q); return `${s.x.toFixed(2)},${s.y.toFixed(2)}`; }).join(' ');
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">`);
  out.push(`<defs><clipPath id="frame"><rect x="${mx}" y="${my}" width="${fw}" height="${fh}"/></clipPath></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  out.push(`<g clip-path="url(#frame)">`);
  // griglia ogni 100 m (o 1000 m sotto 1:10000)
  const step = o.scale >= 10000 ? 1000 : o.scale >= 2500 ? 500 : 100;
  const x0 = o.center.x - fw / 2 / k, x1 = o.center.x + fw / 2 / k, y0 = o.center.y - fh / 2 / k, y1 = o.center.y + fh / 2 / k;
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const s = P({ x, y: 0 }).x; out.push(`<line x1="${s}" y1="${my}" x2="${s}" y2="${my + fh}" stroke="#ddd" stroke-width="0.15"/>`); }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { const s = P({ x: 0, y }).y; out.push(`<line x1="${mx}" y1="${s}" x2="${mx + fw}" y2="${s}" stroke="#ddd" stroke-width="0.15"/>`); }
  // linee di salvaguardia
  for (const [id, sg] of safeguards) {
    if (!sg.pts.length) continue;
    const m = p.objects.find((x) => x.id === id);
    out.push(`<polygon points="${pts(sg.pts)}" fill="none" stroke="#7a3db8" stroke-width="0.35" stroke-dasharray="3 1.2"/>`);
    const top = sg.pts.reduce((a, q) => (q.y > a.y ? q : a), sg.pts[0]);
    const t = P(top);
    out.push(`<text x="${t.x}" y="${t.y - 1}" font-size="2.2" fill="#7a3db8" text-anchor="middle">${esc(`${o.sgLabel} ${m?.name ?? ''}: ${sg.label}`)}</text>`);
  }
  // inviluppo
  if (o.envelope?.rings.length) {
    const d = o.envelope.rings.map((r) => 'M' + r.map((q) => { const s = P(q); return `${s.x.toFixed(2)},${s.y.toFixed(2)}`; }).join('L') + 'Z').join(' ');
    out.push(`<path d="${d}" fill="none" stroke="#5a1f99" stroke-width="0.6" stroke-dasharray="5 1.5"/>`);
    const t = P(o.envelope.rings.flat().reduce((a, q) => (q.y > a.y ? q : a)));
    out.push(`<text x="${t.x}" y="${t.y - 1.2}" font-size="2.6" font-weight="bold" fill="#5a1f99" text-anchor="middle">${esc(`Inviluppo ${o.sgLabel}`)}</text>`);
  }
  // siti unici
  for (const g of site.groups) for (const l of g.links) {
    const a = p.objects.find((x) => x.id === l.a), b = p.objects.find((x) => x.id === l.b);
    if (a && b && isRect(a) && isRect(b)) { const A = P({ x: a.cx, y: a.cy }), B = P({ x: b.cx, y: b.cy }); out.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#0f7f8c" stroke-width="0.4" stroke-dasharray="0.6 1"/>`); }
  }
  // oggetti
  for (const x of p.objects) {
    if (x.kind === 'line') {
      const st = x.role === 'fence' ? 'stroke="#666" stroke-width="0.3" stroke-dasharray="2 1"' : x.role === 'barricade' ? 'stroke="#8a6d3b" stroke-width="0.8"' : x.role === 'road' ? 'stroke="#888" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"' : 'stroke="#1f8a4c" stroke-width="0.5"';
      out.push(`<polyline points="${pts(x.pts)}" fill="none" ${st}/>`);
      const mid = P(x.pts[Math.floor((x.pts.length - 1) / 2)]);
      out.push(`<text x="${mid.x + 1}" y="${mid.y - 1}" font-size="2" fill="#333">${esc(x.name + (x.es ? ` (ES ${x.es})` : ''))}</text>`);
      continue;
    }
    const c = rectCorners(x);
    const st = site.byObject[x.id];
    const stroke = st === 'ko' ? '#c42b2b' : st === 'nd' ? '#b26a00' : '#222';
    out.push(`<polygon points="${pts(c)}" fill="${x.kind === 'magazine' ? '#c9d3e3' : '#e4e0d6'}" stroke="${stroke}" stroke-width="0.3"/>`);
    if (x.kind === 'magazine' && (x.struct === 'ecm' || (x.struct === 'heavy' && x.frontDoor))) {
      const a = P(c[3]), b = P(c[2]);
      out.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#222" stroke-width="0.8"/>`);
    }
    const ctr = P({ x: x.cx, y: x.cy });
    const sub = x.kind === 'magazine' ? (() => { const l = magazineLoad(x); return l.neqQd >= 1 ? `${Math.round(l.neqQd)} kg` : 'vuoto'; })() : `ES ${x.es}`;
    out.push(`<text x="${ctr.x}" y="${ctr.y - Math.max(x.w, x.d) * k / 2 - 1}" font-size="2.3" font-weight="bold" text-anchor="middle">${esc(x.name)}</text>`);
    out.push(`<text x="${ctr.x}" y="${ctr.y + Math.max(x.w, x.d) * k / 2 + 2.4}" font-size="1.8" text-anchor="middle" fill="#444">${esc(sub)}</text>`);
  }
  out.push(`</g>`);
  out.push(`<rect x="${mx}" y="${my}" width="${fw}" height="${fh}" fill="none" stroke="#000" stroke-width="0.4"/>`);
  // nord
  const nx = mx + fw - 10, ny = my + 14;
  out.push(`<polygon points="${nx},${ny - 8} ${nx + 3},${ny + 2} ${nx},${ny} ${nx - 3},${ny + 2}" fill="#000"/><text x="${nx}" y="${ny + 6}" font-size="3" text-anchor="middle" font-weight="bold">N</text>`);
  // scala grafica: lunghezza tonda tra 40 e 100 mm
  const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
  const len = nice.find((m) => m * k >= 40) ?? 5000;
  const sbx = mx + 6, sby = my + fh - 8, L = len * k;
  for (let i = 0; i < 4; i++) out.push(`<rect x="${sbx + (i * L) / 4}" y="${sby}" width="${L / 4}" height="1.6" fill="${i % 2 ? '#fff' : '#000'}" stroke="#000" stroke-width="0.2"/>`);
  out.push(`<text x="${sbx}" y="${sby - 1}" font-size="2.2">0</text><text x="${sbx + L}" y="${sby - 1}" font-size="2.2" text-anchor="middle">${len} m</text>`);
  // cartiglio
  const ty = H - my - tbH + 2;
  out.push(`<rect x="${mx}" y="${ty}" width="${fw}" height="${tbH - 2}" fill="none" stroke="#000" stroke-width="0.4"/>`);
  out.push(`<line x1="${mx + fw * 0.55}" y1="${ty}" x2="${mx + fw * 0.55}" y2="${ty + tbH - 2}" stroke="#000" stroke-width="0.25"/>`);
  out.push(`<text x="${mx + 3}" y="${ty + 7}" font-size="4.5" font-weight="bold">${esc(o.title)}</text>`);
  out.push(`<text x="${mx + 3}" y="${ty + 13}" font-size="3">${esc(`Planimetria QD — linee ${o.sgLabel} — scala 1:${o.scale} su ${o.paper}`)}</text>`);
  out.push(`<text x="${mx + 3}" y="${ty + 19}" font-size="2.6">${esc(`Stato del sito: ${site.status === 'ok' ? 'conforme' : site.status === 'ko' ? 'NON conforme' : site.status === 'acc' ? 'conforme con rischi accettati' : 'da verificare'} · ${site.pairs.length} coppie · NEQ totale ${Math.round(site.neqTot)} kg`)}</text>`);
  out.push(`<text x="${mx + 3}" y="${ty + 25}" font-size="2.4" fill="#444">AASTP-1 Edition D Version 1 (nov. 2025) — distanze tra i punti più vicini (Part I §1.3.2.2)</text>`);
  out.push(`<text x="${mx + fw * 0.55 + 3}" y="${ty + 8}" font-size="5" font-weight="bold" fill="#b00">BOZZA</text>`);
  out.push(`<text x="${mx + fw * 0.55 + 3}" y="${ty + 14}" font-size="2.6" fill="#b00">da verificare e firmare a cura di personale qualificato</text>`);
  out.push(`<text x="${mx + fw * 0.55 + 3}" y="${ty + 20}" font-size="2.6">${esc(`Data: ${o.date ?? new Date().toISOString().slice(0, 10)}${o.author ? ` · Redatto: ${o.author}` : ''}`)}</text>`);
  out.push(`<text x="${mx + fw * 0.55 + 3}" y="${ty + 26}" font-size="2.6">Verificato: ____________________   Approvato: ____________________</text>`);
  out.push(`</svg>`);
  return out.join('\n');
}
