# UX-Benchmark — gpt-5.6-sol

**Modell:** `openai/gpt-5.6-sol` · **Datum:** 2026-08-28 · **Bilder:** 22
**Verbrauch:** 59987 prompt / 7314 completion · 118s

Dieselbe Aufgabe wie an Claude, dieselben Screenshots. Unbearbeitet.

---

## Übergreifender Befund für Anwendung und Workflow

### BEFUND
- Der Community-Hinweis belegt auf dem Telefon rund ein Viertel des sichtbaren Headers. Zusammen mit Logozeile und Workflow-Stepper beginnt der eigentliche Inhalt häufig erst nach 250–300 px.
- Auf den mobilen Workflow-Screens fehlt der auf Desktop sichtbare Link „Back to My Workspace“.
- Der siebenstufige Stepper zeigt mobil nur den Namen des aktuellen Schritts. Die Nummern bleiben erkennbar, die Bedeutung der kommenden Schritte jedoch nicht.
- Der grüne „Ask AI“-Button und der schwarze „N“-Button überdecken regelmäßig Inhalte und Bedienelemente, etwa auf Analyze, Documentation, Delivery und Settings.
- Der vollständige Footer wird auf jedem operativen Screen wiederholt. Mobil ist er teilweise länger als die eigentliche Aufgabe und signalisiert dadurch vorzeitig das Seitenende.
- Primäre Aktionen stehen je nach Screen anders: rechts auf Desktop, zentriert oder vollbreit auf Mobile; teilweise weit vom entscheidungsrelevanten Inhalt entfernt.

### VORSCHLAG
- Community-Hinweis mobil kompakter in maximal zwei Textzeilen setzen; Links und „Dismiss“ darunter in einer einzigen kompakten Zeile belassen.
- „Back to My Workspace“ mobil als bestehende Textaktion direkt unter der Logozeile oder links oberhalb des Steppers zeigen.
- Stepper mobil horizontal scrollbar ausführen und den aktuellen Schritt automatisch zentrieren. Alle sieben vorhandenen Namen bleiben so zugänglich.
- Die beiden Floating-Controls vertikal in einer festen Safe-Area stapeln und beim Scrollen auf reine Icons reduzieren. Sie dürfen keine CTA, Tabellenzeile oder Statusmeldung überdecken.
- Auf Workflow-Seiten den Footer mobil als kompakte, aufklappbare Spaltengruppen darstellen. Alle Links und Rechtstexte bleiben vorhanden.
- Eine konsistente Abschlusszone verwenden: sekundäre Rückwärtsaktion zuerst, grüne Vorwärtsaktion darunter beziehungsweise rechts. Auf Mobile kann diese Zone am Ende der Inhaltskarte stehen.

> Ein eigener Upload-Screen ist in den 22 gelieferten Screenshots nicht enthalten. Upload ist nur im Stepper sichtbar; ein konkreter Screen-Befund wäre daher erfunden.

---

# 01 Landingpage

## BEFUND
- Der Desktop-Hero ist klar aufgebaut und markentypisch. Headline, Erläuterung und zwei Hauptaktionen sind gut verständlich.
- Mobil entsteht vor dem Hero viel Leeraum zwischen Header und „NEW“-Hinweis. Die eigentliche Positionierung der Plattform kommt dadurch spät.
- Drei CTA-Ebenen stehen direkt untereinander: „Open Workspace“, „Read Whitepaper“ und „Explore How It Works & Limitations“. Sie wirken fast gleich wichtig.
- Die mobile Seite ist extrem lang. Besonders „What You Can Do Today“, Sicherheitsargumente und Community-Access verwenden sehr hohe Einzelkarten mit großen Innenabständen.
- In der mobilen SAP-Tool-Vergleichssektion funktioniert die Umwandlung jeder Tabellenzeile in ein Vergleichspaar grundsätzlich gut.
- Im Transformation Showroom sind lange Codezeilen mobil abgeschnitten beziehungsweise nur schwer lesbar.
- Der Footer inklusive ausführlichem Legal Disclaimer beansprucht mobil nochmals eine sehr große Strecke.

