import { describe, expect, it } from 'vitest';
import { checkCompat, CGS, HD_FULL, mixHd, noteIds, table4Cell, table5Cell, TABLE4, TABLE5, type HdFull } from '../src/engine/mixing';

describe('trascrizione di Part I Table 4 e Table 5', () => {
  it('dimensioni e simmetria', () => {
    expect(TABLE4.cells).toHaveLength(9);
    TABLE4.cells.forEach((r) => expect(r).toHaveLength(9));
    for (const a of HD_FULL) for (const b of HD_FULL) expect(table4Cell(a, b)).toBe(table4Cell(b, a));
    expect(TABLE5.cells).toHaveLength(13);
    TABLE5.cells.forEach((r) => expect(r).toHaveLength(13));
    for (const a of CGS) for (const b of CGS) expect(table5Cell(a, b)).toBe(table5Cell(b, a));
  });
  it('celle campione lette sul PDF', () => {
    expect(table4Cell('1.2.1', '1.3.2')).toBe('2), 6)');
    expect(table4Cell('1.3.1', '1.3.2')).toBe('5)');
    expect(table4Cell('1.6', '1.6')).toBe('1.6');
    expect(table4Cell('1.5', '1.5')).toBe('1.1');
    expect(table5Cell('F', 'G')).toBe('2), 3)');
    expect(table5Cell('C', 'N')).toBe('5)');
    expect(table5Cell('K', 'S')).toBe('');
    expect(table5Cell('L', 'L')).toBe('4)');
    expect(table5Cell('N', 'S')).toBe('6)');
    // conteggio delle X (controllo d'insieme sulla trascrizione)
    expect(TABLE5.cells.flat().filter((c) => c === 'X').length).toBe(33);
  });
});

describe('Table 4: l\'algoritmo applica, per ogni coppia di HD, la regola della cella', () => {
  const load = (h: HdFull, neq: number) => ({ hd: h, neq, mce: h === '1.2.1' || h === '1.2.3' || h === '1.6' ? 20 : 0 });
  for (const a of HD_FULL) for (const b of HD_FULL) {
    it(`${a} + ${b}`, () => {
      const cell = table4Cell(a, b);
      const r = mixHd(a === b ? [load(a, 1000)] : [load(a, 1000), load(b, 3000)]);
      const ids = noteIds(cell);
      if (ids.length) {
        const expected = new Set(ids);
        if (ids.includes('4')) expected.add('2');   // la nota 4 rimanda alla nota 2
        expect(new Set(r.applied.filter((x) => /^\d$/.test(x)))).toEqual(expected);
      } else if (cell === '1.4') {
        expect(r.cases).toEqual([]);
      } else if (a === b && cell !== '1.1') {
        expect(r.cases).toEqual([expect.objectContaining({ hd: cell, neq: 1000 })]);
      } else {
        // cella "1.1": tutto aggregato come HD 1.1
        expect(r.cases).toEqual([expect.objectContaining({ hd: '1.1', neq: a === b ? 1000 : 4000 })]);
      }
    });
  }
});

describe('Table 4: casi composti', () => {
  it('nota 1: 1.1 + 1.2.1 → max tra aggregato come 1.1 e 1.2.1 da sola', () => {
    const r = mixHd([{ hd: '1.1', neq: 100, mce: 0 }, { hd: '1.2.1', neq: 5000, mce: 30 }]);
    expect(r.cases.map((c) => [c.hd, c.neq, c.mce])).toEqual([['1.1', 5100, 0], ['1.2.1', 5000, 30]]);
  });
  it('§1.2.3.3.3: 1.1 + 1.2.2 + 1.3.1 → aggregato come 1.1, 1.2, 1.3', () => {
    const r = mixHd([{ hd: '1.1', neq: 100, mce: 0 }, { hd: '1.2.2', neq: 200, mce: 0 }, { hd: '1.3.1', neq: 700, mce: 0 }]);
    expect(r.applied).toContain('1.2.3.3.3');
    expect(r.cases.filter((c) => c.neq === 1000).map((c) => c.hd).sort()).toEqual(['1.1', '1.2.2', '1.3.1']);
  });
  it('nota 5: 1.3.1 + 1.3.2 sommate', () => {
    const r = mixHd([{ hd: '1.3.1', neq: 100, mce: 0 }, { hd: '1.3.2', neq: 300, mce: 0 }]);
    expect(r.cases.map((c) => [c.hd, c.neq])).toEqual([['1.3.1', 400], ['1.3.2', 400]]);
  });
  it('nota 4: 1.6 + 1.2.3 → 1.6 diventa 1.2.3 (NEQ sommato, MCE massimo)', () => {
    const r = mixHd([{ hd: '1.6', neq: 100, mce: 50 }, { hd: '1.2.3', neq: 300, mce: 20 }]);
    expect(r.cases).toEqual([expect.objectContaining({ hd: '1.2.3', neq: 400, mce: 50 })]);
  });
  it('nota 6 facoltativa: caso aggiuntivo HD 1.1', () => {
    const l = [{ hd: '1.2.2' as const, neq: 100, mce: 0 }, { hd: '1.3.1' as const, neq: 300, mce: 0 }];
    expect(mixHd(l).cases.some((c) => c.hd === '1.1')).toBe(false);
    expect(mixHd(l).warnings).toHaveLength(1);
    expect(mixHd(l, { note6As11: true }).cases.find((c) => c.hd === '1.1')?.neq).toBe(400);
  });
  it('HD 1.4 esclusa dal NEQ di calcolo', () => {
    const r = mixHd([{ hd: '1.4', neq: 900, mce: 0 }, { hd: '1.1', neq: 100, mce: 0 }]);
    expect(r.cases).toEqual([expect.objectContaining({ hd: '1.1', neq: 100 })]);
    expect(r.neqQd).toBe(100);
    expect(r.neq14).toBe(900);
  });
});

describe('Table 5: compatibilità', () => {
  it('D con E ammessa, A con D vietata, C con G condizionata (nota 3)', () => {
    expect(checkCompat(['D', 'E'])).toEqual([]);
    expect(checkCompat(['A', 'D'])[0].level).toBe('vietato');
    expect(checkCompat(['C', 'G'])[0]).toMatchObject({ level: 'condizionato', notes: ['3'] });
  });
  it('L sempre separato dagli altri gruppi; L con L condizionato (tipi diversi vietati)', () => {
    expect(checkCompat(['L', 'S']).find((x) => x.b === 'S')?.level).toBe('vietato');
    expect(checkCompat(['L'])[0]).toMatchObject({ a: 'L', b: 'L', level: 'condizionato' });
  });
});
