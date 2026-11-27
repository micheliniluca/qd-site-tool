import { describe, expect, it } from 'vitest';
import { evaluatePair } from '../src/engine/cell';
import { rectCorners, sectorRegions, regionsAt, shapeDistance, polyShape, lineShape, v } from '../src/site/geometry';
import { evaluateSitePair, esRows, shapeOf, evaluateSite } from '../src/site/evaluate';
import { safeguard } from '../src/site/safeguard';
import { PRESETS, emptyProject, serialize, parseProject, type Magazine, type Building, type Line } from '../src/site/model';

const preset = (id: string, x: number, y: number, name = id) => PRESETS.find((p) => p.id === id)!.make(v(x, y), name);

describe('cella — evaluatePair (logica di qd_app.js)', () => {
  it('ECM (c) → ES24, HD 1.1, 10 t: governa il blast BD31 = 479 m', () => {
    const r = evaluatePair({ table: '1', col: 2, es: '24', hd: '1.1', neq: 10000, mce: 50, vol: 'gt', D: 450 });
    expect(r.gov?.eff).toBe('blast');
    expect(r.gov?.o?.ref).toBe('BD31');
    expect(r.required).toBe(479);
    expect(r.rows.find((x) => x.eff === 'debris')?.r?.dr).toBe(416);   // DFD2
    expect(r.ok).toBe(false);
  });
  it('alternative: per default la più cautelativa (BD31 e non BD25 ridotta)', () => {
    const r = evaluatePair({ table: '1', col: 0, es: '24', hd: '1.1', neq: 10000, mce: 50, vol: 'gt' });
    expect(r.rows[0].opts.map((x) => x.o.ref)).toEqual(['BD31', 'BD25']);
    expect(r.rows[0].o?.ref).toBe('BD31');
    const r2 = evaluatePair({ table: '1', col: 0, es: '24', hd: '1.1', neq: 10000, mce: 50, vol: 'gt', choice: { [r.rows[0].key]: 1 } });
    expect(r2.rows[0].o?.ref).toBe('BD25');
  });
  it('condizione MCE ≤ 50 kg filtra le opzioni', () => {
    const r = evaluatePair({ table: '1', col: 2, es: '24', hd: '1.2.1', neq: 5000, mce: 20, vol: 'gt' });
    const p = r.rows.find((x) => x.eff === 'p121')!;
    expect(p.opts).toHaveLength(1);
    expect(p.o?.cond).toEqual({ k: 'mce', op: 'le', v: 50 });
  });
});

describe('geometria', () => {
  const r = { cx: 0, cy: 0, w: 10, d: 20, az: 0 };
  it('rettangolo antiorario, fronte a nord per az = 0', () => {
    const c = rectCorners(r);
    expect(c[2].x).toBeCloseTo(5, 12); expect(c[2].y).toBeCloseTo(10, 12);
    expect(c[3].x).toBeCloseTo(-5, 12); expect(c[3].y).toBeCloseTo(10, 12);
  });
  it('azimut 90°: fronte verso est', () => {
    const c = rectCorners({ ...r, az: 90 });
    expect(Math.max(...c.map((p) => p.x))).toBeCloseTo(10, 9);
  });
  it('settori 150°/135°: rette a 60° e 45° dalla normale', () => {
    const regs = sectorRegions(r, 150, 135);
    const at = (x: number, y: number) => regionsAt(regs, v(x, y)).map((g) => g.name + (g.side ?? '')).sort();
    expect(at(0, 100)).toEqual(['front']);
    expect(at(0, -100)).toEqual(['rear']);
    expect(at(100, 0)).toEqual(['sideright']);
    expect(at(-100, 0)).toEqual(['sideleft']);
    // sul confine fronte/lato: (5 + t·sin60, 10 + t·cos60) appartiene a entrambi (§10)
    expect(at(5 + 100 * Math.sin(Math.PI / 3), 10 + 100 * 0.5)).toEqual(['front', 'sideright']);
    expect(at(5 + 100 * Math.sin(Math.PI / 3) + 1, 10 + 100 * 0.5)).toEqual(['sideright']);
    expect(at(5 + 100 * Math.sin(Math.PI / 3) - 1, 10 + 100 * 0.5)).toEqual(['front']);
    // retro a 45°
    expect(at(-5 - 50 + 1, -10 - 50)).toEqual(['rear']);
    expect(at(-5 - 50 - 1, -10 - 50)).toEqual(['sideleft']);
  });
  it('settore fronte 100° (HD 1.2): rette a 10° dalla normale', () => {
    const regs = sectorRegions(r, 100, 135);
    const front = (x: number, y: number) => regionsAt(regs, v(x, y)).some((g) => g.name === 'front');
    const t = Math.tan(10 * Math.PI / 180) * 100;
    expect(front(5 + t - 0.1, 110)).toBe(true);
    expect(front(5 + t + 0.1, 110)).toBe(false);
  });
  it('distanza minima contorno-contorno', () => {
    const a = polyShape(rectCorners(r));
    const b = polyShape(rectCorners({ cx: 30, cy: 40, w: 10, d: 10, az: 0 }));
    expect(shapeDistance(a, b).d).toBeCloseTo(Math.hypot(20, 25), 9);
    expect(shapeDistance(a, lineShape([v(-100, 50), v(100, 50)])).d).toBeCloseTo(40, 9);
    expect(shapeDistance(a, lineShape([v(-100, 0), v(100, 0)])).d).toBe(0);
    expect(shapeDistance(a, polyShape(rectCorners({ ...r, w: 2, d: 2 }))).d).toBe(0);   // contenuto
  });
});

