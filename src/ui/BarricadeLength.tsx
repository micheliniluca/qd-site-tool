/* Verifica in pianta della lunghezza di una barricata tra due magazzini (Part II §2.2.3.2, Fig. 2-4). */
import { useState } from 'react';
import { checkLength } from '../site/barricade';
import type { Line, Magazine, Project } from '../site/model';
import { fmt1 } from './format';

export function BarricadeLength({ line, project }: { line: Line; project: Project }) {
  const mags = project.objects.filter((o): o is Magazine => o.kind === 'magazine');
  const [a, setA] = useState(mags[0]?.id ?? '');
  const [b, setB] = useState(mags[1]?.id ?? '');
  const ma = mags.find((m) => m.id === a), mb = mags.find((m) => m.id === b);
  const r = ma && mb && ma !== mb ? checkLength(ma, mb, line.pts) : null;
  return (
    <fieldset>
      <legend>Lunghezza della barricata (Fig. 2-4)</legend>
      <div className="row-btns">
        <select value={a} onChange={(e) => setA(e.target.value)}>{mags.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <span>↔</span>
        <select value={b} onChange={(e) => setB(e.target.value)}>{mags.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      </div>
      {r && <>
        <p><span className={`pill st-${r.ok ? 'ok' : 'ko'}`}>{r.ok ? 'OK' : 'NO'}</span> {r.note}</p>
        <ul className="mini">{r.sides.map((s, i) => <li key={i}>Retta {i + 1}: {s.hit ? `la barricata prosegue ${fmt1(s.beyond)} m oltre (richiesti 1,0 m)` : 'non intercettata'}</li>)}</ul>
      </>}
      <p className="hint">Le rette congiungono gli estremi delle due cataste (lati dell'inviluppo convesso). Altezza e spessore si verificano nella vista “Barricate”.</p>
    </fieldset>
  );
}
