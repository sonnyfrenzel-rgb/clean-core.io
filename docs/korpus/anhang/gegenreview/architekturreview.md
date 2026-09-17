# Clean-Core.io — Architektur-Gegenreview des Referenzkorpus v2

**Prüfstand:** 16. September 2026  
**Dokumentversion:** REVIEW-2.0.1-proposed  
**Prüfobjekt:** `referenzkorpus-v2.md` plus `referenzkorpus-v2-auftrag-externer-pruefer.md`  
**Modus:** inhaltliche Stufe A, quellenbasiertes, nicht blindes KI-Gegenreview  
**Entscheidung:** **Nicht unverändert als fachlich freigegebene Ground Truth einsetzen.**  
**Unabhängigkeitsstatus:** Kein menschlicher externer Prüfer, keine behauptete SAP-Zertifizierung, keine organisatorische Freigabe. Der KI-Assistent hat v1 mitverfasst und die v2-Sollantworten vor diesem Gegenreview gesehen.

---

## 1. Entscheidung für den Auftraggeber

Der v2-Korpus ist gegenüber v1 wesentlich nützlicher: Er behandelt nun Transaktionen, interpretierte Texte, dynamische Zielmengen, Erweiterungsmechanismen, Berechtigungsbeobachtungen, Ereignisblöcke und Zielprofilpaare. Besonders wertvoll ist, dass die Autoren zahlreiche Unsicherheiten selbst markieren. Das ist kein Grund, diese Fälle abzulehnen; es zeigt, an welchen Stellen die Sollantwort erst geprüft werden muss.

**Der neue Umfang heilt jedoch nicht alle Regeln.** Einige normative Aussagen sind noch zu weit, einzelne Fachsätze widersprechen ihren eigenen Befunden und ein Teil des Datenmodells vermischt unterschiedliche Gültigkeitsumfänge. Würde eine Engine jetzt exakt auf sämtliche Sollantworten trainiert, könnte sie mehrere fachlich falsche Antworten gerade dadurch als korrekt lernen.

Das Review liefert daher keine pauschale Abwertung und keinen neuen vermeintlichen Goldstandard. Es bestätigt konkrete Teile, widerspricht anderen und benennt die Voraussetzungen für noch offene Urteile. Die ursprünglichen Quelldokumente bleiben unverändert. Ein positiver Einzelbefund wird nicht automatisch zur Freigabe einer gesamten Regel, eines Falls oder des Produkts.

### Ergebnisumfang

| Ergebnis | Tatsächlich geliefert |
|---|---:|
| Aktive Regel-IDs beurteilt | **35** |
| Davon „hält“ | **16** |
| Davon „hält nur unter Bedingung“ | **13** |
| Davon „hält nicht“ in der vorliegenden normativen Fassung | **6** |
| Vollständige inhaltliche Stufe-A-Fallprüfbögen | **10** |
| Verglichene Fachsätze in diesen Bögen | **29** |
| Ausdrückliche Antworten auf Fall-/Prüffragen | **48** |
| Konsolidierte Reviewbefunde | **16** |
| Zusätzliche konstruierte ABAP-Gegenbeispiele | **8** |
| Tatsächlich ausgeführte lokale Gegenmodelltests | **15** |
| Native SAP-/ATC-/ABAP-Unit-Läufe | **0** |
| Läufe der Clean-Core.io-Engine oder des v2-Comparators | **0** |

Die sechs abgelehnten Regelwortlaute sind **R13a, R25, R26, R28, R32 und R34**. Bei R13a und R34 richtet sich das Urteil ausdrücklich gegen eine vollständige Ausschluss-/Abschneideregel; bei engerer Lesart ist die jeweilige Grundidee richtig, der notwendige Scope aber nicht ausreichend festgelegt. Das bedeutet nicht, dass jede Idee darin falsch ist. Beispielsweise sind die separate Sicherheitsachse in R28 und die Abgrenzung opaker Innenlogik in R34 sinnvoll. Ihre pauschalen Schlussregeln sind aber so nicht belastbar.

## 2. Was genau geprüft wurde

Der Prüfauftrag empfiehlt ausdrücklich Stufe A, wenn zuerst die wirksamsten Regeln und zehn entscheidungsrelevante Fälle beurteilt werden sollen. Diese Auswahl wurde ohne zusätzliche Rückfrage zugrunde gelegt: **CC-034, CC-035, CC-026, CC-027, CC-038, CC-053, CC-057, CC-058, CC-060 und CC-023**. Alle sechs Aussageklassen aus dem Auftrag werden in den einzelnen Bögen behandelt: Quellbefund, Level, Objekt-/Nachfolgeridentität, Fachsatz, Prozessskelett und Sicherheit.

Darüber hinaus wurden ausgewählte Passagen weiterer Fälle gelesen, insbesondere CC-028, CC-030, CC-033, CC-037, CC-056 und CC-059. Daraus stammen klar abgegrenzte Zusatzbeobachtungen. **Das ist keine vollständige Stufe-B- oder Stufe-C-Prüfung.** Die mechanische Quellenprüfung umfasst zwar alle 60 Fälle, ihre Semantik aber nicht vollständig.

### Unveränderliche lokale Eingangsidentität

| Datei | Bytes | SHA-256 |
|---|---:|---|
| `referenzkorpus-v2.md` | 585258 | `aa36119e45caf3104631d948de3490f2b956cc0374128a9ffe14407f338ad8a9` |
| `referenzkorpus-v2-auftrag-externer-pruefer.md` | 14050 | `a254acfb116dc27b3b64326945dbd58210670cf66123b39f1a05b650a0dfab2d` |

R01–R12 und R14–R24 werden in v2 ausdrücklich aus v1 übernommen, ihr voller Wortlaut steht aber nicht im neuen Regelregister. Der noch verfügbare v1-Regelabschnitt wurde deshalb gelesen und als gekennzeichneter Herkunftsauszug beigelegt. Eine dort übernommene Konvention ist keine neu entdeckte SAP-Aussage.

Nicht als eigene verifizierte Eingänge vorhanden waren die vollständigen vier Modellreviews, die in v2 beschriebenen Engine-Läufe, der exakte Enginesnapshot, ein vollständiges neues maschinenlesbares v2-Fixturebündel und ein unveränderlicher nativer SAP-Katalogsnapshot. Frühere Chat-Anhänge sind teilweise nicht mehr verfügbar. Für deren erneute Prüfung müssten die entsprechenden Originalstände erneut bereitgestellt werden; die vorliegende Stufe A ist davon nicht abhängig.

### Warum keine blinde externe Freigabe behauptet wird

Der Auftrag verlangt zunächst eine Antwort aus Code und Profil und erst danach Kenntnis der Sollantwort. In dieser Unterhaltung lag der vollständige Korpus bereits vor; außerdem bestand Vorwissen aus der Arbeit an v1. Eine rückwirkend erzeugte „Phase 1“ wäre keine Blindprüfung.

Deshalb tragen alle Ergebnisse den Status **NONBLIND_AI_COUNTERREVIEW**. Es gibt keinen erfundenen Prüfernamen, keine vorgetäuschte Berufserfahrung, keinen nachträglich erfundenen Empfangszeitstempel und kein `architekt`-Signoff. Die inhaltliche Arbeit bleibt verwertbar: Ein durch Primärquelle oder Gegenbeispiel belegter Widerspruch hängt nicht davon ab, ob der Reviewer ein Mensch ist. Eine personell unabhängige Freigabe ist aber ein anderer Nachweis.

## 3. Was bereits trägt und erhalten bleiben sollte

**Quellenintegrität:** Die 60 Fallnummern sind vollständig; 63 ABAP-Dateien mit insgesamt 997 Zeilen ließen sich extrahieren. Alle 61 angegebenen Einzeldateihashes stimmen. Bei zwei zusätzlichen Abhängigkeitsdateien ist kein eigener Einzelhash im Dokument ausgewiesen; sie wurden dennoch lokal separat gehasht. Alle 63 nummerierten Abdrucke entsprechen dem jeweiligen Codeblock. Diese Ergebnisse sprechen gegen eine einfache Quellenbeschädigung, nicht für die semantische Wahrheit der Sollantworten.

**Nachfolgeridentität:** Die Unterscheidung von TADIR-Typ, Objektart und Schlüssel ist richtig. Ebenso wichtig bleibt die Unterscheidung zwischen unbekanntem Nachfolger, leerer beobachteter Liste und nicht anwendbarer Katalogbeziehung. Die KNA1-Beziehung auf das CDS-Lesemodell I_CUSTOMER darf keinen Schreibersatz vortäuschen. [S19]

