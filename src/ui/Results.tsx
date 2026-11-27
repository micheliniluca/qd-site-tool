import { useState } from 'react';
import { optLabel } from '../engine/cell';
import { COLCODE, EFFNAME, LVLNAME, MATRIX, needsMce } from '../engine/matrix';
import { formulaTable } from '../engine/formulas';
import { cellRef, SECTOR_IT, STATUS_RANK, type SiteGroup, type PairCase, type PairEval, type SiteEval, type Status } from '../site/evaluate';
import { magazineLoad, STRUCT_NAME, type Magazine, type PairChoice, type Project, type Risk, type SiteObject } from '../site/model';
import { fmt1, fmtInt, fmtM, STATUS_SHORT, STATUS_TEXT } from './format';
import { askRisk, useDialog } from './dialog';

const rank = STATUS_RANK;
const sectorTxt = (c: PairCase) => (c.pesSector ? SECTOR_IT[c.pesSector] : '—');

/* ---------------- tabella delle coppie ---------------- */

export function PairsTable({ project, site, selectedPair, selectedId, onPick }: {
  project: Project; site: SiteEval; selectedPair: string | null; selectedId: string | null; onPick: (key: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'ko' | 'nd' | 'acc' | 'sel'>('all');
  const name = (id: string) => project.objects.find((o) => o.id === id)?.name ?? '?';
  let rows = [...site.pairs].sort((a, b) => rank[b.status] - rank[a.status] || ((a.gov?.margin ?? 1e9) - (b.gov?.margin ?? 1e9)));
  if (filter === 'ko') rows = rows.filter((r) => r.status === 'ko');
  if (filter === 'nd') rows = rows.filter((r) => r.status === 'nd');
  if (filter === 'acc') rows = rows.filter((r) => r.status === 'acc');
  if (filter === 'sel') rows = rows.filter((r) => r.pesId === selectedId || r.esId === selectedId);
  const count = (s: Status) => site.pairs.filter((p) => p.status === s).length;
  return (
    <div className="pairs">
      <div className="pairs-bar">
        <strong>Verifica di tutte le coppie PES → ES</strong>
        <span className="seg">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Tutte ({site.pairs.length})</button>
          <button className={filter === 'ko' ? 'on' : ''} onClick={() => setFilter('ko')}>Non conformi ({count('ko')})</button>
          <button className={filter === 'nd' ? 'on' : ''} onClick={() => setFilter('nd')}>Da verificare ({count('nd')})</button>
          {count('acc') > 0 && <button className={filter === 'acc' ? 'on' : ''} onClick={() => setFilter('acc')}>Rischi accettati ({count('acc')})</button>}
          <button className={filter === 'sel' ? 'on' : ''} disabled={!selectedId} onClick={() => setFilter('sel')}>Oggetto selezionato</button>
        </span>
      </div>
      <div className="pairs-scroll">
        <table className="tbl">
          <thead><tr>
            <th>PES</th><th>ES</th><th>HD (caso)</th><th>Riga ES</th><th>Col.</th><th>Settore PES</th><th>Effetto che governa</th><th>Formula</th>
            <th className="r">Richiesta</th><th className="r">Distanza</th><th className="r">Margine</th><th>Esito</th>
          </tr></thead>
          <tbody>
            {rows.map((p) => {
              const g = p.gov;
              return (
                <tr key={p.key} className={`${p.key === selectedPair ? 'sel' : ''} row-${p.status}`} onClick={() => onPick(p.key)}>
                  <td>{name(p.pesId)}{p.groupId && <span className="tag" title="Sito unico: NEQ aggregato">SU</span>}</td><td>{name(p.esId)}</td>
                  <td title={g?.load.label}>{g ? `${g.load.hd} · ${fmtInt(g.load.neq)}` : '—'}</td>
                  <td>{g ? g.es.row : '—'}</td>
                  <td>{g ? (g.col < 0 ? '§1.3.6.6.3' : `T${p.table} (${g.colCode})`) : '—'}</td>
                  <td>{g ? sectorTxt(g) : '—'}</td>
                  <td>{g ? EFFNAME[g.eff] : '—'}</td>
                  <td>{g?.res.o ? optLabel(g.res.o) : '—'}</td>
                  <td className="r">{g?.req != null ? `${fmtInt(g.req)} m` : 'n.d.'}</td>
                  <td className="r">{fmtM(g ? g.dist : p.dist)}</td>
                  <td className="r">{g?.margin != null ? `${g.margin >= 0 ? '+' : ''}${fmt1(g.margin)} m` : '—'}</td>
                  <td><span className={`pill st-${p.status}`}>{STATUS_SHORT[p.status]}</span></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={12} className="empty">Nessuna coppia. Aggiungi almeno un magazzino con NEQ ≥ 1 kg e un ES.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- scheda del sito ---------------- */

export function SiteCard({ project, site, onPick, onSelect }: { project: Project; site: SiteEval; onPick: (k: string) => void; onSelect: (id: string) => void }) {
  const name = (id: string) => project.objects.find((o) => o.id === id)?.name ?? '?';
  const w = site.worst;
  const mags = project.objects.filter((o): o is Magazine => o.kind === 'magazine');
  return (
    <div className="sitecard">
      <div className={`site-status st-${site.status}`}>
        <span>Stato del sito</span>
        <strong>{site.pairs.length ? STATUS_TEXT[site.status] : 'Nessuna coppia'}</strong>
      </div>
      <div className="tiles">
        <div className="tile"><span>PES attivi</span><b>{site.nPes}</b></div>
        <div className="tile"><span>ES</span><b>{site.nEs}</b></div>
        <div className="tile"><span>Coppie verificate</span><b>{site.pairs.length}</b></div>
        <div className="tile"><span>NEQ totale</span><b>{fmtInt(site.neqTot)} kg</b></div>
        <div className="tile"><span>Siti unici</span><b>{site.groups.length}</b></div>
        <div className="tile"><span>Rischi accettati</span><b>{Object.keys(project.risks).length}</b></div>
      </div>
      {w && w.gov && (
        <div className="worst" onClick={() => onPick(w.key)}>
          <span className="cap">Coppia peggiore</span>
          <div><b>{name(w.pesId)} → {name(w.esId)}</b> · {EFFNAME[w.gov.eff]} · {w.gov.res.o ? optLabel(w.gov.res.o) : ''}</div>
          <div>distanza {fmtM(w.gov.dist)} · richiesti {w.gov.req != null ? `${fmtInt(w.gov.req)} m` : 'n.d.'}
            {w.gov.margin != null && <> · margine <b className={w.gov.margin < 0 ? 'neg' : ''}>{fmt1(w.gov.margin)} m</b></>}</div>
        </div>
      )}
      {site.groups.length > 0 && <>
        <h4>Siti unici (Part I §1.3.2.3.4)</h4>
        {site.groups.map((g) => (
          <div key={g.id} className="worst" onClick={() => onSelect(g.members[0])}>
            <div><b>{g.members.map(name).join(' + ')}</b> — NEQ {fmtInt(g.load.neqQd)} kg</div>
            <div className="hint">Casi: {g.load.cases.map((c) => `HD ${c.hd} ${fmtInt(c.neq)} kg`).join(' · ')}. Unione dovuta a: {g.links.map((l) => `${name(l.a)}→${name(l.b)}`).join(', ')} sotto la IMD.</div>
          </div>
        ))}
      </>}
      <h4>Magazzini</h4>
      <table className="tbl compact">
        <thead><tr><th>Nome</th><th>Tipo</th><th>HD</th><th className="r">NEQ</th><th>Esito</th></tr></thead>
        <tbody>
          {mags.map((m) => {
            const st = site.byObject[m.id];
            const l = magazineLoad(m);
            return (
              <tr key={m.id} onClick={() => onSelect(m.id)} className={site.koPes.includes(m.id) ? 'row-ko' : ''}>
                <td>{m.name}</td><td>{STRUCT_NAME[m.struct].split(' (')[0]}</td><td>{l.cases.length ? [...new Set(l.cases.map((c) => c.hd))].join(', ') : '—'}</td>
                <td className="r">{l.neqQd >= 1 ? fmtInt(l.neqQd) : 'vuoto'}</td>
                <td>{st ? <span className={`pill st-${st}`}>{STATUS_SHORT[st]}</span> : '—'}</td>
              </tr>
            );
          })}
          {!mags.length && <tr><td colSpan={5} className="empty">Nessun magazzino.</td></tr>}
        </tbody>
      </table>
      {site.koPes.length > 0 && <p className="warn">Magazzini non conformi come PES: {site.koPes.map(name).join(', ')}. Per ciascuna coppia non conforme serve una modifica (quantità, posizione, barricata) o un’accettazione formale del rischio.</p>}
      {site.pairs.some((p) => p.status === 'nd') && <p className="warn">Alcune coppie sono “da verificare”: la quantità è fuori dal campo di validità della formula indicata dalla matrice e la norma non fornisce la distanza.</p>}
    </div>
  );
}

/* ---------------- spiegazione di una coppia ---------------- */

export function PairDetail({ pair, pes, es, choice, onChoice, project, group, onRisk }: {
  pair: PairEval; pes: Magazine; es: SiteObject; choice: PairChoice | undefined;
  onChoice: (c: PairChoice) => void;
  project: Project; group: SiteGroup | undefined; onRisk: (key: string, r: Risk | null) => void;
}) {
  const ask = useDialog();
  const riskKey = `pair:${pair.key}`;
  const risk = project.risks[riskKey];
  const gname = (id: string) => project.objects.find((o) => o.id === id)?.name ?? '?';
  const g = pair.gov;
  const t = pair.table;
  const cases = [...pair.cases].sort((a, b) => rank[b.status] - rank[a.status] || (a.margin ?? 1e9) - (b.margin ?? 1e9));
  const alts = new Map<string, PairCase>();
  for (const c of pair.cases) if (c.res.opts.length > 1 && !c.res.merged) alts.set(c.res.key, c);
  return (
    <div className="detail">
      <div className={`site-status st-${pair.status}`}><span>{pes.name} → {es.name}</span><strong>{STATUS_TEXT[pair.status]}</strong></div>
      {pair.status === 'agg' && <p className="hint">I due magazzini non sono separati dalla IMD appropriata e formano un unico sito (Part I §1.3.2.3.4): il NEQ è sommato e le distanze verso gli altri ES usano il sito unico. Sotto: il confronto con la IMD che ha originato l’unione.</p>}
      {group && group.members.length > 1 && <p className="hint">PES nel sito unico {group.members.map(gname).join(' + ')} (NEQ {fmtInt(group.load.neqQd)} kg).</p>}
      {(pair.rawStatus === 'ko' && pair.status !== 'agg') && (
        <div className={risk ? 'acc' : 'warn bad'}>
          {risk ? <>Rischio accettato: “{risk.text}” — {risk.by}, {risk.date} <button onClick={() => onRisk(riskKey, null)}>Revoca</button></>
            : <>Coppia non conforme: serve una modifica o un’accettazione formale del rischio.{' '}
              <button onClick={async () => { const r = await askRisk(ask, `coppia ${pes.name} → ${es.name}`); if (r) onRisk(riskKey, r); }}>Registra accettazione del rischio…</button></>}
        </div>
      )}
      {g && (
        <div className="why">
          <h4>Perché</h4>
          <ol>
            <li><b>PES</b>: {pes.name}, {STRUCT_NAME[pes.struct]}. Caso di carico che governa: <b>HD {g.load.hd}</b>, NEQ {fmtInt(g.load.neq)} kg{needsMce(g.load.hd) ? `, MCE ${fmtInt(g.load.mce)} kg` : ''} ({g.load.rule}).
              Effetti e quantità di riferimento da Part I Ch.3 Table 1; miscelazione da Part I Ch.2 Table 4.</li>
            {g.extra ? <li><b>{g.extra}</b>: Part I §1.3.6.6.3 impone {g.res.o?.ref} tra i due ECM.</li> : <>
            <li><b>Settore</b>: {g.pesSector ? <>l’ES cade nel settore <b>{SECTOR_IT[g.pesSector]}</b> del PES ({g.scheme}){g.pesSector === 'side' ? '' : ''}</> : 'PES non direzionale'} → colonna <b>({g.colCode})</b>: <em>{MATRIX.tables[t].cols[g.col]}</em></li>
            <li><b>ES</b>: riga <b>{g.es.row}</b>{g.es.why ? ` (${g.es.why})` : ''}: <em>{MATRIX.es[g.es.row]}</em></li>
            <li><b>Cella</b>: {cellRef(t, g.col, g.es.row)} — testo: “{g.res.raw || '(vuota)'}”{g.res.merged ? ' (cella unica blast + detriti)' : ''}.</li>
            </>}
            <li><b>Effetto che governa</b>: {EFFNAME[g.eff]}, {g.res.qtype} = {fmtInt(g.res.Q)} kg{g.res.o?.ref ? <>, formula <b>{g.res.o.ref}</b> ({formulaTable(g.res.o.ref)})</> : g.res.o ? `, ${optLabel(g.res.o)}` : ''}.
              {g.res.r?.seg && <div className="formula">{g.res.r.seg} → {fmt1(g.res.r.d!)} m → <b>{g.res.r.dr} m</b> (per eccesso, Annex I-A §5){g.res.r.capped ? ` · limitata a ${g.res.o?.cap} m dalla matrice` : ''}</div>}
              {g.res.r?.oor && <div className="warn">Q fuori dal campo di validità di {g.res.o?.ref} ({fmtInt(g.res.r.rg![0])}–{fmtInt(g.res.r.rg![1])} kg): la norma non dà la distanza.</div>}
            </li>
            <li><b>Distanza</b> misurata tra i punti più vicini (Part I §1.3.2.2){g.pesSector ? ', limitata alla parte di ES nel settore' : ''}: <b>{fmt1(g.dist)} m</b> {g.req != null ? <>{g.dist >= g.req ? '≥' : '<'} {fmtInt(g.req)} m richiesti → <b>{STATUS_TEXT[g.status]}</b></> : ''}.</li>
          </ol>
          {g.res.o?.lvl && <p><b>Cosa succede</b>: livello di protezione {LVLNAME[g.res.o.lvl]}{g.res.o.pers ? ' (per il personale)' : ''} — vedi Part I §1.3.7 per il danno atteso.</p>}
          {g.res.o?.notes?.length ? <p className="hint">Note di cella: {g.res.o.notes.join('; ')} (non valutate automaticamente: verificare il testo).</p> : null}
        </div>
      )}
      <h4>Tutti i casi valutati</h4>
      <table className="tbl compact">
        <thead><tr><th>HD</th><th>Effetto</th><th>Sett.</th><th>Col.</th><th>ES</th><th>Formula</th><th className="r">Q</th><th className="r">Rich.</th><th className="r">Dist.</th><th>Esito</th></tr></thead>
        <tbody>
          {cases.map((c, i) => (
            <tr key={i} className={c === g ? 'sel' : ''}>
              <td title={c.load.label}>{c.load.hd}</td>
              <td>{c.extra ? 'Terrapieno condiviso' : EFFNAME[c.eff]}</td><td>{sectorTxt(c)}{c.pesSide ? (c.pesSide === 'left' ? ' sx' : ' dx') : ''}</td>
              <td>{c.col < 0 ? '—' : `(${COLCODE[t][c.col]})`}</td><td>{c.col < 0 ? '—' : c.es.row}</td>
              <td>{c.res.o ? optLabel(c.res.o) : '—'}</td>
              <td className="r">{fmtInt(c.res.Q)}</td>
              <td className="r">{c.req != null ? fmtInt(c.req) : 'n.d.'}</td>
              <td className="r">{fmt1(c.dist)}</td>
              <td><span className={`pill st-${c.status}`}>{STATUS_SHORT[c.status]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {alts.size > 0 && (
        <div className="alts">
          <h4>Alternative di cella</h4>
          <p className="hint">Per default si usa l’alternativa valida più cautelativa. Sceglierne un’altra solo se ricorrono le condizioni della nota di cella o della descrizione dell’ES, e motivarlo.</p>
          {[...alts.values()].map((c) => (
            <div key={c.res.key} className="alt">
              <div className="cap">{EFFNAME[c.eff]} · col. ({c.colCode}) · ES {c.es.row}: “{c.res.raw}”</div>
              {c.res.opts.map((x, j) => (
                <label key={j} className="chk">
                  <input type="radio" name={c.res.key} checked={c.res.sel === j}
                    onChange={() => onChoice({ idx: { ...(choice?.idx ?? {}), [c.res.key]: j }, note: choice?.note ?? '' })} />
                  {optLabel(x.o)}{x.o.notes?.length ? ` — ${x.o.notes.join('; ')}` : ''}
                </label>
              ))}
            </div>
          ))}
          {choice && Object.keys(choice.idx).length > 0 && <>
            <label className="fld"><span>Giustificazione della scelta</span>
              <textarea rows={2} value={choice.note} onChange={(e) => onChoice({ ...choice, note: e.target.value })} /></label>
            <button onClick={() => onChoice({ idx: {}, note: '' })}>Ripristina le scelte cautelative</button>
          </>}
        </div>
      )}
    </div>
  );
}
