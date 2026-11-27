/* Verifica di sito: tutte le coppie PES→ES con settori automatici (Annex I-A Sect. I §7–11),
   contenuto misto (Part I Table 4), siti unici (Part I §1.3.2.3.4), terrapieno condiviso (§1.3.6.6.3),
   IBD ridotte (§1.3.6.6.2) e registro dei rischi accettati. */
import { evalOpt, evaluateEffect, type EffectResult } from '../engine/cell';
import { COLCODE, EFFMAP, MATRIX, type Effect, type EsRow, type Opt, type TableId } from '../engine/matrix';
import { mixHd, sumByHd, type LoadCase, type MixResult } from '../engine/mixing';
import {
  clipShape, lineShape, polyShape, rectCorners, sectorRegions, shapeDistance,
  type Rect, type SectorName, type SectorRegion, type Shape, type Vec,
} from './geometry';
import { isRect, magazineLines, magazineLoad, type Magazine, type Project, type SiteObject } from './model';

export const SECTOR_IT: Record<SectorName, string> = { front: 'fronte', side: 'lato', rear: 'retro' };

/* ---------- colonna PES ---------- */

export function pesTable(m: Magazine): TableId {
  return m.struct === 'ecm' ? '1' : m.struct === 'heavy' ? '2' : m.struct === 'medium' ? '3' : '4';
}

/** Schema dei settori di un PES per un effetto (null = PES non direzionale).
    §7: ECM con HD 1.1/1.3 → fronte 150°, retro 135°.  §9: ECM, effetti in MCE di 1.2.1/1.2.3/1.6 → idem.
    §11: ECM o pareti pesanti con HD 1.2 → fronte 100° (effetti progressivi p121/p122).
    Pareti pesanti con porta, altri effetti: la norma non dà l'angolo; si usa 150° (scelta cautelativa, decisa 23/11/2026). */
export function pesScheme(m: Magazine, eff: Effect): { front: number; rear: number; ref: string } | null {
  const hd12 = eff === 'p121' || eff === 'p122';
  if (m.struct === 'ecm') return hd12 ? { front: 100, rear: 135, ref: '§11, Fig. A-2' } : { front: 150, rear: 135, ref: '§7, Fig. A-1' };
  if (m.struct === 'heavy' && m.roof && m.frontDoor)
    return hd12 ? { front: 100, rear: 135, ref: '§11, Fig. A-2' } : { front: 150, rear: 135, ref: '§7 per analogia (porta sul fronte): ipotesi cautelativa' };
  return null;
}

export interface ColumnRegion { col: number; sector: SectorName | null; side?: 'left' | 'right'; poly: Vec[] | null; scheme: string | null }

export function pesColumns(m: Magazine, eff: Effect): ColumnRegion[] {
  const sch = pesScheme(m, eff);
  if (m.struct === 'ecm') {
    const col: Record<SectorName, number> = { rear: 0, side: 1, front: 2 };   // (a) porta opposta, (b) perpendicolare, (c) verso l'ES
    return sectorRegions(m, sch!.front, sch!.rear).map((g) => ({ col: col[g.name], sector: g.name, side: g.side, poly: g.poly, scheme: sch!.ref }));
  }
  if (m.struct === 'heavy') {
    if (!m.roof) return [{ col: 2, sector: null, poly: null, scheme: null }];   // (f)
    if (sch) return sectorRegions(m, sch.front, sch.rear).map((g) => ({ col: g.name === 'front' ? 1 : 0, sector: g.name, side: g.side, poly: g.poly, scheme: sch.ref }));
    return [{ col: 0, sector: null, poly: null, scheme: null }];   // (d)
  }
  return [{ col: m.barricaded ? 0 : 1, sector: null, poly: null, scheme: null }];   // (g)/(h), (i)/(j)
}

/** IBD/PTRD ridotte (§1.3.6.6.2): ECM conforme con volume > 500 m³, caso HD 1.1 con NEQ ≤ 45 t. */
export function reducedIbdPrefer(m: Magazine, c: LoadCase): ((o: Opt) => boolean) | undefined {
  if (m.struct !== 'ecm' || !m.vol500 || c.hd !== '1.1' || c.neq > 45000) return undefined;
  return (o) => !!o.notes?.some((n) => n.includes('1.3.6.6.2'));
}