**Getrennte technische und fachliche Wahrheit:** Ein berechneter Routentext ist weiterhin keine tatsächliche Genehmigung. Ein registrierter Update-Aufruf ist noch kein fachlicher Datenänderungsnachweis. Diese Grundidee aus R18 ist richtig; mehrere neue Sätze müssen allerdings strenger daran gemessen werden.

**Aufwand bleibt Annahme:** Die gelieferten Stundenbandbreiten sind ausdrücklich unkalibriert. Sie werden in diesem Review weder bestätigt noch zu Iststunden umgedeutet. Es wurden keine menschlichen Arbeitszeiten oder realen Migrationsbudgets gemessen.

**Zielprofile sind ein Fortschritt:** Dass dieselbe Quelle je Produkt, Sprachversion und Freigabekontext unterschiedliche Antworten benötigt, ist fachlich wesentlich. Die Profile müssen jedoch tatsächlich in Modell, Schlüssel und Darstellung auftauchen — nicht nur als Kopfzeile über einer weiterhin codebasierten Pauschalantwort.

## 4. Die sechs kritischsten Regelkorrekturen

### 4.1 R25 — Nicht jede Grenze ist dieselbe Transaktion

R25 fasst mehrere Mechanismen unter einer pauschalen Commit-Lesart zusammen. Das ist zu grob. Es müssen mindestens **Datenbank-LUW, SAP-LUW, Update-Registrierung, Update-Anstoß, Ausführungsmodus und beobachtetes fachliches Ergebnis** unterschieden werden.

Ein wichtiger Gegenbeleg ist normales `CALL TRANSACTION`: Die dokumentierte neue SAP-LUW bedeutet nicht, dass allein durch diesen Aufruf die Datenbank-LUW beendet wird. Die BDC-Variante `CALL TRANSACTION … USING`, die aufgerufene Anwendung und tatsächliche Dialogschrittwechsel haben jeweils zusätzliche Semantik. Eine Regel darf diese Kontexte nicht durch eine Liste gleichwertiger Schlüsselwörter ersetzen. [S05–S09, S24]

Für **CC-026** ist die Kernunterscheidung Registrierung versus Ausführung richtig. Die Ausführung im Verbucherprozess setzt jedoch den passenden nicht lokalen Modus voraus. `AND WAIT` darf nicht als Beweis für jeden möglichen nachgelagerten V2- oder fachlichen Erfolg interpretiert werden. `COMMITTED` bleibt eine Ausgabe des Callers.

Für **CC-027** ist richtig: Im gelieferten Slice fehlt der explizite Update-Anstoß. Nicht richtig ist die uneingeschränkte Gleichsetzung des Report-/Sitzungsendes mit einem expliziten Rollback beziehungsweise dem Löschen aller Registrierungsdaten. Auch ein späteres Caller-COMMIT nach `SUBMIT … AND RETURN` darf nicht ohne Prüfung derselben SAP-LUW als Ausführung dieses Kindreports ergänzt werden. [S07, S09]

**Vorgeschlagene Neufassung:** Jede Operation bekommt ihre konkrete Wirkung auf `db_luw`, `sap_luw`, `update_registration`, `dispatch` und `persistence_evidence`. Ein fehlender expliziter COMMIT im Slice erlaubt nicht automatisch den Fachsatz „nicht persistiert“. Bei möglichen impliziten Grenzen oder opaken Aufrufen ist oft **„Persistenz innerhalb der Scheibe nicht nachgewiesen“** richtig. Eine Operation kann bereits eine Datenbankänderung vorgenommen haben, deren spätere Bestätigung oder Rücknahme außerhalb des Scopes liegt.

### 4.2 R32 — Der Name des Exits ist kein Level

R32 will Hostinformationen nicht länger nur aus einem Fixture beziehen. Das ist ein sinnvoller Anspruch, aber aus Markern folgt noch kein D. SAP zählt auch nominierte klassische Erweiterungspunkte wie Userexits und BAdIs zu Level B; echte Modifikationen, implizite Eingriffe und nicht unterstützte Techniken sind davon zu unterscheiden. [S01]

**CC-053** enthält `FORM userexit_save_document` sowie Zugriffe auf eine globale Struktur namens `vbak`. Im Quelltext selbst steht nicht `MV45AFZZ`. Dieser Name stammt aus der erklärten Repositoryidentität. Das ist zulässige Evidenz, aber **Metadaten**, nicht plötzlich ein Syntaxmerkmal.

Dasselbe FORM-Muster kann in einem kundeneigenen Programm mit eigener Struktur stehen. Ein pauschales D aus dem Namen wäre dort falsch. Ebenso ist `vbak-lifsk = lv_block` eine Arbeitsstrukturzuweisung, kein `UPDATE VBAK`.

**Das Review ersetzt deshalb nicht unbelegt D durch B.** Für den konkreten Fall bleibt das definitive technische Urteil offen, bis der tatsächliche Host-/Erweiterungsmechanismus und seine relevante Nominierung belegt sind. Ein ergänzender SAP-Community-Beitrag nennt MV45AFZZ als mögliches B-Beispiel und verweist auf Note 3578329. Diese Note war nicht lesbar und wird nicht als bestätigter Detailbeleg ausgegeben. [S20, S25]

### 4.3 R26 — Ein möglicher Worst Case ist nicht „known“

In **CC-038** stammt der Tabellenname aus einer frei veränderbaren Eingabe. Deshalb ist die vollständige Zielmenge nicht bekannt. Genau deshalb darf `known_worst_level = D` nicht mit der Begründung gesetzt werden, es *könnte* eine SAP-Kerntabelle sein.

Ein bekannter D-Befund braucht eine entsprechende nachgewiesene Operation oder Abhängigkeit. Eine konservative Risikobandbreite darf separat existieren, darf aber nicht dieselbe Bezeichnung tragen. Auch die Strukturverträglichkeit des dynamischen MODIFY begrenzt, welche Ziele tatsächlich erreichbar sind; das Beispiel beweist nicht erfolgreiches Schreiben in jede Tabelle.

Der pauschale R26-Eintrag für dynamisches `WHERE` ist zusätzlich zu korrigieren: Ein unbekanntes Prädikat macht `FROM kna1` nicht zu einem unbekannten Tabellenobjekt. Zielauflösung und Prädikat-/Sicherheitsanalyse sind verschiedene Ergebnisse.

**Vorgeschlagene Felder:** `observed_worst_level`, `unresolved_targets`, `potential_worst_level`, `scope_members` und `target_resolution`. Ein Unknown wird weder schöngerechnet noch durch ein nur vermutetes D ersetzt.

### 4.4 R13a — In einem Stringtemplate kann schon ABAP ausgeführt werden

Die neue Trennung zwischen bloßem Text und später interpretiertem SQL ist wertvoll. Sie reicht aber nicht. Ein Stringtemplate kann bereits bei seiner Auswertung funktionale Methodenaufrufe ausführen. Dafür braucht es keinen späteren SQL- oder Code-Konsumenten. [S12]

```abap
DATA(unused_text) = |{ lcl_counter=>tick( ) }|.
```

Das beiliegende konstruierte Gegenbeispiel lässt `tick` einen Klassenattributzähler erhöhen. Die Quellsemantik enthält einen Call und einen Seiteneffekt, auch wenn `unused_text` danach nicht mehr benutzt wird. Es wurde kein nativer SAP-Lauf dieser Zusatzdatei durchgeführt.

**Vorgeschlagene Neufassung:** Kommentare und reine Textsegmente werden von der Statementerkennung ausgeschlossen. Eingebettete ABAP-Ausdrücke werden rekursiv analysiert. Erst anschließend wird betrachtet, ob der erzeugte String an einen weiteren interpretierenden Konsumenten fließt. So lassen sich inert erscheinender SQL-Text, ABAP-Aufrufe innerhalb eines Templates und späteres Native SQL auseinanderhalten.

### 4.5 R28 — Sicherheitsbeobachtung, Schwachstelle und Policy sind nicht dasselbe

Die eigenständige Klasse `security_and_authorization` ist sinnvoll. Ihr aktueller Inhalt macht jedoch zu viele pauschale Gleichsetzungen.