## VORSCHLAG
- Den Leerraum oberhalb des „NEW“-Hinweises mobil deutlich reduzieren; Hero und Positionierungslabel müssen innerhalb des ersten Viewports beginnen.
- CTA-Hierarchie schärfen: „Open Workspace“ bleibt vollflächig grün, „Read Whitepaper“ als sekundäre dunkle Aktion, „Explore…“ deutlich kompakter als Text-/Tertiäraktion.
- Mobile Feature- und Security-Karten verdichten: Icon links neben Titel, kleinere vertikale Innenabstände, „Learn more“ direkt nach dem Absatz statt am unteren Kartenrand. Inhalte bleiben vollständig.
- Desktop-Sektionen stärker rhythmisch gruppieren: Problem und SAP-Tool-Vergleich als Argumentationsblock, Showroom als Beweisblock, danach Fähigkeiten, Sicherheit und Zugang. Die vorhandene Reihenfolge kann bestehen bleiben, aber Abschnittsabstände sollten zwischen Gruppen stärker und innerhalb der Gruppen kleiner sein.
- Showroom-Code mobil in horizontal scrollbaren Codeflächen darstellen; Labels und Dateinamen bleiben stehen. Keine Codezeile darf durch den Kartenrand visuell abgeschnitten werden.
- Der SAP-Tool-Vergleich ist mobil bereits sinnvoll gelöst; hier nur Abstände und Typografie vereinheitlichen, nicht strukturell umbauen.
- Footer-Spalten mobil einklappbar machen und den Disclaimer typografisch kompakter setzen.

---

# 02 Dashboard / Workspace

## BEFUND
- Desktop vermittelt mit Titel, Kontingent, Projektzeile und „Create Project“ eine verständliche Grundstruktur.
- Die einzige Projektzeile zeigt „Documentation (95%)“, daneben aber „Created: N/A“. Mobil steht „N/A“ isoliert unter dem Fortschrittsbalken und ist keinem Feld mehr eindeutig zugeordnet.
- Der Projektname wird mobil zu „ZCREDIT_CHEC…“ gekürzt; der wichtige fachliche Zusatz „Credit Management“ verschwindet vollständig.
- Die vier Projektaktionen sind nur Icons. Besonders Kopieren, Download und Löschen sind ohne Hover mobil nicht selbsterklärend.
- „Try it with an Example“ zeigt mobil alle sieben Beispiele als lange Liste. Der weiter unten stehende Button „Show Preloaded Examples“ wirkt dadurch widersprüchlich.
- Die Beispielkarten sind mobil schmal, aber textreich; Dateiname, Zeilenzahl, Beschreibung und „Shows“ konkurrieren auf derselben Ebene.

## VORSCHLAG
- Projektkarte mobil in klar beschriftete Zeilen gliedern: Projektname über zwei Zeilen, Status und Fortschritt zusammen, „Created / N/A“ als eigenes Paar. Dafür vorhandene Inhalte nur neu anordnen.
- Die Öffnen-Aktion als eindeutig primäre grüne Aktion belassen; die drei Utility-Aktionen in einer separaten, gleichmäßig verteilten Iconleiste darunter anordnen und über zugängliche Tooltips/Labels erschließen.
- Die Beispielsektion mobil standardmäßig über den bereits vorhandenen Mechanismus „Show Preloaded Examples“ steuern, statt gleichzeitig alle Beispiele und den Show-Button anzuzeigen.
- Beispielkarten kompakter aufbauen: Dateiname und Zeilenzahl in der Kopfzeile, Beschreibung darunter, „Shows:“ als klar abgesetzte letzte Zeile.
- Desktop ist weitgehend in Ordnung. Dort lediglich Projektname und Status stärker gewichten und die Aktionsicons mit konsistenten Hover-Zuständen versehen.

---

# 03 Analyze / Code Analysis