/* ---------- riga ES ---------- */

export interface EsCase { row: EsRow; sector: SectorName | null; why: string }

/** Righe ES applicabili a un oggetto esposto, dato il PES (per gli ECM dipende dal settore dell'ES in cui cade il PES). */
export function esRows(es: SiteObject, pesShape: Shape): EsCase[] {
  if (es.kind === 'building') return [{ row: es.es, sector: null, why: '' }];
  if (es.kind === 'line') return es.role === 'es' && es.es ? [{ row: es.es, sector: null, why: '' }] : [];
  const m = es;
  // edificio di processo che come esposto è un'officina esplosivi (ES 18–20, Part I §1.3.1.13)
  if (m.struct !== 'ecm' && m.esAs) return [{ row: m.esAs, sector: null, why: 'officina esplosivi (impostato sul magazzino)' }];
  switch (m.struct) {
    case 'heavy': return [{ row: m.roof ? '12' : '13', sector: null, why: '' }];
    case 'medium': return [{ row: m.barricaded ? '14' : '15', sector: null, why: '' }];
    case 'light': return [{ row: m.barricaded ? '16' : '17', sector: null, why: '' }];
  }
  // ECM come ES: settori di Fig. A-1 (§7, §8) attorno all'ES; il PES può cadere in più settori → tutti
  const out: EsCase[] = [];
  const seen = new Set<string>();
  for (const g of sectorRegions(m, 150, 135)) {
    if (!clipShape(pesShape, g.poly)) continue;
    let row: EsRow;
    const base = { '7bar': 0, '3bar': 3 } as Record<string, number>;
    if (m.ecmClass in base) row = String(base[m.ecmClass] + (g.name === 'rear' ? 1 : g.name === 'side' ? 2 : 3)) as EsRow;
    else if (g.name === 'front') row = m.ecmClass === 'nc-hv' ? '7' : m.ecmClass === 'nc-barr' ? '8' : '11';
    else row = g.name === 'rear' ? '9' : '10';
    if (seen.has(row)) continue;
    seen.add(row);
    out.push({ row, sector: g.name, why: `PES nel settore ${SECTOR_IT[g.name]} dell'ES` });
  }
  return out;
}

/* ---------- geometrie ---------- */

export function shapeOf(o: SiteObject): Shape {
  return isRect(o) ? polyShape(rectCorners(o as Rect)) : lineShape(o.pts);
}

/* ---------- valutazione della coppia ---------- */

/** ok conforme · ko non conforme · nd da verificare · noqd nessuna QD ·
    acc non conforme con rischio accettato · agg coppia interna a un sito unico */
export type Status = 'ok' | 'ko' | 'nd' | 'noqd' | 'acc' | 'agg';
export const STATUS_RANK: Record<Status, number> = { ko: 5, nd: 4, acc: 3, ok: 2, agg: 1, noqd: 0 };

export interface PairCase {
  eff: Effect;
  load: LoadCase;
  col: number; colCode: string;
  pesSector: SectorName | null; pesSide?: 'left' | 'right'; scheme: string | null;
  es: EsCase;
  dist: number; pa: Vec; pb: Vec;          // distanza tra PES e la parte di ES nel settore
  res: EffectResult;
  req: number | null;                       // QD richiesta (m); 0 = nessuna QD; null = fuori campo
  status: Status;
  margin: number | null;                    // dist − req
  extra?: string;                           // caso aggiuntivo (es. terrapieno condiviso)
}

export interface PairEval {
  key: string; pesId: string; esId: string;
  table: TableId;
  cases: PairCase[];
  gov: PairCase | null;                     // caso che governa (il peggiore)
  status: Status;
  rawStatus: Status;                        // prima di rischio accettato / sito unico
  dist: number; pa: Vec; pb: Vec;           // distanza minima complessiva
  req: number | null;                       // QD richiesta massima tra i casi
  groupId?: string;                         // sito unico del PES (se più magazzini)
}

