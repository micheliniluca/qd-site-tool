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
import { getLang, N_, numLocale, t } from '../i18n';

const esc = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const kg = (x: number) => `${Math.round(x).toLocaleString(numLocale())} kg`;
const m1 = (x: number) => `${x.toLocaleString(numLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 })} m`;
const ST: Record<string, string> = { ok: N_('Conforme'), ko: N_('NON conforme'), nd: N_('Da verificare'), noqd: N_('Nessuna QD'), acc: N_('Rischio accettato'), agg: N_('Stesso sito unico') };
const st = (s: string) => t(ST[s]);

function pairRow(p: Project, pr: PairEval, name: (id: string) => string): string {
  const g = pr.gov;
  return `<tr class="${pr.status}"><td>${esc(name(pr.pesId))}</td><td>${esc(name(pr.esId))}</td><td>${g ? `HD ${g.load.hd}, ${kg(g.load.neq)}` : ''}</td>
    <td>${g ? (g.extra ? esc(g.extra) : `${esc(t(EFFNAME[g.eff]))}${g.pesSector ? ' · ' + t(SECTOR_IT[g.pesSector]) : ''}`) : ''}</td>
    <td>${g && g.col >= 0 ? `T${pr.table} (${g.colCode}) · ES ${g.es.row}` : '—'}</td><td>${g?.res.o ? esc(optLabel(g.res.o)) : '—'}</td>
    <td class="r">${g?.req != null ? `${g.req} m` : t('n.d.')}</td><td class="r">${g ? m1(g.dist) : ''}</td><td>${st(pr.status)}${p.risks[`pair:${pr.key}`] ? ' *' : ''}</td></tr>`;
}
const pairHead = () => `<tr><th>PES</th><th>ES</th><th>${t('Caso')}</th><th>${t('Effetto · settore')}</th><th>${t('Cella')}</th><th>${t('Formula')}</th><th class="r">${t('Richiesta')}</th><th class="r">${t('Misurata')}</th><th>${t('Esito')}</th></tr>`;

