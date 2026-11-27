/* Vista "Revisioni": piani approvati congelati, confronto con lo stato attuale o tra revisioni, ripristino. */
import { useMemo, useState } from 'react';
import { compare, freeze, restore, type Revision } from '../site/revisions';
import type { Project } from '../site/model';
import { t, useLang } from '../i18n';
import { useDialog } from './dialog';
import { fmt1, fmtInt, STATUS_TEXT } from './format';

interface Props { project: Project; commit: (fn: (p: Project) => Project) => void }

export function RevisionsView({ project, commit }: Props) {
  const ask = useDialog();
  useLang();
  const revs = project.revisions ?? [];
  const [selA, setSelA] = useState<string | null>(revs[revs.length - 1]?.id ?? null);
  const [selB, setSelB] = useState<string>('current');
  const A = revs.find((r) => r.id === selA) ?? null;
  const B: Project | Revision | null = selB === 'current' ? project : revs.find((r) => r.id === selB) ?? null;
  const diff = useMemo(() => (A && B ? compare(A, B) : null), [A, B]);

  const doFreeze = async () => {
    const r = await ask({
      title: t('Congela una revisione approvata'),
      message: t('Si salva nel progetto una copia immutabile del piano attuale con tutti i risultati. Lo sfondo non viene copiato.'),
      fields: [{ key: 'title', label: t('Titolo'), value: t('Revisione {n}', { n: revs.length + 1 }), required: true },
        { key: 'author', label: t('Approvata da (nome e ruolo)'), required: true }, { key: 'note', label: t('Note'), type: 'textarea' }],
      ok: t('Congela'),
    });
    if (!r) return;
    const rev = freeze(project, { title: r.title, author: r.author, note: r.note });
    commit((p) => ({ ...p, revisions: [...(p.revisions ?? []), rev] }));
    setSelA(rev.id); setSelB('current');
  };
  const doRestore = async (r: Revision) => {
    if (!(await ask({ title: t('Ripristina revisione'), message: t('Il piano attuale viene sostituito da “{title}”. Si può annullare con “Annulla”.', { title: r.title }), ok: t('Ripristina'), danger: true }))) return;
    commit((p) => restore(p, r));
  };
  const doDelete = async (r: Revision) => {
    if (!(await ask({ title: t('Elimina revisione'), message: t('Eliminare “{title}” dal progetto?', { title: r.title }), ok: t('Elimina'), danger: true }))) return;
    commit((p) => ({ ...p, revisions: (p.revisions ?? []).filter((x) => x.id !== r.id) }));
  };

  return (
    <div className="view revisioni">
      <aside className="view-side">
        <h3>{t('Revisioni approvate')}</h3>
        <button className="on" onClick={doFreeze}>{t('Congela il piano attuale…')}</button>
        {revs.length === 0 && <p className="hint">{t('Nessuna revisione. Congela il piano quando è approvato: potrai confrontarlo con modifiche future (nuova casa, nuovo magazzino, consegne).')}</p>}
        {[...revs].reverse().map((r) => (
          <div key={r.id} className={`rev ${r.id === selA ? 'sel' : ''}`} onClick={() => setSelA(r.id)}>
            <div><b>Rev. {r.n} — {r.title}</b></div>
            <div className="hint">{r.date} · {r.author} · <span className={`pill st-${r.summary.status}`}>{t(STATUS_TEXT[r.summary.status])}</span></div>
            {r.note && <div className="hint">{r.note}</div>}
            <div className="row-btns">
              <button onClick={(e) => { e.stopPropagation(); doRestore(r); }}>{t('Ripristina')}</button>
              <button className="danger" onClick={(e) => { e.stopPropagation(); doDelete(r); }}>{t('Elimina')}</button>
            </div>
          </div>
        ))}
      </aside>
      <div className="view-main">
        <h3>{t('Confronto')}</h3>
        {!A ? <p className="hint">{t('Seleziona una revisione.')}</p> : <>
          <div className="row-btns">
            <span>{t('Da')} <b>Rev. {A.n} — {A.title}</b> {t('a')}</span>
            <select value={selB} onChange={(e) => setSelB(e.target.value)}>
              <option value="current">{t('stato attuale del piano (modifiche in prova)')}</option>
              {revs.filter((r) => r.id !== A.id).map((r) => <option key={r.id} value={r.id}>Rev. {r.n} — {r.title}</option>)}
            </select>
          </div>
          {diff && <>
            <div className="tiles">
              <div className="tile"><span>{t('Stato del sito')}</span><b>{t(STATUS_TEXT[diff.statusBefore])} → {t(STATUS_TEXT[diff.statusAfter])}</b></div>
              <div className="tile"><span>{t('NEQ totale')}</span><b>{fmtInt(diff.neqBefore)} → {fmtInt(diff.neqAfter)} kg</b></div>
              <div className="tile"><span>{t('Oggetti cambiati')}</span><b>{diff.objects.length}</b></div>
              <div className="tile"><span>{t('Coppie cambiate')}</span><b>{diff.pairs.length}</b></div>
            </div>
            <h4>{t('Oggetti')}</h4>
            {diff.objects.length === 0 ? <p className="hint">{t('Nessuna modifica alla planimetria.')}</p> : (
              <table className="tbl compact"><thead><tr><th>{t('Oggetto')}</th><th>{t('Modifica')}</th><th>{t('Cosa')}</th></tr></thead><tbody>
                {diff.objects.map((o) => <tr key={o.id}><td>{o.name}</td><td>{t(o.change)}</td><td>{o.fields.map((f) => t(f)).join(', ')}</td></tr>)}
              </tbody></table>)}
            <h4>{t('Coppie PES → ES')}</h4>
            {diff.pairs.length === 0 ? <p className="hint">{t('Nessuna coppia cambiata.')}</p> : (
              <table className="tbl compact"><thead><tr><th>PES</th><th>ES</th><th>{t('Cambiamento')}</th><th>{t('Prima')}</th><th>{t('Dopo')}</th></tr></thead><tbody>
                {diff.pairs.map((x) => (
                  <tr key={x.key} className={x.what === 'peggiorata' || x.what === 'nuova coppia non conforme' ? 'row-ko' : ''}>
                    <td>{x.pes}</td><td>{x.es}</td><td>{t(x.what)}</td>
                    <td>{x.before ? `${t(STATUS_TEXT[x.before.status])} · ${x.before.req ?? t('n.d.')} / ${fmt1(x.before.dist)} m` : '—'}</td>
                    <td>{x.after ? `${t(STATUS_TEXT[x.after.status])} · ${x.after.req ?? t('n.d.')} / ${fmt1(x.after.dist)} m` : '—'}</td>
                  </tr>))}
              </tbody></table>)}
            {(JSON.stringify(diff.groupsBefore) !== JSON.stringify(diff.groupsAfter)) && <>
              <h4>{t('Siti unici')}</h4>
              <p>{t('Prima:')} {diff.groupsBefore.map((g) => g.join(' + ')).join('; ') || t('nessuno')}</p>
              <p>{t('Dopo:')} {diff.groupsAfter.map((g) => g.join(' + ')).join('; ') || t('nessuno')}</p>
            </>}
            {(diff.risksAdded.length > 0 || diff.risksRemoved.length > 0) && <p className="hint">{t('Rischi accettati: {added} aggiunti, {removed} revocati.', { added: diff.risksAdded.length, removed: diff.risksRemoved.length })}</p>}
            <p className="hint">{t('Richiesta / misurata in metri. Per provare una modifica futura (una casa nuova, un magazzino, una consegna) modifica la planimetria e confronta con l’ultima revisione approvata; poi ripristina o congela una nuova revisione.')}</p>
          </>}
        </>}
      </div>
    </div>
  );
}
