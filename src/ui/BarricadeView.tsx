/* Vista "Barricate": verifica in sezione secondo Part II §2.2.3.2 (Fig. 2-2/2-3) con disegno quotato. */
import { useState } from 'react';
import { checkSection, DEFAULT_SECTION, type BarricadeSectionInput, type StackSection } from '../site/barricade';
import { shapeDistance } from '../site/geometry';
import { shapeOf } from '../site/evaluate';
import { magazineLoad, type Magazine, type Project } from '../site/model';
import { fmt1 } from './format';

interface Props { project: Project; onChange: (list: BarricadeSectionInput[]) => void }

function Num({ label, value, onChange, step = 0.1, title }: { label: string; value: number; onChange: (v: number) => void; step?: number; title?: string }) {
  return (
    <label className="fld" title={title}><span>{label}</span>
      <input type="number" step={step} value={Number.isFinite(value) ? +value.toFixed(3) : ''} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }} />
    </label>
  );
}

function StackForm({ label, s, set }: { label: string; s: StackSection; set: (s: StackSection) => void }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="grid2">
        <Num label="Profondità in sezione (m)" value={s.w} onChange={(w) => set({ ...s, w: Math.max(0.1, w) })} />
        <Num label="Altezza (m)" value={s.h} onChange={(h) => set({ ...s, h: Math.max(0.1, h) })} />
        <Num label="Quota del piede (m)" value={s.z} onChange={(z) => set({ ...s, z })} />
      </div>
      <label className="chk"><input type="checkbox" checked={s.roof} onChange={(e) => set({ ...s, roof: e.target.checked })} /> Tetto protettivo (A sulla faccia vicina)</label>
    </fieldset>
  );
}

export function SectionDrawing({ s }: { s: BarricadeSectionInput }) {
  const r = checkSection(s);
  const W = 760, H = 320, pad = 30;
  const xmin = -s.a.w - 2, xmax = s.gap + s.b.w + 2;
  const zs = [s.a.z, s.b.z, s.a.z + s.a.h, s.b.z + s.b.h, ...r.barricade.map((p) => p.y), ...(r.wallPoly ?? []).map((p) => p.y)];
  const zmin = Math.min(...zs) - 1.5, zmax = Math.max(...zs) + 1.5;
  const k = Math.min((W - 2 * pad) / (xmax - xmin), (H - 2 * pad) / (zmax - zmin));
  const X = (x: number) => pad + (x - xmin) * k, Z = (z: number) => H - pad - (z - zmin) * k;
  const poly = (ps: { x: number; y: number }[]) => ps.map((p) => `${X(p.x).toFixed(1)},${Z(p.y).toFixed(1)}`).join(' ');
  const g = r.ground;
  const groundPts = [{ x: xmin, y: g(xmin) }, { x: 0, y: g(0) }, { x: s.gap, y: g(s.gap) }, { x: xmax, y: g(xmax) }, { x: xmax, y: zmin }, { x: xmin, y: zmin }];
  const stack = (x0: number, st: StackSection) => <rect x={X(x0)} y={Z(st.z + st.h)} width={st.w * k} height={st.h * k} className="sec-stack" />;
  const craterX = -s.a.w / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="section-svg">
      <polygon points={poly(groundPts)} className="sec-ground" />
      <polygon points={poly(r.barricade)} className="sec-bar" />
      {r.wallPoly && <polygon points={poly(r.wallPoly)} className="sec-wall" />}
      {stack(-s.a.w, s.a)}{stack(s.gap, s.b)}
      <text x={X(-s.a.w / 2)} y={Z(s.a.z + s.a.h / 2) + 4} className="sec-lbl c">catasta A</text>
      <text x={X(s.gap + s.b.w / 2)} y={Z(s.b.z + s.b.h / 2) + 4} className="sec-lbl c">catasta B</text>
      {/* cratere r = ½·NEQ^(1/3) dal centro di A */}
      <path d={`M ${X(craterX - r.crater.r)} ${Z(g(craterX))} A ${r.crater.r * k} ${r.crater.r * k * 0.5} 0 0 0 ${X(craterX + r.crater.r)} ${Z(g(craterX))}`} className={`sec-crater ${r.crater.ok ? '' : 'bad'}`} />
      {r.checks.map((c, i) => (
        <g key={i}>
          <line x1={X(c.ab.p.x)} y1={Z(c.ab.p.y)} x2={X(c.ab.q.x)} y2={Z(c.ab.q.y)} className={`sec-ab ${c.ab.ok ? 'ok' : 'bad'}`} />
          <circle cx={X(c.ab.p.x)} cy={Z(c.ab.p.y)} r={4} className="sec-pt" /><text x={X(c.ab.p.x) + 5} y={Z(c.ab.p.y) - 5} className="sec-lbl">A</text>
          <circle cx={X(c.ab.q.x)} cy={Z(c.ab.q.y)} r={4} className="sec-pt" /><text x={X(c.ab.q.x) + 5} y={Z(c.ab.q.y) - 5} className="sec-lbl">B</text>
          {c.cd && <>
            <line x1={X(c.cd.p.x)} y1={Z(c.cd.p.y)} x2={X(c.cd.q.x)} y2={Z(c.cd.q.y)} className={`sec-cd ${c.cd.ok ? 'ok' : 'bad'}`} />
            <text x={X(c.cd.p.x) + 5} y={Z(c.cd.p.y) - 5} className="sec-lbl">C</text><text x={X(c.cd.q.x) + 5} y={Z(c.cd.q.y) - 5} className="sec-lbl">D</text>
          </>}
        </g>
      ))}
      <g transform={`translate(${pad} ${H - 10})`}><line x1={0} x2={5 * k} y1={0} y2={0} className="sec-scale" /><text x={5 * k + 4} y={4} className="sec-lbl">5 m</text></g>
    </svg>
  );
}