/** Tolleranza di misura (m): coordinate al millimetro, una distanza uguale alla QD entro 1 mm è conforme. */
export const DIST_TOL = 0.001;

export const pairKey = (pesId: string, esId: string) => `${pesId}>${esId}`;

export function isPes(o: SiteObject): o is Magazine {
  if (o.kind !== 'magazine') return false;
  const l = magazineLoad(o);
  return l.cases.length > 0 && l.neqQd >= 1;
}
export function isEs(o: SiteObject): boolean {
  return o.kind === 'magazine' || o.kind === 'building' || (o.kind === 'line' && o.role === 'es' && !!o.es && o.pts.length >= 2);
}

export interface PairOpts { choice?: Record<string, number>; cases?: LoadCase[]; shared?: '34' | '12' | null }

export function evaluateSitePair(pes: Magazine, es: SiteObject, opts: PairOpts | Record<string, number> = {}): PairEval {
  // compatibilità con la firma della Fase 1: evaluateSitePair(pes, es, choice)
  const o: PairOpts = 'choice' in opts || 'cases' in opts || 'shared' in opts ? (opts as PairOpts) : { choice: opts as Record<string, number> };
  const table = pesTable(pes);
  const pShape = shapeOf(pes), eShape = shapeOf(es);
  const whole = shapeDistance(pShape, eShape);
  const cases: PairCase[] = [];
  const escases = esRows(es, pShape);
  const loads = o.cases ?? magazineLoad(pes).cases;
  for (const load of loads) {
    for (const [eff, qtype] of EFFMAP[load.hd]) {
      for (const cr of pesColumns(pes, eff)) {
        let part: Shape | null = eShape;
        if (cr.poly) part = clipShape(eShape, cr.poly);
        if (!part) continue;
        const dd = cr.poly ? shapeDistance(pShape, part) : whole;
        for (const ec of escases) {
          const res = evaluateEffect({
            table, col: cr.col, es: ec.row, hd: load.hd, neq: load.neq, mce: load.mce, vol: pes.vol,
            choice: o.choice, prefer: reducedIbdPrefer(pes, load),
          }, eff, qtype);
          let req: number | null, status: Status;
          if (!res.r || res.r.none) { req = 0; status = 'noqd'; }
          else if (res.r.oor) { req = null; status = 'nd'; }
          else { req = res.r.dr as number; status = dd.d + DIST_TOL >= req ? 'ok' : 'ko'; }
          cases.push({
            eff, load, col: cr.col, colCode: COLCODE[table][cr.col], pesSector: cr.sector, pesSide: cr.side, scheme: cr.scheme,
            es: ec, dist: dd.d, pa: dd.pa, pb: dd.pb, res, req, status, margin: req == null ? null : dd.d - req,
          });
        }
      }
    }
    // terrapieno condiviso tra ECM (§1.3.6.6.3): BD5 (≥ 3/4) o BD4 (1/2–3/4) sul blast
    if (o.shared && EFFMAP[load.hd].some(([e]) => e === 'blast')) {
      const ref = o.shared === '34' ? 'BD5' : 'BD4';
      const Q = EFFMAP[load.hd].find(([e]) => e === 'blast')![1] === 'NEQ' ? load.neq : load.mce;
      const opt: Opt = { t: 'f', ref, notes: ['Part I §1.3.6.6.3 terrapieno condiviso'] };
      const r = evalOpt(opt, Q);
      const req = r.oor ? null : (r.dr as number);
      const res: EffectResult = { eff: 'blast', qtype: Q === load.neq ? 'NEQ' : 'MCE', Q, key: `shared|${ref}`, merged: false, raw: `${ref} (§1.3.6.6.3)`, opts: [{ o: opt, i: 0 }], sel: 0, o: opt, r };
      cases.push({
        eff: 'blast', load, col: -1, colCode: '—', pesSector: null, scheme: null, es: { row: escases[0]?.row ?? ('1' as EsRow), sector: null, why: '' },
        dist: whole.d, pa: whole.pa, pb: whole.pb, res, req, status: req == null ? 'nd' : whole.d + DIST_TOL >= req ? 'ok' : 'ko',
        margin: req == null ? null : whole.d - req, extra: `Terrapieno condiviso (${o.shared === '34' ? '≥ 3/4' : '1/2–3/4'} dell'altezza)`,
      });
    }
  }
  let gov: PairCase | null = null;
  for (const c of cases) {
    if (!gov) { gov = c; continue; }
    if (STATUS_RANK[c.status] > STATUS_RANK[gov.status]) gov = c;
    else if (STATUS_RANK[c.status] === STATUS_RANK[gov.status] && c.margin != null && (gov.margin == null || c.margin < gov.margin)) gov = c;
  }
  const status: Status = gov ? gov.status : 'noqd';
  const reqs = cases.map((c) => c.req).filter((x): x is number => x != null);
  return {
    key: pairKey(pes.id, es.id), pesId: pes.id, esId: es.id, table, cases, gov, status, rawStatus: status,
    dist: whole.d, pa: whole.pa, pb: whole.pb, req: reqs.length ? Math.max(...reqs) : null,
  };
}

