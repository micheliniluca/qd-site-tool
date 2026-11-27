import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DRAFT_NOTICE, NORM_EDITION } from '../engine';
import type { EsRow } from '../engine/matrix';
import { evaluateSite, isPes, pairKey } from '../site/evaluate';
import { emptyProject, isRect, newId, parseProject, PRESETS, serialize, type Item, type Magazine, type PairChoice, type Project, type Risk, type SharedCover, type SiteObject } from '../site/model';
import type { Fill } from '../site/capacity';
import { downloadTemplate, exportInventory, readInventoryFile } from './inventoryExcel';
import { ImportDialog, type ImportPreview } from './ImportDialog';
import { Management } from './Management';
import { useDialog } from './dialog';
import { BarricadeView } from './BarricadeView';
import { PrintView } from './PrintView';
import { RevisionsView } from './RevisionsView';
import { HelpView } from './HelpView';
import { downloadBlob, safeName } from './download';
import { downloadWorkbook } from '../site/workbook';
import { buildDxf } from '../site/dxf';
import { buildReportHtml } from '../site/report';
import { safeguard, type Safeguard } from '../site/safeguard';
import { envelope } from '../site/envelope';
import type { Vec } from '../site/geometry';
import { calibrate, loadBackground, pdfPageCount } from './background';
import { Canvas, type Tool, type View } from './Canvas';
import { demoProject } from './demo';
import { Inspector } from './Inspector';
import { PairDetail, PairsTable, SiteCard } from './Results';

const LS_KEY = 'qd-site-tool:project';

interface Hist { past: Project[]; present: Project; future: Project[] }

function loadInitial(): Project {
  try { const s = localStorage.getItem(LS_KEY); if (s) return parseProject(s); } catch { /* storage non disponibile */ }
  return demoProject();
}

function fitView(p: Project, w = 900, h = 600): View {
  const xs: number[] = [], ys: number[] = [];
  for (const o of p.objects) {
    if (isRect(o)) { xs.push(o.cx - o.w, o.cx + o.w); ys.push(o.cy - o.d, o.cy + o.d); }
    else for (const q of o.pts) { xs.push(q.x); ys.push(q.y); }
  }
  if (!xs.length) return { x: 0, y: 0, k: 1 };
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min(w / Math.max(50, x1 - x0), h / Math.max(50, y1 - y0)) * 0.85;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, k };
}

