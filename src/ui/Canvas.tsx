import { useEffect, useMemo, useRef, useState } from 'react';
import { rectCorners, sectorRays, toLocal, type Vec } from '../site/geometry';
import { isRect, magazineLoad, type Magazine, type Project, type SiteObject } from '../site/model';
import { pesScheme, type PairEval, type SiteEval, type Status } from '../site/evaluate';
import type { Safeguard } from '../site/safeguard';
import type { Envelope } from '../site/envelope';
import { fmt1, fmtInt } from './format';

export type Tool =
  | { k: 'select' }
  | { k: 'place'; preset: string }
  | { k: 'line'; preset: string }
  | { k: 'measure' }
  | { k: 'calib' }
  | { k: 'movebg' };

export interface View { x: number; y: number; k: number }   // centro (m) e scala (px/m)

interface Props {
  project: Project;
  site: SiteEval;
  safeguards: Map<string, Safeguard>;
  showLines: boolean;                 // linee dei singoli PES
  envelope: Envelope | null;          // inviluppo di tutte le linee
  envLabel: string;
  selectedId: string | null;
  pair: PairEval | null;
  tool: Tool;
  view: View;
  showSectors: boolean;
  setView: (v: View) => void;
  onSelect: (id: string | null) => void;
  onBeginEdit: () => void;
  onEdit: (fn: (p: Project) => Project) => void;
  onPlace: (preset: string, at: Vec) => void;
  onFinishLine: (preset: string, pts: Vec[]) => void;
  onCalib: (p1: Vec, p2: Vec) => void;
  onToolDone: () => void;
}

type Drag =
  | { k: 'pan'; sx: number; sy: number; v0: View; moved: boolean }
  | { k: 'move'; id: string; w0: Vec; orig: SiteObject; moved: boolean }
  | { k: 'rotate'; id: string; moved: boolean }
  | { k: 'vertex'; id: string; i: number; moved: boolean }
  | { k: 'bg'; w0: Vec; x0: number; y0: number; moved: boolean };

function niceStep(k: number): number {
  const target = 90 / k;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (m * p >= target) return m * p;
  return 10 * p;
}

const STATUS_CLASS: Record<Status, string> = { ok: 'st-ok', ko: 'st-ko', nd: 'st-nd', noqd: 'st-none', acc: 'st-acc', agg: 'st-agg' };

