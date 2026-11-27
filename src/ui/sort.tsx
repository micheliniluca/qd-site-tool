/* Ordinamento delle tabelle cliccando l'intestazione: crescente → decrescente → ordine predefinito.
   I testi si confrontano in ordine "naturale" (7. ECM prima di 13. ECM); i valori mancanti vanno sempre in fondo. */
import { useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n';

export type SortValue = string | number | null | undefined;
type Dir = 1 | -1;
const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function cmp(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return coll.compare(String(a), String(b));
}

export function useSort<R>(cols: Record<string, (r: R) => SortValue>) {
  const [s, setS] = useState<{ key: string; dir: Dir } | null>(null);
  const sortRows = (rows: R[]): R[] => {
    if (!s || !cols[s.key]) return rows;
    const f = cols[s.key];
    return [...rows].sort((a, b) => {
      const va = f(a), vb = f(b);
      const na = va == null || va === '', nb = vb == null || vb === '';
      if (na || nb) return na === nb ? 0 : na ? 1 : -1;     // mancanti in fondo in entrambi i versi
      return cmp(va, vb) * s.dir;
    });
  };
  const click = (key: string) => setS((cur) => (!cur || cur.key !== key ? { key, dir: 1 } : cur.dir === 1 ? { key, dir: -1 } : null));
  // il componente intestazione resta lo stesso fra un aggiornamento e l'altro (legge lo stato corrente da un ref)
  const cur = useRef({ s, click }); cur.current = { s, click };
  const ThRef = useRef<((p: { k: string; children: ReactNode; className?: string; title?: string }) => JSX.Element) | null>(null);
  if (!ThRef.current) ThRef.current = function Th({ k, children, className, title }) {
    const { s: st, click: onClick } = cur.current;
    const on = st?.key === k;
    return (
      <th className={`sortable${on ? ' sorted' : ''}${className ? ` ${className}` : ''}`}
        aria-sort={on ? (st!.dir === 1 ? 'ascending' : 'descending') : 'none'}
        title={title ?? t('Ordina per questa colonna (clic di nuovo per invertire, terzo clic per l’ordine iniziale)')}
        onClick={() => onClick(k)}>
        {children}<span className="sort-ind" aria-hidden="true">{on ? (st!.dir === 1 ? '▲' : '▼') : '↕'}</span>
      </th>
    );
  };
  const Th = ThRef.current;
  return { sortRows, Th, sort: s };
}
