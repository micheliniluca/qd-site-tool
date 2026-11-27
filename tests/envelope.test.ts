import { describe, expect, it } from 'vitest';
import { envelope } from '../src/site/envelope';

const sq = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
const circle = (cx: number, cy: number, r: number, n = 360) => Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.sin((i / n) * 2 * Math.PI), y: cy + r * Math.cos((i / n) * 2 * Math.PI) }));

describe('inviluppo delle linee di salvaguardia', () => {
  it('due quadrati sovrapposti: un solo anello con l’area dell’unione', () => {
    const e = envelope([sq(0, 0, 10), sq(5, 5, 10)]);
    expect(e.rings).toHaveLength(1);
    expect(e.area).toBeCloseTo(175, 6);
  });
  it('poligoni separati: un anello ciascuno', () => {
    const e = envelope([sq(0, 0, 10), sq(20, 0, 10)]);
    expect(e.rings).toHaveLength(2);
    expect(e.area).toBeCloseTo(200, 6);
  });
  it('poligono contenuto in un altro: resta solo quello esterno', () => {
    const e = envelope([sq(0, 0, 10), sq(2, 2, 3)]);
    expect(e.rings).toHaveLength(1);
    expect(e.area).toBeCloseTo(100, 6);
  });
  it('anello di cerchi con un buco al centro: contorno esterno più buco', () => {
    const polys = Array.from({ length: 8 }, (_, i) => circle(100 * Math.sin((i / 8) * 2 * Math.PI), 100 * Math.cos((i / 8) * 2 * Math.PI), 50, 180));
    const e = envelope(polys);
    expect(e.rings).toHaveLength(2);
  });
  it('7 cerchi in fila (come gli ECM): un anello, area tra quella di un cerchio e la somma', () => {
    const polys = Array.from({ length: 7 }, (_, i) => circle(0, i * 22, 300));
    const e = envelope(polys);
    expect(e.rings).toHaveLength(1);
    const one = Math.PI * 300 * 300;
    expect(e.area).toBeGreaterThan(one);
    expect(e.area).toBeLessThan(one * 1.6);
  });
});
