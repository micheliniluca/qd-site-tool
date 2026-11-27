import type { Status } from '../site/evaluate';

export const fmtInt = (x: number) => Math.round(x).toLocaleString('it-IT');
export const fmt1 = (x: number) => x.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtM = (x: number | null | undefined) => (x == null ? '—' : `${fmt1(x)} m`);

export const STATUS_TEXT: Record<Status, string> = { ok: 'Conforme', ko: 'Non conforme', nd: 'Da verificare', noqd: 'Nessuna QD', acc: 'Rischio accettato', agg: 'Stesso sito unico' };
export const STATUS_SHORT: Record<Status, string> = { ok: 'OK', ko: 'NON CONF.', nd: 'DA VERIF.', noqd: '—', acc: 'ACCETTATO', agg: 'SITO UNICO' };
