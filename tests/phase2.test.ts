import { describe, expect, it } from 'vitest';
import { QDF } from '../src/engine';
import { v } from '../src/site/geometry';
import { computeGroups, evaluateSite, evaluateSitePair } from '../src/site/evaluate';
import { fillOf, placeDelivery } from '../src/site/capacity';
import { safeguard } from '../src/site/safeguard';
import { emptyProject, magazineLoad, newItem, parseProject, PRESETS, type Building, type Magazine, type Project, type SiteObject } from '../src/site/model';

const mk = <T extends SiteObject>(id: string, x: number, y: number, name: string, patch: Partial<T> = {}): T =>
  ({ ...PRESETS.find((p) => p.id === id)!.make(v(x, y), name), ...patch } as T);
const proj = (objs: SiteObject[], patch: Partial<Project> = {}): Project => ({ ...emptyProject(), objects: objs, ...patch });

describe('contenuto da inventario', () => {
  it('NEQ per riga, MCE di default cautelativo = NEQ della riga, HD 1.4 esclusa', () => {
    const m = mk<Magazine>('ecm7', 0, 0, 'M', { contentMode: 'inventory', items: [
      newItem({ hd: '1.1', cg: 'D', qty: 100, neqUnit: 10 }),
      newItem({ hd: '1.2.1', cg: 'E', qty: 50, neqUnit: 2, mce: null }),
      newItem({ hd: '1.4', cg: 'S', qty: 10, neqUnit: 1 }),
    ] });
    const l = magazineLoad(m);
    expect(l.neqQd).toBe(1100);
    expect(l.neq14).toBe(10);
    expect(l.cases.map((c) => [c.hd, c.neq, c.mce])).toEqual([['1.1', 1100, 0], ['1.2.1', 100, 100]]);
  });
  it('progetto v1 migrato a v2', () => {
    const p = parseProject(JSON.stringify({ format: 'qd-site-tool', version: 1, objects: [] }));
    expect(p.version).toBe(2);
    expect(p.options.aggregate).toBe(true);
    expect(p.sharedCover).toEqual([]);
  });
});

describe('siti unici (Part I §1.3.2.3.4)', () => {
  const a = mk<Magazine>('ecm7', 0, 0, 'A', { neq: 20000 });
  const b = mk<Magazine>('ecm7', 17, 0, 'B', { neq: 20000 });    // 8 m lato-lato < BD3 (14 m)
  it('due ECM troppo vicini diventano un unico PES col NEQ sommato', () => {
    const { groups, groupOf } = computeGroups(proj([a, b]));
    expect(groups).toHaveLength(1);
    expect(groupOf.get(a.id)!.load.neqQd).toBe(40000);
    const s = evaluateSite(proj([a, b]));
    expect(s.pairs.every((x) => x.status === 'agg')).toBe(true);
    expect(s.groups[0].members.sort()).toEqual([a.id, b.id].sort());
  });
  it('le distanze verso gli ES esterni usano il NEQ aggregato', () => {
    const house = mk<Building>('ibd', 0, 2000, 'casa');
    const s = evaluateSite(proj([a, b, house]));
    const pr = s.pairs.find((x) => x.pesId === a.id && x.esId === house.id)!;
    expect(pr.gov!.load.neq).toBe(40000);
    expect(pr.req).toBe(QDF.distance('BD31', 40000));
  });
  it('aggregazione iterativa: il NEQ sommato porta dentro un terzo magazzino', () => {
    // C a una distanza conforme per 20 t ma non per 40 t (lato-lato ECM: BD3)
    const dOk20 = QDF.distance('BD3', 20000)!, d40 = QDF.distance('BD3', 40000)!;
    const gap = Math.round((dOk20 + d40) / 2);
    const c = mk<Magazine>('ecm7', 17 + 9 + gap, 0, 'C', { neq: 20000 });
    expect(evaluateSitePair(b, c).status).toBe('ok');
    const { groups } = computeGroups(proj([a, b, c]));
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(3);
  });
  it('HD 1.1 sotto 500 kg non si aggrega (§1.3.1.10.3)', () => {
    const s1 = mk<Magazine>('stack', 0, 0, 'S1', { neq: 300 });
    const s2 = mk<Magazine>('stack', 12, 0, 'S2', { neq: 300 });
    const p = proj([s1, s2]);
    expect(computeGroups(p).groups).toHaveLength(2);
    expect(evaluateSite(p).pairs.some((x) => x.status === 'ko')).toBe(true);
  });
  it('opzione disattivata: comportamento della Fase 1', () => {
    const s = evaluateSite(proj([a, b], { options: { aggregate: false, fillWarn: 0.9 } }));
    expect(s.pairs.every((x) => x.status === 'ko')).toBe(true);
  });
});