`CLIENT SPECIFIED` deaktiviert automatische Mandantenbehandlung; ein zusätzliches `WHERE mandt = sy-mandt` kann die Ergebnismenge ausdrücklich auf den aktuellen Mandanten einschränken. `AUTHORITY-CHECK` kann einen Rückgabewert erzeugen, der zunächst gesichert und erst später wirksam geprüft wird. Ein in eine Datenbankoperation übergebener gebundener Parameter wird nicht dadurch zu SQL-Syntax. [S10, S11, S14]

Auch **IN LOCAL MODE** innerhalb eines geeigneten RAP-Behavior-Kontexts ist nicht allein ein Beweis einer Sicherheitslücke. Der beobachtete Umgehungsumfang bestimmter Frameworkprüfungen ist zu benennen; ob er bestimmungsgemäß oder unzulässig ist, benötigt den Aufruf-, Behavior- und Autorisierungskontext. [S17, S18]

**Richtiges Muster:** Beobachtung → Datenfluss → wirksame Schutzmaßnahmen → verbleibendes Risiko → projektbezogene Policyentscheidung. Ein Verbot gehört in `policy_decision`, nicht in eine technische Nachfolgerliste. Ein unabhängig begründeter D-Befund kann neben einem Sicherheitsbefund stehen; der Sicherheitsbefund selbst ist keine neue A–D-Regel.

### 4.6 R34 — Opak ist nicht gleich beendet

Ist die Innenlogik eines aufgerufenen Programms nicht geliefert, darf die Engine diese Innenlogik nicht erfinden. Sie darf aber den sichtbaren Aufrufer nicht einfach abschneiden. Bei `AND RETURN` ist eine normale Rückkehr eine modellierbare Fortsetzung; synchrone, asynchrone und nicht normale Ausgänge unterscheiden sich. [S06, S07]

Positiv: **CC-056 zeichnet selbst eine Rückkehrkante.** Der Fall ist in diesem Punkt präziser als die Regel. Geändert werden muss daher vor allem der pauschale Vertrag und die unzulässig allgemeine Commit-Beschriftung, nicht der sinnvolle opake Knoten an sich.

## 5. Fall CC-034 — Der Fachsatz widerspricht dem Sicherheitsbefund

Das Oracle erkennt richtig, dass `p_name` und `p_kunnr` ungeprüft in SQL eingebaut werden. Gleichzeitig sagt B02, NAME1 des angegebenen Kunden werde im aktuellen Mandanten geändert. Für beliebige erlaubte Eingaben garantiert der Code diesen Scope nicht.

Die 15 tatsächlich ausgeführten Gegenmodelltests enthalten ein **isoliertes In-Memory-SQLite-Modell** mit drei Wegwerfzeilen und zwei Mandanten. Derselbe unsichere Textaufbau ändert bei einer kurzen Eingabe alle drei Zeilen, einschließlich des anderen Mandanten. Die Eingabe liegt innerhalb der im ABAP-Beispiel deklarierten 35 Zeichen für `p_name`. Die gebundene Parameterfassung lässt denselben Inhalt dagegen Daten bleiben und ändert nur die bezeichnete Zeile.

**Das ist kein HANA-Test und kein gegen ein SAP-System ausgeführter Angriff.** Der Test widerlegt im kleinen SQL-Modell die logische Garantie, die der ursprüngliche Fachsatz aus einer ungesicherten Textkonstruktion ableiten will. SAPs ADBC-Dokumentation beschreibt gerade dafür Platzhalter und Bindung. [S10]

Der korrigierte Fachsatz muss drei Bedingungen enthalten: Der Schlüsselguard wurde passiert; die Operation versucht einen bestimmten Update; der tatsächlich betroffene Scope kann durch Textinterpretation von der beabsichtigten Filterung abweichen. `lv_rows <> 0` heißt zudem nicht `lv_rows = 1`.

Die D-Einstufung des nicht unterstützten KNA1-Schreibwegs bleibt davon unabhängig bestehen. Unbekannte Metadaten von `CL_SQL_STATEMENT` machen diesen direkt belegten negativen Effekt nicht unentscheidbar. Umgekehrt ersetzt das D-Label keine fachlich präzise Wirkungsbeschreibung. [S01]

## 6. Die weiteren Stufe-A-Entscheidungen

### CC-035: Bound Values sind kein zweiter CC-034-Injektionsfall

Der Native-SQL-Block verwendet Hostvariablen. Ein pauschaler Injektionsbefund wegen Eingaben wäre falsch. Der direkte SAP-Tabellenwrite bleibt D; die ausdrückliche Mandantenbedingung ist sichtbar. [S11]

Offen bleibt in der aktuellen Programmlogik, ob überhaupt eine Zeile getroffen wurde. Das Review beantwortet die Prüferfrage zu Systemfeldern anhand der Keyworddokumentation: ENDEXEC setzt `sy-subrc` und `sy-dbcnt`; letzteres zählt verarbeitete Zeilen. Die allgemeine dokumentierte 0/4-Tabelle ist in diesem Review kein Nachweis eines bestimmten `sy-subrc` für jedes DB-spezifische Nulltreffer-UPDATE. Erfolgreicher Statementabschluss und tatsächlich geänderte Kundenzeile sind getrennte Aussagen. Der Code wertet die Felder nicht aus. Ein empfohlenes neues Gateway gehört deshalb in einen Änderungsentwurf, nicht in das As-is-Skelett.

„Kein Nachfolger“ wird enger gefasst: Die beobachtete I_CUSTOMER-Beziehung ist kein geeigneter 1:1-Schreibersatz. Ob es eine unterstützte fachliche API für den konkreten Änderungsbedarf gibt, wurde damit noch nicht untersucht.

### CC-023: Die Korrektur muss in der eigentlichen Sollantwort ankommen

Im v2-Korrekturkapitel wird die unbedingte Änderungsbehauptung zurückgenommen. Im späteren Fallkörper steht sie weiterhin. Ein Importer, der die dortige B02 liest, erhält damit ein anderes Soll als ein Mensch, der die Vorrangregel im Kopf behält.

Auch die vorgeschlagene Erklärung zur Nullauffüllung ist zu pauschal. Richtig ist: Ein generisch typisiertes Eingabefeld führt nicht allein wegen seines Namens eine DDIC-ALPHA-Konvertierung aus. Ein kurzer numerischer Wert kann deshalb den gespeicherten nullaufgefüllten Schlüssel verfehlen. Nicht richtig ist: Jeder Schlüssel ohne führende Nullen verfehlt jeden Kunden. SAP behandelt nicht numerische ALPHA-Eingaben anders; ein passender alphanumerischer Schlüssel benötigt keine numerische Nullauffüllung. [S15]

Das lokale Zeichenvergleichs-Gegenmodell enthält beide Richtungen. Es bildet keine komplette SAP-Konvertierungsroutine ab und ist nicht als solcher Lauf etikettiert.

### CC-057 und CC-058: Der Zielwechsel darf den Altprozess nicht unsichtbar machen

KNA1-Legacyzugriff und Cloud-Zielunverträglichkeit sind auseinanderzuhalten. Eine nicht aktivierbare Zielquelle hat keinen beobachteten Zielausführungspfad. Sie kann aber weiterhin einen rekonstruierbaren Altprozess beschreiben. Gerade ein Explore-Team benötigt diese Erklärung, um eine Alternative zu beurteilen.

Darum darf ein targetbezogenes `process = not_applicable` nur das **Target-Ausführungsmodell** betreffen. Ein nachvollziehbares **Source-As-is-Skelett** sollte erhalten bleiben, mit seinem eigenen Profil, Umfang und Erkenntnisstatus. Das ist eine vorgeschlagene Produkt-/Korpuskonvention, keine Behauptung einer SAP-Levelnorm.

Bei CC-058 ließ sich eine echte offene Frage schließen: I_CUSTOMER besitzt in der abgefragten PCE2022-Datei einen eigenen `released`-Eintrag. Seine Freigabe muss somit nicht nur daraus geraten werden, dass es als KNA1-Nachfolger aufgeführt ist. Das macht den klassischen REPORT dennoch nicht cloudaktivierbar. [S19]

### CC-060: A an der Schnittstelle und C im Unterbau sind nur mit Scope korrekt

Der Grundgedanke ist tragfähig: Ein ordnungsgemäß freigegebener klassischer Wrapper kann von einem Cloud-Konsumenten genutzt werden. Der C1-Vertrag verändert aber nicht automatisch die interne Implementierung des Wrappers. [S02, S04]