/* ---------- siti unici (§1.3.2.3.4) ---------- */

export interface SiteGroup {
  id: string;
  members: string[];                        // id magazzini
  load: MixResult;                          // contenuto aggregato dopo Table 4
  links: { a: string; b: string; pair: string }[];   // coppie che hanno causato l'unione
}

export function sharedLevel(p: Project, a: string, b: string): '34' | '12' | null {
  const s = p.sharedCover.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  return s ? s.level : null;
}

function groupLoad(mags: Magazine[]): MixResult {
  return mixHd(sumByHd(mags.flatMap(magazineLines)), { note6As11: mags.some((m) => m.note6As11) });
}

/** Unisce i magazzini non separati dalla IMD appropriata; ripete finché il NEQ aggregato non crea nuove unioni.
    Criterio (confermato 23/11/2026): qualsiasi coppia non conforme tra due magazzini con contenuto, qualunque effetto la governi.
    Eccezione §1.3.1.10.3: HD 1.1 sotto 500 kg non richiede aggregazione. */
export function computeGroups(p: Project): { groups: SiteGroup[]; groupOf: Map<string, SiteGroup> } {
  const mags = p.objects.filter((o): o is Magazine => o.kind === 'magazine');
  const byId = new Map(mags.map((m) => [m.id, m]));
  let groups: SiteGroup[] = mags.map((m) => ({ id: m.id, members: [m.id], load: magazineLoad(m), links: [] }));
  const groupOf = new Map<string, SiteGroup>();
  const reindex = () => { groupOf.clear(); for (const g of groups) for (const id of g.members) groupOf.set(id, g); };
  reindex();
  if (p.options?.aggregate === false) return { groups, groupOf };
  const dirty = new Set(groups.map((g) => g.id));
  let guard = 0;
  while (dirty.size && guard++ < 500) {
    const gid = dirty.values().next().value as string;
    dirty.delete(gid);
    const g = groups.find((x) => x.id === gid);
    if (!g || !g.load.cases.length || g.load.neqQd < 1) continue;
    const small11 = g.load.cases.every((c) => c.hd === '1.1') && g.load.neqQd < 500;
    if (small11) continue;
    let mergeWith: SiteGroup | null = null, link: SiteGroup['links'][number] | null = null;
    outer: for (const b of mags) {
      if (g.members.includes(b.id)) continue;
      const gb = groupOf.get(b.id)!;
      if (!gb.load.cases.length || gb.load.neqQd < 1) continue;   // magazzino vuoto: niente da aggregare
      for (const aid of g.members) {
        const a = byId.get(aid)!;
        const pr = evaluateSitePair(a, b, { choice: p.choices[pairKey(a.id, b.id)]?.idx, cases: g.load.cases, shared: sharedLevel(p, a.id, b.id) });
        if (pr.status === 'ko') { mergeWith = gb; link = { a: a.id, b: b.id, pair: pr.key }; break outer; }
      }
    }
    if (mergeWith && link) {
      const members = [...g.members, ...mergeWith.members];
      const merged: SiteGroup = {
        id: members.slice().sort()[0], members,
        load: groupLoad(members.map((id) => byId.get(id)!)),
        links: [...g.links, ...mergeWith.links, link],
      };
      groups = groups.filter((x) => x !== g && x !== mergeWith).concat(merged);
      dirty.delete(mergeWith.id);
      reindex();
      dirty.add(merged.id);
    }
  }
  return { groups, groupOf };
}

