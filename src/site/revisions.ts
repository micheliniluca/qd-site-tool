/* Revisioni approvate del piano: istantanea congelata con i risultati, confronto tra versioni, ripristino. */
import { evaluateSite, type SiteEval, type Status } from './evaluate';
import { magazineLoad, newId, type Project, type SiteObject } from './model';

export type Snapshot = Pick<Project, 'objects' | 'choices' | 'sharedCover' | 'risks' | 'options' | 'barricadeSections'>;

export interface RevPair { pes: string; es: string; status: Status; req: number | null; dist: number }
export interface RevSummary {
  status: Status; neqTot: number; nPairs: number;
  pairs: Record<string, RevPair>;          // chiave `${pesId}>${esId}`
  groups: string[][];                      // nomi dei magazzini di ciascun sito unico
  neqBy: Record<string, number>;           // NEQ per QD per magazzino
}
export interface Revision {
  id: string; n: number; title: string; date: string; author: string; note: string;
  snapshot: Snapshot; summary: RevSummary;
}

export function snapshotOf(p: Project): Snapshot {
  return JSON.parse(JSON.stringify({
    objects: p.objects, choices: p.choices, sharedCover: p.sharedCover, risks: p.risks, options: p.options, barricadeSections: p.barricadeSections ?? [],
  }));
}

export function summarize(p: Pick<Project, 'objects'>, site: SiteEval): RevSummary {
  const name = (id: string) => p.objects.find((o) => o.id === id)?.name ?? '?';
  const pairs: Record<string, RevPair> = {};
  for (const pr of site.pairs) pairs[pr.key] = { pes: name(pr.pesId), es: name(pr.esId), status: pr.status, req: pr.gov?.req ?? pr.req, dist: Math.round((pr.gov?.dist ?? pr.dist) * 10) / 10 };
  const neqBy: Record<string, number> = {};
  for (const o of p.objects) if (o.kind === 'magazine') neqBy[o.id] = magazineLoad(o).neqQd;
  return { status: site.status, neqTot: site.neqTot, nPairs: site.pairs.length, pairs, groups: site.groups.map((g) => g.members.map(name)), neqBy };
}

export function freeze(p: Project, meta: { title: string; author: string; note: string; date?: string }): Revision {
  const n = (p.revisions ?? []).reduce((m, r) => Math.max(m, r.n), 0) + 1;
  return {
    id: newId('r'), n, title: meta.title || `Revisione ${n}`, author: meta.author, note: meta.note,
    date: meta.date ?? new Date().toISOString().slice(0, 10), snapshot: snapshotOf(p), summary: summarize(p, evaluateSite(p)),
  };
}

/** Riporta il progetto allo stato di una revisione (le revisioni restano). */
export function restore(p: Project, r: Revision): Project {
  return { ...p, ...JSON.parse(JSON.stringify(r.snapshot)) };
}

/* ---------------- confronto ---------------- */

export interface ObjChange { id: string; name: string; kind: SiteObject['kind']; change: 'aggiunto' | 'rimosso' | 'modificato'; fields: string[] }
export interface PairChange { key: string; pes: string; es: string; before: RevPair | null; after: RevPair | null; what: string }
export interface Diff {
  objects: ObjChange[];
  pairs: PairChange[];
  statusBefore: Status; statusAfter: Status;
  neqBefore: number; neqAfter: number;
  groupsBefore: string[][]; groupsAfter: string[][];
  risksAdded: string[]; risksRemoved: string[];
}

const FIELD_IT: Record<string, string> = {
  cx: 'posizione', cy: 'posizione', w: 'dimensioni', d: 'dimensioni', az: 'orientamento', pts: 'tracciato', name: 'nome',
  struct: 'costruzione', ecmClass: 'classe ECM', roof: 'tetto', frontDoor: 'porta', barricaded: 'barricata', hd: 'HD', neq: 'NEQ', mce: 'MCE',
  vol: 'volume', contentMode: 'contenuto', items: 'inventario', vol500: 'IBD ridotte', note6As11: 'nota 6', es: 'tipo ES', role: 'ruolo', note: 'note',
};

export function diffObjects(a: SiteObject[], b: SiteObject[]): ObjChange[] {
  const out: ObjChange[] = [];
  const ma = new Map(a.map((o) => [o.id, o])), mb = new Map(b.map((o) => [o.id, o]));
  for (const o of b) if (!ma.has(o.id)) out.push({ id: o.id, name: o.name, kind: o.kind, change: 'aggiunto', fields: [] });
  for (const o of a) if (!mb.has(o.id)) out.push({ id: o.id, name: o.name, kind: o.kind, change: 'rimosso', fields: [] });
  for (const o of b) {
    const p = ma.get(o.id);
    if (!p) continue;
    const keys = new Set([...Object.keys(p), ...Object.keys(o)]);
    const fields = [...new Set([...keys].filter((k) => JSON.stringify((p as never)[k]) !== JSON.stringify((o as never)[k])).map((k) => FIELD_IT[k] ?? k))];
    if (fields.length) out.push({ id: o.id, name: o.name, kind: o.kind, change: 'modificato', fields });
  }
  return out;
}

const bad = (s: Status | undefined) => s === 'ko' || s === 'nd';

export function diffSummaries(before: RevSummary, after: RevSummary, objsBefore: SiteObject[], objsAfter: SiteObject[], risksBefore: Record<string, unknown>, risksAfter: Record<string, unknown>): Diff {
  const pairs: PairChange[] = [];
  const keys = new Set([...Object.keys(before.pairs), ...Object.keys(after.pairs)]);
  for (const k of keys) {
    const b = before.pairs[k] ?? null, a = after.pairs[k] ?? null;
    let what = '';
    if (!b) what = a && bad(a.status) ? 'nuova coppia non conforme' : 'nuova coppia';
    else if (!a) what = 'coppia eliminata';
    else if (b.status !== a.status) what = bad(a.status) && !bad(b.status) ? 'peggiorata' : !bad(a.status) && bad(b.status) ? 'risolta' : 'esito cambiato';
    else if (b.req !== a.req || Math.abs(b.dist - a.dist) > 0.05) what = 'distanze cambiate';
    if (what) pairs.push({ key: k, pes: (a ?? b)!.pes, es: (a ?? b)!.es, before: b, after: a, what });
  }
  const order = ['peggiorata', 'nuova coppia non conforme', 'esito cambiato', 'risolta', 'distanze cambiate', 'nuova coppia', 'coppia eliminata'];
  pairs.sort((x, y) => order.indexOf(x.what) - order.indexOf(y.what));
  return {
    objects: diffObjects(objsBefore, objsAfter), pairs,
    statusBefore: before.status, statusAfter: after.status, neqBefore: before.neqTot, neqAfter: after.neqTot,
    groupsBefore: before.groups, groupsAfter: after.groups,
    risksAdded: Object.keys(risksAfter).filter((k) => !(k in risksBefore)),
    risksRemoved: Object.keys(risksBefore).filter((k) => !(k in risksAfter)),
  };
}

/** Confronto tra una revisione e lo stato attuale del progetto (o un'altra revisione). */
export function compare(r: Revision, current: Project | Revision): Diff {
  if ('snapshot' in current) return diffSummaries(r.summary, current.summary, r.snapshot.objects, current.snapshot.objects, r.snapshot.risks, current.snapshot.risks);
  return diffSummaries(r.summary, summarize(current, evaluateSite(current)), r.snapshot.objects, current.objects, r.snapshot.risks, current.risks);
}
