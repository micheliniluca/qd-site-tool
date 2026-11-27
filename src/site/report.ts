/* Relazione QD in HTML autonomo: dati del sito, siti unici, scheda QD di ogni magazzino, coppie non conformi,
   rischi accettati e bozza della licenza dei limiti (NEQ ammesso per magazzino). Tutto marcato BOZZA. */
import { optLabel } from '../engine/cell';
import { EFFNAME, needsMce } from '../engine/matrix';
import { checkCompat, TABLE4 } from '../engine/mixing';
import { fillOf, type Fill } from './capacity';
import { evaluateSite, SECTOR_IT, type PairEval, type SiteEval } from './evaluate';
import { ECM_NAME, magazineCgs, magazineLoad, STRUCT_NAME, type Magazine, type Project } from './model';
import { buildPrintSvg, fitScale } from './printSheet';
import type { Safeguard } from './safeguard';

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const kg = (x: number) => `${Math.round(x).toLocaleString('it-IT')} kg`;
const m1 = (x: number) => `${x.toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} m`;
const ST: Record<string, string> = { ok: 'Conforme', ko: 'NON conforme', nd: 'Da verificare', noqd: 'Nessuna QD', acc: 'Rischio accettato', agg: 'Stesso sito unico' };

function pairRow(p: Project, pr: PairEval, name: (id: string) => string): string {
  const g = pr.gov;
  return `<tr class="${pr.status}"><td>${esc(name(pr.pesId))}</td><td>${esc(name(pr.esId))}</td><td>${g ? `HD ${g.load.hd}, ${kg(g.load.neq)}` : ''}</td>
    <td>${g ? (g.extra ? esc(g.extra) : `${esc(EFFNAME[g.eff])}${g.pesSector ? ' · ' + SECTOR_IT[g.pesSector] : ''}`) : ''}</td>
    <td>${g && g.col >= 0 ? `T${pr.table} (${g.colCode}) · ES ${g.es.row}` : '—'}</td><td>${g?.res.o ? esc(optLabel(g.res.o)) : '—'}</td>
    <td class="r">${g?.req != null ? `${g.req} m` : 'n.d.'}</td><td class="r">${g ? m1(g.dist) : ''}</td><td>${ST[pr.status]}${p.risks[`pair:${pr.key}`] ? ' *' : ''}</td></tr>`;
}
const PAIR_HEAD = '<tr><th>PES</th><th>ES</th><th>Caso</th><th>Effetto · settore</th><th>Cella</th><th>Formula</th><th class="r">Richiesta</th><th class="r">Misurata</th><th>Esito</th></tr>';

