/* "Help" tab, English version: same structure, anchors and components as the Italian guide in HelpView.tsx.
   The tables (effects, formulas, matrices, Table 4/5) are generated from the engine data, so they match the calculation. */
import { EFFMAP, EFFNAME, COLCODE, ES_ROWS, HDS, MATRIX, type TableId } from '../engine/matrix';
import { CGS, HD_FULL, TABLE4, TABLE5, table4Cell, table5Cell } from '../engine/mixing';
import { txText, formulaTable } from '../engine/formulas';
import { t } from '../i18n';
import { fmtInt } from './format';
import { Calculator, Ref, Sec, SectorFigure, type HelpBodyProps } from './HelpView';

/** Guide in English (full translation of HelpIt). */
export function HelpEn({ open, toggle, formulas }: HelpBodyProps) {
  return (
    <>
        <p className="draft-note">This guide explains the method by which the tool applies AASTP-1 Edition D Version 1 (Nov. 2025). It does not replace the standard:
          the references in brackets point to paragraphs and pages of the PDF, which must be consulted for every decision. Every result is a DRAFT to be checked and signed by qualified personnel.</p>

        <Sec id="scopo">
          <p>The purpose of <b>Quantity-Distances (QD)</b> is to keep sites that may explode at such distances as to ensure the minimum practicable risk to people, buildings and ammunition <Ref>Part I §1.3.1.1</Ref>.
            The distances are based on trials and on the analysis of real accidents, and remain subject to the uncertainty inherent in explosions <Ref>§1.3.1.2</Ref>; for HD 1.1 they assume the TNT equivalence of the materials.</p>
          <p>The AASTP-1 Ed. D method is divided into three parts, all implemented in the engine:</p>
          <ol>
            <li><b>which effects</b> to consider and with which quantity (Part I Ch.3 Table 1);</li>
            <li><b>which formula</b> applies to each effect, given the type of PES and ES (matrices of Annex I-A Tables 1–4);</li>
            <li><b>what value</b> the formula gives (Annex I-A Tables 5–9), rounded up.</li>
          </ol>
          <p>Each effect is calculated separately: <b>the greatest distance governs</b>, i.e. the smallest quantity <Ref>§1.3.1.4.2</Ref>.</p>
          <p><b>Not covered</b>: underground storage (Part III), airfields and ports (Part IV), field storage (AASTP-5), the QD module of AASTP-1.1 Annex A. Cell notes that refer to the text (e.g. 1.3.5.6, 1.3.3.5) are shown but not evaluated.</p>
        </Sec>

        <Sec id="concetti">
          <dl>
            <dt>PES — Potential Explosion Site</dt><dd>The location where an explosion may occur: magazine, stack, loaded vehicle.</dd>
            <dt>ES — Exposed Site</dt><dd>What must be protected: other magazines (to protect the stocks), workshops, roads, inhabited buildings, utilities. A magazine is a PES for the others and an ES for the other PESs.</dd>
            <dt>NEQ — Net Explosive Quantity</dt><dd>Net mass of explosive in kg. For a PES the total NEQ of everything that can react together is used <Ref>§1.3.2.3</Ref>; for HD 1.2 the contents of all rounds are summed.</dd>
            <dt>MCE — Maximum Credible Event</dt><dd>The largest single HD 1.1-equivalent event expected from a given quantity and type of ammunition; it is determined only for SsD 1.2.1, 1.2.3 and HD 1.6 <Ref>§1.3.2.4</Ref>.</dd>
            <dt>HD — Hazard Division</dt><dd>1.1 mass explosion; 1.2 projection without mass explosion; 1.3 mass fire; 1.4 minor hazard (distances from fire regulations, §1.3.1.8); 1.5 very insensitive substances (treated as 1.1); 1.6 extremely insensitive articles.</dd>
            <dt>SsD — Storage sub-Division</dt><dd>HD 1.2 is divided into 1.2.1 (HE per round &gt; 0.136 kg), 1.2.2 (≤ 0.136 kg) and 1.2.3; HD 1.3 into 1.3.1 (mass fire) and 1.3.2 (progressive burning, less hazardous).</dd>
            <dt>CG — Compatibility Group</dt><dd>Letters A–S stating which ammunition may be stored together (Part I Ch.2, Table 5). The classification code combines HD and group, e.g. “1.1D” <Ref>§1.2.2.4</Ref>.</dd>
          </dl>
        </Sec>

        <Sec id="effetti">
          <p>Explosions produce different effects, which Ed. D separates and calculates one by one <Ref>Part I Ch.1 §5–7</Ref>:</p>
          <ul>
            <li><b>Blast</b> (shock wave) — BD formulas;</li>
            <li><b>Debris and fragments</b> — DFD formulas;</li>
            <li><b>Progressive event</b> of HD 1.2 (“popcorn”: reactions of individual rounds over time) — P1D for 1.2.1, P2D for 1.2.2;</li>
            <li><b>Thermal</b> — TD for 1.3.1, 1.3.2, and the thermal effect of 1.2.3 and 1.6.</li>
          </ul>
          <p>The following table (Part I Ch.3 Table 1) states which effects apply to each HD and whether the quantity is the total NEQ or the MCE:</p>
          <table className="tbl compact"><thead><tr><th>HD / SsD</th>{(['blast', 'debris', 'p121', 'p122', 't131', 't132'] as const).map((e) => <th key={e}>{t(EFFNAME[e])}</th>)}</tr></thead>
            <tbody>{HDS.map((h) => <tr key={h}><td><b>{h}</b></td>{(['blast', 'debris', 'p121', 'p122', 't131', 't132'] as const).map((e) => <td key={e}>{EFFMAP[h].find((x) => x[0] === e)?.[1] ?? ''}</td>)}</tr>)}</tbody></table>
          <p className="hint">Note: in the matrices the thermal effect of 1.2.3 and 1.6 is read in the “Thermal 1.3.2” row, as the original sheet does.</p>
        </Sec>

        <Sec id="distanze">
          <p>AASTP-1 distinguishes <b>internal</b> and <b>external</b> distances <Ref>§1.3.1.3</Ref>:</p>
          <table className="tbl compact"><tbody>
            <tr><td><b>IMD</b> Inter-Magazine Distance</td><td>between magazines (ES 1–17): protects the stocks from immediate propagation <Ref>§1.3.1.9–1.3.1.12</Ref>. At least 10 m is recommended in any case for practical reasons.</td></tr>
            <tr><td><b>EWD</b> Explosives Workshop Distance</td><td>to explosives workshops (ES 18–20); for HD 1.1 the expected overpressure does not exceed 20 kPa <Ref>§1.3.1.13</Ref>.</td></tr>
            <tr><td><b>PTRD</b> Public Traffic Route Distance</td><td>roads, railways, waterways, footpaths (ES 21–23), by traffic density <Ref>§1.3.1.15</Ref>. For “very low” use (&lt; 20 per day) no QD.</td></tr>
            <tr><td><b>IBD</b> Inhabited Building Distance</td><td>inhabited buildings and places of assembly (ES 24). For HD 1.1 it is based on an overpressure of 5 kPa and on no more than one hazardous fragment (&gt; 79 J) per 56 m² <Ref>§1.3.1.16</Ref>; it does not prevent glass breakage.</td></tr>
            <tr><td>Vulnerable constructions</td><td>ES 25 (e.g. schools, hospitals, large glazed buildings): distances greater than the IBD.</td></tr>
            <tr><td>Services and utilities</td><td>ES 26a/b (support offices and canteens), 27a–c (power lines), 28a–c (POL and pipelines).</td></tr>
          </tbody></table>
          <p>Between magazines the matrices also give the <b>level of protection</b> of the stocks at the ES <Ref>§1.3.1.10.2</Ref>:</p>
          <ul>
            <li><b>Virtually complete (V)</b>: no immediate propagation; stocks probably usable;</li>
            <li><b>High (H)</b>: high protection, occasional subsequent fires or explosions possible;</li>
            <li><b>Limited (L)</b>: limited protection, stocks probably damaged; not recommended for new construction.</li>
          </ul>
          <p>“No QD” in the matrix means that the PES or ES already protects against the effects; separation is dictated by construction, access and fire-fighting <Ref>§1.3.1.4.3</Ref>.</p>
        </Sec>

        <Sec id="scala">
          <p>For blast the Hopkinson–Cranz scaling law applies: for the same overpressure, the distance grows with the cube root of the charge. This is why many blast formulas are</p>
          <p className="formula-big">D = k · Q<sup>1/3</sup></p>
          <p>where k (m/kg<sup>1/3</sup>) is the <b>scaled distance</b> associated with a level of damage. For small quantities some formulas use segments in Q<sup>2/3</sup> and Q<sup>1/2</sup> (e.g. BD31: 1.5·Q<sup>2/3</sup> up to 2 500 kg, 5.5·Q<sup>1/2</sup> up to 4 500 kg, then 22.2·Q<sup>1/3</sup>).
            Debris and fragments do not follow a simple scaling law <Ref>§1.3.7.3.3</Ref>: the DFDs are piecewise functions with powers, logarithms and fixed segments.
            The progressive formulas P1D/P2D are polynomials in ln(Q); the thermal TD formulas have a fixed minimum and then grow with Q<sup>1/3</sup> or Q<sup>1/2</sup>.</p>
          <p>Every formula has a <b>range of validity</b>: outside the range the standard gives no distance and the tool reports “to be checked”, without extrapolating (e.g. BD16, BD19, BD20, BD23, BD25, BD28, BD33, BD34 up to 45 t; BD1 up to 120 t).</p>
          <h4>Calculator</h4>
          <Calculator />
          <h4>All formulas (Annex I-A Tables 5–9)</h4>
          <button onClick={() => toggle('formule')}>{open.formule ? 'Hide' : 'Show'} the {formulas.length} formulas</button>
          {open.formule && <table className="tbl compact"><thead><tr><th>Formula</th><th>Table</th><th>Segments (Q in kg → D in m)</th></tr></thead><tbody>
            {formulas.map(({ r, segs }) => <tr key={r}><td><b>{r}</b></td><td>{formulaTable(r)}</td><td>{segs.map((g, i) => <div key={i}><code>{fmtInt(g[0])}{g[1] ? ' ≤ ' : ' < '}Q{g[3] ? ' ≤ ' : ' < '}{fmtInt(g[2])}: {txText(g[4].tx)}</code></div>)}</td></tr>)}
          </tbody></table>}
          <p className="hint">Deviations from the printed text, all conservative or consistent with the inverse formulas and the look-up tables: P1D3 and P2D3 with 0.67; DFD20 in the 400–3 375 and 5 000–7 020 kg segments from the inverse formulas; DFD8 with the printed coefficient 0.141 (+1 m compared with Table 11).</p>
        </Sec>

        <Sec id="matrici">
          <p>The matrices of Annex I-A (PDF pp. 100–231) cross the <b>PES type</b> (columns a–j) with the <b>ES type</b> (rows 1–28c). Each cell contains, for each effect, the formula to use, a fixed distance, “No QD” or “Not applicable”, the level of protection and notes.</p>
          <button onClick={() => toggle('pes')}>{open.pes ? 'Hide' : 'Show'} the PES columns</button>
          {open.pes && <table className="tbl compact"><tbody>{(['1', '2', '3', '4'] as TableId[]).flatMap((tid) => MATRIX.tables[tid].cols.map((c, i) => <tr key={tid + i}><td><b>({COLCODE[tid][i]})</b></td><td>Table {tid} — {MATRIX.tables[tid].title}</td><td>{c}</td></tr>))}</tbody></table>}
          {' '}<button onClick={() => toggle('es')}>{open.es ? 'Hide' : 'Show'} the ES rows</button>
          {open.es && <table className="tbl compact"><tbody>{ES_ROWS.map((r) => <tr key={r}><td><b>ES {r}</b></td><td>{MATRIX.es[r]}</td></tr>)}</tbody></table>}
          <h4>How to read a cell</h4>
          <ul>
            <li><b>Alternatives</b> (“BD31 or BD25”): by default the tool uses the <b>most conservative valid one</b> (greatest distance, excluding those out of range). The others apply only under the conditions written in the cell notes or in the ES description; the choice is saved per pair with a justification.</li>
            <li><b>Conditions</b>: MCE ≤ / &gt; 50 kg and internal volume of the PES ≤ / &gt; 20 m³ are filtered automatically.</li>
            <li><b>Merged cells</b> blast + debris: the blast cell applies, including the choice between alternatives.</li>
            <li><b>Capped distance</b> (“TD1 ≤ 60 m”): the formula is limited to the value given.</li>
          </ul>
          <p>The PES type is chosen from the quick menu (ECM, heavy walls, medium walls, light structure/stack); the exact column is decided by orientation and barricades. A magazine as an ES has its own row: ECM 1–11 according to class and orientation, heavy walls 12/13, medium 14/15, stacks 16/17.</p>
        </Sec>

        <Sec id="settori">
          <p>ECMs and heavy-walled magazines with a door are <b>directional</b>: from the door (front face) the effects are stronger. The zones are bounded by lines drawn from the corners <Ref>Annex I-A Sect. I §7–11, Fig. A-1/A-2, PDF pp. 96–98</Ref>:</p>
          <div className="fig-row">
            <SectorFigure front={150} rear={135} title="Fig. A-1: ECM with HD 1.1/1.3 (and ECM as ES; MCE of 1.2.1, 1.2.3, 1.6). Front 150°, rear 135°." />
            <SectorFigure front={100} rear={135} title="Fig. A-2: ECM or heavy-walled magazine with HD 1.2 (progressive effects). Front 100°." />
          </div>
          <p>“Line at N° from the face” means that the line forms (N − 90)° with the normal to the face: <b>150° → ±60°</b>, <b>135° → ±45°</b>, <b>100° → ±10°</b>. Measurements on the PDF figures confirm this reading.</p>
          <ul>
            <li>As a <b>PES</b>: ES in the front sector → column (c); side → (b); rear → (a).</li>
            <li>As an <b>ES</b> (exposed ECM): one looks at which sector of the ES the PES falls in: rear → door facing away (rows 1/4/9), side → perpendicular (2/5/10), front → door facing the PES (3/6/7/8/11).</li>
            <li>An ES <b>straddling</b> several sectors is evaluated in each, with the distance of only the part falling within it; on the boundary the greater QD applies <Ref>§10</Ref>.</li>
            <li>Heavy walls with the door on the front (column (e)): 100° for HD 1.2 (§11); for the other effects the standard gives no angle and the tool uses 150°, a conservative choice decided on 23/11/2026.</li>
          </ul>
        </Sec>

        <Sec id="misura">
          <p>QDs are measured <b>from the nearest point of the PES to the nearest point of the ES</b>, in a straight line, disregarding barricades or earth mounds <Ref>Part I §1.3.2.2.1</Ref>. If the NEQ is subdivided into stacks that cannot all react together, the distance is measured from the wall adjacent to the governing stack <Ref>§1.3.2.2.2</Ref>.</p>
          <p>In the tool the drawn outline is the one measured from: for ECMs draw the footprint of the structure, not the toe of the earth cover. Roads, power lines and pipelines are lines: their nearest point counts.</p>
        </Sec>

        <Sec id="arrotondamenti">
          <ul>
            <li>Distances are rounded <b>up to the metre</b>; the quantity derived from a distance <b>down to the kg</b> <Ref>Annex I-A Sect. I §5</Ref>.</li>
            <li>At the <b>transition</b> between two segments the greater distance is taken (“the furthest distance or smallest quantity”, note to Table 5).</li>
            <li>The <b>inverse calculation</b> returns the largest Q such that <i>every</i> q ≤ Q requires at most the given distance: in this way it respects the smallest-quantity rule even where the function has jumps.</li>
            <li>With several effects: permitted NEQ = minimum over the NEQ-based effects, permitted MCE = minimum over the MCE-based ones.</li>
          </ul>
        </Sec>

        <Sec id="misto">
          <p>Ammunition of different HDs may be stored together if compatible; the QD is calculated with the rules of <b>Part I Table 4</b> <Ref>§1.2.3.2, PDF p. 49</Ref>:</p>
          <table className="tbl compact grid-table"><thead><tr><th />{HD_FULL.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{HD_FULL.map((a) => <tr key={a}><th>{a}</th>{HD_FULL.map((b) => <td key={b}>{table4Cell(a, b)}</td>)}</tr>)}</tbody></table>
          <ul>
            <li><b>Note 1</b> (1.1 or 1.5 with 1.2): the greater QD of (a) everything aggregated as 1.1 and (b) HD 1.2 alone with its own criteria.</li>
            <li><b>Note 2</b> (different SsDs): they are not summed; each with its own NEQ, the greater governs.</li>
            <li><b>Note 3</b>: HD 1.4 is not aggregated.  <b>Note 4</b>: HD 1.6 with 1.2/1.3 becomes SsD 1.2.3.  <b>Note 5</b>: 1.3.1 + 1.3.2 are summed and the greater QD of “as 1.3.1” and “as 1.3.2” is taken.</li>
            <li><b>Note 6</b>: 1.2.1/1.2.2 with 1.3 may behave as aggregated 1.1: the tool warns and, on request, adds the case.</li>
            <li>1.1, 1.2 and 1.3 together: the greater QD considering the total NEQ as 1.1, as 1.2 and as 1.3 <Ref>§1.2.3.3.3</Ref>.</li>
          </ul>
          <p>The tool generalises the pairwise rules to several HDs in the same magazine, producing a list of <b>calculation cases</b>; the QD of the magazine is the maximum over the cases. A test checks that for all 81 HD pairs the rule applied matches the cell.</p>
          <p><b>Compatibility</b> (Part I Table 5, PDF p. 50): X = permitted; blank = not permitted; number = permitted under the conditions of the note. Group A is stored on its own; L must always be kept separate.</p>
          <table className="tbl compact grid-table"><thead><tr><th />{CGS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{CGS.map((a) => <tr key={a}><th>{a}</th>{CGS.map((b) => <td key={b}>{table5Cell(a, b)}</td>)}</tr>)}</tbody></table>
          <button onClick={() => toggle('notes45')}>{open.notes45 ? 'Hide' : 'Show'} the text of the notes</button>
          {open.notes45 && <div className="norm-block">
            {Object.entries(TABLE4.notes).map(([k, txt]) => <p key={'4' + k}><b>Table 4 note {k}</b>: {txt}</p>)}
            {Object.entries(TABLE5.notes).map(([k, txt]) => <p key={'5' + k}><b>Table 5 note {k}</b>: {txt}</p>)}
          </div>}
        </Sec>

        <Sec id="sitiunici">
          <p>If two PESs <b>are not separated by the appropriate IMD</b>, they are considered a single site and the aggregated NEQ is used, combining the HDs with Table 4 <Ref>Part I §1.3.2.3.4</Ref>.</p>
          <ol>
            <li>The tool starts with one site per magazine.</li>
            <li>If a pair between two magazines with contents is non-compliant (whichever effect governs it), the two sites are merged.</li>
            <li>The aggregated NEQ grows, so the IMDs grow too: the process is repeated until there are no new mergers.</li>
            <li>The distances to all other ESs are calculated from every magazine of the site, with the aggregated contents.</li>
          </ol>
          <p>Exception: for HD 1.1 below 500 kg the IMDs already give high protection and aggregation is not needed <Ref>§1.3.1.10.3</Ref>. Aggregation can propagate in a “cascade” in a crowded depot: this is the intended behaviour, and it shows where the layout needs to be reviewed.</p>
        </Sec>

        <Sec id="speciali">
          <p><b>Reduced IBDs</b> <Ref>Part I §1.3.6.6.2</Ref>: for ECMs with compliant earth cover (≥ 0.6 m, recommended slope 2:1) and internal volume &gt; 500 m³, with HD 1.1 up to 45 t, BD28 from the side and BD25 from the rear may be used for the IBD, and 2/3 of these for the PTRD. The other effects must still be calculated. In the tool it is enabled with a check box on the ECM.</p>
          <p><b>Shared earth mound</b> <Ref>§1.3.6.6.3</Ref>: two ECMs with a common earth mound transmit the shock more readily. If the earth mounds intersect at 3/4 of the height or more, the BD5 distances apply; between 1/2 and 3/4 BD4; at 1/2 or less, normal IMDs. For ECMs not defined in Annex II-B, in principle BD6.</p>
        </Sec>

        <Sec id="barricate">
          <p>An effective barricade intercepts the low-angle, high-velocity projections that would cause immediate propagation <Ref>Part II §2.2.3.1</Ref>. The geometry is checked in cross-section <Ref>§2.2.3.2, Fig. 2-2/2-3, PDF p. 277</Ref>:</p>
          <ul>
            <li><b>Point A</b> on the lower stack, at the top of the face remote from the other stack (or of the near face, if there is a protective roof); <b>B</b> at the top of the other stack.</li>
            <li>The line <b>AB</b> must pass through at least <b>2.4 m</b> of barricade or natural ground.</li>
            <li>If the stacks are less than <b>5·Q<sup>1/3</sup></b> apart, a line <b>CD</b> parallel to and 0.30 m above AB must pass through at least <b>1.0 m</b>. Beyond 5·Q<sup>1/3</sup> the check is made with respect to each stack.</li>
            <li><b>Length</b>: the barricade must extend at least 1.0 m beyond the lines joining the ends of the two stacks (Fig. 2-4).</li>
            <li><b>Material</b>: reinforced concrete or brick count as 4 times their thickness of earth <Ref>§2.2.3.3.1</Ref>; no rubble or stones larger than 0.20 m.</li>
            <li><b>Crater</b>: radius ≈ ½·NEQ<sup>1/3</sup> from the centre of the explosives; the barricade must not be undermined by more than 1/3 of its thickness at the base <Ref>§2.2.3.3.3</Ref>.</li>
          </ul>
          <p>In the tool the barricade in plan is a graphic line and its length is checked in the Object panel; height and thickness are checked in the “Barricades” view. The effect on the QD is set on the magazine (columns g/h, i/j).</p>
        </Sec>

        <Sec id="danni">
          <p>Expected peak incident overpressure for HD 1.1 from stacks and light structures, as a function of the scaled distance <Ref>Part I §1.3.7.3, PDF pp. 82–83</Ref> (valid above 4 500 kg; for smaller NEQs blast damage may be overestimated, and fragments may dominate):</p>
          <table className="tbl compact"><thead><tr><th>Scaled distance (m/kg<sup>1/3</sup>)</th><th>Overpressure (bar)</th></tr></thead><tbody>
            {[['55.5·Q^1/3', '0.015'], ['44.4–33.3·Q^1/3', '0.02–0.03'], ['22.2·Q^1/3', '0.05'], ['14.8·Q^1/3', '0.09'], ['9.6·Q^1/3', '0.16'], ['8.0·Q^1/3', '0.21'], ['7.2·Q^1/3', '0.24'], ['3.6·Q^1/3', '0.70'], ['2.4·Q^1/3', '1.80']].map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}
          </tbody></table>
          <p>ECMs attenuate the blast to the side and above all to the rear: 0.05 bar at 18.0·Q<sup>1/3</sup> from the side and at 14.0·Q<sup>1/3</sup> from the rear (these are the coefficients of BD28 and BD25, the reduced IBDs); 0.09 bar at 12.0·Q<sup>1/3</sup> from the side and at 9.3·Q<sup>1/3</sup> from the rear (BD23 and BD20, the reduced PTRDs). Values not applicable above 45 t or for volumes below 500 m³. For each pair the tool reports the level of protection of the cell; the details of damage by category of people and structures are in §1.3.7.</p>
        </Sec>

        <Sec id="gestione">
          <ul>
            <li><b>Filling</b>: the contents of the magazine (same composition, MCE unchanged) are scaled as long as all pairs of the magazine or of its single site remain compliant; the result is the permitted NEQ and the filling percentage. Beyond the range of the formulas the quantity is not permitted.</li>
            <li><b>Where it fits</b>: for a delivery (HD, group, NEQ) the maximum NEQ that can be added to each magazine is searched for, also checking Table 5. Caution: even a few kg of 1.1 in a 1.2/1.3 magazine cause everything to be treated as aggregated 1.1.</li>
            <li><b>Accepted risks</b>: a non-compliant pair or a non-permitted mixing may be formally accepted (justification, by whom, date). It remains visible everywhere and in the documents.</li>
            <li><b>Revisions</b>: the approved plan is frozen with all its results; future changes (a new house, a new magazine) are tried on the current plan and compared with the revision.</li>
          </ul>
        </Sec>

        <Sec id="validazione">
          <ul>
            <li>The formulas are compared with the look-up tables (Annex I-A Tables 10–12): <b>5 239 values, 5 195 identical, 44 differences all explained</b> (33 due to the misprint in the 4 000 kg row of Table 10, which contains the 4 500 kg values; 6 due to DFD8; 5 transitions between segments).</li>
            <li>Round trip distance → quantity → distance on 20 769 points; only 6 legitimate cases remain, due to non-monotonic discontinuities.</li>
            <li>The TypeScript port is compared with the original JavaScript engine on a dense grid and at all transitions.</li>
            <li>The Excel formulas of the verification workbook are evaluated and compared with the engine on more than 8 000 points.</li>
            <li>Sectors, distances, Table 4 (81 pairs), single sites, barricades, documents and revisions have dedicated tests.</li>
          </ul>
        </Sec>

        <Sec id="flusso">
          <ol>
            <li>Load the background drawing and calibrate it on two known points.</li>
            <li>Draw magazines and ESs from the quick menu; orient the door (azimuth of the front).</li>
            <li>Enter the contents (by hand or from Excel) and check Table 4/5 in the magazine panel.</li>
            <li>Read the site sheet: non-compliant pairs, single sites, IBD lines.</li>
            <li>For each non-compliant pair: move, reduce, barricade (cross-section check) or formally accept the risk.</li>
            <li>Calculate filling and capacity; produce the verification Excel workbook, DXF, scaled drawing and report; freeze the approved revision.</li>
          </ol>
          <p>This is the same path as the flow chart of Annex I-B (PDF p. 253): effects from Table 1, formula from the matrix, value from the formula, the maximum governs.</p>
        </Sec>

        <Sec id="riferimenti">
          <table className="tbl compact"><thead><tr><th>Content</th><th>Location</th><th>PDF page</th></tr></thead><tbody>
            {[['Effects by HD (Table 1)', 'Part I Ch.1/Ch.3', '35'], ['Classification, Tables 2–3', 'Part I Ch.2 §1.2.2', '47'], ['HD mixing (Table 4)', 'Part I §1.2.3.2', '49'], ['Compatibility (Table 5)', 'Part I §1.2.3.3', '50'],
              ['QD types, IMD, EWD, PTRD, IBD', 'Part I §1.3.1', '55–63'], ['Measurement of distances', 'Part I §1.3.2.2', '67'], ['NEQ, MCE', 'Part I §1.3.2.3–1.3.2.4', '—'],
              ['Earth mound, reduced IBDs', 'Part I §1.3.6.6', '80'], ['Expected damage', 'Part I §1.3.7', '82–83'], ['Sectors Fig. A-1/A-2', 'Annex I-A Sect. I §7–11', '96–98'],
              ['PES/ES matrices', 'Annex I-A Tables 1–4', '100–231'], ['BD, DFD, P1D, P2D, TD formulas', 'Annex I-A Tables 5–9', '232–240'], ['Look-up tables', 'Annex I-A Tables 10–12', '241–252'],
              ['Flow chart', 'Annex I-B', '253'], ['Barricades', 'Part II §2.2.3', '276–280']].map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}
          </tbody></table>
          <p className="hint">Standards to be obtained: AASTP-1.1 (site plan manual, QD module Annex A), AASTP-1.2 (DFD curves with barricades), AASTP-3 (sensitivity groups), AASTP-5 (field storage).</p>
        </Sec>

        <Sec id="glossario">
          <dl className="gloss">
            {[['BD / DFD / P1D / P2D / TD', 'distance formulas for blast, debris and fragments, progressive 1.2.1 and 1.2.2, thermal'], ['ECM', 'Earth Covered Magazine, magazine covered with earth (7 bar, or 3 bar if compliant with Part II)'],
              ['Headwall', 'front wall of the ECM containing the door'], ['Single site', 'set of PESs not separated by the appropriate IMD, treated as a single PES'],
              ['Scaled distance', 'D/Q^(1/3), in m/kg^(1/3)'], ['Level of protection V/H/L', 'virtually complete / high / limited (protection of the stocks at the ES)'],
              ['Accepted risk', 'non-compliance formally accepted by whoever has the authority to do so']].map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}
          </dl>
        </Sec>
    </>
  );
}
