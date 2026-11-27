import { EFFMAP, MATRIX, type EsRow } from '../engine/matrix';
import { BUILDING_ES, ECM_NAME, ES_AS_NAME, LINE_ES, magazineLoad, PRESETS, STRUCT_NAME, type Building, type EcmClass, type Line, type Magazine, type Project, type Risk, type SharedCover, type SiteObject, type StructKind } from '../site/model';
import { pesColumns, pesTable, SECTOR_IT, type SiteEval } from '../site/evaluate';
import type { Fill } from '../site/capacity';
import { COLCODE, EFFNAME } from '../engine/matrix';
import { ContentEditor } from './ContentEditor';
import { BarricadeLength } from './BarricadeLength';
import { fmt1, fmtInt, STATUS_TEXT } from './format';
import { t } from '../i18n';

interface Props {
  obj: SiteObject;
  site: SiteEval;
  project: Project;
  fill?: Fill;
  onChange: (o: SiteObject) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRisk: (key: string, r: Risk | null) => void;
  onShared: (list: SharedCover[]) => void;
}

const esLabel = (r: string) => `ES ${r} — ${(MATRIX.es[r] ?? '').slice(0, 70)}${(MATRIX.es[r] ?? '').length > 70 ? '…' : ''}`;

function Num(p: { label: string; value: number; step?: number; min?: number; unit?: string; onChange: (v: number) => void; title?: string }) {
  return (
    <label className="fld" title={p.title}>
      <span>{p.label}</span>
      <span className="num">
        <input type="number" value={Number.isFinite(p.value) ? +p.value.toFixed(3) : ''} step={p.step ?? 1} min={p.min}
          onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) p.onChange(v); }} />
        {p.unit && <em>{p.unit}</em>}
      </span>
    </label>
  );
}
function Check(p: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <label className="chk"><input type="checkbox" checked={p.value} onChange={(e) => p.onChange(e.target.checked)} /> {p.label}</label>;
}

