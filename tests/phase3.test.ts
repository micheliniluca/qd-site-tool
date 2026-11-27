import { describe, expect, it } from 'vitest';
import { checkLength, checkSection, DEFAULT_SECTION, materialLength } from '../src/site/barricade';
import { v } from '../src/site/geometry';

describe('barricata in sezione (Part II §2.2.3.2)', () => {
  it('terreno piano: AB e CD attraversano la larghezza del trapezio alla loro quota', () => {
    const r = checkSection(DEFAULT_SECTION);
    // trapezio: base 7,2, sommità 1,0, altezza 4 → larghezza a quota z: 7,2 − 6,2·z/4
    expect(r.checks[0].ab.length).toBeCloseTo(7.2 - 6.2 * 3 / 4, 1);
    expect(r.checks[0].cd!.length).toBeCloseTo(7.2 - 6.2 * 3.3 / 4, 1);
    expect(r.ok).toBe(true);
  });
  it('barricata troppo bassa: AB < 2,4 m', () => {
    const r = checkSection({ ...DEFAULT_SECTION, h: 3.2 });
    expect(r.checks[0].ab.ok).toBe(false);
    expect(r.ok).toBe(false);
  });
  it('muro in c.a. vale 4 volte il suo spessore di terra (§2.2.3.3.1)', () => {
    const s = { ...DEFAULT_SECTION, h: 0.1, wall: { t: 0.6, h: 5, at: 5 } };
    expect(materialLength(s, v(-6, 3), v(12, 3))).toBeCloseTo(2.4, 1);
  });
  it('A sulla catasta più bassa, faccia remota; con tetto protettivo faccia vicina', () => {
    const r = checkSection({ ...DEFAULT_SECTION, a: { ...DEFAULT_SECTION.a, h: 4 } });
    expect(r.checks[0].from).toBe('B');
    expect(r.checks[0].ab.p.x).toBeCloseTo(12 + 6, 9);
    const r2 = checkSection({ ...DEFAULT_SECTION, a: { ...DEFAULT_SECTION.a, roof: true } });
    expect(r2.checks[0].ab.p.x).toBe(0);
  });
  it('separazione ≥ 5·Q^(1/3): verifica individuale per ciascuna catasta, senza CD', () => {
    const r = checkSection({ ...DEFAULT_SECTION, neq: 10 });   // 5·10^(1/3) = 10,8 m < 12 m
    expect(r.individual).toBe(true);
    expect(r.checks).toHaveLength(2);
    expect(r.checks.every((c) => c.cd === null)).toBe(true);
  });
  it('cratere r = ½·NEQ^(1/3): non deve scalzare più di 1/3 della base', () => {
    expect(checkSection(DEFAULT_SECTION).crater.ok).toBe(true);
    const r = checkSection({ ...DEFAULT_SECTION, neq: 20000 });
    expect(r.crater.r).toBeCloseTo(0.5 * Math.cbrt(20000), 9);
    expect(r.crater.ok).toBe(false);
  });
});

describe('barricata in pianta: lunghezza (Fig. 2-4)', () => {
  const a = { cx: 0, cy: 0, w: 10, d: 10, az: 0 };
  const b = { cx: 30, cy: 0, w: 10, d: 10, az: 0 };
  it('supera le rette tra gli estremi di almeno 1 m', () => {
    expect(checkLength(a, b, [v(15, -6.5), v(15, 6.5)]).ok).toBe(true);
    const r = checkLength(a, b, [v(15, -5.5), v(15, 6.5)]);
    expect(r.ok).toBe(false);
    expect(Math.min(...r.sides.map((s) => s.beyond))).toBeCloseTo(0.5, 9);
  });
  it('barricata che non intercetta le rette', () => {
    expect(checkLength(a, b, [v(15, 10), v(15, 20)]).ok).toBe(false);
  });
});

import { distanceExcel, evalExcel, segmentExcel, usedSegment } from '../src/engine/excelFormula';
import { QDF } from '../src/engine';

