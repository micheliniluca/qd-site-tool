/* Traduzione dell'interfaccia (italiano → inglese).
   La chiave è il testo italiano stesso: t('Salva JSON') restituisce il testo in italiano o la sua traduzione.
   - t(testo, {param}) traduce; i segnaposto {nome} vengono sostituiti dopo la traduzione.
   - N_(testo) non traduce: segna un testo che verrà tradotto più tardi con t() (tabelle, costanti).
   - I dizionari inglesi stanno in src/i18n/en/*.ts (uno per gruppo di file); tests/i18n.test.ts controlla
     che ogni testo letterale passato a t() o N_() abbia la sua traduzione. */
import { useSyncExternalStore } from 'react';

export type Lang = 'it' | 'en';
const KEY = 'qd-lang';

let lang: Lang = (() => {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    if (v === 'it' || v === 'en') return v;
  } catch { /* storage non disponibile */ }
  return 'it';
})();

const listeners = new Set<() => void>();
export const getLang = (): Lang => lang;
export function setLang(l: Lang): void {
  if (l === lang) return;
  lang = l;
  try { globalThis.localStorage?.setItem(KEY, l); } catch { /* storage non disponibile */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((f) => f());
}
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
/** Lingua corrente come stato React: il componente si aggiorna quando cambia. */
export const useLang = (): Lang => useSyncExternalStore(subscribe, getLang, getLang);

const mods = import.meta.glob('./en/*.ts', { eager: true }) as Record<string, { default: Record<string, string> }>;
export const EN: Record<string, string> = Object.assign({}, ...Object.values(mods).map((m) => m.default));

type Params = Record<string, string | number | null | undefined>;
const fill = (s: string, p?: Params) => (p ? s.replace(/\{(\w+)\}/g, (all, k) => (k in p ? String(p[k] ?? '') : all)) : s);

export function t(s: string, p?: Params): string {
  return fill(lang === 'en' ? (EN[s] ?? s) : s, p);
}
export const N_ = (s: string): string => s;

/** Locale per i numeri: virgola decimale in italiano, punto in inglese. */
export const numLocale = (): string => (lang === 'en' ? 'en-GB' : 'it-IT');
