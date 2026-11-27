import type { Status } from '../site/evaluate';
import { N_, numLocale, t } from '../i18n';

export const fmtInt = (x: number) => Math.round(x).toLocaleString(numLocale());
export const fmt1 = (x: number) => x.toLocaleString(numLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtM = (x: number | null | undefined) => (x == null ? '—' : `${fmt1(x)} m`);

const STATUS_TEXT_IT: Record<Status, string> = { ok: N_('Conforme'), ko: N_('Non conforme'), nd: N_('Da verificare'), noqd: N_('Nessuna QD'), acc: N_('Rischio accettato'), agg: N_('Stesso sito unico') };
const STATUS_SHORT_IT: Record<Status, string> = { ok: N_('OK'), ko: N_('NON CONF.'), nd: N_('DA VERIF.'), noqd: '—', acc: N_('ACCETTATO'), agg: N_('SITO UNICO') };

/** Stato per esteso, nella lingua corrente. */
export const statusText = (s: Status): string => t(STATUS_TEXT_IT[s]);
/** Stato abbreviato (tabelle), nella lingua corrente. */
export const statusShort = (s: Status): string => t(STATUS_SHORT_IT[s]);

/* Tabelle compatibili con il codice esistente: ogni lettura (STATUS_TEXT[st]) restituisce il testo già tradotto. */
const translated = (src: Record<Status, string>): Readonly<Record<Status, string>> =>
  Object.defineProperties({} as Record<Status, string>,
    Object.fromEntries(Object.keys(src).map((k) => [k, { get: () => t(src[k as Status]), enumerable: true }])));
export const STATUS_TEXT = translated(STATUS_TEXT_IT);
export const STATUS_SHORT = translated(STATUS_SHORT_IT);
