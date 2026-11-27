/* Export DXF (R12 ASCII, unità in metri, y verso nord) con layer e testi etichettati. */
import { isRect, magazineLoad, type Project } from './model';
import { rectCorners, type Vec } from './geometry';
import type { SiteEval } from './evaluate';
import type { Safeguard } from './safeguard';
import type { Envelope } from './envelope';
import { t } from '../i18n';

export const DXF_LAYERS: Record<string, number> = {
  QD_MAGAZZINI: 1, QD_ES_EDIFICI: 8, QD_ES_LINEE: 3, QD_RECINZIONI: 9, QD_VIABILITA: 252, QD_BARRICATE: 30,
  QD_SALVAGUARDIA: 6, QD_INVILUPPO: 5, QD_SITI_UNICI: 4, QD_TESTI: 7, QD_BOZZA: 1,
};

/** DXF R12 è ANSI: si traslitterano i caratteri non ASCII. */
export function ascii(x: string): string {
  return x.replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[·•]/g, '-').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[’‘]/g, "'")
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
}

class Dxf {
  out: string[] = [];
  g(code: number, v: string | number) { this.out.push(String(code), typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : v); }
  poly(layer: string, pts: Vec[], closed: boolean) {
    if (pts.length < 2) return;
    this.g(0, 'POLYLINE'); this.g(8, layer); this.g(66, 1); this.g(10, 0); this.g(20, 0); this.g(30, 0); this.g(70, closed ? 1 : 0);
    for (const p of pts) { this.g(0, 'VERTEX'); this.g(8, layer); this.g(10, p.x); this.g(20, p.y); this.g(30, 0); }
    this.g(0, 'SEQEND'); this.g(8, layer);
  }
  text(layer: string, p: Vec, h: number, s: string, rot = 0) {
    this.g(0, 'TEXT'); this.g(8, layer); this.g(10, p.x); this.g(20, p.y); this.g(30, 0); this.g(40, h); this.g(1, ascii(s));
    if (rot) this.g(50, rot);
  }
}

export function buildDxf(p: Project, site: SiteEval, safeguards: Map<string, Safeguard>, env?: Envelope | null): string {
  const d = new Dxf();
  const all: Vec[] = [];
  for (const o of p.objects) all.push(...(isRect(o) ? rectCorners(o) : o.pts));
  for (const sg of safeguards.values()) all.push(...sg.pts);
  for (const r of env?.rings ?? []) all.push(...r);
  const xs = all.map((q) => q.x), ys = all.map((q) => q.y);
  const min = { x: Math.min(0, ...xs), y: Math.min(0, ...ys) }, max = { x: Math.max(0, ...xs), y: Math.max(0, ...ys) };
  const th = Math.max(1.5, (max.x - min.x) / 400);   // altezza testi (m)

  d.g(0, 'SECTION'); d.g(2, 'HEADER');
  d.g(9, '$ACADVER'); d.g(1, 'AC1009');
  d.g(9, '$EXTMIN'); d.g(10, min.x); d.g(20, min.y); d.g(30, 0);
  d.g(9, '$EXTMAX'); d.g(10, max.x); d.g(20, max.y); d.g(30, 0);
  d.g(0, 'ENDSEC');
  d.g(0, 'SECTION'); d.g(2, 'TABLES');
  d.g(0, 'TABLE'); d.g(2, 'LAYER'); d.g(70, Object.keys(DXF_LAYERS).length);
  for (const [name, color] of Object.entries(DXF_LAYERS)) { d.g(0, 'LAYER'); d.g(2, name); d.g(70, 0); d.g(62, color); d.g(6, 'CONTINUOUS'); }
  d.g(0, 'ENDTAB'); d.g(0, 'ENDSEC');

  d.g(0, 'SECTION'); d.g(2, 'ENTITIES');
  for (const o of p.objects) {
    if (o.kind === 'magazine') {
      const c = rectCorners(o);
      d.poly('QD_MAGAZZINI', c, true);
      if (o.struct === 'ecm' || (o.struct === 'heavy' && o.frontDoor)) d.poly('QD_MAGAZZINI', [c[3], c[2]], false);   // facciata frontale
      const l = magazineLoad(o);
      d.text('QD_TESTI', { x: o.cx, y: o.cy + th * 0.6 }, th, o.name);
      d.text('QD_TESTI', { x: o.cx, y: o.cy - th * 0.9 }, th * 0.7, l.neqQd >= 1 ? `NEQ ${Math.round(l.neqQd)} kg` : t('vuoto'));
    } else if (o.kind === 'building') {
      d.poly('QD_ES_EDIFICI', rectCorners(o), true);
      d.text('QD_TESTI', { x: o.cx, y: o.cy }, th, `${o.name} (ES ${o.es})`);
    } else {
      const layer = o.role === 'fence' ? 'QD_RECINZIONI' : o.role === 'barricade' ? 'QD_BARRICATE' : o.role === 'road' ? 'QD_VIABILITA' : 'QD_ES_LINEE';
      d.poly(layer, o.pts, false);
      const m = o.pts[Math.floor((o.pts.length - 1) / 2)];
      if (m) d.text('QD_TESTI', { x: m.x, y: m.y + th * 0.5 }, th, o.es ? `${o.name} (ES ${o.es})` : o.name);
    }
  }
  for (const [id, sg] of safeguards) {
    if (!sg.pts.length) continue;
    const m = p.objects.find((o) => o.id === id);
    d.poly('QD_SALVAGUARDIA', sg.pts, true);
    const top = sg.pts.reduce((a, q) => (q.y > a.y ? q : a), sg.pts[0]);
    d.text('QD_SALVAGUARDIA', { x: top.x, y: top.y + th * 0.4 }, th, `${sg.esRow === '24' ? 'IBD' : 'ES ' + sg.esRow} ${m?.name ?? ''}: ${sg.label}`);
  }
  for (const r of env?.rings ?? []) d.poly('QD_INVILUPPO', r, true);
  if (env?.rings.length) {
    const top = env.rings.flat().reduce((a, q) => (q.y > a.y ? q : a));
    d.text('QD_INVILUPPO', { x: top.x, y: top.y + th * 0.4 }, th, t('Inviluppo delle linee di salvaguardia'));
  }
  for (const g of site.groups) {
    const ms = g.members.map((id) => p.objects.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o && isRect(o));
    for (const l of g.links) {
      const a = p.objects.find((o) => o.id === l.a), b = p.objects.find((o) => o.id === l.b);
      if (a && b && isRect(a) && isRect(b)) d.poly('QD_SITI_UNICI', [{ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }], false);
    }
    if (ms.length && isRect(ms[0])) d.text('QD_SITI_UNICI', { x: ms[0].cx, y: ms[0].cy - th * 2.5 }, th * 0.8, t('Sito unico NEQ {neq} kg', { neq: Math.round(g.load.neqQd) }));
  }
  d.text('QD_BOZZA', { x: min.x, y: min.y - th * 3 }, th * 1.5, t('BOZZA - da verificare e firmare a cura di personale qualificato - AASTP-1 Ed. D V1 - {name} - {date}', { name: p.name, date: new Date().toISOString().slice(0, 10) }));
  d.g(0, 'ENDSEC');
  d.g(0, 'EOF');
  return d.out.join('\r\n') + '\r\n';
}
