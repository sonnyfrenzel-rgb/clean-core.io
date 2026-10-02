# UX-Benchmark — grok-4.6

**Modell:** `grok-4.6` · **Datum:** 2026-08-28 · **Bilder:** 22
**Verbrauch:** 34567 prompt / 3913 completion · 238s

Dieselbe Aufgabe wie an Claude, dieselben Screenshots. Unbearbeitet.

---

**A) LANDINGPAGE**

Blickführung, wie sie jetzt ist: Der Blick trifft zuerst auf die Smaragd-Wörter **Clean Core Accelerator**, rutscht auf die zwei CTAs, und reißt an der **Quick-Answer**-Wand ab — noch bevor ein Architekt ABAP gesehen hat. Hängen bleibt er nirgendwo verbindlich; die VBAK-Transformation kommt zu spät, die Sieben-Schritte-Karussell und die sechs gleichgewichteten Feature-Karten sind weitere Abrisse. Ziel: erster Halt = Headline, zweiter Halt = Code, den er kennt, dritter Halt = ATC-Einwand.

**1. Hero-Fold: Labels stapeln sich, Proof fehlt**
*Siehst du:* Über der Headline drei Signale (`NEW`-Chip, Community-Pille, Mono-Zeile), darunter Absatz, `Open Workspace`, `Read Whitepaper`, Textlink `Explore How It Works & Limitations` — dann sofort die blassgrüne Quick-Answer-Karte. Auf 390 px wird daraus eine Leiter aus Buttons, ohne dass VBAK sichtbar wird.
*Änderung:* Die drei Vorsignale zu **einer** Mono-Zeile unter der Nav zusammenziehen: `FREE FOR THE SAP COMMUNITY · CLEAN CORE & ABAP TRANSFORMATION` (11 px, tracking 0.08 em, slate-500). Den `NEW`-Satz als Textlink neben `Read Whitepaper` legen. Hero auf Desktop **56/44**: links Headline + Sub + die zwei bestehenden CTAs (Primary weiterhin `Open Workspace`); rechts die bereits vorhandenen Karten `SELECT ABAP INPUT` | `GENERATED RAP OUTPUT`, auf 12 Zeilen beschnitten, `max-height: 280px`, Overflow intern, darunter Textlink `Full transformation below` als Anchor auf die Tabs. Auf 390 px: Headline, ein Primary (`Open Workspace`), Secondary als Text; nur die ABAP-Input-Karte, RAP hinter einem Accordion `See RAP output`.
*Warum:* Architekten kaufen nicht die Pille „explained without the jargon“. Sie kaufen `SELECT … FROM vbak` → CDS-View. Der zweite Blick muss auf Code fallen, den sie in 2 Sekunden als ihres erkennen.

**2. Seitenrhythmus: Show → Einwand → Einordnung → Angebot**
*Siehst du:* Hero → Quick Answer → Worked Example → abapGit-Band → Karussell → Split „Nobody can say…“ → Toolchain-Tabelle → 6 Feature-Karten → 4 Security-Karten → Pricing → Verify. Der Beweis ist Block 3, der CAB-Einwand Block 6.
*Änderung:* Reihenfolge, Inhalt 1:1: **Hero inkl. Inline-Proof → drei Tabs (VBAK / BSEG / Dynamic Dispatch) vollständig → navy `Download Real abapGit Package` → Split `Do we still need this program?` / `What will it cost to move it?` → Quick Answer (Desktop default offen, 390 px collapsed) → Toolchain-Vergleich → Sieben Schritte → `What you can do today` → `Your data stays yours` → Community → Verify.** Keine Streichung, keine neue Zahl.
*Warum:* Die Zielgruppe scannt „Ist das echtes ABAP?“ → „Nimmt mir das das Urteil?“ → „Kämpft das gegen ATC?“. Die FAQ beantwortet gerade die Frage, die sie noch nicht gestellt hat.