Das Datenmodell muss daher deutlich unterscheiden: **Konsument als Komponente**, **Wrapper als Komponente**, **gesamte betrachtete Erweiterung** und **transitiv beobachteter technischer Unterbau**. Ein Konsument kann unter den genannten Vertragsbedingungen A-Kandidat sein, während der vollständige Zwei-Dateien-Scope einen C-Anteil enthält. Die Oberfläche darf aus der zulässigen Schnittstelle kein uneingeschränktes A für das Ganze machen.

Eine zweite konkrete Korrektur betrifft B02: Die Methode prüft, ob der zurückgegebene Name initial ist, nicht unabhängig, ob ein Kunde existiert. Ein vorhandener Datensatz mit initialem Namen ist im Fixture nicht ausgeschlossen. Ein späterer Umbau auf einen expliziten Existenzindikator wäre deshalb eine bewusste Änderung der Geschäftslogik, kein bloß anderer Satz über denselben Code.

Schließlich teilen sich an Zeile 16 Gateway und beide COND-Arme eine Quellzeile. Eine robuste Ankeridentität braucht Ausdrucksarm oder Quellspanne zusätzlich zur bloßen Zeile. Die Korrektur eines früheren Comparatorproblems ist nicht durch die Einführung irgendeines Tokenoffsets allein abgeschlossen.

## 7. Zusätzlich gelesene Fälle — keine Vollfreigabe der Stufe B

| Fall | Abgegrenzte Beobachtung | Nächster Prüfpunkt |
|---|---|---|
| **CC-028** | Kein E-Eintrag in einer BAPI-Rückgabetabelle und der anschließende Commit-Aufruf sind nicht automatisch ein vollständiger fachlicher Erfolgsbeweis. Der Commit-Return und weitere mögliche Fehlertypen bleiben zu berücksichtigen. [S22] | B03 auf tatsächlich getragene Aussage reduzieren; genaues BAPI-/Commit-Fehlermodell als separaten Oraclevertrag festhalten. |
| **CC-030** | COMMIT innerhalb einer SELECT-Schleife kann einen benötigten Cursor schließen; der entscheidende Punkt ist der nächste erforderliche Datenbank-Fetch, nicht bloß die Behauptung „mehr als eine Zeile“. Puffer-/Fetch-Verhalten macht einen pauschalen konkreten Fehlerzeitpunkt unsicher. [S08,S09] | Datensatz-/Fetchannahmen präzisieren; reproduzierbarer nativer Gegenfall erst als solcher labeln, wenn tatsächlich ausgeführt. |
| **CC-033** | MESSAGE E ist kein universelles ROLLBACK. Datenbank- und Dialogkontext entscheiden über implizite Grenzen; ein bereits ausgeführter direkter Write darf nicht allein mangels sichtbarem COMMIT als „nie persistiert“ verkauft werden. [S05,S08] | `persistence_unknown` statt unbelegtem Ausschluss; konkreten Laufzeit-/Messagekontext dokumentieren. |
| **CC-037** | Ein Default KNA1 ist nicht die vollständige Zielmenge; die reine unbekannte Menge beweist wiederum kein known-D. | Nach korrigiertem R26 neu bewerten; Lese-/Schreibwirkung und konkrete Nominierung getrennt. |
| **CC-056** | Caller-Rückkehr ist sinnvoll erhalten. Der pauschale implizite Commit und das unverändert bleibende Unknown im nicht aktivierbaren Cloud-Zweitprofil passen nicht zu den eigenen strengeren Profilfällen. [S07] | R25/R31/R34 gemeinsam konsolidieren. |
| **CC-059** | IN LOCAL MODE kann ein dokumentiertes Muster des eigenen Behavior sein. CL_ABAP_BEHAVIOR_HANDLER besitzt in der abgefragten PCE2022-Ansicht einen eigenen released-Eintrag. Das belegt noch nicht sämtliche BDEF-Trigger, BTP-2408-Metadaten oder erfolgreiche Aktivierung. [S17–S19] | BDEF-/Trigger-/Autorisierungskontext vollständig angeben; Reported/Failed/Save-Grenzen gezielt prüfen. |

Die übrigen Stufe-B-Fälle sind nicht durch bloße Erwähnung einer Regelnummer fachlich abgenommen. Diese Trennung verhindert, dass die mechanisch geprüften 60 Quellen zu einer angeblich 60-fachen semantischen Freigabe werden.

## 8. Quellenprüfung: Was neu belegt und was weiterhin offen ist

Die wichtigsten neu beobachteten Metadaten stehen in `evidence/catalog-observations.json`:

| Objekt | Beobachtete Identität | Beobachteter Zustand | Aussagegrenze |
|---|---|---|---|
| **I_CUSTOMER** | DDLS / I_CUSTOMER; CDS_STOB / I_CUSTOMER | `released` | Eigener Datensatz im PCE2022-Webabruf, nicht nur ein Nachfolgername. Keine vollständigen ADT-Vertragsattribute aus diesem Eintrag. |
| **CL_ABAP_BEHAVIOR_HANDLER** | CLAS / CL_ABAP_BEHAVIOR_HANDLER | `released` | Eigener PCE2022-Datensatz; nicht automatisch Beleg jedes BTP- oder älteren Produktprofils. |
| **KNA1** | TABL / KNA1 | `notToBeReleased`, Nachfolger I_CUSTOMER | Getrennte Classic-Nominierung, tatsächliches Zielrelease und konkrete Verwendbarkeit bleiben eigene Prüfungen. |

Es wurde **kein** SHA-256 über eine vollständig heruntergeladene native SAP-Katalogdatei als vorhanden behauptet. Die Container-Netzwerkversuche scheiterten; der Webzugriff erlaubte ausgewählte Originaleinträge. `main` ist veränderlich, Cachezeitpunkte unterscheiden sich. Ein Hash über eine lokale Abschrift belegt nur diese Abschrift.

Die gezielten Suchanfragen nach MV45AFZZ, USEREXIT_SAVE_DOCUMENT, KNA1 und CL_SQL_STATEMENT in der abgefragten Classic-Datei lieferten keine Treffer. Diese Beobachtung wird nicht als umfassender Beweis der Nichtfreigabe benutzt. Insbesondere wird aus einem nicht gefundenen Eintrag kein automatisches noAPI beziehungsweise D erzeugt.

Ein neuerer SAP-Hinweis zur **Public Edition 2608** beschreibt Änderungen der Datenherkunft von CustomerName. Er ist ein konkretes Beispiel dafür, warum Nachfolgerfeld und alte Tabellenfelder nicht über Releases hinweg pauschal gleichgesetzt werden dürfen. Er wird ausdrücklich **nicht** als 2023-Verhalten der hier vorgegebenen Fixtures verwendet. [S21]

## 9. Regelregister — Bedeutung der drei Urteile

**Hält** bedeutet: Der abgegrenzte Regelgedanke ist durch Quelle, explizite Korpuskonvention oder unmittelbare Logik tragfähig. Es bedeutet nicht, dass jede Anwendung der Regel in allen 60 Fällen richtig ist.

**Hält nur unter Bedingung** bedeutet: Eine fachlich notwendige Vorbedingung, Gültigkeitsgrenze oder formale Definition fehlt oder muss schärfer sein. Die Bedingung gehört in den aktiven Vertrag, nicht nur in eine Fußnote dieses Reviews.

**Hält nicht** bedeutet: Der gegenwärtige normative Wortlaut lässt ein konkret widerlegtes oder widersprüchliches Urteil zu beziehungsweise verlangt es. Ein pauschaler Sicherheitsvorbehalt oder eine größere Fallzahl heilt das nicht.

Das vollständige Urteil je aktiver Regel steht im nachfolgenden Register und in `decisions/rule-verdicts.json`. R13 in alter Fassung ist ersetzt und wird nicht zusätzlich aktiv gezählt. So ergeben sich 35, nicht 34 aktive IDs.