## BEFUND
- Der grüne Report-Header und die Tabs vermitteln auf Desktop gut, dass es sich um einen umfangreichen Analysebericht handelt.
- Mobil ist die Tabzeile abgeschnitten; sichtbar sind „Decision & Evidence“ und nur der Anfang von „Gaps…“. Nutzer erkennen nicht zuverlässig, dass vier Berichtsbereiche existieren.
- Die Anweisung „Explore all 4 report sections before proceeding“ steht optisch schwach zwischen Tabzeile und Inhalt. Gleichzeitig bleibt „Continue to Design“ aktiv.
- „Coverage Verdict“ zeigt dreimal 0 %, endet aber mit einem großen grünen „Fully Supported“. Direkt danach stehen „0 findings“ und dennoch „Evidence Findings – 2 unique findings“. Inhaltlich mögen dies unterschiedliche Kategorien sein, visuell wirkt es widersprüchlich.
- Die Evidence-Tabelle funktioniert mobil nicht: Spalten werden stark zusammengedrückt, Pattern-Bezeichnungen brechen wortweise und Code wird abgeschnitten.
- Der Executive Summary-Block ist gut als handlungsorientierter Abschluss erkennbar.

## VORSCHLAG
- Tabs mobil horizontal scrollbar ausführen, mit sichtbarem Anschnitt des nächsten Tabs und fixierter aktiver Markierung.
- Den bestehenden Hinweis direkt unter die Tabs setzen und als Statusleiste mit höherem Kontrast behandeln. „Continue to Design“ erst als aktiven Zustand darstellen, wenn die bestehende Bedingung erfüllt ist.
- „Construct Findings“ und „Evidence Findings“ visuell deutlicher als zwei verschiedene Prüfkategorien kennzeichnen: getrennte Karten, jeweils eigener Zähler unmittelbar beim Titel. So werden 0 und 2 nicht als Widerspruch desselben Ergebnisses gelesen.
- Coverage-Kennzahlen und „Fully Supported“ enger zusammenführen und die Bezugsgröße „(0)“ sichtbar beim jeweiligen Wert belassen. Der grüne Gesamtstatus darf nicht größer gewichtet sein als die zugrunde liegenden Nullwerte.
- Evidence Findings mobil nicht in eine Desktop-Tabelle pressen. Jede vorhandene Tabellenzeile als kompakte Record-Karte darstellen: Pattern, Lines, Code Snippet, Severity, Source, SAP Replacement und Target untereinander.
- Executive Summary und Abschlussnavigation sind strukturell gut; lediglich CTA und Rückweg näher an den Summary-Block ziehen.

---

# 04 Design – Ladezustand

## BEFUND
- Der Screen besteht fast vollständig aus Skeleton-Flächen. Außer „Designing Solution…“ und „Architecting solution design…“ gibt es keinen wahrnehmbaren Fortschritt.
- Das große Refresh-Symbol im grünen Header ist sehr kontrastarm und kann wie eine manuelle Aktion statt wie ein laufender Prozess wirken.
- Desktop zeigt unter dem Ladecontainer sehr viel leere Fläche und früh den Footer. Das kann den Eindruck erwecken, der Prozess sei stehen geblieben oder beendet.
- Mobil ist der Skeleton-Aufbau plausibel, aber die sehr große leere Hauptfläche ohne erkennbare Aktivität verstärkt denselben Eindruck.

## VORSCHLAG
- Den vorhandenen Spinner deutlich kontrastreicher und animiert darstellen; keine Button-Optik verwenden.
- Skeletons mit einem sanften, konsistenten Shimmer versehen und ihre Form an die zu erwartende Ergebnisstruktur angleichen, statt nur generische Balken zu zeigen.
- Ladecontainer auf Desktop und Mobile mindestens viewporthoch halten, sodass der Footer während des aktiven Vorgangs nicht direkt sichtbar wird.
- „Designing Solution…“ als primären Status und „Architecting solution design…“ als sekundäre Statuszeile beibehalten; diese Zone sticky innerhalb der Karte setzen.
- Ansonsten ist der Screen für einen temporären Ladezustand angemessen. Zusätzliche Erklärtexte wären nicht nötig.

---

# 05 Transformation

## BEFUND
- Desktop nutzt die verfügbare Breite sinnvoll: ABAP-Quelle und modernisiertes Target stehen direkt vergleichbar nebeneinander.
- Mobil werden daraus zwei sehr hohe Codeflächen. Beide enthalten viel leere dunkle Fläche, während die eigentlichen langen Codezeilen rechts abgeschnitten sind.
- „Sync Scroll: ON“ ist mobil prominent, obwohl die Panels nicht nebeneinander stehen und damit kaum synchron vergleichbar sind.
- Der Compliance-Hub steht mobil getrennt unter dem Seitentitel, wirkt aber wie eine primäre Aktion und konkurriert mit den Code-Controls.
- „Transformation Insights“ verwendet mobil große Abstände zwischen den drei Textblöcken.

