/* Scheda "Gestione": riempimento dei magazzini, "dove ci sta", registro dei rischi accettati, opzioni. */
import { useState } from 'react';
import { CGS, HD_FULL, type Cg, type HdFull } from '../engine/mixing';
import { fillOf, placeDelivery, type Delivery, type Fill, type Placement } from '../site/capacity';
import { magazineLoad, MCE_HD, type Magazine, type Project } from '../site/model';
import { fmtInt } from './format';
import { useDialog } from './dialog';
import { t } from '../i18n';
import { useSort } from './sort';

interface Props {
  project: Project;
  fills: Map<string, Fill> | null;
  setFills: (f: Map<string, Fill> | null) => void;
  onSelect: (id: string) => void;
  onPick: (pairKey: string) => void;
  onOptions: (o: Partial<Project['options']>) => void;
  onRemoveRisk: (key: string) => void;
}

/** Esegue i calcoli a blocchi per non bloccare l'interfaccia. */
async function chunked<T, R>(list: T[], fn: (x: T) => R, onProgress: (i: number) => void): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < list.length; i++) {
    out.push(fn(list[i]));
    onProgress(i + 1);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

export function Management({ project, fills, setFills, onSelect, onPick, onOptions, onRemoveRisk }: Props) {
  const mags = project.objects.filter((o): o is Magazine => o.kind === 'magazine');
  const name = (id: string) => project.objects.find((o) => o.id === id)?.name ?? '?';
  const ask = useDialog();
  const [busy, setBusy] = useState<string | null>(null);
  const [del, setDel] = useState<Delivery>({ descr: '', hd: '1.1', cg: 'D', neq: 1000, mce: null });
  const [places, setPlaces] = useState<Placement[] | null>(null);
  const warn = project.options.fillWarn;

  const runFill = async () => {
    const list = mags.filter((m) => magazineLoad(m).neqQd >= 1);
    const res = await chunked(list, (m) => fillOf(project, m), (i) => setBusy(t('Riempimento: {i}/{n}', { i, n: list.length })));
    setFills(new Map(res.map((f) => [f.magId, f])));
    setBusy(null);
  };
  const runPlace = async () => {
    if (!(del.neq > 0)) return;
    const res = await chunked(mags, (m) => placeDelivery(project, m, del), (i) => setBusy(t('Dove ci sta: {i}/{n}', { i, n: mags.length })));
    res.sort((a, b) => Number(b.fits) - Number(a.fits) || b.maxAdd - a.maxAdd);
    setPlaces(res);
    setBusy(null);
  };

  const fillSt = (f: Fill) => (f.limitedByMce || (f.fill ?? 0) > 1 ? 2 : (f.fill ?? 0) >= warn ? 1 : 0);
  const fs = useSort<Fill>({ name: (f) => name(f.magId), neq: (f) => f.neq, max: (f) => (f.limitedByMce ? 0 : f.maxNeq ?? Infinity), pct: (f) => (f.limitedByMce ? Infinity : f.fill), st: (f) => -fillSt(f), worst: (f) => (f.worst ? `${name(f.worst.pesId)} → ${name(f.worst.esId)}` : null) });
  const ps = useSort<NonNullable<typeof places>[number]>({ name: (x) => name(x.magId), fit: (x) => (x.fits ? 0 : x.alreadyKo ? 2 : 1), max: (x) => (x.alreadyKo ? null : x.maxAdd), worst: (x) => (x.worst ? `${name(x.worst.pesId)} → ${name(x.worst.esId)}` : null), compat: (x) => x.compat.length });
  const fillRows = fs.sortRows(fills ? [...fills.values()].sort((a, b) => (b.fill ?? 0) - (a.fill ?? 0)) : []);
  const risks = Object.entries(project.risks);

  return (
    <div className="mgmt">
      {busy && <div className="msg">{busy}…</div>}

      <h4>{t('Riempimento dei magazzini')}</h4>
      <p className="hint">{t('NEQ ammesso = contenuto attuale scalato finché tutte le coppie del magazzino (o del suo sito unico) restano conformi. MCE invariato.')}</p>
      <div className="row-btns">
        <button onClick={runFill} disabled={!!busy}>{t('Calcola riempimento')}</button>
        <label className="chk">{t('Soglia “da controllare”')}
          <input type="number" min={50} max={100} step={5} value={Math.round(warn * 100)} style={{ width: 60 }}
            onChange={(e) => onOptions({ fillWarn: Math.min(1, Math.max(0.5, (parseFloat(e.target.value) || 90) / 100)) })} /> %</label>
      </div>
      {fills && (
        <table className="tbl compact">
          <thead><tr><fs.Th k="name">{t('Magazzino')}</fs.Th><fs.Th k="neq" className="r">NEQ</fs.Th><fs.Th k="max" className="r">{t('Ammesso')}</fs.Th><fs.Th k="pct" className="r">%</fs.Th><fs.Th k="st">{t('Stato')}</fs.Th><fs.Th k="worst">{t('Coppia limitante')}</fs.Th></tr></thead>
          <tbody>
            {fillRows.map((f) => {
              const st = f.limitedByMce || (f.fill ?? 0) > 1 ? 'ko' : (f.fill ?? 0) >= warn ? 'nd' : 'ok';
              return (
                <tr key={f.magId} onClick={() => onSelect(f.magId)}>
                  <td>{name(f.magId)}</td>
                  <td className="r">{fmtInt(f.neq)}</td>
                  <td className="r">{f.limitedByMce ? '0' : f.maxNeq == null ? '> 64×' : fmtInt(f.maxNeq)}</td>
                  <td className="r">{f.limitedByMce ? '∞' : f.fill == null || f.maxNeq == null ? '—' : `${Math.round(f.fill * 100)}%`}
                    {f.fill != null && f.maxNeq != null && !f.limitedByMce && <div className="bar"><span style={{ width: `${Math.min(100, f.fill * 100)}%` }} className={`st-${st}`} /></div>}</td>
                  <td><span className={`pill st-${st}`}>{st === 'ko' ? t('OLTRE') : st === 'nd' ? t('DA CONTROLLARE') : 'OK'}</span></td>
                  <td>{f.worst ? <a onClick={(e) => { e.stopPropagation(); onPick(f.worst!.key); }}>{name(f.worst.pesId)} → {name(f.worst.esId)}</a> : '—'}</td>
                </tr>
              );
            })}
            {!fillRows.length && <tr><td colSpan={6} className="empty">{t('Nessun magazzino con contenuto.')}</td></tr>}
          </tbody>
        </table>
      )}
      {fills && <p className="hint">{t('“Ammesso 0”: il magazzino resta non conforme anche con quantità quasi nulla, perché limita il resto del suo sito unico, un effetto in MCE o una distanza fissa. Il calcolo non si aggiorna da solo: rieseguirlo dopo ogni modifica.')}</p>}
      {places && <p className="hint">{t('Aggiungere anche poca HD 1.1 a un magazzino di HD 1.2/1.3 fa trattare tutto come HD 1.1 aggregata (Table 4, nota 1 e §1.2.3.3.3); un magazzino vuoto che riceve esplosivo può entrare nel sito unico di un vicino.')}</p>}

      <h4>{t('Dove ci sta')}</h4>
      <p className="hint">{t('Magazzini che possono ricevere una consegna rispettando le QD (con siti unici) e la compatibilità (Table 5, solo per i magazzini con inventario).')}</p>
      <div className="grid2">
        <label className="fld"><span>{t('Descrizione')}</span><input value={del.descr} onChange={(e) => setDel({ ...del, descr: e.target.value })} /></label>
        <label className="fld"><span>NEQ (kg)</span><input type="number" min={1} value={del.neq} onChange={(e) => setDel({ ...del, neq: parseFloat(e.target.value) || 0 })} /></label>
        <label className="fld"><span>HD / SsD</span><select value={del.hd} onChange={(e) => setDel({ ...del, hd: e.target.value as HdFull })}>{HD_FULL.map((h) => <option key={h}>{h}</option>)}</select></label>
        <label className="fld"><span>{t('Gruppo')}</span><select value={del.cg} onChange={(e) => setDel({ ...del, cg: e.target.value as Cg })}>{CGS.map((c) => <option key={c}>{c}</option>)}</select></label>
        {MCE_HD.includes(del.hd) && <label className="fld"><span>MCE (kg)</span><input type="number" min={0} value={del.mce ?? ''} placeholder="= NEQ"
          onChange={(e) => setDel({ ...del, mce: e.target.value === '' ? null : parseFloat(e.target.value) || 0 })} /></label>}
      </div>
      <div className="row-btns"><button onClick={runPlace} disabled={!!busy || !(del.neq > 0)}>{t('Cerca')}</button></div>
      {places && (
        <table className="tbl compact">
          <thead><tr><ps.Th k="name">{t('Magazzino')}</ps.Th><ps.Th k="fit">{t('Esito')}</ps.Th><ps.Th k="max" className="r">{t('Max aggiungibile')}</ps.Th><ps.Th k="worst">{t('Coppia limitante')}</ps.Th><ps.Th k="compat">{t('Compatibilità')}</ps.Th></tr></thead>
          <tbody>
            {ps.sortRows(places).map((x) => (
              <tr key={x.magId} onClick={() => onSelect(x.magId)} className={x.fits ? '' : 'row-dim'}>
                <td>{name(x.magId)}</td>
                <td><span className={`pill st-${x.fits ? 'ok' : x.alreadyKo ? 'ko' : 'nd'}`}>{x.fits ? t('CI STA') : x.alreadyKo ? t('GIÀ NON CONF.') : t('NO')}</span></td>
                <td className="r">{x.alreadyKo ? '—' : x.maxAdd >= del.neq * 4 ? `≥ ${fmtInt(x.maxAdd)}` : fmtInt(x.maxAdd)} kg</td>
                <td>{x.worst ? <a onClick={(e) => { e.stopPropagation(); onPick(x.worst!.key); }}>{name(x.worst.pesId)} → {name(x.worst.esId)}</a> : '—'}</td>
                <td>{x.compat.map((c) => `${c.level === 'vietato' ? t('vietato') : t('condizionato')}: ${c.a}/${c.b}${c.notes.length ? t(' (nota {n})', { n: c.notes.join(',') }) : ''}`).join('; ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4>{t('Registro dei rischi accettati ({n})', { n: risks.length })}</h4>
      {risks.length === 0 && <p className="hint">{t('Nessun rischio accettato. Si registrano dalla spiegazione di una coppia non conforme o dai controlli di compatibilità del magazzino.')}</p>}
      {risks.map(([k, r]) => {
        const [kind, ref] = [k.split(':')[0], k.slice(k.indexOf(':') + 1)];
        const what = kind === 'pair' ? t('Coppia {pair}', { pair: ref.split('>').map(name).join(' → ') }) : t('Compatibilità in {mag}: {cg}', { mag: name(ref.split(':')[0]), cg: ref.split(':')[1] });
        return (
          <div key={k} className="risk">
            <div><b>{what}</b></div>
            <div>“{r.text}”</div>
            <div className="hint">{r.by} · {r.date} <button onClick={async () => { if (await ask({ title: t('Revoca'), message: t('Revocare l’accettazione del rischio “{what}”?', { what }), ok: t('Revoca'), danger: true })) onRemoveRisk(k); }}>{t('Revoca')}</button></div>
          </div>
        );
      })}

      <h4>{t('Opzioni')}</h4>
      <label className="chk"><input type="checkbox" checked={project.options.aggregate} onChange={(e) => onOptions({ aggregate: e.target.checked })} />
        {t('Siti unici: aggrega i magazzini non separati dalla IMD appropriata (Part I §1.3.2.3.4)')}</label>
    </div>
  );
}
