/* Scheda "Help": teoria completa della valutazione QD secondo AASTP-1 Ed. D V1, come è applicata dallo strumento.
   Le tabelle (effetti, formule, matrici, Table 4/5) sono generate dai dati del motore, quindi coincidono col calcolo. */
import { useMemo, useState, type ReactNode } from 'react';
import { QDF } from '../engine';
import { COLCODE, EFFMAP, EFFNAME, ES_ROWS, HDS, MATRIX, type TableId } from '../engine/matrix';
import { CGS, HD_FULL, TABLE4, TABLE5, table4Cell, table5Cell } from '../engine/mixing';
import { formulaTable } from '../engine/formulas';
import { fmtInt } from './format';

const SECTIONS: [string, string][] = [
  ['scopo', '1. Scopo, norma e limiti'],
  ['concetti', '2. Concetti di base'],
  ['effetti', '3. Effetti esplosivi e quantità di riferimento'],
  ['distanze', '4. Tipi di distanza e livelli di protezione'],
  ['scala', '5. Legge di scala e formule'],
  ['matrici', '6. Le matrici PES/ES di Annex I-A'],
  ['settori', '7. Orientamento: fronte, lato, retro'],
  ['misura', '8. Misura della distanza'],
  ['arrotondamenti', '9. Arrotondamenti, raccordi, calcolo inverso'],
  ['misto', '10. Contenuto misto: Table 4 e Table 5'],
  ['sitiunici', '11. Siti unici e aggregazione'],
  ['speciali', '12. ECM: IBD ridotte e terrapieno condiviso'],
  ['barricate', '13. Barricate'],
  ['danni', '14. Danni attesi (Part I §1.3.7)'],
  ['gestione', '15. Riempimento, consegne, rischi, revisioni'],
  ['validazione', '16. Validazione del motore'],
  ['flusso', '17. Flusso di lavoro consigliato'],
  ['riferimenti', '18. Riferimenti nel PDF'],
  ['glossario', '19. Glossario'],
];

function Sec({ id, children }: { id: string; children: ReactNode }) {
  const t = SECTIONS.find((s) => s[0] === id)![1];
  return <section id={`h-${id}`} className="help-sec"><h2>{t}</h2>{children}</section>;
}
const Ref = ({ children }: { children: ReactNode }) => <span className="ref">{children}</span>;

/** Figura dei settori: rettangolo con la facciata frontale in alto e rette dagli spigoli. */
function SectorFigure({ front, rear, title }: { front: number; rear: number; title: string }) {
  const W = 320, H = 300, cx = 160, cy = 150, w = 50, d = 90;
  const of = ((front - 90) * Math.PI) / 180, orr = ((rear - 90) * Math.PI) / 180, L = 200;
  const FL = [cx - w / 2, cy - d / 2], FR = [cx + w / 2, cy - d / 2], RL = [cx - w / 2, cy + d / 2], RR = [cx + w / 2, cy + d / 2];
  const ray = (p: number[], ang: number, sx: number, sy: number) => [p[0] + sx * L * Math.sin(ang), p[1] + sy * L * Math.cos(ang)];
  const fl = ray(FL, of, -1, -1), fr = ray(FR, of, 1, -1), rl = ray(RL, orr, -1, 1), rr = ray(RR, orr, 1, 1);
  return (
    <figure className="help-fig">
      <svg viewBox={`0 0 ${W} ${H}`}>
        <polygon points={`${FL} ${FR} ${fr} ${fl}`} className="hf-front" />
        <polygon points={`${RR} ${RL} ${rl} ${rr}`} className="hf-rear" />
        <rect x={cx - w / 2} y={cy - d / 2} width={w} height={d} className="hf-mag" />
        <line x1={FL[0]} y1={FL[1]} x2={FR[0]} y2={FR[1]} className="hf-door" />
        {[[FL, fl], [FR, fr], [RL, rl], [RR, rr]].map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="hf-ray" />)}
        <text x={cx} y={28} className="hf-t">FRONTE → colonna (c)</text>
        <text x={cx} y={H - 12} className="hf-t">RETRO → colonna (a)</text>
        <text x={34} y={cy + 4} className="hf-t">LATO (b)</text>
        <text x={W - 34} y={cy + 4} className="hf-t">LATO (b)</text>
        <text x={FR[0] + 6} y={FR[1] + 14} className="hf-s">{front}°</text>
        <text x={RR[0] + 6} y={RR[1] - 6} className="hf-s">{rear}°</text>
      </svg>
      <figcaption>{title}</figcaption>
    </figure>
  );
}