export function buildReportHtml(p: Project, safeguards: Map<string, Safeguard>, opts: { author?: string; fills?: Map<string, Fill> } = {}): string {
  const site: SiteEval = evaluateSite(p);
  const name = (id: string) => p.objects.find((o) => o.id === id)?.name ?? '?';
  const mags = p.objects.filter((o): o is Magazine => o.kind === 'magazine');
  const fills = opts.fills ?? new Map(mags.filter((m) => magazineLoad(m).neqQd >= 1).map((m) => [m.id, fillOf(p, m)]));
  const date = new Date().toISOString().slice(0, 10);
  const fit = fitScale(p, { paper: 'A3', landscape: true }, safeguards);
  const map = buildPrintSvg(p, site, safeguards, { paper: 'A3', landscape: true, scale: fit.scale, center: fit.center, title: p.name, sgLabel: 'IBD', author: opts.author, date })
    .replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"');
  const bad = site.pairs.filter((x) => x.status === 'ko' || x.status === 'nd' || x.status === 'acc');

  const magSections = mags.map((m) => {
    const l = magazineLoad(m);
    const g = site.groupOf.get(m.id);
    const f = fills.get(m.id);
    const asPes = site.pairs.filter((x) => x.pesId === m.id);
    const asEs = site.pairs.filter((x) => x.esId === m.id);
    const compat = checkCompat(magazineCgs(m));
    return `<section class="mag"><h3>Scheda QD — ${esc(m.name)}</h3>
      <table class="kv"><tr><th>Costruzione</th><td>${esc(STRUCT_NAME[m.struct])}${m.struct === 'ecm' ? ` — ${esc(ECM_NAME[m.ecmClass])}` : ''}</td></tr>
      <tr><th>Posizione</th><td>x ${m1(m.cx)}, y ${m1(m.cy)}, ${m.w} × ${m.d} m, fronte a ${m.az}°</td></tr>
      <tr><th>Contenuto</th><td>${m.contentMode === 'inventory' ? `${(m.items ?? []).length} righe d'inventario` : 'contenuto semplice'} — NEQ per QD ${kg(l.neqQd)}${l.neq14 ? ` (+ HD 1.4 ${kg(l.neq14)})` : ''}</td></tr>
      <tr><th>Casi di calcolo (Part I Table 4)</th><td>${l.cases.map((c) => `HD ${c.hd}: ${kg(c.neq)}${needsMce(c.hd) ? `, MCE ${kg(c.mce)}` : ''} <i>(${esc(c.rule)})</i>`).join('<br>') || '—'}</td></tr>
      ${l.applied.filter((a) => /^\d$/.test(a)).map((a) => `<tr><th>Table 4 nota ${a}</th><td class="norm">${esc(TABLE4.notes[a])}</td></tr>`).join('')}
      ${compat.length ? `<tr><th>Compatibilità (Table 5)</th><td>${compat.map((c) => esc(c.text) + (p.risks[`compat:${m.id}:${c.a}-${c.b}`] ? ' — rischio accettato' : '')).join('<br>')}</td></tr>` : ''}
      ${g && g.members.length > 1 ? `<tr><th>Sito unico</th><td>${g.members.map(name).join(' + ')} — NEQ aggregato ${kg(g.load.neqQd)}</td></tr>` : ''}
      <tr><th>NEQ ammesso</th><td>${!f ? '—' : f.limitedByMce ? 'nessuno con la configurazione attuale' : f.maxNeq == null ? 'oltre 64 volte il contenuto attuale' : `${kg(f.maxNeq)} (riempimento ${Math.round((f.fill ?? 0) * 100)}%)`}</td></tr>
      <tr><th>Esito</th><td><b>${ST[site.byObject[m.id] ?? 'noqd']}</b></td></tr></table>
      ${m.contentMode === 'inventory' && (m.items ?? []).length ? `<h4>Inventario</h4><table><tr><th>Descrizione</th><th>HD</th><th>CG</th><th class="r">Q.tà</th><th class="r">NEQ/pz</th><th class="r">NEQ</th><th class="r">MCE</th></tr>
        ${(m.items ?? []).map((it) => `<tr><td>${esc(it.descr)}</td><td>${it.hd}</td><td>${it.cg}</td><td class="r">${it.qty}</td><td class="r">${it.neqUnit}</td><td class="r">${kg(it.qty * it.neqUnit)}</td><td class="r">${it.mce ?? ''}</td></tr>`).join('')}</table>` : ''}
      ${asPes.length ? `<h4>Come PES</h4><table>${PAIR_HEAD}${asPes.map((x) => pairRow(p, x, name)).join('')}</table>` : ''}
      ${asEs.length ? `<h4>Come ES</h4><table>${PAIR_HEAD}${asEs.map((x) => pairRow(p, x, name)).join('')}</table>` : ''}
    </section>`;
  }).join('\n');

  const licence = mags.filter((m) => magazineLoad(m).neqQd >= 1 || fills.has(m.id)).map((m) => {
    const l = magazineLoad(m), f = fills.get(m.id);
    const hds = [...new Set(l.totals.map((t) => t.hd))].join(', ');
    return `<tr><td>${esc(m.name)}</td><td>${esc(STRUCT_NAME[m.struct].split(' (')[0])}</td><td>${hds}</td><td class="r">${kg(l.neqQd)}</td>
      <td class="r">${!f ? '—' : f.limitedByMce ? '0 kg' : f.maxNeq == null ? '—' : kg(f.maxNeq)}</td>
      <td>${site.groupOf.get(m.id) && site.groupOf.get(m.id)!.members.length > 1 ? 'Sito unico; ' : ''}${site.pairs.some((x) => x.pesId === m.id && x.status === 'acc') ? 'con rischi accettati' : ''}</td></tr>`;
  }).join('');

  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(p.name)} — Relazione QD (BOZZA)</title>
<style>
body{font:11pt/1.45 Arial,Helvetica,sans-serif;color:#111;max-width:1100px;margin:24px auto;padding:0 16px}
h1{font-size:20pt;margin:0} h2{font-size:14pt;border-bottom:2px solid #333;padding-bottom:3px;margin-top:28px} h3{font-size:12pt;margin:18px 0 6px} h4{font-size:10.5pt;margin:10px 0 4px}
table{border-collapse:collapse;width:100%;font-size:9pt;margin:4px 0} th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top} th{background:#eee}
.r{text-align:right} .kv th{width:200px} tr.ko td{background:#fde4e4} tr.nd td{background:#fdf0db} tr.acc td{background:#ece9f8} .norm{font-style:italic;color:#444}
.draft{color:#b00;font-weight:bold;border:2px solid #b00;padding:6px 10px;margin:10px 0} .mag{page-break-inside:avoid;border-top:1px solid #ccc;margin-top:14px}
.sign td{height:40px} .map{border:1px solid #999;margin:8px 0}
@media print{body{margin:0;max-width:none}.mag{page-break-inside:auto}h2{page-break-before:auto}}
</style></head><body>
<div class="draft">BOZZA — da verificare e firmare a cura di personale qualificato. AASTP-1 Edition D Version 1 (nov. 2025).</div>
<h1>${esc(p.name)} — Relazione Quantity-Distance</h1>
<p>Data ${date}${opts.author ? ` · Redatto da ${esc(opts.author)}` : ''} · Strumento QD Sito</p>

<h2>1. Sintesi</h2>
<table class="kv"><tr><th>Stato del sito</th><td><b>${ST[site.status]}</b></td></tr>
<tr><th>Magazzini con esplosivo (PES)</th><td>${site.nPes}</td></tr><tr><th>Esposti (ES)</th><td>${site.nEs}</td></tr>
<tr><th>Coppie verificate</th><td>${site.pairs.length}, di cui non conformi ${site.pairs.filter((x) => x.status === 'ko').length}, da verificare ${site.pairs.filter((x) => x.status === 'nd').length}, con rischio accettato ${site.pairs.filter((x) => x.status === 'acc').length}</td></tr>
<tr><th>NEQ totale per QD</th><td>${kg(site.neqTot)}</td></tr>
<tr><th>Siti unici</th><td>${site.groups.map((g) => `${g.members.map(name).join(' + ')} (${kg(g.load.neqQd)})`).join('<br>') || 'nessuno'}</td></tr></table>
<div class="map">${map}</div>

<h2>2. Coppie non conformi, da verificare o con rischio accettato</h2>
${bad.length ? `<table>${PAIR_HEAD}${bad.map((x) => pairRow(p, x, name)).join('')}</table><p>* rischio accettato, vedi §4.</p>` : '<p>Nessuna.</p>'}

<h2>3. Schede QD dei magazzini</h2>
<p>Formato provvisorio: il modulo QD di AASTP-1.1 Annex A non è ancora disponibile.</p>
${magSections}

<h2>4. Registro dei rischi accettati</h2>
${Object.keys(p.risks).length ? `<table><tr><th>Oggetto</th><th>Motivazione</th><th>Accettato da</th><th>Data</th></tr>${Object.entries(p.risks).map(([k, r]) =>
  `<tr><td>${esc(k.startsWith('pair:') ? 'Coppia ' + k.slice(5).split('>').map(name).join(' → ') : 'Compatibilità ' + k.slice(7))}</td><td>${esc(r.text)}</td><td>${esc(r.by)}</td><td>${esc(r.date)}</td></tr>`).join('')}</table>` : '<p>Nessuno.</p>'}

<h2>5. Bozza di licenza dei limiti esplosivi</h2>
<div class="draft">BOZZA — i limiti sotto sono il risultato del calcolo con la configurazione attuale e non hanno valore autorizzativo finché non sono verificati e firmati.</div>
<p>NEQ ammesso = contenuto attuale scalato, a parità di composizione e MCE, finché tutte le coppie del magazzino (o del suo sito unico) restano conformi.</p>
<table><tr><th>Magazzino</th><th>Costruzione</th><th>HD presenti</th><th class="r">NEQ attuale</th><th class="r">NEQ massimo</th><th>Condizioni</th></tr>${licence}</table>
<table class="sign"><tr><th>Redatto</th><th>Verificato</th><th>Approvato (autorità competente)</th></tr><tr><td></td><td></td><td></td></tr></table>

<h2>6. Metodo e riferimenti</h2>
<ul>
<li>Effetti e quantità di riferimento: Part I Ch.3 Table 1. Miscelazione: Part I Ch.2 Table 4; compatibilità: Table 5.</li>
<li>Matrici PES/ES: Annex I-A Tables 1–4; formule: Tables 5–9; distanze per eccesso al metro (Annex I-A Sect. I §5).</li>
<li>Settori: Annex I-A Sect. I §7–11, Fig. A-1/A-2. Distanze tra i punti più vicini: Part I §1.3.2.2.</li>
<li>Siti unici: Part I §1.3.2.3.4; IBD ridotte: §1.3.6.6.2; terrapieno condiviso: §1.3.6.6.3.</li>
</ul>
</body></html>`;
}