## VORSCHLAG
- Desktop-Vergleich beibehalten.
- Mobil Quelle und Target als zwei klar umschaltbare Panels innerhalb desselben Codecontainers anordnen. Beide vorhandenen Inhalte bleiben erreichbar; der aktive Dateiname und der Zustand „AI Generated“ bleiben in der Kopfzeile.
- Alternativ, falls beide gleichzeitig sichtbar bleiben müssen: Codeflächen auf eine sinnvolle Mindest-/Maximalhöhe begrenzen und intern vertikal sowie horizontal scrollbar machen.
- „Sync Scroll“ mobil visuell nachrangig behandeln, da es dort keinen unmittelbaren Side-by-Side-Vergleich gibt. „Copy Code“ bleibt bei der Target-Ansicht, „Re-Run Engine“ als separate Utility-Aktion.
- Compliance-Hub in die Titelkarte als Statuskachel integrieren, nicht als gleichwertigen Haupt-CTA.
- Insights mobil durch Trennlinien statt große Leerabstände gliedern.
- Vorwärts- und Rückwärtsnavigation näher an die Insights-Karte ziehen; aktuell entsteht davor unnötig viel Leerraum.

---

# 06 Testing & Sandbox

## BEFUND
- Die drei Vertrauenskarten „Real Sandbox Execution“, „SAP Mock Library“ und „Estimated Coverage“ erklären den Testkontext gut.
- „Generate Suite“ erscheint doppelt: als grüner Button in der Kopfzeile der Test-Suite und nochmals als „Generate Test Suite“ im Empty State.
- Das Terminal nimmt mobil sehr viel Höhe ein, obwohl lediglich „Sandbox initialized. Waiting for execution…“ angezeigt wird.
- „Proceed to Documentation“ ist bereits aktiv, obwohl noch keine Test-Suite generiert wurde und keine Coverage vorliegt.
- Die Auswahl „Mock Environment“ versus „Connected S/4HANA Tenant“ ist erkennbar, der inaktive beziehungsweise nicht verfügbare Zustand des zweiten Modus aber sehr blass und uneindeutig.

## VORSCHLAG
- Im Initialzustand nur den CTA innerhalb des Empty States zeigen. Der Header-Button erscheint erst, wenn bereits eine Suite vorhanden ist und tatsächlich neu generiert werden kann.
- Terminal im Wartezustand auf eine kompakte Loghöhe reduzieren; nach Start der Ausführung darf es dynamisch wachsen.
- „Proceed to Documentation“ solange deaktiviert darstellen, bis der notwendige Testzustand erreicht ist. Das stärkt die Glaubwürdigkeit des siebenstufigen Prozesses.
- Den inaktiven Tenant-Modus mit klarer deaktivierter Fläche, aber lesbarer Beschriftung darstellen; nicht lediglich ausbleichen.
- Mobil zuerst Validation Environment, dann Test Suite, danach Terminal. Diese Reihenfolge ist bereits grundsätzlich richtig und sollte beibehalten werden.
- Desktop ist in der Flächenaufteilung gut; dort hauptsächlich die doppelte Generate-Aktion und den voreilig aktiven Weiter-CTA korrigieren.

---

# 07 Documentation / Process Blueprint & Mapping

## BEFUND
- Der zentrale Zustand lautet „No enterprise specifications yet“ mit „Start Architectural Mapping“. Gleichzeitig sind „Export BPMN“, „Export Confluence“, „Regenerate“ und „Proceed to Delivery“ sichtbar beziehungsweise aktiv.
- Mobil sind die drei oberen Aktionen vertikal verteilt und stehen weit vor dem eigentlichen Empty State. Dadurch erscheint Export wichtiger als das notwendige Mapping.
- Der rote Badge „4 Issues“ überlappt auf Mobile den Empty-State-Container und konkurriert mit „Start Architectural Mapping“.
- Der Screen enthält sehr wenig Inhalt, danach aber viel Leerraum und den vollständigen Footer.

