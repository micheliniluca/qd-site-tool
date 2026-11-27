/* Contenuto del magazzino: semplice (una HD) o inventario (righe con HD, gruppo, quantità, NEQ, MCE),
   con il risultato di Part I Table 4 e i controlli di Table 5. */
import { HDS, needsMce, type Hd } from '../engine/matrix';
import { checkCompat, CGS, HD_FULL, TABLE4, TABLE5, type Cg, type HdFull } from '../engine/mixing';
import { magazineCgs, magazineLoad, MCE_HD, newItem, type Item, type Magazine, type Project, type Risk } from '../site/model';
import type { SiteGroup } from '../site/evaluate';
import { fmtInt } from './format';
import { askRisk, useDialog } from './dialog';
import { t } from '../i18n';

interface Props {
  m: Magazine;
  set: (p: Partial<Magazine>) => void;
  project: Project;
  group: SiteGroup | undefined;
  onRisk: (key: string, r: Risk | null) => void;
}

export function ContentEditor({ m, set, project, group, onRisk }: Props) {
  const ask = useDialog();
  const mode = m.contentMode ?? 'simple';
  const load = magazineLoad(m);
  const issues = checkCompat(magazineCgs(m));
  const items = m.items ?? [];
  const setItem = (i: number, patch: Partial<Item>) => set({ items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const names = (ids: string[]) => ids.map((id) => project.objects.find((o) => o.id === id)?.name ?? '?').join(', ');

  return (
    <fieldset>
      <legend>{t('Contenuto (PES)')}</legend>
      <span className="seg">
        <button className={mode === 'simple' ? 'on' : ''} onClick={() => set({ contentMode: 'simple' })}>{t('Semplice')}</button>
        <button className={mode === 'inventory' ? 'on' : ''} onClick={() => {
          // passando all'inventario si porta dentro il contenuto semplice come prima riga
          const seed = !items.length && m.neq > 0 ? [newItem({ descr: t('Contenuto'), hd: m.hd, cg: 'D', qty: 1, neqUnit: m.neq, mce: needsMce(m.hd) ? m.mce : null })] : items;
          set({ contentMode: 'inventory', items: seed });
        }}>{t('Inventario ({n})', { n: items.length })}</button>
      </span>

      {mode === 'simple' && (
        <div className="grid2">
          <label className="fld"><span>HD / SsD</span>
            <select value={m.hd} onChange={(e) => set({ hd: e.target.value as Hd })}>{HDS.map((h) => <option key={h}>{h}</option>)}</select>
          </label>
          <label className="fld"><span>NEQ (kg)</span>
            <input type="number" min={0} value={m.neq} onChange={(e) => set({ neq: Math.max(0, parseFloat(e.target.value) || 0) })} title={t('0 = magazzino vuoto: solo ES')} />
          </label>
          {needsMce(m.hd) && <label className="fld"><span>MCE (kg)</span>
            <input type="number" min={1} value={m.mce} onChange={(e) => set({ mce: parseFloat(e.target.value) || 0 })} /></label>}
        </div>
      )}

      {mode === 'inventory' && (
        <div className="inv">
          <table className="tbl compact inv-tbl">
            <thead><tr><th>{t('Descrizione')}</th><th>HD</th><th>CG</th><th className="r">{t('Q.tà')}</th><th className="r">{t('NEQ/pz')}</th><th className="r">MCE</th><th className="r">NEQ</th><th /></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id}>
                  <td><input value={it.descr} onChange={(e) => setItem(i, { descr: e.target.value })} /></td>
                  <td><select value={it.hd} onChange={(e) => setItem(i, { hd: e.target.value as HdFull })}>{HD_FULL.map((h) => <option key={h}>{h}</option>)}</select></td>
                  <td><select value={it.cg} onChange={(e) => setItem(i, { cg: e.target.value as Cg })}>{CGS.map((c) => <option key={c}>{c}</option>)}</select></td>
                  <td><input className="n" type="number" min={0} value={it.qty} onChange={(e) => setItem(i, { qty: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
                  <td><input className="n" type="number" min={0} step="any" value={it.neqUnit} onChange={(e) => setItem(i, { neqUnit: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
                  <td>{MCE_HD.includes(it.hd)
                    ? <input className="n" type="number" min={0} step="any" value={it.mce ?? ''} placeholder="= NEQ" title={t('MCE (kg); vuoto = NEQ della riga (cautelativo)')}
                        onChange={(e) => setItem(i, { mce: e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0) })} />
                    : '—'}</td>
                  <td className="r">{fmtInt(it.qty * it.neqUnit)}</td>
                  <td><button className="x" title={t('Elimina la riga')} onClick={() => set({ items: items.filter((_, j) => j !== i) })}>✕</button></td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={8} className="empty">{t('Nessuna riga: magazzino vuoto (solo ES).')}</td></tr>}
            </tbody>
          </table>
          <button onClick={() => set({ items: [...items, newItem()] })}>{t('Aggiungi riga')}</button>
        </div>
      )}

      <label className="fld"><span>{t('Volume interno')}</span>
        <select value={m.vol} onChange={(e) => set({ vol: e.target.value as 'gt' | 'le' })}><option value="gt">&gt; 20 m³</option><option value="le">≤ 20 m³</option></select>
      </label>

      <div className="mix">
        <div className="cap">{t('Part I Table 4 — quantità per la QD')}</div>
        {load.cases.length === 0
          ? <p className="hint">{load.neq14 > 0 ? t('Solo HD 1.4: nessuna QD in Annex I-A, si applicano le norme antincendio (§1.3.1.8).') : t('Magazzino vuoto: è solo un ES.')}</p>
          : <ul className="mini">{load.cases.map((c, i) => <li key={i}><b>HD {c.hd}</b> — NEQ {fmtInt(c.neq)} kg{needsMce(c.hd) ? `, MCE ${fmtInt(c.mce)} kg` : ''} <em>({c.rule})</em></li>)}</ul>}
        {load.cases.length > 1 && <p className="hint">{t('La QD del magazzino è la maggiore tra questi casi.')}</p>}
        {load.info.map((x, i) => <p key={i} className="hint">{x}</p>)}
        {load.applied.filter((a) => /^\d$/.test(a)).map((a) => <p key={a} className="norm" title={t('Testo originale di Table 4')}>{t('Nota')} {a}) {TABLE4.notes[a]}</p>)}
        {load.warnings.map((x, i) => <p key={i} className="warn">{x}</p>)}
        {load.applied.includes('6') && <label className="chk"><input type="checkbox" checked={!!m.note6As11} onChange={(e) => set({ note6As11: e.target.checked })} /> {t('Considera anche il caso cautelativo HD 1.1 aggregata (nota 6)')}</label>}
        {load.neq14 > 0 && load.cases.length > 0 && <p className="hint">{t('HD 1.4: {neq} kg non aggregati (nota 3).', { neq: fmtInt(load.neq14) })}</p>}
      </div>

      {issues.length > 0 && (
        <div className="mix">
          <div className="cap">{t('Part I Table 5 — compatibilità')}</div>
          {issues.map((c) => {
            const key = `compat:${m.id}:${c.a}-${c.b}`;
            const acc = project.risks[key];
            return (
              <div key={key} className={c.level === 'vietato' && !acc ? 'warn bad' : 'warn'}>
                <b>{c.level === 'vietato' ? t('Non ammessa') : t('Condizionata')}</b>: {c.text}
                {c.notes.map((n) => <div key={n} className="norm">{t('Nota')} {n}) {TABLE5.notes[n]}</div>)}
                {acc
                  ? <div className="acc">{t('Rischio accettato:')} “{acc.text}” — {acc.by}, {acc.date} <button onClick={() => onRisk(key, null)}>{t('Revoca')}</button></div>
                  : <button onClick={async () => { const r = await askRisk(ask, t('compatibilità {a}/{b} in {mag}', { a: c.a, b: c.b, mag: m.name })); if (r) onRisk(key, r); }}>{t('Registra accettazione del rischio…')}</button>}
              </div>
            );
          })}
        </div>
      )}

      {group && group.members.length > 1 && (
        <div className="mix site-unico">
          <div className="cap">{t('Sito unico (Part I §1.3.2.3.4)')}</div>
          <p className="hint">{t('Non separato dalla IMD appropriata da:')} <b>{names(group.members.filter((x) => x !== m.id))}</b>. {t('Il NEQ si somma (totale {neq} kg) e le HD si combinano con Table 4; le distanze verso gli altri ES usano il sito unico.', { neq: fmtInt(group.load.neqQd) })}</p>
          <ul className="mini">{group.load.cases.map((c, i) => <li key={i}>HD {c.hd} — NEQ {fmtInt(c.neq)} kg <em>({c.rule})</em></li>)}</ul>
        </div>
      )}
    </fieldset>
  );
}
