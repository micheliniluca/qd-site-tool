/* Vista "Stampa": tavola in scala esatta (SVG in mm), da stampare o scaricare. */
import { useMemo, useState } from 'react';
import type { SiteEval } from '../site/evaluate';
import type { Project } from '../site/model';
import { buildPrintSvg, fitScale, PAPERS, SCALES } from '../site/printSheet';
import type { Safeguard } from '../site/safeguard';
import type { Envelope } from '../site/envelope';
import { downloadBlob, safeName } from './download';

interface Props { project: Project; site: SiteEval; safeguards: Map<string, Safeguard>; envelope: Envelope | null; sgLabel: string }

export function PrintView({ project, site, safeguards, envelope, sgLabel }: Props) {
  const [paper, setPaper] = useState('A3');
  const [landscape, setLandscape] = useState(true);
  const auto = useMemo(() => fitScale(project, { paper, landscape }, safeguards, envelope), [project, paper, landscape, safeguards, envelope]);
  const [scale, setScale] = useState<number | null>(null);
  const [author, setAuthor] = useState('');
  const sc = scale ?? auto.scale;
  const svg = useMemo(() => buildPrintSvg(project, site, safeguards, { paper, landscape, scale: sc, center: auto.center, title: project.name, sgLabel, author, envelope }),
    [project, site, safeguards, envelope, paper, landscape, sc, auto.center, sgLabel, author]);
  const [W, H] = landscape ? PAPERS[paper] : [PAPERS[paper][1], PAPERS[paper][0]];
  const print = () => {
    const style = document.createElement('style');
    style.id = 'print-page';
    style.textContent = `@page { size: ${W}mm ${H}mm; margin: 0 }`;
    document.getElementById('print-page')?.remove();
    document.head.appendChild(style);
    window.print();
  };
  return (
    <div className="view stampa">
      <aside className="view-side">
        <h3>Tavola in scala</h3>
        <label className="fld"><span>Formato</span><select value={paper} onChange={(e) => { setPaper(e.target.value); setScale(null); }}>{Object.keys(PAPERS).map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="chk"><input type="checkbox" checked={landscape} onChange={(e) => { setLandscape(e.target.checked); setScale(null); }} /> Orizzontale</label>
        <label className="fld"><span>Scala</span>
          <select value={sc} onChange={(e) => setScale(+e.target.value)}>
            {[...new Set([...SCALES, auto.scale])].sort((a, b) => a - b).map((s) => <option key={s} value={s}>1:{s}{s === auto.scale ? ' (adatta)' : ''}</option>)}
          </select>
        </label>
        <label className="fld"><span>Redatto da</span><input value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
        <p className="hint">Linee tracciate: {sgLabel} (si cambiano dalla barra della planimetria). Centro: baricentro del sito.</p>
        <div className="row-btns">
          <button className="on" onClick={print}>Stampa…</button>
          <button onClick={() => downloadBlob(`${safeName(project.name)}_tavola_1-${sc}_${paper}.svg`, svg, 'image/svg+xml')}>Scarica SVG</button>
        </div>
        <p className="hint">Stampare al 100% (senza “adatta alla pagina”). L'SVG ha le dimensioni reali del foglio in millimetri: 1 m = {(1000 / sc).toFixed(2)} mm.</p>
      </aside>
      <div className="view-main print-preview">
        <div className="print-sheet" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  );
}