## VORSCHLAG
- Empty State direkt unter Titel und Integrations-Badges platzieren. „Start Architectural Mapping“ wird zum klaren primären nächsten Schritt.
- Export- und Regenerate-Aktionen als deaktivierte Utility-Leiste direkt am Empty State darstellen, solange keine Spezifikationen vorliegen.
- „Proceed to Delivery“ ebenfalls als nicht verfügbaren Zustand darstellen, solange „No enterprise specifications yet“ und vier Issues bestehen.
- Den „4 Issues“-Badge in die Kopfzeile der Mapping-Karte integrieren; keine schwebende Überlagerung.
- Mobil den langen Buttontext nicht auf drei dominante Zeilen zwingen: volle Kartenbreite verwenden und Innenabstand reduzieren.
- Den Hauptbereich viewportfüllend ausrichten, damit der Footer nicht wie der nächste Schritt des Prozesses wirkt.

---

# 08 Delivery / Project Handover

## BEFUND
- Der Screen erzeugt zunächst einen starken Abschlussmoment: Step 7, Raketenicon und „Project Handover“.
- Gleichzeitig bestehen mehrere sichtbare Widersprüche:
  - „ready for deployment“ im Intro,
  - „SOP & Compliance – Not Generated“,
  - „Coverage not estimated“,
  - „Compliance Audit Pack – Partial“,
  - aber „All Artefacts Present“ im Integrity Report.
- Diese Widersprüche sind vertrauenskritischer als die reine Kartenanordnung und können unter der Vorgabe unveränderter Inhalte nicht vollständig aufgelöst werden.
- Mobil stehen erst vier große Download-/Exportkarten und danach der Integrity Report. Die Einschränkungen werden somit erst spät sichtbar.
- Die Board Presentation ist mobil lesbar, aber sehr hoch; die Slide-Navigation liegt weit unterhalb des Inhalts.

## VORSCHLAG
- Integrity Report direkt unter den Handover-Titel setzen, vor die Artefaktaktionen. Nutzer sehen so zuerst den tatsächlichen Status und entscheiden danach über Downloads.
- „Not Generated“, „Partial“ und „Coverage not estimated“ als zusammenhängende Ausnahmeebene unmittelbar beim Integrity Report gruppieren. Es darf kein rein grüner Abschlusszustand dominieren.
- „All Artefacts Present“ nicht als größte oder stärkste Statusaussage gestalten, solange die übrigen vorhandenen Statuswerte sichtbar dagegenstehen.
- Danach die vier Artefaktkarten anzeigen: verfügbarer Download/Export aktiv, „Not Generated“ klar deaktiviert.
- Aktionsfarben vereinheitlichen: Emerald für verfügbare Hauptaktionen; Violett kann beim Stakeholder-Artefakt als Icon-/Kategorieakzent bleiben, sollte aber nicht eine zweite globale Primärfarbe bilden.
- Board Presentation mobil mit reduzierten Innenabständen und einer am unteren Kartenrand fixierten Slide-Navigation darstellen.
- „Return to Dashboard“ ist als einziger Abschluss-CTA korrekt und kann bestehen bleiben.

---

# 09 TCO & Upgrade-ROI Analysis

## BEFUND
- Der Stepper steht auf „1 Upload“, obwohl der Screen über „Back to Analyze“ erreichbar ist und seine Werte laut Untertitel auf dem Modernization Score basieren. Das ordnet die Nebenansicht dem falschen Workflow-Kontext zu.
- Die aktuell sichtbaren Werte sind fachlich alarmierend: Legacy-TCO €0, modernisiertes TCO €1.550, jährliche Einsparung −€1.550, negativer ROI, negative Payback-Dauer und „Infinity%“. Trotzdem werden Teile grün beziehungsweise als Savings präsentiert.
- „Print Business Case“ ist trotz dieses Szenarios eine dominante Aktion.
- Mobil funktionieren die Slider grundsätzlich, es fehlen aber starke visuelle Beziehungen zwischen Regler, Wert und Ergebnis.
- Das ROI-Diagramm ist mobil rechts abgeschnitten; Jahresbeschriftungen und Verlauf sind nicht vollständig erfassbar.