describe('rischi accettati, IBD ridotte, terrapieno condiviso', () => {
  it('una coppia non conforme con rischio registrato diventa "acc"', () => {
    const m = mk<Magazine>('stack', 0, 0, 'S', { neq: 5000 });
    const h = mk<Building>('ibd', 0, 100, 'casa');
    const key = `pair:${m.id}>${h.id}`;
    expect(evaluateSite(proj([m, h])).status).toBe('ko');
    const s = evaluateSite(proj([m, h], { risks: { [key]: { text: 'prova', by: 'x', date: '2026-11-23' } } }));
    expect(s.pairs[0].status).toBe('acc');
    expect(s.status).toBe('acc');
  });
  it('§1.3.6.6.2: ECM > 500 m³ con HD 1.1 ≤ 45 t usa BD25 dal retro', () => {
    const m = mk<Magazine>('ecm7', 0, 0, 'M', { neq: 20000, vol500: true });
    const h = mk<Building>('ibd', 0, -1000, 'casa');
    const blastRef = (x: Magazine) => evaluateSitePair(x, h).cases.find((c) => c.eff === 'blast')!.res.o!.ref;
    expect(blastRef(m)).toBe('BD25');
    expect(blastRef({ ...m, vol500: false })).toBe('BD31');
    expect(blastRef({ ...m, neq: 50000 })).toBe('BD31');
  });
  it('§1.3.6.6.3: terrapieno condiviso aggiunge il caso BD5', () => {
    const a = mk<Magazine>('ecm7', 0, 0, 'A', { neq: 20000 });
    const b = mk<Magazine>('ecm7', 40, 0, 'B', { neq: 20000 });
    const pr = evaluateSitePair(a, b, { shared: '34' });
    const ext = pr.cases.find((c) => c.extra)!;
    expect(ext.res.o!.ref).toBe('BD5');
    expect(ext.req).toBe(QDF.distance('BD5', 20000));
  });
});

describe('gestione: riempimento e "dove ci sta"', () => {
  const stack = mk<Magazine>('stack', 0, 0, 'S', { neq: 1000 });
  const house = mk<Building>('ibd', 0, 300, 'casa');
  it('NEQ ammesso = calcolo inverso sulla formula che governa', () => {
    const p = proj([stack, house]);
    const f = fillOf(p, stack);
    const pr = evaluateSitePair(stack, house);
    const refs = pr.cases.filter((c) => c.res.o?.ref).map((c) => c.res.o!.ref!);
    const expected = Math.min(...refs.map((r) => QDF.quantity(r, pr.dist).q));
    expect(Math.abs(f.maxNeq! - expected)).toBeLessThanOrEqual(1);
    expect(f.fill).toBeCloseTo(1000 / f.maxNeq!, 6);
  });
  it('dove ci sta: magazzino vuoto lontano sì, vicino alla casa no; gruppo A incompatibile', () => {
    const far = mk<Magazine>('ecm7', 0, -2000, 'Lontano', { neq: 0, contentMode: 'inventory', items: [] });
    const near = mk<Magazine>('ecm7', 0, 250, 'Vicino', { neq: 0, contentMode: 'inventory', items: [] });
    const p = proj([house, far, near]);
    const d = { descr: 'colpi', hd: '1.1' as const, cg: 'D' as const, neq: 5000, mce: null };
    expect(placeDelivery(p, far, d).fits).toBe(true);
    const pn = placeDelivery(p, near, d);
    expect(pn.fits).toBe(false);
    expect(pn.maxAdd).toBeLessThan(5000);
    const withA = { ...far, items: [newItem({ hd: '1.1', cg: 'A', qty: 1, neqUnit: 10 })] };
    const pa = placeDelivery(proj([house, withA]), withA, d);
    expect(pa.compat[0].level).toBe('vietato');
    expect(pa.fits).toBe(false);
  });
});