**3. Worked Example als ein signiertes Artefakt, nicht als Collage**
*Siehst du:* Absatz Business Context, fünf Prozess-Chips, zwei Code-Karten, ganzer ABAP-Unit-Test, drei Insight-Chips, darunter klein `Verified against Clean-Core Engine v2.6.2`. `WATCH TRANSFORMATION LIVE` als dunkler Full-Width-Pill. Auf dem Telefon laufen Codezeilen aus der Karte auf die Seite.
*Änderung:* Alles in **eine** weiße Karte (bestehender Radius). Topbar: bestehende Tabs links, rechts Mono `ENGINE v2.6.2 · 27 AUG 2025`. Darunter drei Bänder mit den vorhandenen Labels: `01 BUSINESS CONTEXT` (Absatz + die fünf Chips in einer Wrap-Zeile, Mono 12/16) · `02 INPUT → OUTPUT` (50/50, Plex Mono 12/18, `max-height: 280px`, `overflow-y: auto`) · `03 GENERATED TEST + VERDICT` (Unit-Test 60 %, die drei grünen Checks rechts 40 % gestapelt). `Watch Transformation Live` wird Textbutton in der Topbar — nicht noch ein Dark-Pill neben dem späteren Download-Band. 390 px: Bänder als Accordions, `02` default offen; Code 11 px, Horizontalscroll **nur innerhalb der Karte** (`overflow-x: auto` auf dem Pre, nicht auf `body`).
*Warum:* Das ist der CAB-Screenshot. Er muss wirken wie ein reproduzierbarer Lauf, nicht wie ein Blog-Embed.

**4. Sieben Schritte: Kette zeigen, nicht eine Folie**
*Siehst du:* `How a transformation actually runs`, dann ein Karussell, das nur `Deep Code Intelligence` plus Device-Frame des Analyze-Reports zeigt. Auf dem Telefon sitzt der Screenshot als Miniatur in der Karte.
*Änderung:* Karussell-Chrome ersetzen durch einen **7-Zellen-Strip** (Desktop, `grid-template-columns: repeat(7, 1fr)`, Höhe 72 px): Mono-Labels `UPLOAD … DELIVERY` in der bestehenden Reihenfolge, Zelle mit Nummer + der bereits im Abschnitt stehenden Ergebniszeile („Each step produces something you can read…“). Default: Zelle 2 `ANALYZE` aktiv, darunter der vorhandene Screenshot. Klick tauscht nur das Bild — gleiche Interaktion, anderes Chrome. 390 px: vertikaler Stepper, aktive Stufe offen, andere Stufen 44-px-Zeilen (Nummer + Titel).
*Warum:* Architekten denken in Stage-Gates. Ein Karussell versteckt den Vertrag. Der Strip ist in 2 Sekunden lesbar.

**5. Toolchain-Vergleich: Keep/Add-Scan statt Matrix-Wand**
*Siehst du:* Intro „ATC remains the authoritative check“, Pille `32,103 classified SAP objects`, dann 7-Zeilen-Tabelle Capability | SAP Native | Clean-Core.io. Auf 390 px wird jede Zeile ein Aufsatz.
*Änderung:* Alle 7 Zeilen und jeder Statuswortlaut bleiben. Desktop: linke Spalte 220 px sticky (Capability-Name), rechts zwei gestapelte Blöcke pro Zeile — SAP in `slate-50`, Status in Mono-Versalien (`NOT AVAILABLE` / `MANUAL ONLY` / `ATC FLAGS ONLY`); Clean-Core mit 6-px-Emerald-Left-Border und dem bestehenden Grün-Status. Spaltenköpfe in Mono: `YOU KEEP THIS` | `WE ADD THIS` — Wörter aus dem Intro („authoritative check“ / „picks up from there“). 390 px: dieselbe Paarung, nicht die 3-Spalten-Tabelle.
*Warum:* Das ist das Trust-Argument für den CoE. Tabellen-Chrome liest sich wie Vendor-Matrix; Keep/Add ist die Sprache, in der Architekten briefen.