| Regel | Urteil | Begründung / Bedingung | Quellen |
|---|---|---|---|
| R01 | **hält nur unter Bedingung** | C nur für tatsächlich internes, nicht anders nominiertes Objekt und unter dem ausdrücklich stipulierten Profil. Katalog- und releaseübergreifende Abwesenheit ist nicht aus einer einzelnen Suchfehlanzeige beweisbar. | S01, S19, S20 |
| R02 | **hält** | Nicht unterstütztes direktes SAP-Kerntabellenschreiben bleibt D; ADBC oder Native SQL ändern den Effekt nicht. Ein Lesenachfolger ist keine Schreib-API. | S01, S10, S11 |
| R03 | **hält nur unter Bedingung** | B im erklärten klassischen Bestandsscope, wenn die gesamte bewertete Abhängigkeits- und Technologiemenge geschlossen und zulässig ist. Nicht von einer sichtbaren eigenen Klasse auf eine unbekannte Implementierung schließen. | S01, S02 |
| R04 | **hält** | Getrennte Classic-/Cloud-Betrachtung ist im dokumentierten Overlap richtig. Beide Metadatenfelder erhalten; nicht in ein einziges Release-Label kollabieren. | S03 |
| R05 | **hält nur unter Bedingung** | Der dokumentierte Bestands-/Deprecated-Kontext muss im Regelkopf benannt werden. Die bloße Zahl der Nachfolger legt kein Level fest; R05 ist kein genereller Ersatz für die Released-Lese-Regel R03. | S01, S03 |
| R06 | **hält** | Statische Angabe per Literal/Konstante und syntaktisch dynamische Variable getrennt von der Datenflussauflösung führen. Keine Änderung gegenüber dem eingegrenzten CALL-FUNCTION-Vertrag. | S26 |
| R07 | **hält nur unter Bedingung** | Zielmenge nur bei vollständigem, pfad- und aliasbewusstem Datenfluss schließen. Vorbelegung, Namensmuster und nicht vollständig bekannte Aufrufer sind keine Singleton-Garantie. | S26, S27 |
| R08 | **hält** | Kardinalität, Projektion und Prädikat-/NULL-Semantik erhalten. Die v2-Präzisierung des konkreten CC-008-Prädikats ist richtig; WHERE-Position allein reicht nicht. | S23 |
| R09 | **hält nur unter Bedingung** | FAE-Leerfortsetzungsschutz und fachlich sanfter Leerpfad trennen. ASSERT ohne ID kann die Fortsetzung wirksam verhindern, aber durch Dump. Die v2-Aussage, ASSERT sei überhaupt kein Guard, gilt nicht als allgemeine Semantik. | S13, S23 |
| R10 | **hält** | D für als implizite SAP-Erweiterung belegten Eingriff. Nicht auf jeden klassischen Exit oder Enhancement-Marker ausweiten; dafür trägt R10 keine Aussage. | S01 |
| R11 | **hält** | Dynpro allein begründet kein D. Ereignis-, Screen- und GUI-Metadaten sind für Rekonstruktion notwendig; Cloud-Rehosting und klassisches Level getrennt halten. | S01 |
| R12 | **hält nur unter Bedingung** | Unknown ist für den fehlenden konkreten Freigabebeleg zulässig. Ist eine Technologie oder ein Objekt ausdrücklich unsupported/noAPI, darf generelle Unkenntnis diese negative Evidenz nicht verdrängen. Konvention, keine pauschale SAP-Kernelklassifikation. | S01 |
| R13a | **hält nicht** | Der Ausschluss ganzer Stringtemplates ohne späteren Konsumenten ist zu weit. Eingebettete funktionale Methodenaufrufe werden bereits bei Auswertung des Templates ausgeführt und können Seiteneffekte haben. Nur Textsegmente sind inert. | S12 |
| R13b | **hält nur unter Bedingung** | Konsumentenbezogene Interpretation ist richtig. Quellsprachenausdrücke, SQL-Text, Identifier und gebundene Parameter müssen getrennt bleiben. Ein Literal mit beliebigem Konsumenten ist nicht automatisch ausführbarer Code oder Injektion. | S10, S11, S12 |
| R14 | **hält** | Dispatch, super-Aufruf und fehlende Vorfahren getrennt zu führen bleibt richtig. Diese Regel wird als semantisches Prinzip bestätigt, nicht als Prüfung jeder OO-Fixture-Implementierung. | S27 |
| R15 | **hält nur unter Bedingung** | RTTS-Freigabe, dynamisch bezeichnete Typen und Klassensprache jeweils prüfen. Freigabe eines Deskriptors ist keine Freigabe jedes damit erreichbaren Typs. | S02, S19 |
| R16 | **hält** | Fehlende Customer-/Partnerimplementierung führt zu Unvollständigkeit, nicht zu erfundenem SAP-internem C. Bekannte Evidenz und Gesamturteil getrennt zu halten ist die richtige Korpuskonvention. | S01 |
| R17 | **hält** | TADIR- und spezifische Objektidentität sowie Nachfolgerliste erhalten; unbekannt, leer und nicht erhoben unterscheiden. Ein Katalogverweis ist kein Beleg für Drop-in-Kompatibilität. | S19, S21 |
| R18 | **hält** | Fachsätze müssen vom angegebenen Scope und vollständigen Guard-Kontext getragen werden. Statusausgabe ist nicht gleich Geschäftsereignis; die Regel ist richtig, wird aber in mehreren v2-Sollsätzen verletzt. | S09, S10 |
| R19 | **hält nur unter Bedingung** | Kontroll- und Abbruchpfade sind richtig gefordert. Abstraktionsgrenze, ausgelassene allgemeine Exceptions und Rückkehr aus opaken Aufrufen müssen explizit sein; nicht jede ausgelassene Sprachoperation ist ein Fehler. | S06, S07 |
| R20 | **hält** | Eigene Persistenz begründet keine automatische CAP-/BTP-Pflicht. Dies ist eine sinnvolle Architekturkonvention; konkrete Zielplattformfähigkeit ist separat nachzuweisen. | S02 |
| R21 | **hält** | Nicht gemessene Stunden bleiben Annahmen; Istwerte null. Der Satz bleibt unabhängig vom technischen Review gültig und liefert ausdrücklich keinen Aufwand-Accuracy-Score. | Korpuskonvention |
| R22 | **hält** | Exakte Quell-, Kontext-, Regel- und Sollversionen sind nötig. Änderungen erzeugen einen Reviewbedarf. Hashes belegen Integrität, nicht fachliche Wahrheit; noch fehlende Kontexthashes sind eine Umsetzungslücke. | S19 |
| R23 | **hält** | Grenzwerte, Währung und vorgelagerte Abbrüche müssen in Fachsätzen erhalten bleiben. Auch ein korrektes numerisches Prädikat liefert ohne Währung keine EUR-Aussage. | S12 |
| R24 | **hält** | GET/CALL BADI allein beweist keine konkrete aktive Einzelimplementierung. Die Bindungsmetadaten bleiben eigenständige Evidenz; keine universelle Herabstufung klassischer BAdIs. | S01, S28 |
| R25 | **hält nicht** | SAP-LUW, Datenbank-LUW, Verbuchungsanstoß, Ausführungsmodus und bestätigte Persistenz werden vermischt. Nicht jeder Programm-/Screenaufruf committet; DB-Commit ist kein automatisches COMMIT WORK. Registrierung ohne Anstoß ist nicht gleich vollständige Wirkungslosigkeit. | S05, S06, S07, S08, S09, S24 |
| R26 | **hält nicht** | Ein möglicher Worst Case darf nicht known_worst heißen. Dynamisches WHERE verändert nicht automatisch die bekannte FROM-Zielmenge. Unbekannt, beobachtet und vorsorgliche Obergrenze sind drei unterschiedliche Aussagen. | S01, S10 |
| R27 | **hält nur unter Bedingung** | Statementanker plus Offset ist sinnvoll, aber Tokenisierung muss normiert werden. Kettenelement, Makroexpansionspfad und Ausdrucksarm brauchen zusätzliche IDs; eine Makroaufrufstelle kann mehrere Wirkungsstellen enthalten. | Korpuskonvention |
| R28 | **hält nicht** | Die separate Sicherheitsachse ist richtig, die pauschalen Befunde sind es nicht: CLIENT SPECIFIED erlaubt expliziten Mandantenfilter; LOCAL MODE kann bestimmungsgemäß sein; gebundene Eingabe ist keine Textinjektion; gespeicherter sy-subrc kann später wirksam geprüft werden. Verbot und Nachfolger sind verschiedene Felder. | S10, S11, S14, S17, S18 |
| R29 | **hält nur unter Bedingung** | Typreferenzen sind eigenständige DDIC-Abhängigkeiten; ein Lese-CDS ist kein mechanischer Typersatz. Level erst nach Objekt-/Release-/Nominationkontext; NODES/GET brauchen zusätzlich LDB-Bindung. | S01, S16, S19 |
| R30 | **hält nur unter Bedingung** | C1 kann eine zulässige Konsumentengrenze bilden. Dafür Zustand, Vertrag, Usage Visibility, Sprachversionen und Signatur prüfen. Komponentenlevel und Gesamt-/transitiver Scope dürfen nicht unter derselben Levelspalte unterschiedlich aggregiert werden. | S01, S02, S04 |
| R31 | **hält** | Quelle plus explizites Zielprofil ist gegenüber einer Code-only-Antwort richtig. Der Schlüssel muss um bewerteten Scope und objektbezogene Sprach-/Freigabemetadaten ergänzt werden. Profilpaare dürfen mehrere Dimensionen wechseln, dann aber keine Ein-Faktor-Kausalität behaupten. | S02, S19 |
| R32 | **hält nicht** | Namen und Marker liefern Hinweise, nicht das Level D. Klassische nominierte Userexits/BAdIs können B sein; explizite, implizite und echte Modifikationen unterscheiden. Source-Bytes allein identifizieren ein Include nicht als MV45AFZZ. | S01, S20, S25 |
| R33 | **hält nur unter Bedingung** | Ereignisorientierung und kontextabhängiges CHECK sind richtig. Reportereignisse sind kein stets vollständig durchlaufener linearer Ablauf; GET/CHECK kann den LDB-Unterbaum unterdrücken. Ereignisbedingungen und Wiedereintritte gehören zum Vertrag. | S16 |
| R34 | **hält nicht** | An einer opaken Grenze endet die Kenntnis der internen Logik, nicht zwingend der Kontrollfluss des Aufrufers. AND RETURN, synchrone Rückkehr und asynchrone Fortsetzung sind zu erhalten; Transaktionseffekte separat nach korrigiertem R25. CC-056 zeigt selbst eine Rückkehrkante; die Korpusinstanz ist an dieser Stelle präziser als der pauschale Regelwortlaut. | S06, S07, S24 |