describe('formule Excel aperte', () => {
  it('ogni tratto tradotto in Excel dà la stessa distanza del motore (tutte le formule, griglia densa e raccordi)', () => {
    let n = 0;
    for (const ref of QDF.refs) {
      const [lo, hi] = QDF.range(ref);
      const qs = [...Array.from({ length: 120 }, (_, k) => lo * Math.pow(hi / lo, k / 119)), ...QDF.F[ref].flatMap((g) => [g[0], g[2]])];
      for (const q of qs) {
        const i = usedSegment(ref, q);
        expect(evalExcel(segmentExcel(ref, i, '$F2'), q)).toBeCloseTo(QDF.dExact(ref, q)!, 9);
        expect(evalExcel(distanceExcel({ t: 'f', ref }, q, '$F2')!, q)).toBe(QDF.distance(ref, q));
        n++;
      }
    }
    expect(n).toBeGreaterThan(8000);
  });
  it('esempi di testo', () => {
    expect(distanceExcel({ t: 'f', ref: 'BD31' }, 10000, 'F5')).toBe('ROUNDUP(22.2*F5^(1/3),0)');
    expect(distanceExcel({ t: 'f', ref: 'TD1', cap: 60 }, 20000, 'F5')).toBe('ROUNDUP(MIN(60,0.22*F5^0.5),0)');
    expect(distanceExcel({ t: 'fixed', d: 60 }, 10, 'F5')).toBe('60');
    expect(distanceExcel({ t: 'f', ref: 'BD16' }, 50000, 'F5')).toBeNull();
  });
});

import * as XLSX from 'xlsx';
import { buildWorkbook } from '../src/site/workbook';
import { buildDxf } from '../src/site/dxf';
import { evaluateSite } from '../src/site/evaluate';
import { safeguard } from '../src/site/safeguard';
import { emptyProject, PRESETS, type SiteObject } from '../src/site/model';

const mkObj = (id: string, x: number, y: number, name: string, patch: Record<string, unknown> = {}): SiteObject =>
  ({ ...PRESETS.find((p) => p.id === id)!.make(v(x, y), name), ...patch } as SiteObject);