**6. `What you can do today`: zwei Gewichte, sechs Karten**
*Siehst du:* 2×3 identische Karten. Extensibility Routing, Cloudification Catalog, Dual RAP & CAP sitzen optisch gleichauf mit Assessment, Compliance Evidence, BPMN.
*Änderung:* Reihe 1 unverändert (die drei Artefakte, die ein Architekt zeichnet). Reihe 2: gleiches Card-Chrome, aber Icon + Titel + eine Zeile; Rest hinter Disclosure `Details` (Copy bleibt). `NEW` bleibt ausschließlich auf Modernization Assessment. 390 px: Reihe 1 als Karten, Reihe 2 als eine gruppierte Liste (Icon, Titel, Chevron, bestehende Learn-more-Ziele).
*Warum:* Sechs Equals sagen „Plattform“. Gekauft werden Routing-Entscheidung, Catalog-Match und RAP/CAP-Entwurf. Der Rest sind Folgen.

**7. Pricing-Paar: CTA auf eine Linie, Telefon = eine Entscheidung**
*Siehst du:* Weiß `Free Community Edition` vs. Navy `Free + Your Own Key` — der Kontrast trägt. Navy ist höher, die beiden `Go to Workspace` sitzen nicht auf einer Baseline. Auf 390 px kollidieren `UNLIMITED · FREE` / `BYOK`-Chips, die Checkliste wickelt.
*Änderung:* Desktop `align-items: stretch`, beide Karten `min-height` der Navy-Karte, CTAs `margin-top: auto`. 390 px: Segmented Control `COMMUNITY | YOUR KEY` schaltet dasselbe Card-Chrome (weiß/navy), eine Entscheidung pro Viewport; die drei Trust-Karten darunter als 3-Zeilen-Liste mit bestehendem `LEARN MORE`. Jeder Bullet bleibt.
*Warum:* BYOK vs. 5-Lauf-Limit ist eine Achse. CTA-Versatz und Doppelstack machen daraus Arbeitsgedächtnis.

**8. Emerald = Start, nicht Tapete**
*Siehst du:* `Open Workspace` im Hero, `Go to Workspace` auf beiden Pricing-Karten, nochmal im Navy-Band `Verify it yourself`, plus Nav-Button — dazwischen `Watch Transformation Live`, Download, 6× Learn more.
*Änderung:* Primary-Emerald nur: Hero, Nav (schon da), Navy-Verify. Pricing-CTAs bleiben vom Label, aber die weiße Karte als Outline (wie `Read Whitepaper`), Navy-Karte als Emerald (bestehend). Mid-Page-Aktionen = Textlinks bzw. der schon vorhandene Download-Button. Kein zusätzlicher Sticky-CTA. 390 px: der Header-Button `Go to Workspace` ist der einzige persistente Emerald; In-Body-Wiederholungen nach dem Fold Outline.
*Warum:* Wenn jede Bahn einen grünen Ziegel hat, signalisiert die Akzentfarbe nichts mehr. Für diese Zielgruppe heißt Grün „ich starte einen Lauf“, nicht „ich scrolle“.

Typografie-Einsatz (bau-scharf, nicht „größer“): **ein** Display nur im Hero (bestehende Größe, `Clean Core` weiter emerald). Alle Sektionsköpfe eine Stufe darunter — visuell ~36/40, nicht Hero-Konkurrenz (`See a real ABAP…`, `Nobody can say…`, `Community access` sind heute Display-Peers). Kicker immer Mono 11 / 0.08 em / slate-500 (`THREE WORKED EXAMPLES`, `THE SEVEN STEPS`, `LIVE TODAY`, `SOVEREIGN & SECURED`). Body 16/26 slate-600. Damit bleibt der Blick auf Emerald-Headline und Code hängen, statt an jedem `How we…` neu zu starten.

