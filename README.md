# QD Sito — pianificazione e verifica Quantity-Distance (AASTP-1 Ed. D V1)

Applicazione web (TypeScript + Vite + React) per disegnare la planimetria di un deposito di munizioni,
assegnare a magazzini ed ES le caratteristiche di AASTP-1 da un menù di selezione rapida e verificare
**tutte le coppie PES → ES** con settori automatici. Ogni risultato è una **BOZZA da verificare e firmare a cura
di personale qualificato**. Contesto completo e piano a fasi: [HANDOFF.md](HANDOFF.md).

## Avvio

```powershell
npm install
```
```powershell
npm run dev
```
```powershell
npm test
```
```powershell
npm run build
```

`npm run build` produce in `dist/` una pagina statica (percorsi relativi, apribile da qualsiasi cartella servita via HTTP).

## Struttura

```
src/engine/       motore QD puro (nessuna dipendenza dal DOM)
  formulas.ts     Tables 5–9: porting 1:1 di legacy/engine/qd_formulas.js
  matrix.ts       tipi e dati di Annex I-A Tables 1–4 (data/matrix.json), Part I Table 1 (EFFMAP)
  cell.ts         selezione della cella, filtro condizioni MCE/volume, alternativa più cautelativa
  validation.ts   confronto con Tables 10–12 e classificazione delle differenze
  mixing.ts       Part I Table 4 (miscelazione/aggregazione HD) e Table 5 (compatibilità)
  excelFormula.ts traduzione dei tratti delle formule in formule Excel
src/site/         modello di sito e verifica
  geometry.ts     rettangoli orientati, distanze contorno-contorno, ritaglio, settori Fig. A-1/A-2
  evaluate.ts     colonna PES e riga ES automatiche, tutte le coppie, scheda sito
  safeguard.ts    linee IBD / ES 25 / PTRD per settore
  capacity.ts     riempimento dei magazzini e "dove ci sta"
  inventoryImport.ts  lettura delle righe d'inventario (intestazioni, codici di classificazione)
  model.ts        progetto JSON (v2), contenuto dei magazzini, menù di selezione rapida
  calibrate.ts    calibrazione dello sfondo su due punti
  barricade.ts    barricate: verifica in sezione (AB, CD, cratere) e lunghezza in pianta
  workbook.ts     Excel di verifica con formule aperte (SheetJS)
  dxf.ts          export DXF R12 con layer e testi
  printSheet.ts   tavola SVG in scala esatta (mm) con cartiglio
  report.ts       relazione HTML: schede QD, rischi accettati, bozza di licenza dei limiti
  revisions.ts    revisioni approvate, confronto, ripristino
src/ui/           interfaccia: planimetria, viste Barricate / Tavola in scala / Revisioni / Help, dialoghi interni
data/             matrix.json, lookup.json (artefatti generati da extraction/: non modificarli a mano)
                  part1_tables45.json (Part I Tables 4 e 5: trascrizione manuale, verificata sul PDF renderizzato)
extraction/       script pdfplumber che rigenerano data/ dal PDF della norma
legacy/           motore JS e test originali, usati dai test per verificare l'identità del porting
tests/            Vitest
```

## Test (148)

- `tests/formulas.test.ts` — equivalenti di `legacy/tests/test.js` e `test2.js`:
  5 239 valori di Tables 10–12, **5 195 identici, 44 differenze tutte spiegate**
  (33 refuso della riga 4 000 kg di Table 10, 6 DFD8, 5 raccordi tra tratti);
  round-trip D(Q) → Q(D) su 20 769 punti con i soli 6 casi non monotoni noti.
  In più confronta il modulo TS con il file JS originale (`dExact`, `distance`, `quantity`, `segText`) su una griglia densa e su tutti i raccordi.
- `tests/site.test.ts` — logica di cella, settori 150°/135°/100°, punti sul confine, distanze, scelta della riga ES per gli ECM esposti,
  strade ritagliate per settore, linee IBD, salvataggio JSON, calibrazione.
- `tests/mixing.test.ts` — trascrizione di Tables 4 e 5 (simmetria, celle campione, numero di X) e, per **tutte le 81 coppie di HD**,
  che l'algoritmo applichi esattamente la regola della cella di Table 4; casi composti (§1.2.3.3.3, note 1, 4, 5, 6).
- `tests/phase3.test.ts` — barricate (sezione, muro ×4, cratere, lunghezza), formule Excel confrontate col motore su oltre 8 000 punti,
  Excel di verifica (formule riscritte e rilette), DXF R12, tavola in scala (100 m a 1:1000 = 100 mm), relazione, revisioni.