describe('linee di salvaguardia di un sito unico', () => {
  it('usano il NEQ aggregato', () => {
    const a = mk<Magazine>('stack', 0, 0, 'A', { neq: 1000 });
    const sg1 = safeguard(a, '24');
    const sg2 = safeguard(a, '24', 360, [{ hd: '1.1', neq: 4000, mce: 0, label: '', rule: '' }]);
    expect(sg2.maxReq).toBeGreaterThan(sg1.maxReq);
  });
});

import { parseInventory, parseClass, mapHeaders, TEMPLATE_HEADERS, TEMPLATE_ROWS } from '../src/site/inventoryImport';

describe('import inventario', () => {
  it('riconosce le intestazioni del modello', () => {
    const m = mapHeaders(TEMPLATE_HEADERS);
    expect(m).toMatchObject({ mag: 0, descr: 1, code: 2, hd: 3, cg: 4, qty: 5, neqUnit: 6, mce: 7, he: 8 });
  });
  it('legge le righe del modello', () => {
    const r = parseInventory([TEMPLATE_HEADERS, ...TEMPLATE_ROWS]);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.mag, x.item.hd, x.item.cg, x.item.qty * x.item.neqUnit])).toEqual([
      ['M1', '1.1', 'D', 200 * 6.6], ['M3', '1.2.1', 'E', 5000 * 0.12], ['M3', '1.3.1', 'C', 3000],
    ]);
  });
  it('SsD 1.2 dedotta dall\'HE per colpo; numeri con la virgola', () => {
    expect(parseClass('1.2', '', '', 0.2).hd).toBe('1.2.1');
    expect(parseClass('1.2', '', '', 0.1).hd).toBe('1.2.2');
    expect(parseClass('', '', '1.4S', NaN)).toMatchObject({ hd: '1.4', cg: 'S' });
    const r = parseInventory([['Magazzino', 'HD', 'Quantità', 'NEQ totale'], ['M1', '1.1 D', '10', '1.234,5']]);
    expect(r.rows[0].item.cg).toBe('D');
    expect(r.rows[0].item.qty * r.rows[0].item.neqUnit).toBeCloseTo(1234.5, 6);
  });
  it('segnala colonne mancanti e righe errate', () => {
    expect(parseInventory([['Nome', 'Quantità']]).errors.length).toBeGreaterThan(0);
    const r = parseInventory([['Magazzino', 'HD', 'NEQ'], ['M1', '2.1', 5], ['', '1.1', 5]]);
    expect(r.rows).toHaveLength(0);
    expect(r.errors).toHaveLength(2);
  });
});

describe('capacità oltre il campo di validità', () => {
  it('il NEQ ammesso non supera il campo delle formule (fuori campo = non ammesso)', () => {
    const s = mk<Magazine>('stack', 0, 0, 'S', { neq: 20000 });   // 64 × 20 t supera i 500 t delle formule
    const far = mk<Building>('ibd', 0, 20000, 'casa');
    const f = fillOf(proj([s, far]), s);
    expect(f.maxNeq).not.toBeNull();
    expect(f.maxNeq!).toBeLessThanOrEqual(500000);
  });
});
