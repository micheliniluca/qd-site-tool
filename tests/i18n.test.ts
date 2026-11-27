/* Ogni testo letterale passato a t() o N_() deve avere la traduzione inglese. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN, t, setLang } from '../src/i18n';

const SRC = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) return f === 'i18n' ? [] : files(p);
  return /\.(ts|tsx)$/.test(f) ? [p] : [];
});

/** Testi letterali in t('…'), t("…"), t(`…`) e N_(…), senza espressioni ${…}. */
export function literals(code: string): string[] {
  const out: string[] = [];
  const re = /\b(?:t|N_)\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.|\$(?!\{))*)`)/g;
  for (const m of code.matchAll(re)) {
    const raw = m[1] ?? m[2] ?? m[3];
    out.push(raw.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n'));
  }
  return out;
}

describe('traduzione inglese', () => {
  it('ogni testo marcato ha la traduzione', () => {
    const missing = new Set<string>();
    for (const f of files(SRC)) for (const s of literals(readFileSync(f, 'utf8'))) if (!(s in EN)) missing.add(`${f.replace(SRC, '')}: ${s}`);
    expect([...missing]).toEqual([]);
  });
  it('i segnaposto sono gli stessi nelle due lingue', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const bad = Object.entries(EN).filter(([it, en]) => ph(it) !== ph(en)).map(([it]) => it);
    expect(bad).toEqual([]);
  });
  it('t() cambia lingua e sostituisce i segnaposto', () => {
    expect(t('{n} m', { n: 5 })).toBe('5 m');
    setLang('en'); const en = t('Salva JSON'); setLang('it');
    expect(t('Salva JSON')).toBe('Salva JSON');
    expect(en).toBe(EN['Salva JSON']);
  });
});
