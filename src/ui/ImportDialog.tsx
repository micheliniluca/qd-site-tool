/* Anteprima dell'import dell'inventario da Excel prima di applicarlo. */
import type { ParseResult } from '../site/inventoryImport';
import { norm } from '../site/inventoryImport';
import type { Item, Magazine, Project } from '../site/model';
import { fmtInt } from './format';
import { t } from '../i18n';

export interface ImportPreview extends ParseResult { file: string; sheet: string }

/** Raggruppa le righe per magazzino del progetto (nome confrontato senza maiuscole/accenti). */
export function matchImport(p: Project, r: ParseResult) {
  const mags = p.objects.filter((o): o is Magazine => o.kind === 'magazine');
  const byName = new Map(mags.map((m) => [norm(m.name), m]));
  const matched = new Map<string, { mag: Magazine; items: Item[] }>();
  const unmatched = new Map<string, number>();
  for (const row of r.rows) {
    const m = byName.get(norm(row.mag));
    if (!m) { unmatched.set(row.mag, (unmatched.get(row.mag) ?? 0) + 1); continue; }
    const cur = matched.get(m.id) ?? { mag: m, items: [] };
    cur.items.push(row.item);
    matched.set(m.id, cur);
  }
  return { matched, unmatched };
}

export function ImportDialog({ project, preview, onApply, onClose }: {
  project: Project; preview: ImportPreview; onApply: (byMag: Map<string, Item[]>) => void; onClose: () => void;
}) {
  const { matched, unmatched } = matchImport(project, preview);
  const warnings = preview.rows.flatMap((r) => r.warnings);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('Import inventario — {file} (foglio “{sheet}”)', { file: preview.file, sheet: preview.sheet })}</h3>
        <p className="hint">{t('{n} righe lette. Il contenuto dei magazzini trovati sarà', { n: preview.rows.length })} <b>{t('sostituito')}</b> {t('dall’inventario importato.')}</p>
        <table className="tbl compact">
          <thead><tr><th>{t('Magazzino')}</th><th className="r">{t('Righe')}</th><th className="r">NEQ (kg)</th><th>HD</th></tr></thead>
          <tbody>
            {[...matched.values()].map(({ mag, items }) => (
              <tr key={mag.id}><td>{mag.name}</td><td className="r">{items.length}</td>
                <td className="r">{fmtInt(items.reduce((s, i) => s + i.qty * i.neqUnit, 0))}</td>
                <td>{[...new Set(items.map((i) => `${i.hd}${i.cg}`))].join(', ')}</td></tr>
            ))}
            {!matched.size && <tr><td colSpan={4} className="empty">{t('Nessun magazzino del progetto corrisponde ai nomi nel file.')}</td></tr>}
          </tbody>
        </table>
        {unmatched.size > 0 && <p className="warn">{t('Magazzini non presenti nel progetto (righe ignorate): {list}.', { list: [...unmatched.entries()].map(([n, c]) => `${n} (${c})`).join(', ') })}</p>}
        {preview.errors.length > 0 && <div className="warn bad"><b>{t('Righe scartate')}</b><ul className="mini">{preview.errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul>{preview.errors.length > 30 && t('… e altre {n}', { n: preview.errors.length - 30 })}</div>}
        {warnings.length > 0 && <div className="warn"><b>{t('Assunzioni da verificare')}</b><ul className="mini">{warnings.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul>{warnings.length > 30 && t('… e altre {n}', { n: warnings.length - 30 })}</div>}
        <div className="row-btns">
          <button className="on" disabled={!matched.size} onClick={() => onApply(new Map([...matched.entries()].map(([id, v]) => [id, v.items])))}>{t('Applica a {n} magazzini', { n: matched.size })}</button>
          <button onClick={onClose}>{t('Annulla')}</button>
        </div>
      </div>
    </div>
  );
}