export function Canvas(props: Props) {
  const { project, site, view, tool, selectedId, pair } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Vec | null>(null);
  const [linePts, setLinePts] = useState<Vec[]>([]);
  const [twoPts, setTwoPts] = useState<Vec[]>([]);   // misura / calibrazione

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setLinePts([]); setTwoPts([]); }, [tool]);

  const S = (p: Vec) => ({ x: (p.x - view.x) * view.k + size.w / 2, y: size.h / 2 - (p.y - view.y) * view.k });
  const W = (sx: number, sy: number): Vec => ({ x: (sx - size.w / 2) / view.k + view.x, y: (size.h / 2 - sy) / view.k + view.y });
  const evtW = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    return W(e.clientX - r.left, e.clientY - r.top);
  };
  const pts = (ps: Vec[]) => ps.map((p) => { const s = S(p); return `${s.x.toFixed(1)},${s.y.toFixed(1)}`; }).join(' ');

  // finitura linea con Invio / annullamento con Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,select,textarea')) return;
      if (e.key === 'Escape') { setLinePts([]); setTwoPts([]); props.onToolDone(); }
      if (e.key === 'Enter' && tool.k === 'line' && linePts.length >= 2) { props.onFinishLine(tool.preset, linePts); setLinePts([]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onWheel = (e: React.WheelEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const before = W(sx, sy);
    const k = Math.min(200, Math.max(0.005, view.k * Math.exp(-e.deltaY * 0.0015)));
    // mantiene fermo il punto sotto il cursore
    props.setView({ k, x: before.x - (sx - size.w / 2) / k, y: before.y - (size.h / 2 - sy) / k });
  };

  const objById = (id: string) => project.objects.find((o) => o.id === id);

  const onDown = (e: React.PointerEvent) => {
    const w = evtW(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (e.button === 1 || (e.button === 0 && e.shiftKey && tool.k === 'select')) {
      setDrag({ k: 'pan', sx: e.clientX, sy: e.clientY, v0: view, moved: false }); return;
    }
    if (e.button !== 0) return;
    const t = (e.target as Element).closest('[data-h]') as HTMLElement | SVGElement | null;
    const h = t?.getAttribute('data-h');
    if (tool.k === 'place') { props.onPlace(tool.preset, w); return; }
    if (tool.k === 'line') { setLinePts([...linePts, w]); return; }
    if (tool.k === 'measure' || tool.k === 'calib') {
      const n = twoPts.length >= 2 ? [w] : [...twoPts, w];
      setTwoPts(n);
      if (tool.k === 'calib' && n.length === 2) { props.onCalib(n[0], n[1]); setTwoPts([]); }
      return;
    }
    if (tool.k === 'movebg' && project.background) {
      setDrag({ k: 'bg', w0: w, x0: project.background.x, y0: project.background.y, moved: false }); return;
    }
    if (h?.startsWith('rot:')) { setDrag({ k: 'rotate', id: h.slice(4), moved: false }); return; }
    if (h?.startsWith('vx:')) { const [, id, i] = h.split(':'); setDrag({ k: 'vertex', id, i: +i, moved: false }); return; }
    if (h?.startsWith('obj:')) {
      const id = h.slice(4);
      props.onSelect(id);
      const o = objById(id);
      if (o) setDrag({ k: 'move', id, w0: w, orig: o, moved: false });
      return;
    }
    setDrag({ k: 'pan', sx: e.clientX, sy: e.clientY, v0: view, moved: false });
  };

  const onMove = (e: React.PointerEvent) => {
    const w = evtW(e);
    setHover(w);
    if (!drag) return;
    // la voce di cronologia (annulla) si crea al primo movimento effettivo, non al semplice clic
    if (drag.k !== 'pan' && !drag.moved) { drag.moved = true; props.onBeginEdit(); }
    if (drag.k === 'pan') {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      props.setView({ ...drag.v0, x: drag.v0.x - dx / view.k, y: drag.v0.y + dy / view.k });
    } else if (drag.k === 'move') {
      const dx = w.x - drag.w0.x, dy = w.y - drag.w0.y;
      const o = drag.orig;
      const snap = (x: number) => (e.altKey ? x : Math.round(x * 10) / 10);
      props.onEdit((p) => ({
        ...p, objects: p.objects.map((x) => x.id !== drag.id ? x
          : isRect(o) ? { ...o, cx: snap(o.cx + dx), cy: snap(o.cy + dy) }
          : { ...o, pts: o.pts.map((q) => ({ x: snap(q.x + dx), y: snap(q.y + dy) })) }),
      }));
    } else if (drag.k === 'rotate') {
      const o = objById(drag.id);
      if (!o || !isRect(o)) return;
      let az = (Math.atan2(w.x - o.cx, w.y - o.cy) * 180) / Math.PI;
      az = e.shiftKey ? Math.round(az / 15) * 15 : Math.round(az);
      az = ((az % 360) + 360) % 360;
      props.onEdit((p) => ({ ...p, objects: p.objects.map((x) => (x.id === drag.id ? { ...x, az } : x)) }));
    } else if (drag.k === 'vertex') {
      const q = { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10 };
      props.onEdit((p) => ({
        ...p, objects: p.objects.map((x) => x.id === drag.id && x.kind === 'line' ? { ...x, pts: x.pts.map((v, i) => (i === drag.i ? q : v)) } : x),
      }));
    } else if (drag.k === 'bg') {
      const dx = w.x - drag.w0.x, dy = w.y - drag.w0.y;
      props.onEdit((p) => (p.background ? { ...p, background: { ...p.background, x: drag.x0 + dx, y: drag.y0 + dy } } : p));
    }
  };

  // doppio clic: chiude la linea (i due clic del doppio clic hanno aggiunto vertici coincidenti: si eliminano)
  const onDbl = () => {
    if (tool.k !== 'line') return;
    const tol = 4 / view.k;
    const ded = linePts.filter((p, i) => i === 0 || Math.hypot(p.x - linePts[i - 1].x, p.y - linePts[i - 1].y) > tol);
    if (ded.length >= 2) { props.onFinishLine(tool.preset, ded); setLinePts([]); }
  };

  const onUp = () => {
    if (drag?.k === 'pan' && !drag.moved && tool.k === 'select') props.onSelect(null);
    setDrag(null);
  };

  /* ---- griglia ---- */
  const grid = useMemo(() => {
    const step = niceStep(view.k);
    const minor = step / 5;
    const tl = W(0, 0), br = W(size.w, size.h);
    const lines: JSX.Element[] = [];
    const labels: JSX.Element[] = [];
    if (minor * view.k >= 7) {
      for (let x = Math.ceil(tl.x / minor) * minor; x <= br.x; x += minor) { const s = S({ x, y: 0 }).x; lines.push(<line key={'mx' + x} x1={s} x2={s} y1={0} y2={size.h} className="g-minor" />); }
      for (let y = Math.ceil(br.y / minor) * minor; y <= tl.y; y += minor) { const s = S({ x: 0, y }).y; lines.push(<line key={'my' + y} y1={s} y2={s} x1={0} x2={size.w} className="g-minor" />); }
    }
    for (let x = Math.ceil(tl.x / step) * step; x <= br.x; x += step) {
      const s = S({ x, y: 0 }).x;
      lines.push(<line key={'x' + x} x1={s} x2={s} y1={0} y2={size.h} className={Math.abs(x) < 1e-6 ? 'g-axis' : 'g-major'} />);
      labels.push(<text key={'tx' + x} x={s + 3} y={12} className="g-label">{fmtInt(x)}</text>);
    }
    for (let y = Math.ceil(br.y / step) * step; y <= tl.y; y += step) {
      const s = S({ x: 0, y }).y;
      lines.push(<line key={'y' + y} y1={s} y2={s} x1={0} x2={size.w} className={Math.abs(y) < 1e-6 ? 'g-axis' : 'g-major'} />);
      labels.push(<text key={'ty' + y} x={3} y={s - 3} className="g-label">{fmtInt(y)}</text>);
    }
    return { lines, labels, step };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, size]);

  const bg = project.background;
  const sel = selectedId ? objById(selectedId) : undefined;

  /* ---- settori del magazzino selezionato ---- */
  const sectors: JSX.Element[] = [];
  if (props.showSectors && sel && sel.kind === 'magazine') {
    const m = sel as Magazine;
    const L = Math.max(150, (props.safeguards.get(m.id)?.maxReq ?? 0) * 1.1);
    const schemes = new Map<string, { front: number; rear: number }>();
    for (const eff of ['blast', 'p121'] as const) { const s = pesScheme(m, eff); if (s && (eff === 'blast' || m.hd.startsWith('1.2'))) schemes.set(`${s.front}`, s); }
    if (m.struct === 'ecm' && !schemes.size) schemes.set('150', { front: 150, rear: 135 });
    for (const s of schemes.values()) sectorRays(m, s.front, s.rear, L).forEach(([a, b], i) => {
      const A = S(a), B = S(b);
      sectors.push(<line key={`sr${s.front}-${i}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className={s.front === 100 ? 'sector-ray hd12' : 'sector-ray'} />);
      if (i % 2 === 0) sectors.push(<text key={`st${s.front}-${i}`} x={B.x} y={B.y} className="sector-lbl">{i < 2 ? `${s.front}°` : `${s.rear}°`}</text>);
    });
  }

  /* ---- oggetti ---- */
  const objs = project.objects.map((o) => {
    const st = site.byObject[o.id];
    const cls = `obj obj-${o.kind}${o.kind === 'line' ? ' role-' + o.role : ''} ${st ? STATUS_CLASS[st] : ''} ${o.id === selectedId ? 'sel' : ''}` +
      (pair && (pair.pesId === o.id || pair.esId === o.id) ? ' inpair' : '');
    if (o.kind === 'line') {
      const c = S(o.pts[Math.floor((o.pts.length - 1) / 2)] ?? { x: 0, y: 0 });
      return (
        <g key={o.id} className={cls}>
          <polyline points={pts(o.pts)} className="hit" data-h={'obj:' + o.id} />
          <polyline points={pts(o.pts)} className="shape" />
          <text x={c.x + 4} y={c.y - 5} className="obj-lbl">{o.name}{o.es ? ` · ES ${o.es}` : ''}</text>
          {o.id === selectedId && o.pts.map((p, i) => { const s = S(p); return <rect key={i} x={s.x - 4} y={s.y - 4} width={8} height={8} className="handle" data-h={`vx:${o.id}:${i}`} />; })}
        </g>
      );
    }
    const corners = rectCorners(o);
    const c = S({ x: o.cx, y: o.cy });
    const fl = S(corners[3]), fr = S(corners[2]);
    const fc = { x: (fl.x + fr.x) / 2, y: (fl.y + fr.y) / 2 };
    const dirx = Math.sin((o.az * Math.PI) / 180), diry = -Math.cos((o.az * Math.PI) / 180);   // schermo: y verso il basso
    const isMag = o.kind === 'magazine';
    const m = o as Magazine;
    const directional = isMag && (m.struct === 'ecm' || (m.struct === 'heavy' && m.frontDoor));
    const rot = { x: fc.x + dirx * 22, y: fc.y + diry * 22 };
    const small = Math.max(o.w, o.d) * view.k < 30;
    return (
      <g key={o.id} className={cls}>
        <polygon points={pts(corners)} className="shape" data-h={'obj:' + o.id} />
        {(directional || o.kind === 'building') && <line x1={fl.x} y1={fl.y} x2={fr.x} y2={fr.y} className={directional ? 'door' : 'door-thin'} />}
        {directional && <polygon className="door-arrow" points={`${fc.x + dirx * 9},${fc.y + diry * 9} ${fc.x - diry * 5},${fc.y + dirx * 5} ${fc.x + diry * 5},${fc.y - dirx * 5}`} />}
        <text x={c.x} y={c.y + (small ? -Math.max(o.w, o.d) * view.k / 2 - 6 : 0)} className="obj-lbl c">{o.name}</text>
        {isMag && !small && (() => { const l = magazineLoad(m); const hds = [...new Set(l.totals.map((t) => t.hd))];
          return <text x={c.x} y={c.y + 13} className="obj-sub c">{l.neqQd >= 1 || l.neq14 > 0 ? `HD ${hds.join('+')} · ${fmtInt(l.neqQd + l.neq14)} kg` : 'vuoto'}</text>; })()}
        {o.kind === 'building' && !small && <text x={c.x} y={c.y + 13} className="obj-sub c">ES {o.es}</text>}
        {o.id === selectedId && (
          <>
            <line x1={fc.x} y1={fc.y} x2={rot.x} y2={rot.y} className="rot-stem" />
            <circle cx={rot.x} cy={rot.y} r={6} className="handle rot" data-h={'rot:' + o.id}><title>Ruota (Maiusc = passi di 15°)</title></circle>
          </>
        )}
      </g>
    );
  });

  /* ---- siti unici: collegamenti tra i magazzini uniti ---- */
  const groupEls: JSX.Element[] = [];
  for (const g of site.groups) {
    const ms = g.members.map(objById).filter((o): o is Magazine => !!o && o.kind === 'magazine');
    if (ms.length < 2) continue;
    for (const l of g.links) {
      const a = objById(l.a) as Magazine | undefined, b = objById(l.b) as Magazine | undefined;
      if (!a || !b) continue;
      const A = S({ x: a.cx, y: a.cy }), B = S({ x: b.cx, y: b.cy });
      groupEls.push(<line key={`gl${l.pair}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className="group-link" />);
    }
    const cx = ms.reduce((s, m) => s + m.cx, 0) / ms.length, cy = Math.max(...ms.map((m) => m.cy + Math.max(m.w, m.d) / 2));
    const C = S({ x: cx, y: cy });
    groupEls.push(<text key={`gt${g.id}`} x={C.x} y={C.y - 16} className="group-lbl c">{`Sito unico · ${fmtInt(g.load.neqQd)} kg`}</text>);
  }

  /* ---- linee di salvaguardia ---- */
  const sgs: JSX.Element[] = [];
  let sgi = 0;
  if (props.showLines) props.safeguards.forEach((sg, id) => {
    const m = objById(id) as Magazine | undefined;
    if (!m || !sg.pts.length) return;
    // etichette distribuite a direzioni diverse (i contorni sono raggi equispaziati da nord) per non sovrapporsi
    const t = S(id === selectedId ? sg.pts[0] : sg.pts[Math.round(((sgi++ * 29) % 360) / 360 * sg.pts.length) % sg.pts.length]);
    sgs.push(
      <g key={'sg' + id} className={`safeguard ${id === selectedId ? 'sel' : ''}`}>
        <polygon points={pts(sg.pts)} />
        <text x={t.x} y={t.y - 5} className="sg-lbl c">{`${sg.esRow === '24' ? 'IBD' : 'ES ' + sg.esRow} ${m.name}: ${sg.label}${sg.unknown ? ' (parz.)' : ''}`}</text>
      </g>,
    );
  });

  if (props.envelope && props.envelope.rings.length) {
    const d = props.envelope.rings.map((r) => 'M' + r.map((q) => { const s = S(q); return `${s.x.toFixed(1)},${s.y.toFixed(1)}`; }).join('L') + 'Z').join(' ');
    const top = props.envelope.rings.flat().reduce((a, q) => (q.y > a.y ? q : a));
    const t = S(top);
    sgs.push(
      <g key="envelope" className="envelope">
        <path d={d} />
        <text x={t.x} y={t.y - 6} className="env-lbl c">{`Inviluppo ${props.envLabel}`}</text>
      </g>,
    );
  }

  /* ---- coppia selezionata ---- */
  let pairEl: JSX.Element | null = null;
  if (pair) {
    const g = pair.gov;
    const a = S(g ? g.pa : pair.pa), b = S(g ? g.pb : pair.pb);
    const d = g ? g.dist : pair.dist;
    pairEl = (
      <g className={`pairline ${STATUS_CLASS[pair.status]}`}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        <circle cx={a.x} cy={a.y} r={3} /><circle cx={b.x} cy={b.y} r={3} />
        <text x={(a.x + b.x) / 2 + 6} y={(a.y + b.y) / 2 - 6} className="pair-lbl">
          {`${fmt1(d)} m${g?.req != null ? ` / richiesti ${fmtInt(g.req)} m` : ''}`}
        </text>
      </g>
    );
  }

  /* ---- anteprime strumenti ---- */
  const preview: JSX.Element[] = [];
  if (tool.k === 'line' && linePts.length) {
    const all = hover ? [...linePts, hover] : linePts;
    preview.push(<polyline key="lp" points={pts(all)} className="preview" />);
  }
  if ((tool.k === 'measure' || tool.k === 'calib') && twoPts.length) {
    const p2 = twoPts[1] ?? hover;
    if (p2) {
      const a = S(twoPts[0]), b = S(p2);
      const d = Math.hypot(p2.x - twoPts[0].x, p2.y - twoPts[0].y);
      preview.push(<g key="ms" className="measure"><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} /><circle cx={a.x} cy={a.y} r={3} /><circle cx={b.x} cy={b.y} r={3} />
        <text x={(a.x + b.x) / 2 + 6} y={(a.y + b.y) / 2 - 6}>{fmt1(d)} m</text></g>);
    }
  }

  // scala grafica
  const sb = grid.step, sbPx = sb * view.k;
  const cursor = tool.k === 'select' ? (drag?.k === 'pan' ? 'grabbing' : 'default') : tool.k === 'movebg' ? 'move' : 'crosshair';

  let hoverInfo = '';
  if (hover) {
    hoverInfo = `x ${fmt1(hover.x)}  y ${fmt1(hover.y)} m`;
    if (sel && isRect(sel)) { const l = toLocal(sel, hover); hoverInfo += `   ·  locale ${sel.name}: ${fmt1(l.x)}, ${fmt1(l.y)}`; }
  }

  return (
    <div className="canvas" ref={wrap} style={{ cursor }}>
      <svg width={size.w} height={size.h} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDbl} onPointerLeave={() => setHover(null)}>
        <rect width={size.w} height={size.h} className="paper" />
        {bg && (() => { const tl = S({ x: bg.x, y: bg.y }); return (
          <image href={bg.dataUrl} x={tl.x} y={tl.y} width={bg.pxW * bg.mPerPx * view.k} height={bg.pxH * bg.mPerPx * view.k} opacity={bg.opacity} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />
        ); })()}
        <g className="grid">{grid.lines}</g>
        {sgs}
        {sectors}
        {groupEls}
        {objs}
        {pairEl}
        {preview}
        <g className="grid-labels">{grid.labels}</g>
        <g className="scalebar" transform={`translate(16 ${size.h - 22})`}>
          <rect x={0} y={0} width={sbPx} height={5} /><rect x={0} y={0} width={sbPx / 2} height={5} className="alt" />
          <text x={sbPx + 6} y={6}>{fmtInt(sb)} m</text>
        </g>
        <g className="north" transform={`translate(${size.w - 26} 34)`}>
          <polygon points="0,-16 6,6 0,2 -6,6" /><text x={0} y={20} className="c">N</text>
        </g>
      </svg>
      <div className="canvas-status">
        <span>{hoverInfo}</span>
        <span>{tool.k === 'line' ? 'Clic per aggiungere vertici · doppio clic o Invio per finire · Esc annulla'
          : tool.k === 'place' ? 'Clic sulla planimetria per posizionare · Esc annulla'
          : tool.k === 'measure' ? 'Misura: clic su due punti'
          : tool.k === 'calib' ? 'Calibrazione: clic su due punti di distanza nota del disegno'
          : tool.k === 'movebg' ? 'Trascina lo sfondo'
          : 'Trascina per spostare · rotella per zoom · trascina il vuoto per muovere la vista'}</span>
      </div>
    </div>
  );
}