/** Calcolatrice: distanza da quantità e quantità da distanza per una formula. */
function Calculator() {
  const [ref, setRef] = useState('BD31');
  const [q, setQ] = useState(10000);
  const [dist, setDist] = useState(400);
  const [lo, hi] = QDF.range(ref);
  const d = QDF.distance(ref, q), de = QDF.dExact(ref, q), seg = QDF.segText(ref, q);
  const inv = QDF.quantity(ref, dist);
  return (
    <div className="calc">
      <div className="row-btns">
        <label className="fld"><span>Formula</span><select value={ref} onChange={(e) => setRef(e.target.value)}>{QDF.refs.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="fld"><span>Q (kg)</span><input type="number" value={q} onChange={(e) => setQ(parseFloat(e.target.value) || 0)} /></label>
        <label className="fld"><span>D (m)</span><input type="number" value={dist} onChange={(e) => setDist(parseFloat(e.target.value) || 0)} /></label>
      </div>
      <p>{formulaTable(ref)} · campo di validità {fmtInt(lo)}–{fmtInt(hi)} kg</p>
      <p>Distanza: {d == null ? <b>fuori campo — la norma non dà la distanza</b> : <><code>{seg}</code> → {de!.toFixed(2)} m → <b>{d} m</b></>}</p>
      <p>Quantità massima a {dist} m: <b>{inv.below ? 'nessuna (anche la quantità minima richiede di più)' : `${inv.capped ? '≥ ' : ''}${fmtInt(inv.q)} kg`}</b>{inv.capped ? ' (limite superiore di validità)' : ''}</p>
    </div>
  );
}

export function HelpView() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const go = (id: string) => document.getElementById(`h-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const formulas = useMemo(() => QDF.refs.map((r) => ({ r, segs: QDF.F[r] })), []);

  return (
    <div className="view help">
      <aside className="view-side help-toc">
        <h3>Teoria QD</h3>
        {SECTIONS.map(([id, t]) => <a key={id} onClick={() => go(id)}>{t}</a>)}
      </aside>
      <div className="view-main help-body">
        <p className="draft-note">Questa guida spiega il metodo con cui lo strumento applica AASTP-1 Edition D Version 1 (nov. 2025). Non sostituisce la norma:
          i riferimenti tra parentesi rimandano a paragrafi e pagine del PDF, da consultare per ogni decisione. Ogni risultato è una BOZZA da verificare e firmare a cura di personale qualificato.</p>

        <Sec id="scopo">
          <p>Lo scopo delle <b>Quantity-Distances (QD)</b> è tenere i siti che possono esplodere a distanze tali da garantire il rischio minimo praticabile per persone, edifici e munizioni <Ref>Part I §1.3.1.1</Ref>.
            Le distanze sono basate su prove e sull'analisi di incidenti reali e restano soggette all'incertezza propria delle esplosioni <Ref>§1.3.1.2</Ref>; per HD 1.1 presuppongono l'equivalenza in TNT dei materiali.</p>
          <p>Il metodo di AASTP-1 Ed. D è diviso in tre parti, tutte implementate nel motore:</p>
          <ol>
            <li><b>quali effetti</b> considerare e con quale quantità (Part I Ch.3 Table 1);</li>
            <li><b>quale formula</b> vale per ciascun effetto, dato il tipo di PES e di ES (matrici di Annex I-A Tables 1–4);</li>
            <li><b>quanto vale</b> la formula (Annex I-A Tables 5–9), arrotondata per eccesso.</li>
          </ol>
          <p>Ogni effetto si calcola separatamente: <b>governa la distanza maggiore</b>, ovvero la quantità minore <Ref>§1.3.1.4.2</Ref>.</p>
          <p><b>Non coperti</b>: depositi sotterranei (Part III), aeroporti e porti (Part IV), depositi da campo (AASTP-5), il modulo QD di AASTP-1.1 Annex A. Le note di cella che rimandano al testo (es. 1.3.5.6, 1.3.3.5) sono mostrate ma non valutate.</p>
        </Sec>

        <Sec id="concetti">
          <dl>
            <dt>PES — Potential Explosion Site</dt><dd>Il luogo dove può avvenire l'esplosione: magazzino, catasta, veicolo carico.</dd>
            <dt>ES — Exposed Site</dt><dd>Ciò che va protetto: altri magazzini (per proteggere le scorte), officine, strade, edifici abitati, reti. Un magazzino è PES per gli altri e ES per gli altri PES.</dd>
            <dt>NEQ — Net Explosive Quantity</dt><dd>Massa netta di esplosivo in kg. Per un PES si usa il NEQ totale di tutto ciò che può reagire insieme <Ref>§1.3.2.3</Ref>; per HD 1.2 si somma il contenuto di tutti i colpi.</dd>
            <dt>MCE — Maximum Credible Event</dt><dd>Il più grande evento singolo equivalente a HD 1.1 atteso da una data quantità e tipo di munizioni; si determina solo per SsD 1.2.1, 1.2.3 e HD 1.6 <Ref>§1.3.2.4</Ref>.</dd>
            <dt>HD — Hazard Division</dt><dd>1.1 esplosione di massa; 1.2 proiezione senza esplosione di massa; 1.3 incendio di massa; 1.4 rischio minore (distanze da norme antincendio, §1.3.1.8); 1.5 sostanze molto poco sensibili (trattate come 1.1); 1.6 articoli estremamente insensibili.</dd>
            <dt>SsD — Storage sub-Division</dt><dd>HD 1.2 si divide in 1.2.1 (HE per colpo &gt; 0,136 kg), 1.2.2 (≤ 0,136 kg) e 1.2.3; HD 1.3 in 1.3.1 (incendio di massa) e 1.3.2 (combustione progressiva, meno pericolosa).</dd>
            <dt>CG — Compatibility Group</dt><dd>Lettere A–S che dicono quali munizioni possono stare insieme (Part I Ch.2, Table 5). Il codice di classificazione unisce HD e gruppo, es. “1.1D” <Ref>§1.2.2.4</Ref>.</dd>
          </dl>
        </Sec>

        <Sec id="effetti">
          <p>Le esplosioni producono effetti diversi, che la Ed. D separa e calcola uno per uno <Ref>Part I Ch.1 §5–7</Ref>:</p>
          <ul>
            <li><b>Blast</b> (onda d'urto) — formule BD;</li>
            <li><b>Detriti e frammenti</b> — formule DFD;</li>
            <li><b>Evento progressivo</b> di HD 1.2 (“popcorn”: reazioni di singoli colpi nel tempo) — P1D per 1.2.1, P2D per 1.2.2;</li>
            <li><b>Termico</b> — TD per 1.3.1, 1.3.2, e il termico di 1.2.3 e 1.6.</li>
          </ul>
          <p>La tabella seguente (Part I Ch.3 Table 1) dice quali effetti valgono per ciascuna HD e se la quantità è il NEQ totale o l'MCE:</p>
          <table className="tbl compact"><thead><tr><th>HD / SsD</th>{(['blast', 'debris', 'p121', 'p122', 't131', 't132'] as const).map((e) => <th key={e}>{EFFNAME[e]}</th>)}</tr></thead>
            <tbody>{HDS.map((h) => <tr key={h}><td><b>{h}</b></td>{(['blast', 'debris', 'p121', 'p122', 't131', 't132'] as const).map((e) => <td key={e}>{EFFMAP[h].find((x) => x[0] === e)?.[1] ?? ''}</td>)}</tr>)}</tbody></table>
          <p className="hint">Nota: nelle matrici il termico di 1.2.3 e 1.6 si legge nella riga “Thermal 1.3.2”, come fa la scheda originale.</p>
        </Sec>

        <Sec id="distanze">
          <p>AASTP-1 distingue distanze <b>interne</b> e <b>esterne</b> <Ref>§1.3.1.3</Ref>:</p>
          <table className="tbl compact"><tbody>
            <tr><td><b>IMD</b> Inter-Magazine Distance</td><td>tra magazzini (ES 1–17): protegge le scorte dalla propagazione immediata <Ref>§1.3.1.9–1.3.1.12</Ref>. Si consiglia comunque almeno 10 m per ragioni pratiche.</td></tr>
            <tr><td><b>EWD</b> Explosives Workshop Distance</td><td>verso officine esplosivi (ES 18–20); per HD 1.1 la sovrapressione attesa non supera 20 kPa <Ref>§1.3.1.13</Ref>.</td></tr>
            <tr><td><b>PTRD</b> Public Traffic Route Distance</td><td>strade, ferrovie, vie d'acqua, percorsi (ES 21–23), per densità di traffico <Ref>§1.3.1.15</Ref>. Per uso “molto basso” (&lt; 20 al giorno) nessuna QD.</td></tr>
            <tr><td><b>IBD</b> Inhabited Building Distance</td><td>edifici abitati e luoghi di aggregazione (ES 24). Per HD 1.1 si basa su una sovrapressione di 5 kPa e su non più di un frammento pericoloso (&gt; 79 J) ogni 56 m² <Ref>§1.3.1.16</Ref>; non evita la rottura dei vetri.</td></tr>
            <tr><td>Costruzioni vulnerabili</td><td>ES 25 (es. scuole, ospedali, grandi edifici vetrati): distanze maggiori dell'IBD.</td></tr>
            <tr><td>Servizi e reti</td><td>ES 26a/b (uffici e mense di supporto), 27a–c (elettrodotti), 28a–c (POL e oleodotti).</td></tr>
          </tbody></table>
          <p>Tra magazzini le matrici indicano anche il <b>livello di protezione</b> delle scorte all'ES <Ref>§1.3.1.10.2</Ref>:</p>
          <ul>
            <li><b>Virtualmente completa (V)</b>: nessuna propagazione immediata; scorte probabilmente utilizzabili;</li>
            <li><b>Elevata (H)</b>: protezione alta, possibili incendi o esplosioni successive occasionali;</li>
            <li><b>Limitata (L)</b>: protezione limitata, scorte probabilmente danneggiate; non raccomandata per costruzioni nuove.</li>
          </ul>
          <p>“No QD” nella matrice significa che PES o ES proteggono già dagli effetti; la separazione la dettano costruzione, accesso e antincendio <Ref>§1.3.1.4.3</Ref>.</p>
        </Sec>

        <Sec id="scala">
          <p>Per il blast vale la legge di scala di Hopkinson–Cranz: a pari sovrapressione, la distanza cresce con la radice cubica della carica. Per questo molte formule di blast sono</p>
          <p className="formula-big">D = k · Q<sup>1/3</sup></p>
          <p>dove k (m/kg<sup>1/3</sup>) è la <b>distanza scalata</b> associata a un livello di danno. Per piccole quantità alcune formule usano tratti in Q<sup>2/3</sup> e Q<sup>1/2</sup> (es. BD31: 1,5·Q<sup>2/3</sup> fino a 2 500 kg, 5,5·Q<sup>1/2</sup> fino a 4 500 kg, poi 22,2·Q<sup>1/3</sup>).
            Detriti e frammenti non seguono una legge di scala semplice <Ref>§1.3.7.3.3</Ref>: le DFD sono funzioni a tratti con potenze, logaritmi e tratti fissi.
            Le formule progressive P1D/P2D sono polinomi in ln(Q); le termiche TD hanno un minimo fisso e poi crescono con Q<sup>1/3</sup> o Q<sup>1/2</sup>.</p>
          <p>Ogni formula ha un <b>campo di validità</b>: fuori campo la norma non dà la distanza e lo strumento segnala “da verificare”, senza estrapolare (es. BD16, BD19, BD20, BD23, BD25, BD28, BD33, BD34 fino a 45 t; BD1 fino a 120 t).</p>
          <h4>Calcolatrice</h4>
          <Calculator />
          <h4>Tutte le formule (Annex I-A Tables 5–9)</h4>
          <button onClick={() => toggle('formule')}>{open.formule ? 'Nascondi' : 'Mostra'} le {formulas.length} formule</button>
          {open.formule && <table className="tbl compact"><thead><tr><th>Formula</th><th>Tabella</th><th>Tratti (Q in kg → D in m)</th></tr></thead><tbody>
            {formulas.map(({ r, segs }) => <tr key={r}><td><b>{r}</b></td><td>{formulaTable(r)}</td><td>{segs.map((g, i) => <div key={i}><code>{fmtInt(g[0])}{g[1] ? ' ≤ ' : ' < '}Q{g[3] ? ' ≤ ' : ' < '}{fmtInt(g[2])}: {g[4].tx}</code></div>)}</td></tr>)}
          </tbody></table>}
          <p className="hint">Scostamenti dallo stampato, tutti cautelativi o coerenti con le formule inverse e le tabelle di consultazione: P1D3 e P2D3 con 0,67; DFD20 nei tratti 400–3 375 e 5 000–7 020 kg dalle formule inverse; DFD8 con il coefficiente stampato 0,141 (+1 m rispetto a Table 11).</p>
        </Sec>

        <Sec id="matrici">
          <p>Le matrici di Annex I-A (PDF pag. 100–231) incrociano il <b>tipo di PES</b> (colonne a–j) con il <b>tipo di ES</b> (righe 1–28c). Ogni cella contiene, per ciascun effetto, la formula da usare, una distanza fissa, “No QD” o “Not applicable”, il livello di protezione e note.</p>
          <button onClick={() => toggle('pes')}>{open.pes ? 'Nascondi' : 'Mostra'} le colonne PES</button>
          {open.pes && <table className="tbl compact"><tbody>{(['1', '2', '3', '4'] as TableId[]).flatMap((t) => MATRIX.tables[t].cols.map((c, i) => <tr key={t + i}><td><b>({COLCODE[t][i]})</b></td><td>Table {t} — {MATRIX.tables[t].title}</td><td>{c}</td></tr>))}</tbody></table>}
          {' '}<button onClick={() => toggle('es')}>{open.es ? 'Nascondi' : 'Mostra'} le righe ES</button>
          {open.es && <table className="tbl compact"><tbody>{ES_ROWS.map((r) => <tr key={r}><td><b>ES {r}</b></td><td>{MATRIX.es[r]}</td></tr>)}</tbody></table>}
          <h4>Come si legge una cella</h4>
          <ul>
            <li><b>Alternative</b> (“BD31 or BD25”): lo strumento usa per default la <b>più cautelativa valida</b> (distanza maggiore, escluse quelle fuori campo). Le altre valgono solo alle condizioni scritte nelle note di cella o nella descrizione dell'ES; la scelta si salva per coppia con una giustificazione.</li>
            <li><b>Condizioni</b>: MCE ≤ / &gt; 50 kg e volume interno del PES ≤ / &gt; 20 m³ si filtrano in automatico.</li>
            <li><b>Celle unite</b> blast + detriti: vale la cella del blast, compresa la scelta tra alternative.</li>
            <li><b>Distanza con tetto</b> (“TD1 ≤ 60 m”): la formula è limitata al valore indicato.</li>
          </ul>
          <p>Il tipo di PES si sceglie dal menù rapido (ECM, pareti pesanti, pareti medie, struttura leggera/catasta); la colonna esatta la decidono orientamento e barricate. Un magazzino come ES ha la sua riga: ECM 1–11 secondo classe e orientamento, pareti pesanti 12/13, medie 14/15, cataste 16/17.</p>
        </Sec>

        <Sec id="settori">
          <p>Gli ECM e i magazzini a pareti pesanti con porta sono <b>direzionali</b>: dalla porta (facciata frontale) gli effetti sono più forti. Le zone sono delimitate da rette tracciate dagli spigoli <Ref>Annex I-A Sect. I §7–11, Fig. A-1/A-2, PDF pag. 96–98</Ref>:</p>
          <div className="fig-row">
            <SectorFigure front={150} rear={135} title="Fig. A-1: ECM con HD 1.1/1.3 (e ECM come ES; MCE di 1.2.1, 1.2.3, 1.6). Fronte 150°, retro 135°." />
            <SectorFigure front={100} rear={135} title="Fig. A-2: ECM o magazzino pesante con HD 1.2 (effetti progressivi). Fronte 100°." />
          </div>
          <p>“Linea a N° dalla facciata” significa che la retta forma (N − 90)° con la normale alla facciata: <b>150° → ±60°</b>, <b>135° → ±45°</b>, <b>100° → ±10°</b>. Le misure sulle figure del PDF confermano questa lettura.</p>
          <ul>
            <li>Come <b>PES</b>: ES nel settore fronte → colonna (c); lato → (b); retro → (a).</li>
            <li>Come <b>ES</b> (ECM esposto): si guarda in quale settore dell'ES cade il PES: retro → porta opposta (righe 1/4/9), lato → perpendicolare (2/5/10), fronte → porta verso il PES (3/6/7/8/11).</li>
            <li>Un ES <b>a cavallo</b> di più settori si valuta in ciascuno, con la distanza della sola parte che vi cade; sul confine vale la QD maggiore <Ref>§10</Ref>.</li>
            <li>Pareti pesanti con porta sul fronte (colonna (e)): 100° per HD 1.2 (§11); per gli altri effetti la norma non dà l'angolo e lo strumento usa 150°, scelta cautelativa decisa il 23/11/2026.</li>
          </ul>
        </Sec>

        <Sec id="misura">
          <p>Le QD si misurano <b>dal punto più vicino del PES al punto più vicino dell'ES</b>, in linea retta, senza tener conto di barricate o terrapieni <Ref>Part I §1.3.2.2.1</Ref>. Se il NEQ è suddiviso in cataste che non possono reagire tutte insieme, si misura dalla parete adiacente alla catasta che governa <Ref>§1.3.2.2.2</Ref>.</p>
          <p>Nello strumento il contorno disegnato è quello da cui si misura: per gli ECM va disegnato l'ingombro della struttura, non l'unghia del terrapieno. Strade, elettrodotti e oleodotti sono linee: conta il loro punto più vicino.</p>
        </Sec>

        <Sec id="arrotondamenti">
          <ul>
            <li>Le distanze si arrotondano <b>per eccesso al metro</b>; la quantità ricavata da una distanza <b>per difetto al kg</b> <Ref>Annex I-A Sect. I §5</Ref>.</li>
            <li>Al <b>raccordo</b> tra due tratti si prende la distanza maggiore (“the furthest distance or smallest quantity”, nota a Table 5).</li>
            <li>Il <b>calcolo inverso</b> restituisce la Q più grande tale che <i>ogni</i> q ≤ Q richieda al massimo la distanza data: così rispetta la regola della quantità minore anche dove la funzione ha salti.</li>
            <li>Con più effetti: NEQ ammesso = minimo sugli effetti in NEQ, MCE ammesso = minimo su quelli in MCE.</li>
          </ul>
        </Sec>

        <Sec id="misto">
          <p>Munizioni di HD diverse possono stare insieme se compatibili; la QD si calcola con le regole di <b>Part I Table 4</b> <Ref>§1.2.3.2, PDF pag. 49</Ref>:</p>
          <table className="tbl compact grid-table"><thead><tr><th />{HD_FULL.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{HD_FULL.map((a) => <tr key={a}><th>{a}</th>{HD_FULL.map((b) => <td key={b}>{table4Cell(a, b)}</td>)}</tr>)}</tbody></table>
          <ul>
            <li><b>Nota 1</b> (1.1 o 1.5 con 1.2): QD maggiore tra (a) tutto aggregato come 1.1 e (b) la sola HD 1.2 con i suoi criteri.</li>
            <li><b>Nota 2</b> (SsD diverse): non si sommano; ciascuna col proprio NEQ, governa la maggiore.</li>
            <li><b>Nota 3</b>: HD 1.4 non si aggrega.  <b>Nota 4</b>: HD 1.6 con 1.2/1.3 diventa SsD 1.2.3.  <b>Nota 5</b>: 1.3.1 + 1.3.2 si sommano e si prende la QD maggiore tra “come 1.3.1” e “come 1.3.2”.</li>
            <li><b>Nota 6</b>: 1.2.1/1.2.2 con 1.3 possono comportarsi come 1.1 aggregata: lo strumento avvisa e, su richiesta, aggiunge il caso.</li>
            <li>1.1, 1.2 e 1.3 insieme: QD maggiore considerando il NEQ totale come 1.1, come 1.2 e come 1.3 <Ref>§1.2.3.3.3</Ref>.</li>
          </ul>
          <p>Lo strumento generalizza le regole a coppie a più HD nello stesso magazzino, producendo una lista di <b>casi di calcolo</b>; la QD del magazzino è il massimo tra i casi. Un test verifica che per tutte le 81 coppie di HD la regola applicata coincida con la cella.</p>
          <p><b>Compatibilità</b> (Part I Table 5, PDF pag. 50): X = ammessa; vuoto = non ammessa; numero = ammessa alle condizioni della nota. Il gruppo A si conserva da solo; L va sempre separato.</p>
          <table className="tbl compact grid-table"><thead><tr><th />{CGS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{CGS.map((a) => <tr key={a}><th>{a}</th>{CGS.map((b) => <td key={b}>{table5Cell(a, b)}</td>)}</tr>)}</tbody></table>
          <button onClick={() => toggle('notes45')}>{open.notes45 ? 'Nascondi' : 'Mostra'} il testo delle note</button>
          {open.notes45 && <div className="norm-block">
            {Object.entries(TABLE4.notes).map(([k, t]) => <p key={'4' + k}><b>Table 4 nota {k}</b>: {t}</p>)}
            {Object.entries(TABLE5.notes).map(([k, t]) => <p key={'5' + k}><b>Table 5 nota {k}</b>: {t}</p>)}
          </div>}
        </Sec>

        <Sec id="sitiunici">
          <p>Se due PES <b>non sono separati dalla IMD appropriata</b>, si considerano un unico sito e si usa il NEQ aggregato, combinando le HD con Table 4 <Ref>Part I §1.3.2.3.4</Ref>.</p>
          <ol>
            <li>Lo strumento parte con un sito per magazzino.</li>
            <li>Se una coppia tra due magazzini con contenuto è non conforme (qualunque effetto la governi), i due siti si uniscono.</li>
            <li>Il NEQ aggregato cresce, quindi crescono anche le IMD: si ripete finché non ci sono nuove unioni.</li>
            <li>Le distanze verso tutti gli altri ES si calcolano da ogni magazzino del sito, con il contenuto aggregato.</li>
          </ol>
          <p>Eccezione: per HD 1.1 sotto 500 kg le IMD danno già protezione elevata e non serve aggregare <Ref>§1.3.1.10.3</Ref>. L'aggregazione può propagarsi “a cascata” in un deposito affollato: è il comportamento previsto, e mostra dove la disposizione va rivista.</p>
        </Sec>

        <Sec id="speciali">
          <p><b>IBD ridotte</b> <Ref>Part I §1.3.6.6.2</Ref>: per ECM con terrapieno conforme (≥ 0,6 m, pendenza consigliata 2:1) e volume interno &gt; 500 m³, con HD 1.1 fino a 45 t, si possono usare BD28 di lato e BD25 dal retro per l'IBD, e i 2/3 per la PTRD. Gli altri effetti vanno comunque calcolati. Nello strumento si attiva con una casella sull'ECM.</p>
          <p><b>Terrapieno condiviso</b> <Ref>§1.3.6.6.3</Ref>: due ECM con terrapieno comune trasmettono meglio l'urto. Se i terrapieni si intersecano a 3/4 dell'altezza o più valgono le distanze BD5; tra 1/2 e 3/4 BD4; a 1/2 o meno, IMD normali. Per ECM non definiti in Annex II-B, in linea di principio BD6.</p>
        </Sec>

        <Sec id="barricate">
          <p>Una barricata efficace intercetta le proiezioni a bassa angolazione e alta velocità che causerebbero la propagazione immediata <Ref>Part II §2.2.3.1</Ref>. La geometria si verifica in sezione <Ref>§2.2.3.2, Fig. 2-2/2-3, PDF pag. 277</Ref>:</p>
          <ul>
            <li><b>Punto A</b> sulla catasta più bassa, in sommità della faccia lontana dall'altra (o della faccia vicina, se c'è un tetto protettivo); <b>B</b> sulla sommità dell'altra catasta.</li>
            <li>La linea <b>AB</b> deve attraversare almeno <b>2,4 m</b> di barricata o terreno naturale.</li>
            <li>Se le cataste distano meno di <b>5·Q<sup>1/3</sup></b>, una linea <b>CD</b> parallela 0,30 m sopra AB deve attraversare almeno <b>1,0 m</b>. Oltre 5·Q<sup>1/3</sup> si verifica rispetto a ciascuna catasta.</li>
            <li><b>Lunghezza</b>: la barricata deve superare di almeno 1,0 m le rette che congiungono gli estremi delle due cataste (Fig. 2-4).</li>
            <li><b>Materiale</b>: c.a. o mattoni valgono 4 volte il loro spessore di terra <Ref>§2.2.3.3.1</Ref>; niente macerie né pietre oltre 0,20 m.</li>
            <li><b>Cratere</b>: raggio ≈ ½·NEQ<sup>1/3</sup> dal centro dell'esplosivo; la barricata non deve esserne scalzata per più di 1/3 del suo spessore al piede <Ref>§2.2.3.3.3</Ref>.</li>
          </ul>
          <p>Nello strumento la barricata in pianta è una linea grafica e la sua lunghezza si verifica nel pannello Oggetto; l'altezza e lo spessore si verificano nella vista “Barricate”. L'effetto sulla QD si imposta sul magazzino (colonne g/h, i/j).</p>
        </Sec>

        <Sec id="danni">
          <p>Sovrapressione di picco incidente attesa per HD 1.1 da cataste e strutture leggere, in funzione della distanza scalata <Ref>Part I §1.3.7.3, PDF pag. 82–83</Ref> (valida sopra 4 500 kg; per NEQ minori i danni da blast possono essere sovrastimati, e i frammenti possono dominare):</p>
          <table className="tbl compact"><thead><tr><th>Distanza scalata (m/kg<sup>1/3</sup>)</th><th>Sovrapressione (bar)</th></tr></thead><tbody>
            {[['55,5·Q^1/3', '0,015'], ['44,4–33,3·Q^1/3', '0,02–0,03'], ['22,2·Q^1/3', '0,05'], ['14,8·Q^1/3', '0,09'], ['9,6·Q^1/3', '0,16'], ['8,0·Q^1/3', '0,21'], ['7,2·Q^1/3', '0,24'], ['3,6·Q^1/3', '0,70'], ['2,4·Q^1/3', '1,80']].map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}
          </tbody></table>
          <p>Gli ECM attenuano il blast di lato e soprattutto dal retro: 0,05 bar a 18,0·Q<sup>1/3</sup> di lato e a 14,0·Q<sup>1/3</sup> dal retro (sono i coefficienti di BD28 e BD25, le IBD ridotte); 0,09 bar a 12,0·Q<sup>1/3</sup> di lato e a 9,3·Q<sup>1/3</sup> dal retro (BD23 e BD20, le PTRD ridotte). Valori non applicabili oltre 45 t o per volumi sotto 500 m³. Per ogni coppia lo strumento riporta il livello di protezione della cella; il dettaglio dei danni per categoria di persone e strutture è in §1.3.7.</p>
        </Sec>

        <Sec id="gestione">
          <ul>
            <li><b>Riempimento</b>: il contenuto del magazzino (stessa composizione, MCE invariato) si scala finché tutte le coppie del magazzino o del suo sito unico restano conformi; il risultato è il NEQ ammesso e la percentuale di riempimento. Oltre il campo delle formule la quantità non è ammessa.</li>
            <li><b>Dove ci sta</b>: per una consegna (HD, gruppo, NEQ) si cerca il NEQ massimo aggiungibile a ogni magazzino, verificando anche Table 5. Attenzione: anche pochi kg di 1.1 in un magazzino di 1.2/1.3 fanno trattare tutto come 1.1 aggregata.</li>
            <li><b>Rischi accettati</b>: una coppia non conforme o una miscelazione non ammessa può essere accettata formalmente (motivazione, chi, data). Resta visibile ovunque e nei documenti.</li>
            <li><b>Revisioni</b>: il piano approvato si congela con tutti i risultati; le modifiche future (una casa nuova, un magazzino) si provano sul piano attuale e si confrontano con la revisione.</li>
          </ul>
        </Sec>

        <Sec id="validazione">
          <ul>
            <li>Le formule sono confrontate con le tabelle di consultazione (Annex I-A Tables 10–12): <b>5 239 valori, 5 195 identici, 44 differenze tutte spiegate</b> (33 per il refuso della riga 4 000 kg di Table 10, che contiene i valori di 4 500 kg; 6 per DFD8; 5 raccordi tra tratti).</li>
            <li>Round-trip distanza → quantità → distanza su 20 769 punti; restano solo 6 casi legittimi dovuti a discontinuità non monotone.</li>
            <li>Il porting in TypeScript è confrontato col motore JavaScript originale su una griglia densa e su tutti i raccordi.</li>
            <li>Le formule Excel del file di verifica sono valutate e confrontate col motore su oltre 8 000 punti.</li>
            <li>Settori, distanze, Table 4 (81 coppie), siti unici, barricate, documenti e revisioni hanno test dedicati.</li>
          </ul>
        </Sec>

        <Sec id="flusso">
          <ol>
            <li>Caricare il disegno di sfondo e calibrarlo su due punti noti.</li>
            <li>Disegnare magazzini ed ES dal menù rapido; orientare la porta (azimut del fronte).</li>
            <li>Inserire il contenuto (a mano o da Excel) e controllare Table 4/5 nel pannello del magazzino.</li>
            <li>Leggere la scheda sito: coppie non conformi, siti unici, linee IBD.</li>
            <li>Per ogni coppia non conforme: spostare, ridurre, barricare (verifica in sezione) o accettare formalmente il rischio.</li>
            <li>Calcolare riempimento e capacità; produrre Excel di verifica, DXF, tavola in scala e relazione; congelare la revisione approvata.</li>
          </ol>
          <p>È lo stesso percorso del diagramma di flusso di Annex I-B (PDF pag. 253): effetti dalla Table 1, formula dalla matrice, valore dalla formula, governa il massimo.</p>
        </Sec>

        <Sec id="riferimenti">
          <table className="tbl compact"><thead><tr><th>Contenuto</th><th>Posizione</th><th>Pag. PDF</th></tr></thead><tbody>
            {[['Effetti per HD (Table 1)', 'Part I Ch.1/Ch.3', '35'], ['Classificazione, Tables 2–3', 'Part I Ch.2 §1.2.2', '47'], ['Miscelazione HD (Table 4)', 'Part I §1.2.3.2', '49'], ['Compatibilità (Table 5)', 'Part I §1.2.3.3', '50'],
              ['Tipi di QD, IMD, EWD, PTRD, IBD', 'Part I §1.3.1', '55–63'], ['Misura delle distanze', 'Part I §1.3.2.2', '67'], ['NEQ, MCE', 'Part I §1.3.2.3–1.3.2.4', '—'],
              ['Terrapieno, IBD ridotte', 'Part I §1.3.6.6', '80'], ['Danni attesi', 'Part I §1.3.7', '82–83'], ['Settori Fig. A-1/A-2', 'Annex I-A Sect. I §7–11', '96–98'],
              ['Matrici PES/ES', 'Annex I-A Tables 1–4', '100–231'], ['Formule BD, DFD, P1D, P2D, TD', 'Annex I-A Tables 5–9', '232–240'], ['Tabelle di consultazione', 'Annex I-A Tables 10–12', '241–252'],
              ['Diagramma di flusso', 'Annex I-B', '253'], ['Barricate', 'Part II §2.2.3', '276–280']].map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}
          </tbody></table>
          <p className="hint">Norme da reperire: AASTP-1.1 (site plan manual, modulo QD Annex A), AASTP-1.2 (curve DFD con barricate), AASTP-3 (gruppi di sensibilità), AASTP-5 (depositi da campo).</p>
        </Sec>

        <Sec id="glossario">
          <dl className="gloss">
            {[['BD / DFD / P1D / P2D / TD', 'formule di distanza per blast, detriti e frammenti, progressivo 1.2.1 e 1.2.2, termico'], ['ECM', 'Earth Covered Magazine, magazzino coperto di terra (7 bar o 3 bar se conforme a Part II)'],
              ['Headwall', 'testata frontale dell’ECM con la porta'], ['Sito unico', 'insieme di PES non separati dalla IMD appropriata, trattati come un solo PES'],
              ['Distanza scalata', 'D/Q^(1/3), in m/kg^(1/3)'], ['Livello di protezione V/H/L', 'virtualmente completa / elevata / limitata (protezione delle scorte all’ES)'],
              ['Rischio accettato', 'non conformità accettata formalmente da chi ne ha l’autorità']].map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}
          </dl>
        </Sec>
      </div>
    </div>
  );
}