## VORSCHLAG
- TCO als Nebenansicht des Analyze-Schritts behandeln: Schritt 2 visuell aktiv beziehungsweise der Analyze-Kontext hervorgehoben. Alle sieben Schritte bleiben bestehen.
- Negative Werte nicht im positiven Emerald-Erfolgsstil darstellen. Vorhandene Minuswerte, rote Legacy-/Warnakzente und neutrale Kartenflächen müssen den ungünstigen Szenariozustand sichtbar tragen.
- „Print Business Case“ bei rechnerisch ungültigen beziehungsweise widersprüchlichen Zuständen visuell deaktivieren. „Back to Analyze“ bleibt die klarere Aktion.
- Inputs mobil jeweils als geschlossene Einheit gestalten: Label und aktueller Wert in einer Zeile, Slider direkt darunter, Hilfstext unmittelbar anschließend.
- Ergebnisreihenfolge beibehalten: Net Savings, Payback, ROI, Vorher/Nachher, Forecast. Die drei Top-KPIs aber dichter zusammenfassen, damit ihre Beziehung deutlich wird.
- Diagramm responsiv auf die Kartenbreite skalieren, vollständige X-Achse zeigen und keine Beschriftung am rechten Rand abschneiden.
- Wichtig: Die semantischen Rechenwidersprüche lassen sich nicht allein gestalterisch heilen. Das Design sollte sie zumindest nicht als Erfolg verkaufen.

---

# 10 Knowledge / Reference Hub

## BEFUND
- Der Desktop-Screen hat eine nachvollziehbare Hierarchie: Hero, Quick Answer, FAQ plus Key Terms, Vergleich, Alignment und weiterführende Links.
- Der Hero ist mobil sehr hoch. Die „Naming note“ hat fast dasselbe Gewicht wie die eigentliche Einführung.
- FAQ-Karten sind mobil verständlich, aber durch große Höhen und Innenabstände sehr lang.
- Der gravierendste Fehler ist die Vergleichstabelle: Mobil ist praktisch nur „Feature / Criteria“ und „In-App RAP“ sichtbar. Die Spalte „Side-by-Side CAP“ liegt außerhalb des Ausschnitts, ohne klare Scroll-Affordance.
- Key Terms sowie Related Tools sind inhaltlich und visuell solide.

## VORSCHLAG
- Die Naming Note innerhalb des Heros stärker als sekundären Hinweis gestalten: kleinere Schrift, schmalere linke Akzentlinie und weniger Abstand zur Einführung.
- FAQ-Karten verdichten: Icon, Versalien-Label und Pfeil in eine Kopfzeile; Frage direkt darunter. Inhalte und Reihenfolge bleiben bestehen.
- Vergleichstabelle mobil horizontal scrollbar machen, erste Spalte sticky setzen und einen sichtbaren Anschnitt der nächsten Spalte belassen. So wird erkennbar, dass weitere Inhalte folgen.
- Tabellenzellen dürfen nicht durch einen festen Desktop-Mindestwert abgeschnitten werden; jede Vergleichsspalte braucht eine definierte lesbare Breite.
- „Clean Core Extensibility Alignment“ ist als dunkler Abschlussblock wirksam und sollte beibehalten werden.
- Related Tools und Further Reading könnten mobil mit geringeren Kartenhöhen direkt anschließen; aktuell erzeugen die großzügigen Abstände unnötige Seitenlänge.

---

# 11 Settings

## BEFUND
- Desktop ist sinnvoll zweispaltig: operative Einstellungen links, Plan- und Rechtshinweise rechts.
- Mobil wird die rechte Desktop-Spalte fast vollständig vor die eigentlichen Einstellungen gezogen. Nach „Current Plan“ folgen die großen dunklen Blöcke „Free Community Edition Status“ und „Legal & Privacy Directory“, bevor Personal Data oder System Preferences erreichbar sind.
- Das verzögert die häufigsten Aufgaben erheblich.
- Die E-Mail-Adresse ist in Personal Data abgeschnitten; es ist nicht erkennbar, ob der vollständige Wert anderweitig zugänglich ist.
- System Preferences und Security & Access sind klar gegliedert.
- Bring Your Own Key verwendet Violett konsistent als Bereichsakzent, aber „Test Connection“ ist sehr kontrastarm und kann wie deaktiviert wirken.
- S/4HANA Live Tenant Integration ist mobil außergewöhnlich lang: Connectivity Mode, Instructions, Security Measures, Warranty Disclaimer, Textfeld und CTA stehen komplett offen.
- Danger Zone ist korrekt deutlich getrennt und sollte am Ende bleiben.