- `tests/phase2.test.ts` — inventario, siti unici (anche iterativi), eccezione < 500 kg, rischi accettati, IBD ridotte,
  terrapieno condiviso, riempimento confrontato col calcolo inverso, "dove ci sta", import da Excel.

## Uso

1. **Sfondo** (facoltativo): immagine o PDF della planimetria → **Calibra** cliccando due punti di distanza nota → **Sposta sfondo** se serve.
2. **Menù di selezione rapida** a sinistra: scegli un tipo (ECM 7 bar, pareti pesanti, catasta, edificio abitato, strada…) e clicca sulla planimetria.
   Le linee (strade, elettrodotti, oleodotti, recinzioni) si disegnano clic dopo clic; doppio clic o Invio per chiudere.
3. Nel pannello **Oggetto**: HD, NEQ, MCE, volume, dimensioni, azimut del fronte (porta). Il cerchio blu sul fronte ruota l'oggetto (Maiusc = 15°).
4. La tabella in basso verifica **tutte le coppie**; un clic apre la spiegazione nel pannello **Coppia** e disegna la quota sulla planimetria.
5. **Scheda sito**: stato complessivo, coppia peggiore, magazzini non conformi.
6. **Salva JSON / Apri…** per il file di progetto (`*.qdsite.json`). Il progetto è anche salvato automaticamente nel browser.
7. **Inventario Excel…** importa il contenuto dei magazzini (anteprima prima di applicare); **Modello** scarica il file di esempio,
   **Esporta** salva inventario e riepilogo di Table 4. Nel pannello Oggetto il contenuto si può anche scrivere a mano.
8. **Gestione**: riempimento dei magazzini, "dove ci sta" per una consegna, registro dei rischi accettati, opzione siti unici.
9. **Documenti** (menù in alto): Excel di verifica con formule aperte, DXF con linee etichettate, relazione HTML con schede QD
   e bozza di licenza dei limiti, tavola in scala. Tutto marcato BOZZA.
10. Viste **Barricate** (verifica in sezione), **Tavola in scala** (stampa o SVG in mm), **Revisioni** (piani approvati e confronto)
    e **Help** (teoria completa della valutazione QD, con calcolatrice e tabelle generate dal motore).

Scorciatoie: Ctrl+Z / Ctrl+Y, Canc elimina l'oggetto selezionato, Esc annulla lo strumento, rotella = zoom, trascinare il vuoto = spostare la vista.

## Scelte implementative della Fase 1

Oltre a quelle del motore (HANDOFF §3.1). La lettura degli angoli è confermata dalle misure su Fig. A-1/A-2; le altre righe restano da confermare o correggere:

| Tema | Scelta | Riferimento |
|---|---|---|
| Settori | La retta "a N° dalla facciata" forma (N − 90)° con la normale: fronte 150° → ±60°, retro 135° → ±45°, fronte 100° → ±10°. | Annex I-A §7, §11, Fig. A-1/A-2 (I-A-1…3, PDF pag. 96–98) |
| Schema per effetto | ECM: Fig. A-1 per blast/detriti/termico (anche in MCE, §9); Fig. A-2 (fronte 100°) per gli effetti progressivi p121/p122 di HD 1.2. | §7, §9, §11 |
| Pareti pesanti con porta | Colonna (e) se l'ES è nel settore frontale: 100° per gli effetti HD 1.2 (§11); 150° per gli altri effetti, per analogia con l'ECM e perché è la scelta più cautelativa (la norma non dà l'angolo). **Decisa il 23/11/2026.** Da dichiarare come ipotesi nel modulo QD. Senza tetto → sempre (f). | Table 2 (PDF pag. 133), §11 |
| ES a cavallo di settori | Si valutano tutti i settori toccati, ciascuno con la distanza dalla sola parte di ES che vi cade; governa il caso peggiore. | §10 |
| ECM come ES | Riga dal settore dell'ES (Fig. A-1) in cui cade il PES: retro → porta opposta (1/4/9), lato → perpendicolare (2/5/10), fronte → verso il PES (3/6/7/8/11). Le righe 7 e 8 esistono solo "porta verso il PES": negli altri settori si usano 9/10. | §7–8, righe ES 1–11 |
| Distanza | Minima tra contorni (punto più vicino → punto più vicino). Il contorno disegnato è quello della struttura, non l'unghia del terrapieno: da confermare sul testo per gli ECM. | Part I §1.3.2.2 |
| Esito | Se un effetto noto non è soddisfatto la coppia è **non conforme** anche se un altro effetto è fuori campo (la scheda originale diceva "da verificare"). | — |
| Alternative di cella | Default: la più cautelativa valida. La scelta di un'altra alternativa si salva per coppia nel progetto con una giustificazione. | HANDOFF §3.2 |
| Linee di salvaguardia | Contorno calcolato per raggi dal centro del PES: per ogni direzione il punto più lontano con distanza ≤ QD del settore in cui cade. Default ES 24 (IBD); selezionabili ES 25 e PTRD 21–23. | — |
| Barricate | In Fase 1 l'effetto si imposta sul magazzino (colonne g/h, i/j); le barricate disegnate sono solo grafiche. | Part II §2.2.3 (Fase 3) |
| Contenuto | Una sola HD per magazzino; magazzino con NEQ 0 = solo ES. Miscelazione/aggregazione HD e siti unici in Fase 2. | Part I Table 4 |

Non coperti in Fase 1: siti unici e aggregazione (HANDOFF §5.3), terrapieno condiviso, note di cella che rimandano al testo
(mostrate ma non valutate), Part III/IV, documenti ed export.

## Fase 2 — contenuti, siti unici, gestione

| Tema | Implementazione | Riferimento |
|---|---|---|
| Inventario | Righe con HD/SsD, gruppo, quantità, NEQ per pezzo, MCE. Import da Excel con anteprima: le intestazioni si riconoscono anche in inglese; il codice di classificazione ("1.1D") dà HD e gruppo. | Part I Ch.2 Tables 2–3 |
| SsD mancante | HD 1.2 senza SsD → dall'HE per colpo (> 0,136 kg → 1.2.1, altrimenti 1.2.2), senza HE → 1.2.1; HD 1.3 → 1.3.1; gruppo mancante → D. Ogni assunzione è segnalata nell'anteprima. | Part I Ch.2 |
| MCE | MCE del magazzino = evento singolo più grande tra le righe della stessa SsD. Se manca nella riga si usa il NEQ della riga (cautelativo). | Part I §1.3.2.4 |
| Table 4 | Regole a coppie generalizzate a più HD: 1.5 → 1.1; 1.4 non aggregata e senza QD (§1.3.1.8); 1.6 con 1.1 → 1.1, con 1.2/1.3 → 1.2.3 (nota 4); nota 1 = due casi (tutto come 1.1, sola 1.2); nota 2 = ogni SsD col suo NEQ; nota 5 = 1.3 sommata come 1.3.1 e come 1.3.2; 1.1+1.2+1.3 → §1.2.3.3.3 (NEQ totale come 1.1, 1.2 e 1.3). La QD è il massimo tra i casi. | Part I §1.2.3.2–1.2.3.3 |
| Nota 6 | Solo avviso; il caso HD 1.1 aggregata si attiva con una casella sul magazzino. | Table 4 nota 6 |
| Table 5 | Coppie di gruppi: vuoto = non ammessa; note = condizionata (con il testo della nota). L con qualunque altro gruppo è non ammessa (nota 4). Si può registrare l'accettazione del rischio. | Part I §1.2.3.3.4 |
| Siti unici | Due magazzini con contenuto si uniscono se una coppia tra loro è non conforme; si ripete col contenuto aggregato finché non ci sono nuove unioni. Criterio confermato il 23/11/2026: basta una qualsiasi coppia non conforme tra i due magazzini, qualunque effetto la governi (termico compreso). Le coppie interne diventano "stesso sito unico", quelle verso gli altri ES usano il contenuto aggregato da ogni magazzino del sito. Eccezione: HD 1.1 sotto 500 kg non si aggrega. Disattivabile in Gestione. | Part I §1.3.2.3.4, §1.3.1.10.3 |
| IBD ridotte | Con la casella "terrapieno conforme e volume > 500 m³" su un ECM, per HD 1.1 ≤ 45 t si sceglie in automatico l'alternativa "Reduced QD" della cella (BD25 retro, BD28 lato e corrispondenti PTRD). | Part I §1.3.6.6.2 |
| Terrapieno condiviso | Tra due ECM indicati nel pannello: caso aggiuntivo BD5 (≥ 3/4) o BD4 (1/2–3/4) sul blast; vale il più restrittivo con la IMD normale. | Part I §1.3.6.6.3 |
| Rischi accettati | Registro nel progetto (motivazione, chi, data). Una coppia non conforme accettata diventa "rischio accettato" e non rende il sito non conforme; il riempimento la tratta comunque come limite. | — |
| Riempimento | Bisezione sul fattore che scala il contenuto (MCE invariato) finché tutte le coppie del magazzino o del suo sito unico restano conformi; fuori campo delle formule = non ammesso. "Ammesso 0" se il limite non dipende dalla quantità del magazzino. | — |
| Dove ci sta | Per ogni magazzino: compatibilità (solo con inventario), NEQ massimo aggiungibile (fino a 4 volte la consegna) e coppia limitante. | — |

Progetti salvati con la Fase 1 (versione 1) si aprono e vengono portati alla versione 2.

## Fase 3 — documenti, barricate, revisioni

| Tema | Implementazione | Riferimento |
|---|---|---|
| Excel di verifica | Fogli Leggimi, Magazzini, Casi (ogni effetto × settore × riga ES × caso di carico), Coppie (caso che governa), Formule, Rischi accettati, Table 4. “D richiesta” è `ROUNDUP(formula del tratto usato; 0)` con Q in colonna F; margine ed esito sono formule. Il tratto scelto segue la regola del raccordo (distanza maggiore). | Annex I-A Tables 5–9, §5 |
| DXF | R12 ASCII, metri, y verso nord. Layer QD_MAGAZZINI, QD_ES_EDIFICI, QD_ES_LINEE, QD_RECINZIONI, QD_BARRICATE, QD_SALVAGUARDIA, QD_SITI_UNICI, QD_TESTI, QD_BOZZA. Testi traslitterati in ASCII. | — |
| Tavola in scala | SVG con le dimensioni reali del foglio (A4–A0) e scala 1:200–1:25 000; cartiglio con BOZZA e spazi per le firme. Stampare al 100%. | — |
| Relazione | HTML autonomo: sintesi con mappa, coppie critiche, scheda QD per magazzino (formato provvisorio in attesa di AASTP-1.1 Annex A), registro dei rischi, bozza di licenza dei limiti (NEQ ammesso), riferimenti. | — |
| Barricate in sezione | A sulla catasta più bassa (faccia remota, o vicina con tetto protettivo), B sullo spigolo superiore vicino dell'altra catasta (Fig. 2-2/2-3). AB ≥ 2,4 m; sotto 5·Q^(1/3) anche CD (0,30 m sopra) ≥ 1,0 m; oltre, verifica per ciascuna catasta. Terreno naturale = materiale; c.a./mattoni ×4. Cratere r = ½·NEQ^(1/3) dal centro della catasta A: scalzamento ≤ 1/3 della base. | Part II §2.2.3.2–2.2.3.3 |
| Barricate in pianta | La linea "barricata" deve superare di ≥ 1,0 m le due rette tra gli estremi delle cataste (lati dell'inviluppo convesso). | Fig. 2-4 |
| Revisioni | Istantanea immutabile (senza sfondo) con i risultati; confronto oggetti, coppie (peggiorate, risolte, nuove), siti unici e rischi rispetto allo stato attuale o a un'altra revisione; ripristino annullabile. | — |
| Dialoghi | Conferme e richieste sono finestre interne all'app: `window.confirm`/`prompt` sono bloccati in alcuni ambienti (era la causa del tasto “Nuovo” che non funzionava). | — |

## Aggiunte (26/11/2026)

| Funzione | Dove | Note |
|---|---|---|
| Edificio di processo esposto come officina | pannello del magazzino, "Come esposto (ES)" | ES 18/19/20 al posto della riga del tipo strutturale (Part I §1.3.1.13) |
| Tolleranza di misura 1 mm | `src/site/evaluate.ts` (`DIST_TOL`) | una distanza uguale alla QD entro 1 mm è conforme (coordinate al millimetro dai DWG) |
| Inviluppo delle linee di salvaguardia | barra della planimetria, casella "Inviluppo"; tavola in scala; DXF (layer `QD_INVILUPPO`) | contorno dell'unione di tutte le linee della riga ES scelta, senza librerie esterne (`src/site/envelope.ts`) |
| Strada interna | menù rapido "Altro → Strada interna"; ruolo di linea "Strada interna (non ES)" | viabilità del sito, disegnata e esportata (layer DXF `QD_VIABILITA`) ma esclusa dalle verifiche: le strade pubbliche restano ES 21–23 |