---

**B) WORKFLOW — 3 über alle sieben Schritte**

**1. Zustände `BLOCKED / RUNNING / PARTIAL / COMPLETE` als ein Chrome**
*Siehst du:* Design ist nur Skeleton `Designing Solution…`. Documentation zeigt `No enterprise specifications yet`, während `EXPORT BPMN` / `EXPORT CONFLUENCE` schon klickbar sind. Testing: leere Suite, Terminal `Waiting for execution…`, `Proceed to Documentation` Outline plus Orange `Skipping this step`. Delivery: SOP `NOT GENERATED`, Integrity-Report mischt Grün und Gelb (`Coverage not estimated`). Analyze: Coverage 0 % / 0 % / 0 % neben großem Ring `FULLY SUPPORTED`. TCO: ehrlicher Leerstand, aber mit Stepper auf Upload.
*Änderung (eine Pattern-Spec):*
- `BLOCKED`: gestrichelte Karte, Mono-Label, **eine** Emerald-Action (bestehende Verben: `Generate Test Suite`, `Start Architectural Mapping`). Exports `disabled` bis ein Artefakt existiert.
- `RUNNING`: Skeleton behalten, darüber eine Chip-Zeile aus dem **vorherigen** Schritt, nur mit Werten, die schon auf dem Screen stehen (z. B. `ZCREDIT_CHECK · 62% · Side-by-Side`).
- `PARTIAL`: exakt die gelben Integrity-Chips von Delivery — in Testing (keine Suite) und Documentation (keine Spec) **in** der Leerkarte, nicht als Orange unter dem Weiter-Button.
- `COMPLETE`: Ist-Zustand.
- Analyze: bei drei Mal 0 % den Ring `FULLY SUPPORTED` nicht zeigen; die drei Zahlen behalten und visuell die schon vorhandene Construct-Findings-Leerfläche (`No findings from these detectors`) als Verdict nutzen.
*Warum:* Ein Architekt, der Confluence aus einer Leerkarte exportiert oder `FULLY SUPPORTED` bei 0 % liest, glaubt der Landing-Zeile „architect signs the result“ nicht.

**2. Stepper = Vertrag, nicht Dekor**
*Siehst du:* 7 Dots auf jeder Workflow-Seite; auf dem Telefon nur die aktuelle Stufe beschriftet. TCO trägt denselben Stepper, obwohl TCO keiner der sieben Schritte ist und nur Upload grün ist. Idle-Seiten (Design, Testing, Documentation) nennen das Artefakt nicht.
*Änderung:* Unter dem Stepper eine 20-px-Mono-Zeile = vorhandener Seiten-Sub + `ARTIFACT:` und dem Dateinamen, der schon sichtbar ist (`zcredit_check`, `service.ts`, abapGit-Package). Telefon: Dots behalten, darunter immer `Stufe + Artefakt`. **Stepper von TCO entfernen** — der TCO-Leertext sagt bereits, dass Zahlen aus einem signierten Analyze-Lauf kommen; TCO wird nicht zum achten Schritt.
*Warum:* Die Landing verspricht „each step produces something you can read and check“. Das App-Chrome nennt dieses Etwas nicht.