describe('verifica di coppia con settori automatici', () => {
  it('ECM a nord di un ECM: PES in colonna (c), ES (ECM 7 bar con porta a sud) in riga 3', () => {
    const pes = preset('ecm7', 0, 0, 'A') as Magazine;
    const es = { ...(preset('ecm7', 0, 100, 'B') as Magazine), az: 180 };
    const pr = evaluateSitePair(pes, es);
    expect(new Set(pr.cases.map((c) => c.colCode))).toEqual(new Set(['c']));
    expect(new Set(pr.cases.map((c) => c.es.row))).toEqual(new Set(['3']));
    expect(pr.dist).toBeCloseTo(100 - 26, 9);
  });
  it('ES a cavallo di due settori: si valutano entrambi e governa il peggiore', () => {
    const pes = preset('ecm7', 0, 0, 'A') as Magazine;
    const b = { ...(preset('ibd', 0, 0, 'casa') as Building), cx: 300, cy: 180, w: 200, d: 20 };
    const pr = evaluateSitePair(pes, b);
    expect(new Set(pr.cases.map((c) => c.colCode))).toEqual(new Set(['b', 'c']));
    const worst = Math.min(...pr.cases.map((c) => c.margin!));
    expect(pr.gov!.margin).toBe(worst);
  });
  it('direzione inversa: settore dell’ES. ECM con porta opposta al PES → riga 1', () => {
    const pes = preset('stack', 0, 0, 'S') as Magazine;
    const es = preset('ecm7', 0, 200, 'E') as Magazine;   // porta a nord, PES a sud = retro dell'ES
    expect(esRows(es, shapeOf(pes)).map((x) => x.row)).toEqual(['1']);
    const es2 = { ...es, ecmClass: 'nc-hv' as const, az: 180 };   // porta verso il PES
    expect(esRows(es2, shapeOf(pes)).map((x) => x.row)).toEqual(['7']);
  });
  it('strada: ogni settore usa la distanza della parte di strada che vi cade', () => {
    const pes = preset('ecm7', 0, 0, 'A') as Magazine;
    const road = { ...(preset('r22', 0, 0) as Line), pts: [v(-2000, 300), v(2000, 300)] };
    const pr = evaluateSitePair(pes, road);
    const front = pr.cases.find((c) => c.pesSector === 'front')!;
    const side = pr.cases.find((c) => c.pesSector === 'side')!;
    expect(front.dist).toBeCloseTo(300 - 13, 6);
    // la strada entra nel settore laterale dove la retta a 60° dallo spigolo (4.5, 13) la incontra
    const t = (300 - 13) / Math.cos(Math.PI / 3);
    expect(side.dist).toBeCloseTo(t, 6);
    expect(pr.cases.some((c) => c.pesSector === 'rear')).toBe(false);
  });
});