export function Inspector({ obj, site, project, fill, onChange, onDelete, onDuplicate, onRisk, onShared }: Props) {
  const st = site.byObject[obj.id];
  const set = <T extends SiteObject>(patch: Partial<T>) => onChange({ ...(obj as T), ...patch });
  return (
    <div className="inspector">
      <div className="insp-head">
        <input className="name" value={obj.name} onChange={(e) => set({ name: e.target.value })} />
        {st && <span className={`pill st-${st}`}>{t(STATUS_TEXT[st])}</span>}
      </div>
      {obj.kind === 'magazine' && <MagazineForm m={obj} set={set} project={project} site={site} fill={fill} onRisk={onRisk} onShared={onShared} />}
      {obj.kind === 'building' && <BuildingForm b={obj} set={set} />}
      {obj.kind === 'line' && <LineForm l={obj} set={set} />}
      {obj.kind === 'line' && obj.role === 'barricade' && <BarricadeLength line={obj} project={project} />}
      {obj.kind !== 'line' && (
        <fieldset>
          <legend>{t('Posizione e ingombro')}</legend>
          <div className="grid2">
            <Num label={t('X centro')} unit="m" step={0.5} value={obj.cx} onChange={(v) => set({ cx: v })} />
            <Num label={t('Y centro')} unit="m" step={0.5} value={obj.cy} onChange={(v) => set({ cy: v })} />
            <Num label={t('Larghezza (facciata)')} unit="m" step={0.5} min={0.5} value={obj.w} onChange={(v) => set({ w: Math.max(0.5, v) })} />
            <Num label={t('Profondità (fronte–retro)')} unit="m" step={0.5} min={0.5} value={obj.d} onChange={(v) => set({ d: Math.max(0.5, v) })} />
            <Num label={t('Azimut del fronte')} unit="°" value={obj.az} title={t('Direzione verso cui guarda la porta/facciata frontale, in gradi da nord in senso orario')}
              onChange={(v) => set({ az: ((v % 360) + 360) % 360 })} />
          </div>
          <p className="hint">{t('Il contorno è quello da cui si misura la distanza (punto più vicino → punto più vicino, Part I §1.3.2.2). Per gli ECM disegnare l’ingombro della struttura, non l’unghia del terrapieno.')}</p>
        </fieldset>
      )}
      <label className="fld"><span>{t('Note')}</span><textarea rows={2} value={obj.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></label>
      <div className="row-btns">
        <button onClick={onDuplicate}>{t('Duplica')}</button>
        <button className="danger" onClick={onDelete}>{t('Elimina')}</button>
      </div>
    </div>
  );
}

function MagazineForm({ m, set, project, site, fill, onRisk, onShared }: {
  m: Magazine; set: (p: Partial<Magazine>) => void; project: Project; site: SiteEval; fill?: Fill;
  onRisk: (key: string, r: Risk | null) => void; onShared: (list: SharedCover[]) => void;
}) {
  const tab = pesTable(m);
  const load = magazineLoad(m);
  const hds = [...new Set(load.cases.map((c) => c.hd))];
  const hdCols = hds.flatMap((hd) => EFFMAP[hd].map(([eff]) => ({ eff, cols: pesColumns(m, eff) })))
    .filter((x, i, a) => a.findIndex((y) => y.eff === x.eff) === i);
  const quick = PRESETS.filter((p) => p.group.startsWith('Magazzini'));
  const ecms = project.objects.filter((o): o is Magazine => o.kind === 'magazine' && o.struct === 'ecm' && o.id !== m.id);
  const shared = project.sharedCover.filter((x) => x.a === m.id || x.b === m.id);
  const other = (x: SharedCover) => (x.a === m.id ? x.b : x.a);
  return (
    <>
      <fieldset>
        <legend>{t('Tipo di magazzino (selezione rapida)')}</legend>
        <select value="" onChange={(e) => {
          const p = quick.find((x) => x.id === e.target.value); if (!p) return;
          const n = p.make({ x: m.cx, y: m.cy }, m.name) as Magazine;
          set({ struct: n.struct, ecmClass: n.ecmClass, roof: n.roof, frontDoor: n.frontDoor, barricaded: n.barricaded });
        }}>
          <option value="">{t('Applica un tipo predefinito…')}</option>
          {quick.map((p) => <option key={p.id} value={p.id}>{t(p.label)} — {t(p.hint)}</option>)}
        </select>
        <label className="fld"><span>{t('Costruzione')}</span>
          <select value={m.struct} onChange={(e) => set({ struct: e.target.value as StructKind })}>
            {(Object.keys(STRUCT_NAME) as StructKind[]).map((k) => <option key={k} value={k}>{t(STRUCT_NAME[k])}</option>)}
          </select>
        </label>
        {m.struct === 'ecm' && <>
          <label className="fld"><span>{t('Classe ECM (come ES)')}</span>
            <select value={m.ecmClass} onChange={(e) => set({ ecmClass: e.target.value as EcmClass })}>
              {(Object.keys(ECM_NAME) as EcmClass[]).map((k) => <option key={k} value={k}>{t(ECM_NAME[k])}</option>)}
            </select>
          </label>
          <Check label={t('Terrapieno conforme a §1.3.6.6.1 e volume interno > 500 m³ (IBD/PTRD ridotte di lato e retro, §1.3.6.6.2)')} value={!!m.vol500} onChange={(v) => set({ vol500: v })} />
        </>}
        {m.struct === 'heavy' && <>
          <Check label={t('Tetto protettivo 150 mm c.a.')} value={m.roof} onChange={(v) => set({ roof: v })} />
          <Check label={t('Porta o grande apertura sulla facciata frontale')} value={m.frontDoor} onChange={(v) => set({ frontDoor: v })} />
        </>}
        {(m.struct === 'medium' || m.struct === 'light') && <Check label={t('Barricato')} value={m.barricaded} onChange={(v) => set({ barricaded: v })} />}
        {m.struct !== 'ecm' && (
          <label className="fld" title={t('Un edificio di processo, quando è esposto, si verifica come officina esplosivi (Part I §1.3.1.13) e non come magazzino')}>
            <span>{t('Come esposto (ES)')}</span>
            <select value={m.esAs ?? ''} onChange={(e) => set({ esAs: (e.target.value || null) as Magazine['esAs'] })}>
              <option value="">{t('come magazzino (riga del tipo strutturale)')}</option>
              {(Object.keys(ES_AS_NAME) as ('18' | '19' | '20')[]).map((k) => <option key={k} value={k}>{t(ES_AS_NAME[k])}</option>)}
            </select>
          </label>
        )}
      </fieldset>

      <ContentEditor m={m} set={set} project={project} group={site.groupOf.get(m.id)} onRisk={onRisk} />

      {fill && fill.neq > 0 && (
        <fieldset>
          <legend>{t('Riempimento')}</legend>
          <p className="hint">{fill.maxNeq == null && !fill.limitedByMce ? t('Nessun limite entro 64 volte il contenuto attuale.')
            : fill.limitedByMce ? t('Non conforme anche con quantità quasi nulla: limitano il resto del sito unico, effetti in MCE o distanze fisse.')
            : <>{t('NEQ ammesso con la stessa composizione:')} <b>{fmtInt(fill.maxNeq!)} kg</b> — {t('riempimento')} <b>{Math.round(fill.fill! * 100)}%</b>.</>}</p>
        </fieldset>
      )}

      {m.struct === 'ecm' && (
        <fieldset>
          <legend>{t('Terrapieno condiviso (§1.3.6.6.3)')}</legend>
          {shared.map((x) => (
            <div key={other(x)} className="row-btns">
              <span>{project.objects.find((o) => o.id === other(x))?.name}</span>
              <select value={x.level} onChange={(e) => onShared(project.sharedCover.map((y) => (y === x ? { ...y, level: e.target.value as '34' | '12' } : y)))}>
                <option value="34">{t('intersezione ≥ 3/4 dell’altezza → BD5')}</option>
                <option value="12">{t('tra 1/2 e 3/4 → BD4')}</option>
              </select>
              <button onClick={() => onShared(project.sharedCover.filter((y) => y !== x))}>✕</button>
            </div>
          ))}
          <select value="" onChange={(e) => { if (e.target.value) onShared([...project.sharedCover, { a: m.id, b: e.target.value, level: '34' }]); }}>
            <option value="">{t('Aggiungi un ECM con terrapieno in comune…')}</option>
            {ecms.filter((x) => !shared.some((y) => other(y) === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <p className="hint">{t('Intersezione a metà altezza o più in basso: nessuna riduzione, valgono le IMD normali.')}</p>
        </fieldset>
      )}

      <fieldset>
        <legend>{t('Come si legge la matrice')}</legend>
        <p className="hint">{t('Come PES:')} <b>Annex I-A Table {tab}</b> — {MATRIX.tables[tab].title}.</p>
        {load.cases.length > 0 && <ul className="mini">
          {hdCols.map(({ eff, cols }) => (
            <li key={eff}>{t(EFFNAME[eff])}: {cols.map((c) => `(${COLCODE[tab][c.col]})${c.sector ? ' ' + t(SECTOR_IT[c.sector]) + (c.side ? ' ' + (c.side === 'left' ? t('sx') : t('dx')) : '') : ''}`).join(', ')}
              {cols[0]?.scheme ? <em> — {t('settori {scheme}', { scheme: cols[0].scheme })}</em> : null}</li>
          ))}
        </ul>}
        <p className="hint">{t('Come ES:')} {m.struct === 'ecm' ? t('riga scelta dal settore dell’ECM in cui cade il PES (Fig. A-1)') : t('riga {row}', { row: m.struct === 'heavy' ? (m.roof ? 12 : 13) : m.struct === 'medium' ? (m.barricaded ? 14 : 15) : (m.barricaded ? 16 : 17) })}.</p>
      </fieldset>
    </>
  );
}

function BuildingForm({ b, set }: { b: Building; set: (p: Partial<Building>) => void }) {
  return (
    <fieldset>
      <legend>{t('Tipo di ES')}</legend>
      <select value={b.es} onChange={(e) => set({ es: e.target.value as EsRow })}>
        {BUILDING_ES.map((r) => <option key={r} value={r}>{esLabel(r)}</option>)}
      </select>
      <p className="hint">{MATRIX.es[b.es]}</p>
    </fieldset>
  );
}

function LineForm({ l, set }: { l: Line; set: (p: Partial<Line>) => void }) {
  let length = 0;
  for (let i = 0; i + 1 < l.pts.length; i++) length += Math.hypot(l.pts[i + 1].x - l.pts[i].x, l.pts[i + 1].y - l.pts[i].y);
  return (
    <fieldset>
      <legend>{t('Linea')}</legend>
      <label className="fld"><span>{t('Ruolo')}</span>
        <select value={l.role} onChange={(e) => { const role = e.target.value as Line['role']; set({ role, es: role === 'es' ? l.es ?? '21' : null }); }}>
          <option value="es">{t('ES (strada, ferrovia, elettrodotto, oleodotto)')}</option>
          <option value="road">{t('Strada interna (non ES)')}</option>
          <option value="fence">{t('Recinzione / confine (non ES)')}</option>
          <option value="barricade">{t('Barricata (solo grafica in Fase 1)')}</option>
        </select>
      </label>
      {l.role === 'es' && <>
        <select value={l.es ?? '21'} onChange={(e) => set({ es: e.target.value as EsRow })}>
          {LINE_ES.map((r) => <option key={r} value={r}>{esLabel(r)}</option>)}
        </select>
        <p className="hint">{MATRIX.es[l.es ?? '21']}</p>
      </>}
      <p className="hint">{t('{n} vertici · lunghezza {len} m. Trascina i quadratini per spostare i vertici.', { n: l.pts.length, len: fmt1(length) })}</p>
      <div className="row-btns">
        <button disabled={l.pts.length <= 2} onClick={() => set({ pts: l.pts.slice(0, -1) })}>{t('Rimuovi ultimo vertice')}</button>
        <button onClick={() => { const a = l.pts[l.pts.length - 1], b = l.pts[l.pts.length - 2] ?? a; set({ pts: [...l.pts, { x: a.x + (a.x - b.x) || a.x + 50, y: a.y + (a.y - b.y) }] }); }}>{t('Aggiungi vertice')}</button>
      </div>
      <table className="vtx"><tbody>{l.pts.map((p, i) => <tr key={i}><td>{i + 1}</td><td>{fmtInt(p.x)}</td><td>{fmtInt(p.y)}</td></tr>)}</tbody></table>
    </fieldset>
  );
}