describe('documenti', () => {
  const p = { ...emptyProject(), name: 'Prova', objects: [mkObj('ecm7', 0, 0, 'M1', { neq: 10000 }), mkObj('ibd', 0, 300, 'Casa'), mkObj('r22', 0, 0, 'SP1', { pts: [v(-500, -400), v(500, -400)] })] };
  const site = evaluateSite(p);
  it('Excel: D richiesta è una formula che riproduce il valore del motore', () => {
    const wb = buildWorkbook(p, site);
    expect(wb.SheetNames).toEqual(['Leggimi', 'Magazzini', 'Casi', 'Coppie', 'Formule', 'Rischi accettati', 'Table 4']);
    const ws = wb.Sheets['Coppie'];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    expect(rows.length).toBe(1 + site.pairs.length);
    const q = ws['Q2'];
    expect(q.f).toMatch(/^ROUNDUP\(/);
    const pr = site.pairs[0];
    expect(q.v).toBe(pr.gov!.req);
    expect(evalExcel(q.f!, ws['F2'].v as number)).toBe(pr.gov!.req);
    expect(ws['T2'].f).toBe('IF(R2>=Q2,"OK","NON CONFORME")');
    // si può riscrivere e rileggere
    const back = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array', cellFormula: true });
    expect(back.Sheets['Coppie']['Q2'].f).toBe(q.f);
  });
  it('DXF R12: struttura, layer ed entità', () => {
    const sg = new Map([[p.objects[0].id, safeguard(p.objects[0] as never, '24')]]);
    const dxf = buildDxf(p, site, sg);
    const lines = dxf.trimEnd().split('\r\n');
    expect(lines.length % 2).toBe(0);
    expect(lines.slice(-2)).toEqual(['0', 'EOF']);
    const codes = (k: string) => lines.filter((x, i) => i % 2 === 1 && x === k && lines[i - 1] === '0').length;
    expect(codes('POLYLINE')).toBe(1 + 1 + 1 + 1 + 1);   // magazzino, facciata, casa, strada, linea IBD
    expect(codes('TEXT')).toBeGreaterThanOrEqual(5);
    expect(dxf).toContain('QD_SALVAGUARDIA');
    expect(/[^\x00-\x7f]/.test(dxf)).toBe(false);
  });
});

import { compare, freeze, restore } from '../src/site/revisions';

describe('revisioni approvate', () => {
  const base = { ...emptyProject(), objects: [mkObj('stack', 0, 0, 'S1', { neq: 1000 }), mkObj('ibd', 0, 1000, 'Casa')] };
  it('congela, confronta con una modifica futura (casa più vicina) e ripristina', () => {
    const r1 = freeze(base, { title: 'Piano 2026', author: 'LM', note: '' });
    expect(r1.n).toBe(1);
    expect(r1.summary.status).toBe('ok');
    const casa = base.objects[1] as { cy: number };
    const changed = { ...base, revisions: [r1], objects: [base.objects[0], { ...base.objects[1], cy: 120 } as SiteObject, mkObj('ibd', 500, 0, 'Nuova casa')] };
    const d = compare(r1, changed);
    expect(d.objects.map((o) => [o.name, o.change])).toEqual(expect.arrayContaining([['Nuova casa', 'aggiunto'], ['Casa', 'modificato']]));
    expect(d.objects.find((o) => o.name === 'Casa')!.fields).toEqual(['posizione']);
    expect(d.statusBefore).toBe('ok');
    expect(d.statusAfter).toBe('ko');
    expect(d.pairs[0].what).toBe('peggiorata');
    const back = restore(changed, r1);
    expect((back.objects[1] as { cy: number }).cy).toBe(casa.cy);
    expect(back.revisions).toHaveLength(1);
    // il congelamento non è influenzato da modifiche successive
    (changed.objects[0] as { neq: number }).neq = 99;
    expect((r1.snapshot.objects[0] as { neq: number }).neq).toBe(1000);
  });
});

import { buildPrintSvg, fitScale, sheetSize } from '../src/site/printSheet';

describe('tavola in scala esatta', () => {
  it('1 m del sito = 1000/scala mm sulla carta', () => {
    const p = { ...emptyProject(), objects: [mkObj('stack', 0, 0, 'S', { neq: 1000, w: 100, d: 100 })] };
    const site = evaluateSite(p);
    const svg = buildPrintSvg(p, site, new Map(), { paper: 'A3', landscape: true, scale: 1000, center: v(0, 0), title: 'Prova', sgLabel: 'IBD' });
    expect(svg).toContain('width="420mm" height="297mm"');
    const m = /<polygon points="([^"]+)" fill="#c9d3e3"/.exec(svg)!;
    const xs = m[1].split(' ').map((q) => +q.split(',')[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 6);   // 100 m a 1:1000 = 100 mm
    expect(sheetSize({ paper: 'A4', landscape: false })).toEqual([210, 297]);
    expect(fitScale(p, { paper: 'A4', landscape: true }, new Map()).scale).toBe(1000);
  });
});

import { buildReportHtml } from '../src/site/report';

describe('relazione e licenza (bozza)', () => {
  it('contiene BOZZA, le schede dei magazzini, la licenza e la mappa', () => {
    const p = { ...emptyProject(), name: 'Sito <prova>', objects: [mkObj('stack', 0, 0, 'S1', { neq: 1000 }), mkObj('ibd', 0, 300, 'Casa')] };
    const html = buildReportHtml(p, new Map());
    expect(html).toContain('BOZZA');
    expect(html).toContain('Scheda QD — S1');
    expect(html).toContain('Bozza di licenza dei limiti');
    expect(html).toContain('<svg');
    expect(html).toContain('Sito &lt;prova&gt;');
  });
});