/* ---------- sito ---------- */

export interface SiteEval {
  pairs: PairEval[];
  byObject: Record<string, Status>;        // stato peggiore di ogni oggetto (come PES o come ES)
  status: Status;
  worst: PairEval | null;
  nPes: number; nEs: number; neqTot: number;
  koPes: string[];                          // magazzini (PES) non conformi
  groups: SiteGroup[];                      // siti unici con più di un magazzino
  groupOf: Map<string, SiteGroup>;
}

/** Coppie con PES nel gruppo `g` (tutti i membri, con il contenuto aggregato) verso tutti gli ES. */
export function evaluateGroupPairs(p: Project, g: SiteGroup, groupOf: Map<string, SiteGroup>): PairEval[] {
  const out: PairEval[] = [];
  const es = p.objects.filter(isEs);
  const multi = g.members.length > 1;
  for (const aid of g.members) {
    const a = p.objects.find((o) => o.id === aid) as Magazine;
    for (const b of es) {
      if (b.id === a.id) continue;
      const pr = evaluateSitePair(a, b, { choice: p.choices[pairKey(a.id, b.id)]?.idx, cases: g.load.cases, shared: sharedLevel(p, a.id, b.id) });
      if (multi) pr.groupId = g.id;
      if (groupOf.get(b.id) === g) pr.status = 'agg';
      else if (pr.status === 'ko' && p.risks[`pair:${pr.key}`]) pr.status = 'acc';
      out.push(pr);
    }
  }
  return out;
}

export function evaluateSite(p: Project): SiteEval {
  const { groups, groupOf } = computeGroups(p);
  const pairs: PairEval[] = [];
  for (const g of groups) if (g.load.cases.length && g.load.neqQd >= 1) pairs.push(...evaluateGroupPairs(p, g, groupOf));
  const byObject: Record<string, Status> = {};
  const bump = (id: string, s: Status) => { if (!byObject[id] || STATUS_RANK[s] > STATUS_RANK[byObject[id]]) byObject[id] = s; };
  let worst: PairEval | null = null;
  for (const pr of pairs) {
    bump(pr.pesId, pr.status); bump(pr.esId, pr.status);
    const m = pr.gov?.margin;
    if (!worst || STATUS_RANK[pr.status] > STATUS_RANK[worst.status] ||
        (STATUS_RANK[pr.status] === STATUS_RANK[worst.status] && m != null && (worst.gov?.margin == null || m < worst.gov.margin))) worst = pr;
  }
  const status: Status = worst ? (worst.status === 'agg' ? 'ok' : worst.status) : 'noqd';
  const pes = p.objects.filter(isPes);
  return {
    pairs, byObject, status, worst, nPes: pes.length, nEs: p.objects.filter(isEs).length,
    neqTot: pes.reduce((s, m) => s + magazineLoad(m).neqQd, 0),
    koPes: pes.filter((m) => pairs.some((x) => x.pesId === m.id && x.status === 'ko')).map((m) => m.id),
    groups: groups.filter((g) => g.members.length > 1), groupOf,
  };
}

/** Testo di riferimento della cella (tabella, colonna, ES, pagina). */
export function cellRef(table: TableId, col: number, es: string): string {
  if (col < 0) return 'Part I §1.3.6.6.3 (terrapieno condiviso)';
  const row = MATRIX.tables[table].rows[es];
  return `Annex I-A, Table ${table} col. (${COLCODE[table][col]}), ES ${es} — pag. ${row.annex} (PDF ${row.page})`;
}

export type { SectorRegion };