**3. Transformation und Testing als eine Evidence-Desk, nicht zwei Marketingseiten**
*Siehst du:* Transformation hat den starken Split (ABAP | Node/TS), darunter eine Insights-Zeile, die Landing-Features wiederholt (`EVENT-DRIVEN MICROSERVICES`, TypeORM, XSUAA). Testing hängt drei Benefit-Karten davor (eine davon violett `Estimated Coverage` = `GENERATE TESTS TO SEE ESTIMATE`), erst dann Suite + Terminal.
*Änderung:* Insights unter den Editor als Disclosure `INSIGHTS` (alle drei Texte bleiben). Den schon vorhandenen Compliance-Chip `62%` als persistente Leiste von Transformation **nach** Testing durchziehen. Testing: die drei Benefit-Sätze zur Subzeile unter dem Titel konkatenieren, Primary Surface = Suite + Terminal. Den Coverage-Satz in die **leere** Suite-Karte als gedämpfte Zeile legen (er ist ein Zustand, kein Feature). Mock vs. `CONNECTED S/4HANA` bleibt. Skip-Warnung in die Leerkarte, nicht unter den Button. Violett auf dieser Fläche entfällt — Coverage nutzt Slate/Emerald wie der 62 %-Chip.
*Warum:* Der Converter ist das Produkt. Benefit-Karten im Tool wiederholen die Landing und machen die Arbeit weicher, als der erste Kontakt sie verkauft hat.

---

**C) EIN MUTIGER VORSCHLAG**

**Die Landing-Transformation in derselben Editor-Chrome rendern wie Screen 05 (schwarzer Split, Plex Mono, `LEGACY SOURCE` | `MODERNIZED TARGET`), nicht in den mint-/lavendelfarbenen Marketing-Codekarten.**

Der VBAK-Lauf auf der Landing ist heute ein anderes Produkt als der Converter im Workspace: pastellige Karten, Device-Frame, Karussell. Der Architekt, der `Open Workspace` drückt, landet in einem schwarzen Editor plus `ZCREDIT_CHECK`. Der Bruch ist Glaubwürdigkeit.

Umsetzen: Im Hero-Proof und in Band `02 INPUT → OUTPUT` dieselben Header, dieselbe Hintergrundfläche, dieselbe Mono-Größe wie in der Transformation-Stufe. Tabs VBAK/BSEG/Dynamic Dispatch bleiben. Kein neues Illustrationsthema, keine zweite Akzentfarbe, kein Framework-Wechsel — du **entfernst** die Sonder-Chrome, die es nur auf der Landing gibt. Emerald bleibt der einzige Akzent (Checks, Primary, Score). Navy bleibt das Instrument-Band (Download, Cost-Card, BYOK, Verify), das es schon gibt.

Warum das Setup nicht verwässert: IBM-Plex-Mono auf Slate-900 **ist** das System; die mintgrünen Codekarten sind die Abweichung. Du ziehst die Oberfläche auf die Typografie- und Farbregel zusammen, statt eine Marketingwelt daneben zu pflegen. Die Diskussion („zu hart für Fachbereich“) ist genau richtig: Fachbereich liest Band `01 BUSINESS CONTEXT` und die Keep/You-call-Karte; Architekt liest den Editor. Beide Flächen existieren schon — sie müssen nur dieselbe Grammatik sprechen.

---

**D) WAS DU NICHT ANFASSEN WÜRDEST**

**1. Die Headline-Konstruktion.** `The SAP Architect's` + smaragd `Clean Core Accelerator` ist Besitz und Kategorie in einer Zeile. Das ist der erste Blick, und er ist richtig. Kein Rewrite, kein anderes Wortgrün.

**2. Das Navy/Weiß-Paar Community vs. BYOK** plus die drei Sätze darunter (`SANDBOX ONLY · READ-ONLY`, `ENCRYPTED · STATELESS`, `ADMIN GATED ONBOARDING`) und die Spezifik in `Your data stays yours` (Belgium, Art. 17 DSGVO, stateless APIs). Das ist die einzige klare Entscheidung auf der Seite und der einzige Security-Block, der nicht wie generische Lock-Icons wirkt. Ebenso stehen lassen: die ATC-Zeile („authoritative check — keep using it“) mit der Pille `32,103 classified SAP objects`, der Stamp `Verified against Clean-Core Engine v2.6.2`, und der TCO-Leertext („A financial case built on a number nobody measured is worse than no page at all“). Das ist die Stimme, die diese Zielgruppe als nicht-vendorisch liest — daran wird nicht „aufgehübscht“.