## 10. Empfohlener Korpusvertrag für die nächste Korrektur

### 10.1 Keine neue Gesamtnote, sondern klarere Zustandsachsen

Ein möglicher Datensatz trennt folgende Aspekte. Das Beispiel ist ein **Schemaentwurf**, kein bestehendes Produktschema und kein bereits implementierter Validator:

```json
{
  "source_context": {
    "source_set_hash": "...",
    "language_version_by_object": {},
    "repository_manifest_hash": "..."
  },
  "assessment": {
    "scope_id": "extension-with-wrapper",
    "scope_members": ["ZCL_ROUTE_SERVICE", "ZCL_CUSTOMER_API"],
    "target_profile_id": "...",
    "rule_revision": "2.0.1-proposed",
    "applicable": true,
    "level": "C",
    "completeness": "declared-slice-only"
  },
  "observed_risk": {
    "known_worst_level": "C",
    "basis": ["KNA1 read in wrapper"],
    "unresolved_dependencies": []
  },
  "target_activation": {
    "result": "not_executed",
    "predicted_compatibility": "conditional",
    "native_receipt": null
  },
  "source_process": {
    "status": "reconstructed",
    "scope": "delivered-slice",
    "target_executable": false
  },
  "review": {
    "kind": "nonblind_ai_counterreview",
    "external_human_signoff": null
  }
}
```

`Unknown`, `not_applicable`, `not_executed` und `not_activatable` beantworten verschiedene Fragen. Eine Null in einem Level darf nicht dieselbe Bedeutung wie ein unbekanntes Ziel oder eine noch nicht ausgeführte Prüfung tragen.

### 10.2 Quellenanker für reale Spracheigenschaften

Ein stabiler Anker braucht mindestens Quellmengenhash, Datei, Statementidentität und tatsächliche Quellspanne. Tokenoffsets sind zusätzlich hilfreich, müssen aber normiert werden: Zählbeginn, Interpunktion, Verkettung, Ausdrucksgrenzen und Makroexpansion.

Für einen Ausdruck mit zwei Ergebnisarmen sind unterschiedliche `expression_path`-Werte möglich. Für mehrere Wirkungen eines Makros sind Aufrufstelle und `expansion_ordinal` nötig. Der Definitionsanker bleibt als Herkunft erhalten. Kommentar-/Whitespaceänderungen erfordern eine bewusst definierte Abbildung; ursprüngliche Quellenhashes dürfen nicht nachträglich so tun, als habe es keine Änderung gegeben.

### 10.3 Fachsatzprüfung als eigener Vertrag

Jeder Fachsatz braucht einen definierten Gegenstand und eine Behauptungsstärke: **Versuch**, **registriert**, **ausgeführt**, **Zeilen betroffen**, **Commit erfolgt**, **fachlich bestätigt**. Diese Stufen sind keine automatisch monotone Pipeline: Beispielsweise kann eine Ausgabe einen Commit benennen, ohne einen Fachzustand oder eine Zahl betroffener Objekte zu bestätigen.

Jeder Fachsatz braucht außerdem positive und negative Szenarien. Für CC-060 gehören Name initial, Grenzwert genau 10000 und 10000,01 dazu. Für CC-053 sind vorhandene Sperre bei negativem Prädikat und unbekannte Währung entscheidend. Für CC-034 sind Nulltreffer, Mehrfachtreffer und veränderte SQL-Filterung relevant. Ein korrekter Zeilenanker allein kann diese Unterschiede nicht absichern.

### 10.4 Metamorphe Prüfungen nur mit Voraussetzungen

Die im Korpus beschriebene Idee metamorpher Tests ist sinnvoll, aber nicht jede Textänderung erhält Semantik. Eine Umbenennung kann reflektive oder dynamisch textbasierte Bezüge brechen. Zwei beliebige vollständige REPORT-Quellen lassen sich nicht einfach hintereinanderkleben und als unverändertes Programm betrachten. Kommentaränderungen müssen tatsächliche Kommentarpositionen berücksichtigen.

Daher braucht jede Transformation einen zulässigen Eingabebereich und eine überprüfbare Vorbedingung. Ein abaplint-Dissens wird mit Parserversion, Sprachprofil und Minimalfall untersucht. Weder der externe Parser noch die eigene Engine sind aufgrund ihres Namens automatisch richtig.

## 11. Korrekturen am unabhängigen Prüfverfahren

Der Prüfauftrag sagt, ein Prüfer, der absichtlich falsche Sollantworten nicht findet, habe Phase 2 schon vor Phase 1 gelesen. Dieser Schluss ist nicht gedeckt. Ein übersehener Kontrollfehler kann aus Irrtum, unklarem Scope, fehlendem Detailwissen oder einem anders interpretierten Vertrag entstehen. Umgekehrt kann ein vorinformierter Prüfer einen Kontrollfehler entdecken. **Kontrollergebnis und Unabhängigkeit sind unterschiedliche Nachweise.**

Eine tragfähige Blindrunde benötigt getrennte Materialpakete, einen tatsächlichen Zugriffspfad, die Abgabe der ersten Antworten vor Öffnen der Vergleichsdaten und eine externe Empfangsbestätigung. Kontrollfälle helfen bei der Bewertung der Sorgfalt, ersetzen diese Dokumentation aber nicht.

Ebenso sollte ein Ergebnis nicht deshalb als unbrauchbar gelten, weil es überwiegend zustimmt. Eine adversariale Suche darf auf Gegenbeispiele ausgerichtet sein; das Gesamturteil muss anschließend trotzdem richtige Aussagen anerkennen. Sonst wird nicht Wahrheit, sondern eine gewünschte negative Antwort optimiert.

Die Klauseln zur Stufe `architekt` sollten außerdem auf **Aussagefacetten und geprüften Umfang** bezogen werden. Eine personell unabhängige Zustimmung zum statischen D-Befund in CC-034 ist noch keine unabhängige Freigabe seines Fachsatzes, seines Graphen, einer SAP-Aktivierung oder seiner Stundenannahme.

## 12. Tatsächlich ausgeführte Qualitätssicherung

### Mechanische Quellenprüfung

`python tools/recheck_sources.py` prüft lokal erneut die 60 Fall-IDs, alle extrahierten Codeblöcke, die deklarierte Quellenidentität, die nummerierten Doppelabdrucke und die aktive Regelliste. Ergebnis: keine Abweichungen. Die 997 Quellzeilen sind **keine** 997 unabhängig bewerteten Fachurteile.

### Lokale Gegenmodelle

`python -m unittest discover -s tools -p 'test_countermodels.py' -v` führt 15 Tests aus:

- vier SQLite-Gegenmodelle zu normalem Update, unsicherem Textaufbau, Parameterbindung und Nulltreffer-Commit;
- drei eingegrenzte Zeichenvergleichsmodelle für numerische und alphanumerische Kundenschlüssel;
- vier Modelle der CC-060-Name-/Betragsverzweigung;
- vier Modelle der CC-053-Sperrkandidatenlogik einschließlich Erhalt eines vorhandenen Werts.

Alle 15 liefen erfolgreich. Sie wurden vom selben KI-Autor wie das Review verfasst, sind keine unabhängige Ground Truth und kein Leistungstest der Produktengine. Ihr begrenzter Zweck ist, konkrete logische Gegenbeispiele ausführbar zu machen.

### Acht neue ABAP-Gegenbeispiele

Die zusätzlichen Quelldateien sind **konstruiert und nicht nativ aktiviert**. Sie behandeln Template-Seiteneffekte, dynamisches WHERE bei bekanntem FROM, explizite Mandantenfilter, gesicherte Autorisierungsreturncodes, Caller-Fortsetzung nach SUBMIT, mehrfache Makrowirkungen, ASSERT-Fail-fast und ein gleichnamiges FORM in kundeneigenem Kontext. Kein Fall wird als tatsächlich aus einem von mir betreuten Kundenprojekt ausgegeben.

## 13. Freigabeentscheidung und nächste Arbeitspakete

### Entscheidung dieses Reviews

**Der v2-Kandidat sollte in dieser Fassung nicht zur autoritativen Freigabeschranke für fachliche Richtigkeit werden.** Er bleibt als Entwicklungs-, Diskussion- und Gegenbeispielkorpus nützlich. Ein bestimmter nachgewiesener Fehler einer Sollantwort muss vor dem Einfrieren der entsprechenden Regel korrigiert oder ausdrücklich als strittig geführt werden.

Das ist keine Forderung, erst ein SAP-System anzuschließen, bevor überhaupt fachlich gearbeitet werden darf. Der Auftrag erlaubt zu Recht ein statisches Review. Mehrere harte Widersprüche sind schon mit Quellen, Kontext und logischen Gegenbeispielen klärbar. Native Prüfungen werden nur für die Punkte verlangt, deren konkrete Zielimplementierung, Meldung oder Laufzeitwirkung sonst nicht belegt ist.

### Korrekturfolge

| Priorität | Arbeitspaket | Abnahme |
|---|---|---|
| **P0** | R13a/R25/R26/R32 neu formulieren; CC-034-Scope korrigieren. | Konstruierte Gegenbeispiele werden weder falsch grün noch falsch D; alte korrekte Negativkontrollen bleiben richtig. |
| **P1** | R28/R30/R34, Source-/Targetprozess, Wirkungs-/Ankeridentität und CC-023/060-Fachsätze konsolidieren. | Eine kanonische Aussage je Facette/Profil; Scope sichtbar; kein Widerspruch zwischen Managementtext, Sicherheitsbefund und Code. |
| **P1** | Maschinenlesbares v2.0.1-proposed-Bündel und Comparator mit explizitem Schemascope erstellen. | Regeln, Enums, Kontext-/Oraclehashes und tatsächliche Befundidentitäten konsistent; fehlende Prüfungen bleiben fehlend. |
| **P2** | Exakte Metadaten- und Zielprofilbelege ergänzen. | Vollständiger Snapshot oder dokumentierter autoritativer Metadatenauszug mit ausreichender Provenienz; ADT-Vertragsdetails für Wrapper sichtbar. |
| **Unabhängiger Schritt** | Neuer menschlicher Reviewer erhält frische Phase-1-Unterlagen. | Reale Abgabe vor Oraclezugang, fachlicher Dissens nachvollziehbar; keine Selbstfreigabe dieses Reviews. |

### Was bewusst nicht entschieden ist

Keine Aussage zur tatsächlichen Genauigkeit der Clean-Core.io-Engine auf diesen 60 Fällen. Keine native Aktivierbarkeit sämtlicher Fixtures. Kein fehlerfreier v2-Comparator. Keine gemessene Migrationszeit. Keine Markt- oder Modellüberlegenheit. Keine persönliche Produktionshäufigkeit aus angeblicher SAP-Kundenverantwortung. Keine Freigabe der vollständigen 60 Falloracles.

**Die tragende Verbesserung ist enger und konkret:** Ein Teil der Sollantworten wurde bestätigt, mehrere belastbare Widersprüche wurden lokalisiert, offene Metadaten wurden teilweise geklärt und die nächste Korrektur ist in Regeln, Fallbögen und ausführbaren Gegenmodellen nachvollziehbar beschrieben.

---

## 14. Quellenregister

Quellen S01–S28 sind Primärmaterialien von SAP beziehungsweise SAP-eigene Code-/Dokumentationsrepositorys. S25 ist ein ergänzender SAP-Community-Beitrag und wird ausdrücklich nicht als Ersatz für die nicht gelesene SAP-Note behandelt. Einige ältere Keywordseiten belegen klassische Sprachsemantik; sie ersetzen keine aktuelle Zielsystemausführung. Katalogeinträge und neuere Produkthinweise werden nur in ihrem ausgewiesenen Profil verwendet. Alle URLs wurden für dieses Review recherchiert oder als klar gekennzeichnete Herkunftsquelle aus dem Korpus übernommen. Details stehen in `evidence/sources.json`.

### [S01] SAP Learning: Exploring Clean Core Extensibility Best Practices

https://learning.sap.com/courses/practicing-clean-core-extensibility-for-sap-s-4hana-cloud/explaining-extensibility-model-best-practices_e290f382-800e-40ef-a203-85a13115f487

**Aussageumfang:** Level A–D; klassische APIs/Techniken; Userexits/BAdIs nicht pauschal D. Keine Einzelobjektfreigabe für MV45AFZZ.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S02] SAP Learning: Setting Up for Clean Core Development / Tier-2 APIs

https://learning.sap.com/courses/practicing-clean-core-extensibility-for-sap-s-4hana-cloud/creating-tier-2-cloud-apis_a75bf2cd-815c-42bb-8d3b-2bba4931ecad

**Aussageumfang:** API-Freigabe umfasst Zustand, Vertrag und Sichtbarkeit; Wrapper-/Konsumentengrenzen.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S03] SAP: Object Release State in Cloudification Repository Viewer

https://community.sap.com/t5/technology-blog-posts-by-sap/object-release-state-in-cloudification-repository-viewer-for-clean-core/ba-p/14350668

**Aussageumfang:** SAP-Beitrag zum Overlap classicAPI/notToBeReleased und zur Bestandsverwendung deprecated APIs. Suchansicht ausgewertet.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S04] SAP ABAP Platform 2022: Cloud API Enablement / Wrapper

https://help.sap.com/docs/ABAP_PLATFORM_NEW/b5670aaaa2364a29935f40b16499972d/f871712b816943b0ab5e04b60799e518.html?version=202210.000

**Aussageumfang:** Kundeneigene Wrapper außerhalb ABAP Cloud mit C1-Freigabe für Cloud-Konsumenten; keine Freigabe der Wrapperimplementierung durch bloßen Vertragsnamen.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S05] SAP: LUWs in ABAP

https://help.sap.com/docs/abap-cloud/abap-concepts/luws-in-abap

**Aussageumfang:** SAP-LUW versus Datenbank-LUW; Verbuchung, lokale/synchrone/asynchrone Verarbeitung; Transaktionsgrenzen. Keine native Ausführung des Fallcodes.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S06] ABAP 7.52 Keyword Documentation: CALL TRANSACTION

https://help.sap.com/doc/abapdocu_752_index_htm/7.52/en-US/abapcall_transaction.htm

**Aussageumfang:** Neue SAP-LUW beim normalen Aufruf; Aufruf allein beendet die Datenbank-LUW nicht. CALL TRANSACTION USING/BDC und aufgerufene Anwendung separat betrachten.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S07] ABAP 7.52 Keyword Documentation: SAP LUW

https://help.sap.com/doc/abapdocu_752_index_htm/7.52/en-US/abensap_luw.htm

**Aussageumfang:** SAP-LUW bei internen Sitzungen; SUBMIT/CALL TRANSACTION; unvollständig abgeschlossene Verbuchungsregistrierungen.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S08] ABAP 7.52 Keyword Documentation: Database Commit

https://help.sap.com/doc/abapdocu_752_index_htm/7.52/en-US/abendb_commit.htm

**Aussageumfang:** Datenbank-Commit, implizite Kontexte, RFC/WAIT/Dialog und Cursor. Nicht gleichbedeutend mit COMMIT WORK/Update-Dispatch.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S09] ABAP 7.52 Keyword Documentation: COMMIT WORK

