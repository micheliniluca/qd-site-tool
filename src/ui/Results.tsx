import { useState } from 'react';
import { optLabel } from '../engine/cell';
import { COLCODE, EFFNAME, LVLNAME, MATRIX, needsMce } from '../engine/matrix';
import { formulaTable } from '../engine/formulas';
import { cellRef, SECTOR_IT, STATUS_RANK, type SiteGroup, type PairCase, type PairEval, type SiteEval, type Status } from '../site/evaluate';
import { magazineLoad, STRUCT_NAME, type Magazine, type PairChoice, type Project, type Risk, type SiteObject } from '../site/model';
import { fmt1, fmtInt, fmtM, STATUS_SHORT, STATUS_TEXT } from './format';
import { askRisk, useDialog } from './dialog';
import { t } from '../i18n';
import { useSort } from './sort';

const rank = STATUS_RANK;
const sectorTxt = (c: PairCase) => (c.pesSector ? t(SECTOR_IT[c.pesSector]) : '—');

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
  const { sortRows, Th } = useSort<PairEval>({
    pes: (p) => name(p.pesId), es: (p) => name(p.esId),
    hd: (p) => (p.gov ? `${p.gov.load.hd} ${String(Math.round(p.gov.load.neq)).padStart(9, '0')}` : null),
    row: (p) => p.gov?.es.row, col: (p) => (p.gov ? (p.gov.col < 0 ? '§' : `T${p.table} ${p.gov.colCode}`) : null),
    sec: (p) => (p.gov ? sectorTxt(p.gov) : null), eff: (p) => (p.gov ? t(EFFNAME[p.gov.eff]) : null),
    formula: (p) => (p.gov?.res.o ? optLabel(p.gov.res.o) : null),
    req: (p) => p.gov?.req, dist: (p) => (p.gov ? p.gov.dist : p.dist), margin: (p) => p.gov?.margin,
    st: (p) => -rank[p.status],
  });
  rows = sortRows(rows);
  const count = (s: Status) => site.pairs.filter((p) => p.status === s).length;
  return (
    <div className="pairs">
      <div className="pairs-bar">
        <strong>{t('Verifica di tutte le coppie PES → ES')}</strong>
        <span className="seg">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>{t('Tutte ({n})', { n: site.pairs.length })}</button>
          <button className={filter === 'ko' ? 'on' : ''} onClick={() => setFilter('ko')}>{t('Non conformi ({n})', { n: count('ko') })}</button>
          <button className={filter === 'nd' ? 'on' : ''} onClick={() => setFilter('nd')}>{t('Da verificare ({n})', { n: count('nd') })}</button>
          {count('acc') > 0 && <button className={filter === 'acc' ? 'on' : ''} onClick={() => setFilter('acc')}>{t('Rischi accettati ({n})', { n: count('acc') })}</button>}
          <button className={filter === 'sel' ? 'on' : ''} disabled={!selectedId} onClick={() => setFilter('sel')}>{t('Oggetto selezionato')}</button>
        </span>
      </div>
      <div className="pairs-scroll">
        <table className="tbl">
          <thead><tr>
            <Th k="pes">PES</Th><Th k="es">ES</Th><Th k="hd">{t('HD (caso)')}</Th><Th k="row">{t('Riga ES')}</Th><Th k="col">{t('Col.')}</Th><Th k="sec">{t('Settore PES')}</Th><Th k="eff">{t('Effetto che governa')}</Th><Th k="formula">{t('Formula')}</Th>
            <Th k="req" className="r">{t('Richiesta')}</Th><Th k="dist" className="r">{t('Distanza')}</Th><Th k="margin" className="r">{t('Margine')}</Th><Th k="st">{t('Esito')}</Th>
          </tr></thead>
          <tbody>
            {rows.map((p) => {
              const g = p.gov;
              return (
                <tr key={p.key} className={`${p.key === selectedPair ? 'sel' : ''} row-${p.status}`} onClick={() => onPick(p.key)}>
                  <td>{name(p.pesId)}{p.groupId && <span className="tag" title={t('Sito unico: NEQ aggregato')}>{t('SU')}</span>}</td><td>{name(p.esId)}</td>
                  <td title={g?.load.label}>{g ? `${g.load.hd} · ${fmtInt(g.load.neq)}` : '—'}</td>
                  <td>{g ? g.es.row : '—'}</td>
                  <td>{g ? (g.col < 0 ? '§1.3.6.6.3' : `T${p.table} (${g.colCode})`) : '—'}</td>
                  <td>{g ? sectorTxt(g) : '—'}</td>
                  <td>{g ? t(EFFNAME[g.eff]) : '—'}</td>
                  <td>{g?.res.o ? optLabel(g.res.o) : '—'}</td>
                  <td className="r">{g?.req != null ? `${fmtInt(g.req)} m` : t('n.d.')}</td>
                  <td className="r">{fmtM(g ? g.dist : p.dist)}</td>
                  <td className="r">{g?.margin != null ? `${g.margin >= 0 ? '+' : ''}${fmt1(g.margin)} m` : '—'}</td>
                  <td><span className={`pill st-${p.status}`}>{t(STATUS_SHORT[p.status])}</span></td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={12} className="empty">{t('Nessuna coppia. Aggiungi almeno un magazzino con NEQ ≥ 1 kg e un ES.')}</td></tr>}
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
  const { sortRows, Th } = useSort<Magazine>({
    name: (m) => m.name, type: (m) => t(STRUCT_NAME[m.struct]).split(' (')[0],
    hd: (m) => [...new Set(magazineLoad(m).cases.map((c) => c.hd))].join(', '),
    neq: (m) => magazineLoad(m).neqQd, st: (m) => (site.byObject[m.id] ? -rank[site.byObject[m.id]!] : null),
  });
  const mags = sortRows(project.objects.filter((o): o is Magazine => o.kind === 'magazine'));
  return (
    <div className="sitecard">
      <div className={`site-status st-${site.status}`}>
        <span>{t('Stato del sito')}</span>
        <strong>{site.pairs.length ? t(STATUS_TEXT[site.status]) : t('Nessuna coppia')}</strong>
      </div>
      <div className="tiles">
        <div className="tile"><span>{t('PES attivi')}</span><b>{site.nPes}</b></div>
        <div className="tile"><span>ES</span><b>{site.nEs}</b></div>
        <div className="tile"><span>{t('Coppie verificate')}</span><b>{site.pairs.length}</b></div>
        <div className="tile"><span>{t('NEQ totale')}</span><b>{fmtInt(site.neqTot)} kg</b></div>
        <div className="tile"><span>{t('Siti unici')}</span><b>{site.groups.length}</b></div>
        <div className="tile"><span>{t('Rischi accettati')}</span><b>{Object.keys(project.risks).length}</b></div>
      </div>
      {w && w.gov && (
        <div className="worst" onClick={() => onPick(w.key)}>
          <span className="cap">{t('Coppia peggiore')}</span>
          <div><b>{name(w.pesId)} → {name(w.esId)}</b> · {t(EFFNAME[w.gov.eff])} · {w.gov.res.o ? optLabel(w.gov.res.o) : ''}</div>
          <div>{t('distanza')} {fmtM(w.gov.dist)} · {t('richiesti')} {w.gov.req != null ? `${fmtInt(w.gov.req)} m` : t('n.d.')}
            {w.gov.margin != null && <> · {t('margine')} <b className={w.gov.margin < 0 ? 'neg' : ''}>{fmt1(w.gov.margin)} m</b></>}</div>
        </div>
      )}
      {site.groups.length > 0 && <>
        <h4>{t('Siti unici (Part I §1.3.2.3.4)')}</h4>
        {site.groups.map((g) => (
          <div key={g.id} className="worst" onClick={() => onSelect(g.members[0])}>
            <div><b>{g.members.map(name).join(' + ')}</b> — NEQ {fmtInt(g.load.neqQd)} kg</div>
            <div className="hint">{t('Casi: {cases}. Unione dovuta a: {links} sotto la IMD.', { cases: g.load.cases.map((c) => `HD ${c.hd} ${fmtInt(c.neq)} kg`).join(' · '), links: g.links.map((l) => `${name(l.a)}→${name(l.b)}`).join(', ') })}</div>
          </div>
        ))}
      </>}
      <h4>{t('Magazzini')}</h4>
      <table className="tbl compact">
        <thead><tr><Th k="name">{t('Nome')}</Th><Th k="type">{t('Tipo')}</Th><Th k="hd">HD</Th><Th k="neq" className="r">NEQ</Th><Th k="st">{t('Esito')}</Th></tr></thead>
        <tbody>
          {mags.map((m) => {
            const st = site.byObject[m.id];
            const l = magazineLoad(m);
            return (
              <tr key={m.id} onClick={() => onSelect(m.id)} className={site.koPes.includes(m.id) ? 'row-ko' : ''}>
                <td>{m.name}</td><td>{t(STRUCT_NAME[m.struct]).split(' (')[0]}</td><td>{l.cases.length ? [...new Set(l.cases.map((c) => c.hd))].join(', ') : '—'}</td>
                <td className="r">{l.neqQd >= 1 ? fmtInt(l.neqQd) : t('vuoto')}</td>
                <td>{st ? <span className={`pill st-${st}`}>{t(STATUS_SHORT[st])}</span> : '—'}</td>
              </tr>
            );
          })}
          {!mags.length && <tr><td colSpan={5} className="empty">{t('Nessun magazzino.')}</td></tr>}
        </tbody>
      </table>
      {site.koPes.length > 0 && <p className="warn">{t('Magazzini non conformi come PES: {list}. Per ciascuna coppia non conforme serve una modifica (quantità, posizione, barricata) o un’accettazione formale del rischio.', { list: site.koPes.map(name).join(', ') })}</p>}
      {site.pairs.some((p) => p.status === 'nd') && <p className="warn">{t('Alcune coppie sono “da verificare”: la quantità è fuori dal campo di validità della formula indicata dalla matrice e la norma non fornisce la distanza.')}</p>}
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
  const tab = pair.table;
  const cases = [...pair.cases].sort((a, b) => rank[b.status] - rank[a.status] || (a.margin ?? 1e9) - (b.margin ?? 1e9));
  const alts = new Map<string, PairCase>();
  for (const c of pair.cases) if (c.res.opts.length > 1 && !c.res.merged) alts.set(c.res.key, c);
  return (
    <div className="detail">
      <div className={`site-status st-${pair.status}`}><span>{pes.name} → {es.name}</span><strong>{t(STATUS_TEXT[pair.status])}</strong></div>
      {pair.status === 'agg' && <p className="hint">{t('I due magazzini non sono separati dalla IMD appropriata e formano un unico sito (Part I §1.3.2.3.4): il NEQ è sommato e le distanze verso gli altri ES usano il sito unico. Sotto: il confronto con la IMD che ha originato l’unione.')}</p>}
      {group && group.members.length > 1 && <p className="hint">{t('PES nel sito unico {list} (NEQ {neq} kg).', { list: group.members.map(gname).join(' + '), neq: fmtInt(group.load.neqQd) })}</p>}
      {(pair.rawStatus === 'ko' && pair.status !== 'agg') && (
        <div className={risk ? 'acc' : 'warn bad'}>
          {risk ? <>{t('Rischio accettato:')} “{risk.text}” — {risk.by}, {risk.date} <button onClick={() => onRisk(riskKey, null)}>{t('Revoca')}</button></>
            : <>{t('Coppia non conforme: serve una modifica o un’accettazione formale del rischio.')}{' '}
              <button onClick={async () => { const r = await askRisk(ask, t('coppia {pes} → {es}', { pes: pes.name, es: es.name })); if (r) onRisk(riskKey, r); }}>{t('Registra accettazione del rischio…')}</button></>}
        </div>
      )}
      {g && (
        <div className="why">
          <h4>{t('Perché')}</h4>
          <ol>
            <li><b>PES</b>: {pes.name}, {t(STRUCT_NAME[pes.struct])}. {t('Caso di carico che governa:')} <b>HD {g.load.hd}</b>, NEQ {fmtInt(g.load.neq)} kg{needsMce(g.load.hd) ? `, MCE ${fmtInt(g.load.mce)} kg` : ''} ({g.load.rule}).
              {t('Effetti e quantità di riferimento da Part I Ch.3 Table 1; miscelazione da Part I Ch.2 Table 4.')}</li>
            {g.extra ? <li><b>{g.extra}</b>: {t('Part I §1.3.6.6.3 impone {ref} tra i due ECM.', { ref: g.res.o?.ref })}</li> : <>
            <li><b>{t('Settore')}</b>: {g.pesSector ? <>{t('l’ES cade nel settore')} <b>{t(SECTOR_IT[g.pesSector])}</b> {t('del PES')} ({g.scheme})</> : t('PES non direzionale')} → {t('colonna')} <b>({g.colCode})</b>: <em>{MATRIX.tables[tab].cols[g.col]}</em></li>
            <li><b>ES</b>: {t('riga')} <b>{g.es.row}</b>{g.es.why ? ` (${g.es.why})` : ''}: <em>{MATRIX.es[g.es.row]}</em></li>
            <li><b>{t('Cella')}</b>: {cellRef(tab, g.col, g.es.row)} — {t('testo:')} “{g.res.raw || t('(vuota)')}”{g.res.merged ? t(' (cella unica blast + detriti)') : ''}.</li>
            </>}
            <li><b>{t('Effetto che governa')}</b>: {t(EFFNAME[g.eff])}, {g.res.qtype} = {fmtInt(g.res.Q)} kg{g.res.o?.ref ? <>, {t('formula')} <b>{g.res.o.ref}</b> ({formulaTable(g.res.o.ref)})</> : g.res.o ? `, ${optLabel(g.res.o)}` : ''}.
              {g.res.r?.seg && <div className="formula">{g.res.r.seg} → {fmt1(g.res.r.d!)} m → <b>{g.res.r.dr} m</b> {t('(per eccesso, Annex I-A §5)')}{g.res.r.capped ? t(' · limitata a {cap} m dalla matrice', { cap: g.res.o?.cap }) : ''}</div>}
              {g.res.r?.oor && <div className="warn">{t('Q fuori dal campo di validità di {ref} ({min}–{max} kg): la norma non dà la distanza.', { ref: g.res.o?.ref, min: fmtInt(g.res.r.rg![0]), max: fmtInt(g.res.r.rg![1]) })}</div>}
            </li>
            <li><b>{t('Distanza')}</b> {t('misurata tra i punti più vicini (Part I §1.3.2.2)')}{g.pesSector ? t(', limitata alla parte di ES nel settore') : ''}: <b>{fmt1(g.dist)} m</b> {g.req != null ? <>{g.dist >= g.req ? '≥' : '<'} {t('{req} m richiesti', { req: fmtInt(g.req) })} → <b>{t(STATUS_TEXT[g.status])}</b></> : ''}.</li>
          </ol>
          {g.res.o?.lvl && <p><b>{t('Cosa succede')}</b>: {t('livello di protezione')} {t(LVLNAME[g.res.o.lvl])}{g.res.o.pers ? t(' (per il personale)') : ''} — {t('vedi Part I §1.3.7 per il danno atteso.')}</p>}
          {g.res.o?.notes?.length ? <p className="hint">{t('Note di cella: {notes} (non valutate automaticamente: verificare il testo).', { notes: g.res.o.notes.join('; ') })}</p> : null}
        </div>
      )}
      <h4>{t('Tutti i casi valutati')}</h4>
      <table className="tbl compact">
        <thead><tr><th>HD</th><th>{t('Effetto')}</th><th>{t('Sett.')}</th><th>{t('Col.')}</th><th>ES</th><th>{t('Formula')}</th><th className="r">Q</th><th className="r">{t('Rich.')}</th><th className="r">{t('Dist.')}</th><th>{t('Esito')}</th></tr></thead>
        <tbody>
          {cases.map((c, i) => (
            <tr key={i} className={c === g ? 'sel' : ''}>
              <td title={c.load.label}>{c.load.hd}</td>
              <td>{c.extra ? t('Terrapieno condiviso') : t(EFFNAME[c.eff])}</td><td>{sectorTxt(c)}{c.pesSide ? ' ' + (c.pesSide === 'left' ? t('sx') : t('dx')) : ''}</td>
              <td>{c.col < 0 ? '—' : `(${COLCODE[tab][c.col]})`}</td><td>{c.col < 0 ? '—' : c.es.row}</td>
              <td>{c.res.o ? optLabel(c.res.o) : '—'}</td>
              <td className="r">{fmtInt(c.res.Q)}</td>
              <td className="r">{c.req != null ? fmtInt(c.req) : t('n.d.')}</td>
              <td className="r">{fmt1(c.dist)}</td>
              <td><span className={`pill st-${c.status}`}>{t(STATUS_SHORT[c.status])}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {alts.size > 0 && (
        <div className="alts">
          <h4>{t('Alternative di cella')}</h4>
          <p className="hint">{t('Per default si usa l’alternativa valida più cautelativa. Sceglierne un’altra solo se ricorrono le condizioni della nota di cella o della descrizione dell’ES, e motivarlo.')}</p>
          {[...alts.values()].map((c) => (
            <div key={c.res.key} className="alt">
              <div className="cap">{t(EFFNAME[c.eff])} · {t('col.')} ({c.colCode}) · ES {c.es.row}: “{c.res.raw}”</div>
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
            <label className="fld"><span>{t('Giustificazione della scelta')}</span>
              <textarea rows={2} value={choice.note} onChange={(e) => onChoice({ ...choice, note: e.target.value })} /></label>
            <button onClick={() => onChoice({ idx: {}, note: '' })}>{t('Ripristina le scelte cautelative')}</button>
          </>}
        </div>
      )}
    </div>
  );
}