describe('linee di salvaguardia', () => {
  it('PES non direzionale: contorno a distanza costante = QD ES24', () => {
    const m = preset('stack', 0, 0) as Magazine;
    const r = evaluatePair({ table: '4', col: 1, es: '24', hd: '1.1', neq: m.neq, mce: m.mce, vol: m.vol });
    const sg = safeguard(m, '24');
    expect(sg.maxReq).toBe(r.required);
    const sh = polyShape(rectCorners(m));
    for (const p of sg.pts) expect(Math.abs(shapeDistance(sh, lineShape([p])).d - r.required!)).toBeLessThan(0.01);
  });
  it('ECM: distanza propria del fronte verso nord', () => {
    const m = preset('ecm7', 0, 0) as Magazine;
    const sg = safeguard(m, '24');
    const front = Math.max(...sg.pts.map((p) => p.y));
    const reqFront = Math.max(...sg.pieces.filter((x) => x.region.sector === 'front').map((x) => x.req!));
    expect(front - 13).toBeCloseTo(reqFront, 1);
  });
});

describe('progetto JSON', () => {
  it('salva e ricarica', () => {
    const p = emptyProject();
    p.objects.push(preset('ecm7', 0, 0), preset('ibd', 500, 0));
    const q = parseProject(serialize(p));
    expect(q.objects).toEqual(p.objects);
    expect(evaluateSite(q).pairs).toHaveLength(1);
  });
  it('rifiuta file non validi', () => {
    expect(() => parseProject('{"a":1}')).toThrow();
  });
});

describe('calibrazione dello sfondo su due punti', () => {
  it('p1 resta fermo e |p1p2| diventa la distanza reale', async () => {
    const { calibrate } = await import('../src/site/calibrate');
    const bg = { dataUrl: '', name: 'x', pxW: 1000, pxH: 500, x: -50, y: 30, mPerPx: 0.5, opacity: 1, locked: true };
    const p1 = v(10, 5), p2 = v(70, 5);                    // 60 m sul disegno = 120 px
    const c = calibrate(bg, p1, p2, 240);
    expect(c.mPerPx).toBeCloseTo(2, 12);                   // 120 px → 240 m
    // il pixel sotto p1 è lo stesso prima e dopo
    const px = (q: typeof bg) => ((p1.x - q.x) / q.mPerPx);
    const py = (q: typeof bg) => ((q.y - p1.y) / q.mPerPx);
    expect(px(c)).toBeCloseTo(px(bg), 9);
    expect(py(c)).toBeCloseTo(py(bg), 9);
  });
});

describe('edificio di processo esposto come officina (esAs)', () => {
  it('usa la riga ES impostata al posto di quella del tipo strutturale', () => {
    const pes = PRESETS.find((p) => p.id === 'ecm3')!.make({ x: 0, y: 0 }, 'ECM') as Magazine;
    const ws = PRESETS.find((p) => p.id === 'medb')!.make({ x: 300, y: 0 }, 'Officina') as Magazine;
    expect(esRows(ws, shapeOf(pes)).map((x) => x.row)).toEqual(['14']);
    expect(esRows({ ...ws, esAs: '18' }, shapeOf(pes)).map((x) => x.row)).toEqual(['18']);
    const r = evaluateSitePair({ ...pes, neq: 12500 }, { ...ws, esAs: '18' });
    expect(r.gov?.es.row).toBe('18');
    expect(r.req).toBe(186);   // BD18 = 8·Q^(1/3), 12 500 kg
  });
});

describe('tolleranza di misura', () => {
  it('distanza uguale alla QD entro 1 mm è conforme, oltre no', () => {
    const a = PRESETS.find((p) => p.id === 'ecm3')!.make({ x: 0, y: 0 }, 'A') as Magazine;
    const mk = (gap: number) => ({ ...a, id: 'b', name: 'B', cx: 10 + gap - 0.0 }) as Magazine;
    // ECM 9 m di larghezza, affiancati: interasse = 9 + gap; BD3 a 12 500 kg = 12 m
    const pes = { ...a, neq: 12500 };
    expect(evaluateSitePair(pes, { ...mk(0), cx: 9 + 12 - 0.0005 }).status).toBe('ok');
    expect(evaluateSitePair(pes, { ...mk(0), cx: 9 + 12 - 0.01 }).status).toBe('ko');
  });
});

describe('strade interne', () => {
  it('una strada interna non è un esposto e non genera coppie', () => {
    const p = emptyProject();
    p.objects = [preset('ecm7', 0, 0, 'ECM'), preset('road', 50, 0, 'Strada'), preset('r21', 50, 100, 'Pubblica')];
    const s = evaluateSite(p);
    expect(s.pairs.map((r) => p.objects.find((o) => o.id === r.esId)!.name)).toEqual(['Pubblica']);
  });
});