https://help.sap.com/doc/abapdocu_752_index_htm/7.52/en-US/abapcommit.htm?file=abapcommit.htm%2F1000

**Aussageumfang:** Verbuchungsanstoß, AND WAIT und sy-subrc; unvollständig beendete SAP-LUW; Cursor und Fehlernachweise. Erfolgreich gelesene Suchansicht, kein nativer SAP-Lauf.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S10] ABAP 7.52: ADBC DDL and DML

https://help.sap.com/doc/abapdocu_752_index_htm/7.52/en-US/abenadbc_ddl_dml.htm

**Aussageumfang:** EXECUTE_UPDATE, Anzahl bearbeiteter Zeilen, Platzhalter und SET_PARAM statt unsicherem Textaufbau.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S11] ABAP 7.52: EXEC SQL

https://help.sap.com/doc/abapdocu_752_index_htm/7.52/en-US/abapexec.htm

**Aussageumfang:** Native SQL, Hostvariablen, fehlende automatische Mandantenbehandlung, sy-subrc und sy-dbcnt nach ENDEXEC.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S12] ABAP 7.52: Embedded Expressions in String Templates

https://help.sap.com/doc/abapdocu_752_index_htm/7.52/en-US/abenstring_templates_expressions.htm

**Aussageumfang:** Eingebettete Ausdrücke einschließlich funktionaler Methodenaufrufe; auch Seiteneffekte möglich, ohne späteren SQL-/Code-Konsumenten.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S13] SAP: ASSERT

https://help.sap.com/docs/abap-cloud/abap-keyword/assert

**Aussageumfang:** ASSERT ohne ID ist aktiv; bei falscher Bedingung Laufzeitfehler. ASSERT ID zusätzlich von Checkpoint-Konfiguration abhängig.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S14] SAP: Specifying a Client

https://help.sap.com/docs/SAP_NETWEAVER_701/6da3d9466c4b1014a5a2e370bd8c5dc8/fceb3969358411d1829f0000e829fbfe.html?locale=en-US&state=PRODUCTION&version=7.01.24

**Aussageumfang:** CLIENT SPECIFIED schaltet automatische Mandantenbehandlung aus; explizite Einschränkung kann Mandant erneut begrenzen. Historische Sprachdokumentation, nicht Cloud-Zulassung.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S15] SAP: ALPHA Conversion

https://help.sap.com/docs/SAP_NETWEAVER_AS_ABAP_751_IP/9c91640bf34c49d8bad6bc560bedd707/cfb789f931a24016999eabd80aa4ea6f.html?version=7.51.12

**Aussageumfang:** Numerische und nicht numerische Schlüssel werden unterschiedlich behandelt; keine universelle Pflicht zu führenden Nullen für alphanumerische Schlüssel.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S16] SAP: Exiting GET Event Blocks

https://help.sap.com/saphelp_autoid2007/helpdata/en/9f/db99b435c111d1829f0000e829fbfe/content.htm?no_cache=true

**Aussageumfang:** CHECK/EXIT im GET-Kontext können untergeordnete LDB-Knoten unterdrücken; nicht bloß generischer Blockabbruch.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S17] SAP: EML READ ENTITIES, Long Form

https://help.sap.com/docs/abap-cloud/abap-keyword/read-entities-long-form

**Aussageumfang:** IN LOCAL MODE im eigenen Behavior-Kontext; Umgehung definierter Frameworkprüfungen ist nicht allein ein Schwachstellennachweis.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S18] SAP ABAP Platform 2022: Determinations

https://help.sap.com/docs/ABAP_PLATFORM_NEW/fc4c71aa50014fd1b43721701471913d/ede4e327def74b3b869fad2e70b00abb.html?version=202210.latest

**Aussageumfang:** Offizielles Determination-Muster mit EML IN LOCAL MODE; BDEF-Trigger/Save-Kontext bleiben notwendig.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S19] SAP Cloudification Repository: objectReleaseInfo_PCE2022.json

https://raw.githubusercontent.com/SAP/abap-atc-cr-cv-s4hc/main/src/objectReleaseInfo_PCE2022.json

**Aussageumfang:** Eigene Einträge I_CUSTOMER und CL_ABAP_BEHAVIOR_HANDLER: released; KNA1: notToBeReleased mit typisiertem I_CUSTOMER-Nachfolger. main ist beweglich, kein vollständiger Commit-/Byte-Pin.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S20] SAP Cloudification Repository: objectClassifications_SAP.json

https://raw.githubusercontent.com/SAP/abap-atc-cr-cv-s4hc/main/src/objectClassifications_SAP.json

**Aussageumfang:** Gezielte Suche nach MV45AFZZ, USEREXIT_SAVE_DOCUMENT, KNA1, CL_SQL_STATEMENT ohne Treffer. Keine vollständige Negativzertifizierung und kein Levelbeweis aus Abwesenheit.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S21] SAP Public Edition 2608: Customer CDS field-name changes

https://help.sap.com/docs/SAP_S4HANA_CLOUD/ee9ee0ca4c3942068ea584d2f929b5b1/33e87490d09e496093a1b45dba38c2b4.html?locale=de-DE

**Aussageumfang:** Nur ein neueres Gegenbeispiel zur pauschalen Feldäquivalenz: CustomerName-Quellen ändern sich in 2608. Nicht auf das 2023-Fixture übertragen.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S22] SAP: Transaction Model for Developing BAPIs

https://help.sap.com/docs/SAP_NETWEAVER_AS_ABAP_752/166400f6be7b46e8adc6b90fd20f3516/4d4f424ab3ee468de10000000a42189c.html

**Aussageumfang:** Caller-gesteuerter Transaktionsabschluss, Kontext und BAPI-Ergebnisprüfung; Aufruf eines Commit-Funktionsbausteins ist kein universeller fachlicher Erfolgsbeweis.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S23] SAP samples: ABAP SQL Cheat Sheet

https://raw.githubusercontent.com/SAP-samples/abap-cheat-sheets/main/03_ABAP_SQL.md

**Aussageumfang:** Vom Korpus übernommene Quelle für SQL-Semantik; in dieser Runde nicht als nativer Zielrelease-Compilebeleg gewertet.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S24] SAP: Running a Program Using CALL TRANSACTION USING

https://help.sap.com/saphelp_gbt10/helpdata/EN/4d/91cdf0b9a642a1e10000000a42189c/content.htm?no_cache=true

**Aussageumfang:** BDC-Variante hat eigene Commit-/Batch-Input-Semantik; nicht mit dem normalen CALL TRANSACTION ohne USING gleichsetzen.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S25] SAP Community by SAP: Extensibility in the Age of AI

https://community.sap.com/t5/technology-blog-posts-by-sap/extensibility-in-the-age-of-ai-why-abcd-is-easier-and-smarter-than-you/ba-p/14234516/page/2

**Aussageumfang:** Zusätzlicher, schwächerer Kontext: nennt MV45AFZZ als mögliches Level-B-Muster und verweist auf Note 3578329. Die Note war nicht lesbar; daraus wird keine konkrete Objekt-/Releasefreigabe gemacht.

**Abruf:** 2026-09-16; Web-Leseansicht; kein archivierter vollständiger Upstream-Snapshot.

### [S26] SAP: CALL FUNCTION func

https://help.sap.com/docs/abap-cloud/abap-keyword/call-function-func

**Aussageumfang:** Literal/Konstante versus Variable; eigentliche Auswertung und Signaturkonflikte zur Laufzeit; dynamische Eingaben prüfen.

**Abruf:** 2026-09-16; Substantive Suchansicht; direkte JavaScript-Seite leer..

### [S27] SAP samples: ABAP Object Orientation

https://raw.githubusercontent.com/SAP-samples/abap-cheat-sheets/main/04_ABAP_Object_Orientation.md

**Aussageumfang:** Vererbung, lokale/globale Klassen, Parameter, Polymorphismus; kein Zielrelease-Aktivierungsnachweis.

**Abruf:** 2026-09-16; Web-Raw-Ansicht.

### [S28] SAP: Building Your First BAdI

https://help.sap.com/saphelp_scm700_ehp02/helpdata/en/44/f5175e19fd2463e10000000a1553f7/content.htm?no_cache=true

**Aussageumfang:** GET/CALL BAdI und Aktivierungs-/Implementierungskontext.

**Abruf:** 2026-09-16; SAP-Hilfeseite.