## VORSCHLAG
- Mobile Reihenfolge ändern:
  1. Current Plan  
  2. Personal Data  
  3. System Preferences  
  4. Security & Access  
  5. Bring Your Own Key  
  6. S/4HANA Live Tenant Integration  
  7. Free Community Edition Status  
  8. Legal & Privacy Directory  
  9. Danger Zone  
  Alle Inhalte bleiben erhalten, operative Aufgaben kommen aber zuerst.
- Personal Data mobil direkt nach der Planübersicht anzeigen und die E-Mail in einer eigenen, umbrechenden Zeile darstellen statt mit Ellipsis abzuschneiden.
- „Test Connection“ klar als aktueller aktiver oder deaktivierter Zustand gestalten; der gegenwärtige blasse Zwischenzustand ist uneindeutig.
- Innerhalb der Live-Tenant-Karte Instructions, Security Measures und Warranty Disclaimer als klar getrennte Untersektionen mit kompakteren Abständen setzen. Die Texte bleiben vollständig sichtbar.
- Desktop kann die rechte Spalte sticky bis zum Ende der Security-/BYOK-Bereiche führen; der lange Legal-Block sollte nicht die visuelle Dominanz über die eigentlichen Einstellungen übernehmen.
- Danger Zone am Ende belassen und den Lösch-CTA weiterhin deutlich von allen anderen Aktionen unterscheiden.

---

# Priorisierung nach Wirkung zu Aufwand

1. **Mobile Tabellen und Codeflächen responsiv machen** – Analyze Evidence, Knowledge Comparison, Transformation und TCO-Chart.  
   **Wirkung: sehr hoch · Aufwand: mittel**

2. **Unzulässige Vorwärtszustände korrigieren** – Testing, Documentation und Delivery dürfen keinen Abschluss suggerieren, wenn Tests, Mapping oder Artefakte fehlen.  
   **Wirkung: sehr hoch · Aufwand: niedrig bis mittel**

3. **TCO-Kontext und Negativzustände korrigieren** – Analyze statt Upload hervorheben; negative Szenarien nicht als grüne Savings darstellen.  
   **Wirkung: sehr hoch · Aufwand: niedrig**

4. **Floating-Widgets kollisionsfrei positionieren** – Ask AI und schwarzes „N“ dürfen mobil keine Inhalte überdecken.  
   **Wirkung: hoch · Aufwand: niedrig**

5. **Workflow-Stepper mobil vollständig zugänglich machen** – horizontal scrollbar, aktiver Schritt zentriert, Workspace-Rückweg ergänzen.  
   **Wirkung: hoch · Aufwand: mittel**

6. **Mobile Settings neu ordnen** – operative Einstellungen vor Status- und Rechtstexten.  
   **Wirkung: hoch · Aufwand: niedrig**

7. **Dashboard-Beispielsektion mobil einklappen beziehungsweise über den vorhandenen Show-Mechanismus steuern.**  
   **Wirkung: mittel bis hoch · Aufwand: niedrig**

8. **Footer auf operativen Mobile-Screens verdichten** – aufklappbare Gruppen, identische Inhalte.  
   **Wirkung: mittel · Aufwand: niedrig bis mittel**

9. **Lade- und Empty States glaubwürdiger gestalten** – animierter Design-Status, weniger leere Terminalfläche, primäre Empty-State-Aktion zuerst.  
   **Wirkung: mittel · Aufwand: niedrig**

10. **Vertikale Abstände und Kartenhöhen auf Landingpage und Knowledge Hub reduzieren.**  
    **Wirkung: mittel · Aufwand: niedrig**