export function buildReportHtml(p: Project, safeguards: Map<string, Safeguard>, opts: { author?: string; fills?: Map<string, Fill> } = {}): string {
  const site: SiteEval = evaluateSite(p);
  const name = (id: string) => p.objects.find((o) => o.id === id)?.name ?? '?';
  const mags = p.objects.filter((o): o is Magazine => o.kind === 'magazine');
  const fills = opts.fills ?? new Map(mags.filter((m) => magazineLoad(m).neqQd >= 1).map((m) => [m.id, fillOf(p, m)]));
  const date = new Date().toISOString().slice(0, 10);
  const fit = fitScale(p, { paper: 'A3', landscape: true }, safeguards);
  const PAIR_HEAD = pairHead();
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
    return `<section class="mag"><h3>${t('Scheda QD — {name}', { name: esc(m.name) })}</h3>
      <table class="kv"><tr><th>${t('Costruzione')}</th><td>${esc(t(STRUCT_NAME[m.struct]))}${m.struct === 'ecm' ? ` — ${esc(t(ECM_NAME[m.ecmClass]))}` : ''}</td></tr>
      <tr><th>${t('Posizione')}</th><td>${t('x {x}, y {y}, {w} × {d} m, fronte a {az}°', { x: m1(m.cx), y: m1(m.cy), w: m.w, d: m.d, az: m.az })}</td></tr>
      <tr><th>${t('Contenuto')}</th><td>${m.contentMode === 'inventory' ? t("{n} righe d'inventario", { n: (m.items ?? []).length }) : t('contenuto semplice')} — ${t('NEQ per QD')} ${kg(l.neqQd)}${l.neq14 ? ` (+ HD 1.4 ${kg(l.neq14)})` : ''}</td></tr>
      <tr><th>${t('Casi di calcolo (Part I Table 4)')}</th><td>${l.cases.map((c) => `HD ${c.hd}: ${kg(c.neq)}${needsMce(c.hd) ? `, MCE ${kg(c.mce)}` : ''} <i>(${esc(c.rule)})</i>`).join('<br>') || '—'}</td></tr>
      ${l.applied.filter((a) => /^\d$/.test(a)).map((a) => `<tr><th>${t('Table 4 nota {n}', { n: a })}</th><td class="norm">${esc(TABLE4.notes[a])}</td></tr>`).join('')}
      ${compat.length ? `<tr><th>${t('Compatibilità (Table 5)')}</th><td>${compat.map((c) => esc(c.text) + (p.risks[`compat:${m.id}:${c.a}-${c.b}`] ? t(' — rischio accettato') : '')).join('<br>')}</td></tr>` : ''}
      ${g && g.members.length > 1 ? `<tr><th>${t('Sito unico')}</th><td>${g.members.map(name).join(' + ')} — ${t('NEQ aggregato')} ${kg(g.load.neqQd)}</td></tr>` : ''}
      <tr><th>${t('NEQ ammesso')}</th><td>${!f ? '—' : f.limitedByMce ? t('nessuno con la configurazione attuale') : f.maxNeq == null ? t('oltre 64 volte il contenuto attuale') : t('{kg} (riempimento {pct}%)', { kg: kg(f.maxNeq), pct: Math.round((f.fill ?? 0) * 100) })}</td></tr>
      <tr><th>${t('Esito')}</th><td><b>${st(site.byObject[m.id] ?? 'noqd')}</b></td></tr></table>
      ${m.contentMode === 'inventory' && (m.items ?? []).length ? `<h4>${t('Inventario')}</h4><table><tr><th>${t('Descrizione')}</th><th>HD</th><th>CG</th><th class="r">${t('Q.tà')}</th><th class="r">${t('NEQ/pz')}</th><th class="r">NEQ</th><th class="r">MCE</th></tr>
        ${(m.items ?? []).map((it) => `<tr><td>${esc(it.descr)}</td><td>${it.hd}</td><td>${it.cg}</td><td class="r">${it.qty}</td><td class="r">${it.neqUnit}</td><td class="r">${kg(it.qty * it.neqUnit)}</td><td class="r">${it.mce ?? ''}</td></tr>`).join('')}</table>` : ''}
      ${asPes.length ? `<h4>${t('Come PES')}</h4><table>${PAIR_HEAD}${asPes.map((x) => pairRow(p, x, name)).join('')}</table>` : ''}
      ${asEs.length ? `<h4>${t('Come ES')}</h4><table>${PAIR_HEAD}${asEs.map((x) => pairRow(p, x, name)).join('')}</table>` : ''}
    </section>`;
  }).join('\n');

  const licence = mags.filter((m) => magazineLoad(m).neqQd >= 1 || fills.has(m.id)).map((m) => {
    const l = magazineLoad(m), f = fills.get(m.id);
    const hds = [...new Set(l.totals.map((x) => x.hd))].join(', ');
    return `<tr><td>${esc(m.name)}</td><td>${esc(t(STRUCT_NAME[m.struct]).split(' (')[0])}</td><td>${hds}</td><td class="r">${kg(l.neqQd)}</td>
      <td class="r">${!f ? '—' : f.limitedByMce ? '0 kg' : f.maxNeq == null ? '—' : kg(f.maxNeq)}</td>
      <td>${site.groupOf.get(m.id) && site.groupOf.get(m.id)!.members.length > 1 ? t('Sito unico; ') : ''}${site.pairs.some((x) => x.pesId === m.id && x.status === 'acc') ? t('con rischi accettati') : ''}</td></tr>`;
  }).join('');

  return `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><title>${esc(p.name)} — ${t('Relazione QD (BOZZA)')}</title>
<style>
body{font:11pt/1.45 Arial,Helvetica,sans-serif;color:#111;max-width:1100px;margin:24px auto;padding:0 16px}
h1{font-size:20pt;margin:0} h2{font-size:14pt;border-bottom:2px solid #333;padding-bottom:3px;margin-top:28px} h3{font-size:12pt;margin:18px 0 6px} h4{font-size:10.5pt;margin:10px 0 4px}
table{border-collapse:collapse;width:100%;font-size:9pt;margin:4px 0} th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top} th{background:#eee}
.r{text-align:right} .kv th{width:200px} tr.ko td{background:#fde4e4} tr.nd td{background:#fdf0db} tr.acc td{background:#ece9f8} .norm{font-style:italic;color:#444}
.draft{color:#b00;font-weight:bold;border:2px solid #b00;padding:6px 10px;margin:10px 0} .mag{page-break-inside:avoid;border-top:1px solid #ccc;margin-top:14px}
.sign td{height:40px} .map{border:1px solid #999;margin:8px 0}
@media print{body{margin:0;max-width:none}.mag{page-break-inside:auto}h2{page-break-before:auto}}
</style></head><body>
<div class="draft">${t('BOZZA — da verificare e firmare a cura di personale qualificato. AASTP-1 Edition D Version 1 (nov. 2025).')}</div>
<h1>${esc(p.name)} — ${t('Relazione Quantity-Distance')}</h1>
<p>${t('Data {date}', { date })}${opts.author ? t(' · Redatto da {author}', { author: esc(opts.author) }) : ''} · ${t('Strumento QD Sito')}</p>

<h2>${t('1. Sintesi')}</h2>
<table class="kv"><tr><th>${t('Stato del sito')}</th><td><b>${st(site.status)}</b></td></tr>
<tr><th>${t('Magazzini con esplosivo (PES)')}</th><td>${site.nPes}</td></tr><tr><th>${t('Esposti (ES)')}</th><td>${site.nEs}</td></tr>
<tr><th>${t('Coppie verificate')}</th><td>${t('{n}, di cui non conformi {ko}, da verificare {nd}, con rischio accettato {acc}', { n: site.pairs.length, ko: site.pairs.filter((x) => x.status === 'ko').length, nd: site.pairs.filter((x) => x.status === 'nd').length, acc: site.pairs.filter((x) => x.status === 'acc').length })}</td></tr>
<tr><th>${t('NEQ totale per QD')}</th><td>${kg(site.neqTot)}</td></tr>
<tr><th>${t('Siti unici')}</th><td>${site.groups.map((g) => `${g.members.map(name).join(' + ')} (${kg(g.load.neqQd)})`).join('<br>') || t('nessuno')}</td></tr></table>
<div class="map">${map}</div>

<h2>${t('2. Coppie non conformi, da verificare o con rischio accettato')}</h2>
${bad.length ? `<table>${PAIR_HEAD}${bad.map((x) => pairRow(p, x, name)).join('')}</table><p>${t('* rischio accettato, vedi §4.')}</p>` : `<p>${t('Nessuna.')}</p>`}

<h2>${t('3. Schede QD dei magazzini')}</h2>
<p>${t('Formato provvisorio: il modulo QD di AASTP-1.1 Annex A non è ancora disponibile.')}</p>
${magSections}

<h2>${t('4. Registro dei rischi accettati')}</h2>
${Object.keys(p.risks).length ? `<table><tr><th>${t('Oggetto')}</th><th>${t('Motivazione')}</th><th>${t('Accettato da')}</th><th>${t('Data')}</th></tr>${Object.entries(p.risks).map(([k, r]) =>
  `<tr><td>${esc(k.startsWith('pair:') ? t('Coppia {x}', { x: k.slice(5).split('>').map(name).join(' → ') }) : t('Compatibilità {x}', { x: k.slice(7) }))}</td><td>${esc(r.text)}</td><td>${esc(r.by)}</td><td>${esc(r.date)}</td></tr>`).join('')}</table>` : `<p>${t('Nessuno.')}</p>`}

<h2>${t('5. Bozza di licenza dei limiti esplosivi')}</h2>
<div class="draft">${t('BOZZA — i limiti sotto sono il risultato del calcolo con la configurazione attuale e non hanno valore autorizzativo finché non sono verificati e firmati.')}</div>
<p>${t('NEQ ammesso = contenuto attuale scalato, a parità di composizione e MCE, finché tutte le coppie del magazzino (o del suo sito unico) restano conformi.')}</p>
<table><tr><th>${t('Magazzino')}</th><th>${t('Costruzione')}</th><th>${t('HD presenti')}</th><th class="r">${t('NEQ attuale')}</th><th class="r">${t('NEQ massimo')}</th><th>${t('Condizioni')}</th></tr>${licence}</table>
<table class="sign"><tr><th>${t('Redatto')}</th><th>${t('Verificato')}</th><th>${t('Approvato (autorità competente)')}</th></tr><tr><td></td><td></td><td></td></tr></table>

<h2>${t('6. Metodo e riferimenti')}</h2>
<ul>
<li>${t('Effetti e quantità di riferimento: Part I Ch.3 Table 1. Miscelazione: Part I Ch.2 Table 4; compatibilità: Table 5.')}</li>
<li>${t('Matrici PES/ES: Annex I-A Tables 1–4; formule: Tables 5–9; distanze per eccesso al metro (Annex I-A Sect. I §5).')}</li>
<li>${t('Settori: Annex I-A Sect. I §7–11, Fig. A-1/A-2. Distanze tra i punti più vicini: Part I §1.3.2.2.')}</li>
<li>${t('Siti unici: Part I §1.3.2.3.4; IBD ridotte: §1.3.6.6.2; terrapieno condiviso: §1.3.6.6.3.')}</li>
</ul>
</body></html>`;
}
