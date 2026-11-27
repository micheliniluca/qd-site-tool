/* Vista "Revisioni": piani approvati congelati, confronto con lo stato attuale o tra revisioni, ripristino. */
import { useMemo, useState } from 'react';
import { compare, freeze, restore, type Revision } from '../site/revisions';
import type { Project } from '../site/model';
import { useDialog } from './dialog';
import { fmt1, fmtInt, STATUS_TEXT } from './format';

interface Props { project: Project; commit: (fn: (p: Project) => Project) => void }

export function RevisionsView({ project, commit }: Props) {
  const ask = useDialog();
  const revs = project.revisions ?? [];
  const [selA, setSelA] = useState<string | null>(revs[revs.length - 1]?.id ?? null);
  const [selB, setSelB] = useState<string>('current');
  const A = revs.find((r) => r.id === selA) ?? null;
  const B: Project | Revision | null = selB === 'current' ? project : revs.find((r) => r.id === selB) ?? null;
  const diff = useMemo(() => (A && B ? compare(A, B) : null), [A, B]);

  const doFreeze = async () => {
    const r = await ask({
      title: 'Congela una revisione approvata',
      message: 'Si salva nel progetto una copia immutabile del piano attuale con tutti i risultati. Lo sfondo non viene copiato.',
      fields: [{ key: 'title', label: 'Titolo', value: `Revisione ${revs.length + 1}`, required: true },
        { key: 'author', label: 'Approvata da (nome e ruolo)', required: true }, { key: 'note', label: 'Note', type: 'textarea' }],
      ok: 'Congela',
    });
    if (!r) return;
    const rev = freeze(project, { title: r.title, author: r.author, note: r.note });
    commit((p) => ({ ...p, revisions: [...(p.revisions ?? []), rev] }));
    setSelA(rev.id); setSelB('current');
  };
  const doRestore = async (r: Revision) => {
    if (!(await ask({ title: 'Ripristina revisione', message: `Il piano attuale viene sostituito da “${r.title}”. Si può annullare con “Annulla”.`, ok: 'Ripristina', danger: true }))) return;
    commit((p) => restore(p, r));
  };
  const doDelete = async (r: Revision) => {
    if (!(await ask({ title: 'Elimina revisione', message: `Eliminare “${r.title}” dal progetto?`, ok: 'Elimina', danger: true }))) return;
    commit((p) => ({ ...p, revisions: (p.revisions ?? []).filter((x) => x.id !== r.id) }));
  };

  return (
    <div className="view revisioni">
      <aside className="view-side">
        <h3>Revisioni approvate</h3>
        <button className="on" onClick={doFreeze}>Congela il piano attuale…</button>
        {revs.length === 0 && <p className="hint">Nessuna revisione. Congela il piano quando è approvato: potrai confrontarlo con modifiche future (nuova casa, nuovo magazzino, consegne).</p>}
        {[...revs].reverse().map((r) => (
          <div key={r.id} className={`rev ${r.id === selA ? 'sel' : ''}`} onClick={() => setSelA(r.id)}>
            <div><b>Rev. {r.n} — {r.title}</b></div>
            <div className="hint">{r.date} · {r.author} · <span className={`pill st-${r.summary.status}`}>{STATUS_TEXT[r.summary.status]}</span></div>
            {r.note && <div className="hint">{r.note}</div>}
            <div className="row-btns">
              <button onClick={(e) => { e.stopPropagation(); doRestore(r); }}>Ripristina</button>
              <button className="danger" onClick={(e) => { e.stopPropagation(); doDelete(r); }}>Elimina</button>
            </div>
          </div>
        ))}
      </aside>
      <div className="view-main">
        <h3>Confronto</h3>
        {!A ? <p className="hint">Seleziona una revisione.</p> : <>
          <div className="row-btns">
            <span>Da <b>Rev. {A.n} — {A.title}</b> a</span>
            <select value={selB} onChange={(e) => setSelB(e.target.value)}>
              <option value="current">stato attuale del piano (modifiche in prova)</option>
              {revs.filter((r) => r.id !== A.id).map((r) => <option key={r.id} value={r.id}>Rev. {r.n} — {r.title}</option>)}
            </select>
          </div>
          {diff && <>
            <div className="tiles">
              <div className="tile"><span>Stato del sito</span><b>{STATUS_TEXT[diff.statusBefore]} → {STATUS_TEXT[diff.statusAfter]}</b></div>
              <div className="tile"><span>NEQ totale</span><b>{fmtInt(diff.neqBefore)} → {fmtInt(diff.neqAfter)} kg</b></div>
              <div className="tile"><span>Oggetti cambiati</span><b>{diff.objects.length}</b></div>
              <div className="tile"><span>Coppie cambiate</span><b>{diff.pairs.length}</b></div>
            </div>
            <h4>Oggetti</h4>
            {diff.objects.length === 0 ? <p className="hint">Nessuna modifica alla planimetria.</p> : (
              <table className="tbl compact"><thead><tr><th>Oggetto</th><th>Modifica</th><th>Cosa</th></tr></thead><tbody>
                {diff.objects.map((o) => <tr key={o.id}><td>{o.name}</td><td>{o.change}</td><td>{o.fields.join(', ')}</td></tr>)}
              </tbody></table>)}
            <h4>Coppie PES → ES</h4>
            {diff.pairs.length === 0 ? <p className="hint">Nessuna coppia cambiata.</p> : (
              <table className="tbl compact"><thead><tr><th>PES</th><th>ES</th><th>Cambiamento</th><th>Prima</th><th>Dopo</th></tr></thead><tbody>
                {diff.pairs.map((x) => (
                  <tr key={x.key} className={x.what === 'peggiorata' || x.what === 'nuova coppia non conforme' ? 'row-ko' : ''}>
                    <td>{x.pes}</td><td>{x.es}</td><td>{x.what}</td>
                    <td>{x.before ? `${STATUS_TEXT[x.before.status]} · ${x.before.req ?? 'n.d.'} / ${fmt1(x.before.dist)} m` : '—'}</td>
                    <td>{x.after ? `${STATUS_TEXT[x.after.status]} · ${x.after.req ?? 'n.d.'} / ${fmt1(x.after.dist)} m` : '—'}</td>
                  </tr>))}
              </tbody></table>)}
            {(JSON.stringify(diff.groupsBefore) !== JSON.stringify(diff.groupsAfter)) && <>
              <h4>Siti unici</h4>
              <p>Prima: {diff.groupsBefore.map((g) => g.join(' + ')).join('; ') || 'nessuno'}</p>
              <p>Dopo: {diff.groupsAfter.map((g) => g.join(' + ')).join('; ') || 'nessuno'}</p>
            </>}
            {(diff.risksAdded.length > 0 || diff.risksRemoved.length > 0) && <p className="hint">Rischi accettati: {diff.risksAdded.length} aggiunti, {diff.risksRemoved.length} revocati.</p>}
            <p className="hint">Richiesta / misurata in metri. Per provare una modifica futura (una casa nuova, un magazzino, una consegna) modifica la planimetria e confronta con l’ultima revisione approvata; poi ripristina o congela una nuova revisione.</p>
          </>}
        </>}
      </div>
    </div>
  );
}