export function BarricadeView({ project, onChange }: Props) {
  const list = project.barricadeSections ?? [];
  const [idx, setIdx] = useState(0);
  const cur = list[idx];
  const set = (s: BarricadeSectionInput) => onChange(list.map((x, i) => (i === idx ? s : x)));
  const mags = project.objects.filter((o): o is Magazine => o.kind === 'magazine');
  const [ma, setMa] = useState('');
  const [mb, setMb] = useState('');
  const fromPair = () => {
    const a = mags.find((m) => m.id === ma), b = mags.find((m) => m.id === mb);
    if (!a || !b || !cur) return;
    const gap = Math.round(shapeDistance(shapeOf(a), shapeOf(b)).d * 10) / 10;
    set({ ...cur, name: `${a.name} – ${b.name}`, gap, neq: Math.max(1, magazineLoad(a).neqQd), x0: Math.round(gap * 0.2 * 10) / 10, base: Math.round(gap * 0.6 * 10) / 10 });
  };
  const r = cur ? checkSection(cur) : null;
  return (
    <div className="view barricate">
      <aside className="view-side">
        <h3>Sezioni di barricata</h3>
        {list.map((s, i) => {
          const ok = checkSection(s).ok;
          return <button key={i} className={`preset ${i === idx ? 'on' : ''}`} onClick={() => setIdx(i)}><span>{s.name}</span><small className={ok ? 'okt' : 'kot'}>{ok ? 'verificata' : 'non verificata'}</small></button>;
        })}
        <div className="row-btns">
          <button onClick={() => { onChange([...list, { ...DEFAULT_SECTION, name: `Sezione ${list.length + 1}` }]); setIdx(list.length); }}>Nuova sezione</button>
          {cur && <button onClick={() => { onChange([...list, { ...cur, name: cur.name + ' (copia)' }]); setIdx(list.length); }}>Duplica</button>}
          {cur && <button className="danger" onClick={() => { onChange(list.filter((_, i) => i !== idx)); setIdx(Math.max(0, idx - 1)); }}>Elimina</button>}
        </div>
        <p className="hint">Riferimenti: Part II §2.2.3.2 (geometria), §2.2.3.3 (materiale, cratere), Fig. 2-2/2-3 (PDF pag. 277). La lunghezza in pianta si verifica selezionando una barricata sulla planimetria.</p>
      </aside>
      {!cur ? <div className="view-main"><p className="hint pad">Nessuna sezione. Crea una sezione per verificare altezza e spessore di una barricata tra due cataste.</p></div> : (
        <div className="view-main">
          <div className="row-btns">
            <input className="name" value={cur.name} onChange={(e) => set({ ...cur, name: e.target.value })} />
            <span className={`pill st-${r!.ok ? 'ok' : 'ko'}`}>{r!.ok ? 'VERIFICATA' : 'NON VERIFICATA'}</span>
          </div>
          <SectionDrawing s={cur} />
          <div className="sec-grid">
            <div>
              <fieldset>
                <legend>Da una coppia di magazzini (facoltativo)</legend>
                <div className="row-btns">
                  <select value={ma} onChange={(e) => setMa(e.target.value)}><option value="">catasta A…</option>{mags.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                  <select value={mb} onChange={(e) => setMb(e.target.value)}><option value="">catasta B…</option>{mags.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                  <button disabled={!ma || !mb || ma === mb} onClick={fromPair}>Applica distanza e NEQ</button>
                </div>
              </fieldset>
              <fieldset>
                <legend>Generale</legend>
                <div className="grid2">
                  <Num label="Distanza tra le facce (m)" value={cur.gap} onChange={(gap) => set({ ...cur, gap: Math.max(0, gap) })} />
                  <Num label="NEQ catasta A (kg)" step={1} value={cur.neq} onChange={(neq) => set({ ...cur, neq: Math.max(0, neq) })} title="Per 5·Q^(1/3) e raggio del cratere" />
                </div>
              </fieldset>
              <StackForm label="Catasta A" s={cur.a} set={(a) => set({ ...cur, a })} />
              <StackForm label="Catasta B" s={cur.b} set={(b) => set({ ...cur, b })} />
            </div>
            <div>
              <fieldset>
                <legend>Barricata di terra</legend>
                <div className="grid2">
                  <Num label="Piede lato A, da faccia A (m)" value={cur.x0} onChange={(x0) => set({ ...cur, x0 })} />
                  <Num label="Altezza (m)" value={cur.h} onChange={(h) => set({ ...cur, h: Math.max(0, h) })} />
                  <Num label="Larghezza alla base (m)" value={cur.base} onChange={(base) => set({ ...cur, base: Math.max(0.1, base) })} />
                  <Num label="Larghezza in sommità (m)" value={cur.top} onChange={(top) => set({ ...cur, top: Math.max(0, top) })} />
                </div>
                <label className="chk"><input type="checkbox" checked={!!cur.wall} onChange={(e) => set({ ...cur, wall: e.target.checked ? { t: 0.3, h: cur.h, at: cur.x0 + cur.base / 2 - 0.15 } : null })} /> Muro in c.a. / mattoni (vale 4 volte il suo spessore di terra)</label>
                {cur.wall && <div className="grid2">
                  <Num label="Spessore muro (m)" step={0.05} value={cur.wall.t} onChange={(t) => set({ ...cur, wall: { ...cur.wall!, t: Math.max(0.05, t) } })} />
                  <Num label="Altezza muro (m)" value={cur.wall.h} onChange={(h) => set({ ...cur, wall: { ...cur.wall!, h } })} />
                  <Num label="Faccia lato A del muro, x (m)" value={cur.wall.at} onChange={(at) => set({ ...cur, wall: { ...cur.wall!, at } })} />
                </div>}
              </fieldset>
              <fieldset>
                <legend>Risultati</legend>
                <p className="hint">5·Q^(1/3) = {fmt1(r!.sep5)} m {r!.individual ? '≤' : '>'} distanza {fmt1(cur.gap)} m{r!.sloping ? ' · terreno in pendenza' : ' · terreno piano'}.</p>
                {r!.checks.map((c, i) => (
                  <div key={i} className="res">
                    <div><b>Linea AB</b> (A sulla catasta {c.from}): {fmt1(c.ab.length)} m di materiale — richiesti 2,4 m <span className={`pill st-${c.ab.ok ? 'ok' : 'ko'}`}>{c.ab.ok ? 'OK' : 'NO'}</span></div>
                    {c.cd ? <div><b>Linea CD</b> (0,30 m sopra AB): {fmt1(c.cd.length)} m — richiesto 1,0 m <span className={`pill st-${c.cd.ok ? 'ok' : 'ko'}`}>{c.cd.ok ? 'OK' : 'NO'}</span></div>
                      : <div className="hint">Linea CD non richiesta.</div>}
                  </div>
                ))}
                <div className="res"><b>Cratere</b>: r = ½·NEQ^(1/3) = {fmt1(r!.crater.r)} m dal centro di A; la barricata è scalzata per {fmt1(r!.crater.undermined)} m, ammessi {fmt1(r!.crater.allowed)} m (1/3 della base)
                  <span className={`pill st-${r!.crater.ok ? 'ok' : 'ko'}`}>{r!.crater.ok ? 'OK' : 'NO'}</span></div>
                {r!.notes.map((n, i) => <p key={i} className="warn">{n}</p>)}
                <p className="hint">Punto A sulla catasta più bassa, in sommità sulla faccia remota (sulla faccia vicina con tetto protettivo); B sullo spigolo superiore vicino dell'altra catasta, come in Fig. 2-2/2-3. Il terreno naturale tra le cataste conta come materiale.</p>
              </fieldset>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