export function App() {
  const [hist, setHist] = useState<Hist>(() => ({ past: [], present: loadInitial(), future: [] }));
  const project = hist.present;
  const [view, setView] = useState<View>(() => project.view ?? fitView(project));
  const [tool, setTool] = useState<Tool>({ k: 'select' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pairSel, setPairSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'obj' | 'pair' | 'site' | 'mgmt'>('site');
  const [viewMode, setViewMode] = useState<'plan' | 'barricate' | 'stampa' | 'revisioni' | 'help'>('plan');
  const docsRef = useRef<HTMLDetailsElement>(null);
  const [fills, setFills] = useState<Map<string, Fill> | null>(null);
  const [importPrev, setImportPrev] = useState<ImportPreview | null>(null);
  const invRef = useRef<HTMLInputElement>(null);
  const ask = useDialog();
  const [showSg, setShowSg] = useState(true);
  const [sgRow, setSgRow] = useState<EsRow>('24');
  const [showSectors, setShowSectors] = useState(true);
  const [showEnv, setShowEnv] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);

  /* ---- storia (annulla / ripeti) ---- */
  const beginEdit = useCallback(() => setHist((h) => ({ past: [...h.past.slice(-99), h.present], present: h.present, future: [] })), []);
  const edit = useCallback((fn: (p: Project) => Project) => setHist((h) => ({ ...h, present: fn(h.present) })), []);
  const commit = useCallback((fn: (p: Project) => Project) => setHist((h) => ({ past: [...h.past.slice(-99), h.present], present: fn(h.present), future: [] })), []);
  const undo = () => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h));
  const redo = () => setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));

  /* ---- salvataggio automatico nel browser ---- */
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, serialize({ ...project, view })); }
      catch { try { localStorage.setItem(LS_KEY, serialize({ ...project, background: null, view })); } catch { /* ignora */ } }
    }, 600);
    return () => clearTimeout(t);
  }, [project, view]);

  /* ---- calcolo ---- */
  const site = useMemo(() => evaluateSite(project), [project.objects, project.choices, project.sharedCover, project.risks, project.options]); // eslint-disable-line react-hooks/exhaustive-deps
  const safeguards = useMemo(() => {
    const m = new Map<string, Safeguard>();
    // per i siti unici la linea di ogni magazzino usa il contenuto aggregato
    if (showSg || showEnv) for (const o of project.objects) if (isPes(o)) m.set(o.id, safeguard(o, sgRow, 360, site.groupOf.get(o.id)?.load.cases));
    return m;
  }, [project.objects, showSg, showEnv, sgRow, site]);
  const env = useMemo(() => (showEnv ? envelope([...safeguards.values()].map((s) => s.pts)) : null), [showEnv, safeguards]);
  // nei documenti (tavola, DXF, relazione) vanno solo le linee visibili a schermo
  const shownSg = useMemo(() => (showSg ? safeguards : new Map<string, Safeguard>()), [showSg, safeguards]);
  // i risultati di riempimento non sono più validi dopo una modifica
  useEffect(() => { setFills(null); }, [project.objects, project.sharedCover, project.options.aggregate]);

  const pair = pairSel ? site.pairs.find((p) => p.key === pairSel) ?? null : null;
  const sel = selectedId ? project.objects.find((o) => o.id === selectedId) : undefined;

  /* ---- azioni ---- */
  const nextName = (kind: SiteObject['kind']) => {
    const pre = kind === 'magazine' ? 'M' : kind === 'building' ? 'E' : 'L';
    let n = 1;
    const names = new Set(project.objects.map((o) => o.name));
    while (names.has(pre + n)) n++;
    return pre + n;
  };
  const place = (presetId: string, at: Vec) => {
    const pr = PRESETS.find((p) => p.id === presetId)!;
    const probe = pr.make(at, '');
    const o = pr.make({ x: Math.round(at.x), y: Math.round(at.y) }, nextName(probe.kind));
    commit((p) => ({ ...p, objects: [...p.objects, o] }));
    setSelectedId(o.id); setTab('obj'); setTool({ k: 'select' });
  };
  const finishLine = (presetId: string, pts: Vec[]) => {
    const pr = PRESETS.find((p) => p.id === presetId)!;
    const o = { ...pr.make(pts[0], nextName('line')), pts: pts.map((q) => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 })) } as SiteObject;
    commit((p) => ({ ...p, objects: [...p.objects, o] }));
    setSelectedId(o.id); setTab('obj'); setTool({ k: 'select' });
  };
  const pickPreset = (id: string) => {
    const pr = PRESETS.find((p) => p.id === id)!;
    setTool(pr.group.startsWith('Linee') || pr.group === 'Altro' ? { k: 'line', preset: id } : { k: 'place', preset: id });
  };
  const changeObj = (o: SiteObject) => commit((p) => ({ ...p, objects: p.objects.map((x) => (x.id === o.id ? o : x)) }));
  const deleteSel = () => {
    if (!selectedId) return;
    commit((p) => ({ ...p, objects: p.objects.filter((o) => o.id !== selectedId),
      choices: Object.fromEntries(Object.entries(p.choices).filter(([k]) => !k.split('>').includes(selectedId))) }));
    setSelectedId(null); setPairSel(null);
  };
  const duplicateSel = () => {
    if (!sel) return;
    const c = isRect(sel) ? { ...sel, id: newId(sel.kind[0]), name: nextName(sel.kind), cx: sel.cx + sel.w + 10 }
      : { ...sel, id: newId('l'), name: nextName('line'), pts: sel.pts.map((q) => ({ x: q.x + 20, y: q.y - 20 })) };
    commit((p) => ({ ...p, objects: [...p.objects, c as SiteObject] }));
    setSelectedId(c.id);
  };
  const setRisk = (key: string, r: Risk | null) => commit((p) => {
    const risks = { ...p.risks };
    if (r) risks[key] = r; else delete risks[key];
    return { ...p, risks };
  });
  const setShared = (list: SharedCover[]) => commit((p) => ({ ...p, sharedCover: list }));
  const setOptions = (o: Partial<Project['options']>) => commit((p) => ({ ...p, options: { ...p.options, ...o } }));
  const openInventory = async (f: File) => {
    try { setImportPrev({ ...(await readInventoryFile(f)), file: f.name }); }
    catch (e) { setMsg(`Errore nella lettura del file: ${(e as Error).message}`); }
  };
  const applyImport = (byMag: Map<string, Item[]>) => {
    commit((p) => ({ ...p, objects: p.objects.map((o) => (byMag.has(o.id) ? { ...(o as Magazine), contentMode: 'inventory', items: byMag.get(o.id)! } : o)) }));
    setMsg(`Inventario importato in ${byMag.size} magazzini.`);
    setImportPrev(null);
  };
  const setChoice = (key: string, c: PairChoice) => commit((p) => {
    const choices = { ...p.choices };
    if (Object.keys(c.idx).length) choices[key] = c; else delete choices[key];
    return { ...p, choices };
  });

  const saveJson = () => {
    const blob = new Blob([serialize({ ...project, view })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/[^\w\-]+/g, '_') || 'sito'}.qdsite.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const openJson = async (f: File) => {
    try {
      const p = parseProject(await f.text());
      setHist({ past: [], present: p, future: [] });
      setView(p.view ?? fitView(p));
      setSelectedId(null); setPairSel(null); setTab('site');
      setMsg(`Aperto: ${f.name}`);
    } catch (e) { setMsg(`Errore: ${(e as Error).message}`); }
  };
  const loadBg = async (f: File) => {
    try {
      let page = 1;
      if (/\.pdf$/i.test(f.name)) {
        const n = await pdfPageCount(f);
        if (n > 1) {
          const r = await ask({ title: 'Pagina del PDF', message: `Il PDF ha ${n} pagine. Quale pagina usare come sfondo?`, fields: [{ key: 'p', label: 'Pagina', type: 'number', value: '1', required: true }], ok: 'Carica' });
          if (!r) return;
          page = Math.min(n, Math.max(1, parseInt(r.p, 10) || 1));
        }
      }
      setMsg('Caricamento dello sfondo…');
      const widthM = Math.round(1000 / view.k * 0.8) || 500;
      const bg = await loadBackground(f, { x: view.x, y: view.y }, widthM, page);
      commit((p) => ({ ...p, background: bg }));
      setMsg('Sfondo caricato con scala provvisoria: usa “Calibra” cliccando due punti di distanza nota.');
      setTool({ k: 'calib' });
    } catch (e) { setMsg(`Errore nel caricamento dello sfondo: ${(e as Error).message}`); }
  };
  const onCalib = async (p1: Vec, p2: Vec) => {
    if (!project.background) { setMsg('Nessuno sfondo da calibrare.'); return; }
    const measured = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const r = await ask({ title: 'Calibrazione dello sfondo', message: `Sul disegno i due punti distano ora ${measured.toFixed(2)} m. Indica la distanza reale: il primo punto resta fermo.`,
      fields: [{ key: 'd', label: 'Distanza reale (m)', value: measured.toFixed(2), required: true }], ok: 'Calibra' });
    const real = r ? parseFloat(r.d.replace(',', '.')) : NaN;
    if (!(real > 0)) return;
    commit((p) => ({ ...p, background: calibrate(p.background!, p1, p2, real) }));
    setMsg(`Sfondo calibrato: ${real} m tra i due punti.`);
    setTool({ k: 'select' });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,select,textarea')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); deleteSel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sgLabel = sgRow === '24' ? 'IBD (ES 24)' : sgRow === '25' ? 'costruzioni vulnerabili (ES 25)' : `PTRD (ES ${sgRow})`;
  const makeReport = async () => {
    const r = await ask({ title: 'Relazione QD e bozza di licenza', message: 'Si genera un file HTML autonomo (da aprire nel browser e stampare in PDF). Il calcolo del NEQ ammesso può richiedere qualche secondo.',
      fields: [{ key: 'author', label: 'Redatto da (nome e ruolo)' }], ok: 'Genera' });
    if (!r) return;
    setMsg('Generazione della relazione…');
    await new Promise((res) => setTimeout(res, 30));
    downloadBlob(`${safeName(project.name)}_relazione_QD_BOZZA.html`, buildReportHtml(project, shownSg, { author: r.author, fills: fills ?? undefined }), 'text/html');
    setMsg('Relazione scaricata (BOZZA).');
  };
  const groups = [...new Set(PRESETS.map((p) => p.group))];
  const activePreset = tool.k === 'place' || tool.k === 'line' ? tool.preset : null;
  const pes = pair ? (project.objects.find((o) => o.id === pair.pesId) as Magazine) : null;
  const esObj = pair ? project.objects.find((o) => o.id === pair.esId) : null;

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><b>QD Sito</b><span>{NORM_EDITION}</span></div>
        <input className="pname" value={project.name} onChange={(e) => edit((p) => ({ ...p, name: e.target.value }))} onFocus={beginEdit} title="Nome del sito" />
        <nav className="views">
          {([['plan', 'Planimetria'], ['barricate', 'Barricate'], ['stampa', 'Tavola in scala'], ['revisioni', 'Revisioni'], ['help', 'Help']] as const).map(([k, l]) => (
            <button key={k} className={viewMode === k ? 'on' : ''} onClick={() => setViewMode(k)}>{l}</button>
          ))}
        </nav>
        <div className="tb">
          <button onClick={async () => {
            const r = await ask({ title: 'Nuovo progetto', message: 'Si apre un progetto vuoto. Il progetto attuale resta recuperabile con “Annulla” finché la pagina è aperta; per conservarlo usa prima “Salva JSON”.', ok: 'Nuovo progetto vuoto', danger: true });
            if (!r) return;
            commit(() => emptyProject()); setView({ x: 0, y: 0, k: 1 }); setSelectedId(null); setPairSel(null); setTab('site'); setViewMode('plan');
          }}>Nuovo</button>
          <button onClick={() => fileRef.current?.click()}>Apri…</button>
          <button onClick={saveJson}>Salva JSON</button>
          <button onClick={() => { commit(() => demoProject()); setView(fitView(demoProject())); setSelectedId(null); setPairSel(null); }}>Esempio</button>
          <span className="sep" />
          <button onClick={undo} disabled={!hist.past.length} title="Ctrl+Z">Annulla</button>
          <button onClick={redo} disabled={!hist.future.length} title="Ctrl+Y">Ripeti</button>
          <span className="sep" />
          <details className="menu" ref={docsRef}>
            <summary>Documenti</summary>
            <div className="menu-list" onClick={() => docsRef.current?.removeAttribute('open')}>
              <button onClick={() => { downloadWorkbook(project); setMsg('Excel di verifica scaricato (BOZZA).'); }}>Excel di verifica (formule aperte)</button>
              <button onClick={() => { downloadBlob(`${safeName(project.name)}_QD_BOZZA.dxf`, buildDxf(project, site, shownSg, env), 'application/dxf'); setMsg(`DXF scaricato con le linee ${sgLabel}.`); }}>DXF con linee etichettate</button>
              <button onClick={makeReport}>Relazione e bozza di licenza (HTML)</button>
              <button onClick={() => setViewMode('stampa')}>Tavola stampabile in scala…</button>
              <hr />
              <button onClick={() => invRef.current?.click()}>Importa inventario da Excel…</button>
              <button onClick={downloadTemplate}>Modello Excel dell’inventario</button>
              <button onClick={() => exportInventory(project)}>Esporta inventario</button>
            </div>
          </details>
        </div>
        {viewMode === 'plan' && <div className="tb tb2">
          <button onClick={() => bgRef.current?.click()} title="Immagine o PDF della planimetria">Sfondo…</button>
          {project.background && <>
            <button className={tool.k === 'calib' ? 'on' : ''} onClick={() => setTool(tool.k === 'calib' ? { k: 'select' } : { k: 'calib' })}>Calibra</button>
            <button className={tool.k === 'movebg' ? 'on' : ''} onClick={() => setTool(tool.k === 'movebg' ? { k: 'select' } : { k: 'movebg' })}>Sposta sfondo</button>
            <input type="range" min={0.1} max={1} step={0.05} value={project.background.opacity} title="Opacità dello sfondo"
              onChange={(e) => edit((p) => ({ ...p, background: { ...p.background!, opacity: +e.target.value } }))} />
            <button onClick={() => commit((p) => ({ ...p, background: null }))}>Rimuovi sfondo</button>
          </>}
          <span className="sep" />
          <button className={tool.k === 'measure' ? 'on' : ''} onClick={() => setTool(tool.k === 'measure' ? { k: 'select' } : { k: 'measure' })}>Misura</button>
          <button onClick={() => setView(fitView(project, 900, 560))}>Adatta vista</button>
          <span className="sep" />
          <label className="chk"><input type="checkbox" checked={showSg} onChange={(e) => setShowSg(e.target.checked)} /> Linee</label>
          <label className="chk" title="Contorno dell'unione di tutte le linee (zona di salvaguardia combinata)"><input type="checkbox" checked={showEnv} onChange={(e) => setShowEnv(e.target.checked)} /> Inviluppo</label>
          <select value={sgRow} onChange={(e) => setSgRow(e.target.value as EsRow)} disabled={!showSg && !showEnv} title="Linea di salvaguardia da tracciare">
            <option value="24">IBD (ES 24)</option><option value="25">Costruzioni vulnerabili (ES 25)</option>
            <option value="21">PTRD bassa densità (ES 21)</option><option value="22">PTRD media densità (ES 22)</option><option value="23">PTRD alta densità (ES 23)</option>
          </select>
          <label className="chk"><input type="checkbox" checked={showSectors} onChange={(e) => setShowSectors(e.target.checked)} /> Settori</label>
        </div>}
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openJson(f); e.target.value = ''; }} />
        <input ref={invRef} type="file" accept=".xlsx,.xls,.csv,.ods" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openInventory(f); e.target.value = ''; }} />
        <input ref={bgRef} type="file" accept="image/*,.pdf,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadBg(f); e.target.value = ''; }} />
      </header>
      <div className="draft">{DRAFT_NOTICE} · {NORM_EDITION}</div>
      {msg && <div className="msg" onClick={() => setMsg(null)}>{msg} <span>✕</span></div>}

      {viewMode === 'barricate' && <BarricadeView project={project} onChange={(list) => commit((p) => ({ ...p, barricadeSections: list }))} />}
      {viewMode === 'stampa' && <PrintView project={project} site={site} safeguards={shownSg} envelope={env} sgLabel={sgLabel} />}
      {viewMode === 'revisioni' && <RevisionsView project={project} commit={commit} />}
      {viewMode === 'help' && <HelpView />}
      <div className="main" hidden={viewMode !== 'plan'}>
        <aside className="palette">
          <button className={`tool ${tool.k === 'select' ? 'on' : ''}`} onClick={() => setTool({ k: 'select' })}>Seleziona / sposta</button>
          {groups.map((g) => (
            <div key={g} className="pgroup">
              <div className="pgh">{g}</div>
              {PRESETS.filter((p) => p.group === g).map((p) => (
                <button key={p.id} className={`preset ${activePreset === p.id ? 'on' : ''}`} onClick={() => pickPreset(p.id)} title={p.hint}>
                  <span>{p.label}</span><small>{p.hint}</small>
                </button>
              ))}
            </div>
          ))}
        </aside>

        <section className="center">
          <Canvas
            project={project} site={site} safeguards={safeguards} showLines={showSg} envelope={env} envLabel={sgLabel} selectedId={selectedId} pair={pair} tool={tool} view={view}
            showSectors={showSectors} setView={setView}
            onSelect={(id) => { setSelectedId(id); if (id) setTab('obj'); }}
            onBeginEdit={beginEdit} onEdit={edit} onPlace={place} onFinishLine={finishLine} onCalib={onCalib}
            onToolDone={() => setTool({ k: 'select' })}
          />
          <PairsTable project={project} site={site} selectedPair={pairSel} selectedId={selectedId}
            onPick={(k) => { setPairSel(k === pairSel ? null : k); setTab('pair'); }} />
        </section>

        <aside className="side">
          <nav className="tabs">
            <button className={tab === 'obj' ? 'on' : ''} onClick={() => setTab('obj')}>Oggetto</button>
            <button className={tab === 'pair' ? 'on' : ''} onClick={() => setTab('pair')}>Coppia</button>
            <button className={tab === 'site' ? 'on' : ''} onClick={() => setTab('site')}>Scheda sito</button>
            <button className={tab === 'mgmt' ? 'on' : ''} onClick={() => setTab('mgmt')}>Gestione</button>
          </nav>
          <div className="side-body">
            {tab === 'obj' && (sel
              ? <Inspector key={sel.id} obj={sel} site={site} project={project} fill={fills?.get(sel.id)} onChange={changeObj} onDelete={deleteSel} onDuplicate={duplicateSel} onRisk={setRisk} onShared={setShared} />
              : <p className="hint pad">Seleziona un oggetto sulla planimetria, oppure scegli un tipo dal menù a sinistra e clicca sulla planimetria per inserirlo.</p>)}
            {tab === 'pair' && (pair && pes && esObj
              ? <PairDetail pair={pair} pes={pes} es={esObj} choice={project.choices[pairKey(pair.pesId, pair.esId)]} onChoice={(c) => setChoice(pair.key, c)}
                  project={project} group={site.groupOf.get(pair.pesId)} onRisk={setRisk} />
              : <p className="hint pad">Seleziona una riga nella tabella delle coppie per vederne la spiegazione.</p>)}
            {tab === 'mgmt' && <Management project={project} fills={fills} setFills={setFills}
              onSelect={(id) => { setSelectedId(id); }} onPick={(k) => { setPairSel(k); setTab('pair'); }}
              onOptions={setOptions} onRemoveRisk={(k) => setRisk(k, null)} />}
            {tab === 'site' && <SiteCard project={project} site={site} onPick={(k) => { setPairSel(k); setTab('pair'); }} onSelect={(id) => { setSelectedId(id); setTab('obj'); }} />}
          </div>
        </aside>
      </div>
      {importPrev && <ImportDialog project={project} preview={importPrev} onApply={applyImport} onClose={() => setImportPrev(null)} />}
    </div>
  );
}
