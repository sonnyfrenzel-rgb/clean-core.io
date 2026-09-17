# Korrekturen an v1-Fällen — Prüfung von Fables Block „Wo der Korpus selbst irrt"

**Geprüft:** fable.md Abschnitt 5 („Wo der Korpus selbst irrt") und die Fälle KA-004, KA-025 bis KA-029, KA-102 gegen den vollständigen v1-Text von CC-002, CC-007, CC-008, CC-013, CC-023. Zeilenangaben „v1 Z. n" beziehen sich auf `C:/Users/felix/OneDrive/Desktop/referenzkorpus-v1.md` (3748 Zeilen); „code Z. n" auf die Zeilennummer im jeweiligen `source.abap`.

**Ergebnis in einem Satz:** Fünf Behauptungen bestätigt (Ankerkonventionen CC-007, Ankerkonvention CC-013 als Uneinheitlichkeit, CC-008 F04 als Regelformulierung, ALPHA in CC-023, `cloud_view = not_applicable`), zwei teilweise widerlegt (CC-008 F04 ist für den eigenen Code sachlich richtig; CC-002 hat keinen unbelegten Fachsatz, sondern eine fehlende Vorbedingung), eine Frage entschieden (KA-025 gehört nicht in CC-002, sondern in einen neuen Fall).

Nichts ausgeführt; alle Aussagen sind Textprüfung plus dokumentierte ABAP-Semantik. Beleggrad je Abschnitt angegeben.

---

## 0. Ankerkonvention, einmal ausformuliert (Briefing Regel 5)

Damit die Korrekturen in §1, §2 und §7 dieselbe Konvention benutzen, hier der Vorschlag, den die korrigierten Tabellen voraussetzen:

- **Primäranker = Zeile, auf der das Statement beginnt, plus Tokenoffset**, wo das Merkmal nicht das erste Token ist: `source.abap:4+8`.
- **Tokenoffset** zählt 0-basiert ab dem ersten Token des Statements; Trennzeichen (`,` einer SELECT-Liste, der abschließende `.`) zählen nicht; `a~kunnr`, `@p_land`, `@DATA(x)` sind je ein Token. Diese Zählweise ist ein Vorschlag an den Comparator-Autor, keine SAP-Norm.
- **Sekundäranker** = Literal-/Tabellenzeile oder Bereich, als solcher gekennzeichnet; der Comparator prüft den Primäranker, der Sekundäranker ist Lesehilfe.
- **Artefaktbefunde** (R11 Dynpro, Sprachversion, Artefakttyp) ankern am einleitenden Statement (`REPORT`, `PROGRAM`, `CLASS … DEFINITION`) mit der Kennzeichnung `scope=artefact` und nennen die Evidenzstellen als Sekundäranker.
- **Skelettknoten** folgen derselben Regel: Statementbeginn primär, Bereich sekundär.

Beleggrad: Korpuskonvention, keine SAP-Norm. Offene Prüferfrage an den Comparator-Autor: Ist die Kommaregel tragfähig, oder soll der Offset auf Statement-Scanner-Token (SAP `SCAN ABAP-SOURCE`) normiert werden?

---

## 1. CC-007 F01–F04 — zwei Ankerkonventionen für ein Statement (Fable KA-004, L10)

**Fables Behauptung.** F01–F03 sind je an der JOIN-Zeile verankert, F04 an einem Bereich 4–8 — zwei Konventionen für dasselbe Statement (KA-004, Beleggrad verifiziert „Korpus selbst"; L10: „Der Ankervertrag ist innerhalb des Korpus nicht einheitlich (CC-007)").

**Prüfergebnis: bestätigt.** v1 Z. 1186–1189:
- F01 `source.abap:5` (FROM-Zeile), F02 `source.abap:6` (erste JOIN-Zeile), F03 `source.abap:7` (zweite JOIN-Zeile), F04 `source.abap:4–8` (Bereich).
- Das Statement beginnt auf code Z. 4 (`SELECT a~kunnr, …`) und endet auf code Z. 9 (`INTO TABLE …`). Keiner der vier Anker nennt den Statementbeginn; F04 nennt einen Bereich, der das Statement nicht einmal vollständig umfasst (Z. 9 fehlt).
- Der Skelettknoten `j` (v1 Z. 1261, 1275) verankert mit `source.abap:4–9` — eine dritte Variante im selben Fall.

Eine Engine, die konsistent am Statementbeginn ankert, liefert `source.abap:4` für alle vier Befunde und wird vom v1-Comparator (Prüfung F02: Anker sind Datei + Zeilenbereich + Ausschnitt-Hash) an F01–F03 abgelehnt.

**Korrigierter Abschnitt (nur Befundtabelle und Skelettanker; Sollaussagen unverändert):**

| ID | Regelversion | Exakter Anker | Schwere* | Sollaussage | Quellen |
|---|---|---|---|---|---|
| CC-007-F01 | R01@1.0.0 | source.abap:4+8 (Sekundäranker: source.abap:5) | medium | KNA1 lesen; Nachfolger I_CUSTOMER. | SAP-LEVEL, SAP-PCE22 |
| CC-007-F02 | R01@1.0.0 | source.abap:4+13 (Sekundäranker: source.abap:6) | medium | KNB1 lesen; Nachfolger I_CUSTOMERCOMPANY. | SAP-LEVEL, SAP-PCE22 |
| CC-007-F03 | R01@1.0.0 | source.abap:4+22 (Sekundäranker: source.abap:7) | medium | KNVV lesen; Nachfolger I_CUSTOMERSALESAREA. | SAP-LEVEL, SAP-PCE22 |
| CC-007-F04 | R08@1.0.0 | source.abap:4 (Sekundäranker: source.abap:6–7, die beiden JOIN-Klauseln) | medium | Company und Sales Area werden jeweils nur über Kunde verbunden; Kombinationen können sich multiplizieren. | SAP-SQL |

Tokenzählung (Kommas zählen nicht): `SELECT`(0) `a~kunnr`(1) `a~name1`(2) `b~bukrs`(3) `c~vkorg`(4) `c~vtweg`(5) `c~spart`(6) `FROM`(7) **`kna1`(8)** `AS`(9) `a`(10) `INNER`(11) `JOIN`(12) **`knb1`(13)** `AS`(14) `b`(15) `ON`(16) `b~kunnr`(17) `=`(18) `a~kunnr`(19) `INNER`(20) `JOIN`(21) **`knvv`(22)**.

Skelettknoten `j`: `source.abap:4` (Bereich 4–9 sekundär). Objektanker im Abschnitt „SAP-/Repository-Objekte" (v1: `source.abap:5/6/7`) entsprechend auf `4+8`, `4+13`, `4+22`.

**Begründung:** Ein Statement, ein Primäranker; die Tabellennamen sind Offsets innerhalb dieses Statements, keine eigenen Statements. Die Sekundäranker erhalten die v1-Lesbarkeit.

---

## 2. CC-013 F01 — Anker auf `PROGRAM` (Fable §5: „drei Ankerkonventionen")

**Fables Behauptung.** CC-013 F01 ist an Zeile 1 (`PROGRAM`) verankert, CC-007 F04 an einen Bereich, CC-001 F01 an die FROM-Zeile: drei Konventionen; eine Engine, die konsistent am Statementbeginn ankert, wird an mindestens einem dieser Fälle abgelehnt.

**Prüfergebnis: bestätigt als Uneinheitlichkeit, nicht als falscher Anker.** v1 Z. 2082: F01 `source.abap:1`; v1 Z. 2088: das explizite Verbot ebenfalls `source.abap:1`. Code Z. 1 ist `PROGRAM zcc_ref_013.` — der Beginn eines Statements. Unter der Konvention aus §0 ist `:1` für einen **Artefaktbefund** (R11 bewertet Dynpro-Programm plus PBO/PAI/Status, nicht eine Zeile) der richtige Primäranker. Was fehlt, ist (a) die Kennzeichnung `scope=artefact` und (b) die Evidenzstellen, ohne die ein Comparator nicht unterscheiden kann, ob die Engine „Dynpro erkannt" oder „Programmkopf gesehen" hat. Fables Dreiteilung ist als Befund richtig; die Reparatur ist nicht das Verschieben von `:1`, sondern das Deklarieren, was `:1` bedeutet.

**Korrigierter Abschnitt:**

| ID | Regelversion | Exakter Anker | Schwere* | Sollaussage | Quellen |
|---|---|---|---|---|---|
| CC-013-F01 | R11@1.0.0 | source.abap:1 (scope=artefact; Sekundäranker: source.abap:5 `MODULE … OUTPUT`, source.abap:6 `SET PF-STATUS`, source.abap:8 `MODULE … INPUT`) | medium | Dynpro mit gelieferten PBO/PAI- und Statusmetadaten: klassischer B-Kandidat, Cloud-UI-Rehosting nötig; nicht automatisch D. | SAP-LEVEL, SAP-SCREEN |

Explizit unzulässige Schlussfolgerung (v1 Z. 2088) bleibt bei `source.abap:1`, ergänzt um `scope=artefact`.

**Begründung:** R11 ist eine Aussage über das Artefakt; ein Artefaktbefund braucht einen deklarierten Artefaktanker plus Evidenz, sonst ist `:1` vom Comparator nicht von einem Zufallstreffer zu unterscheiden.

---

## 3. CC-008 F04 — „WHERE auf rechter Tabelle verwirft NULL-Treffer" als Regel (Fable KA-028, KA-029, §3.8)

**Fables Behauptung.** F04 ist als Regelsatz formuliert („WHERE-Bedingung auf rechter Tabelle verwirft NULL-Company-Treffer"); wörtlich angewandt liefert er bei `… OR b~bukrs IS NULL` (KA-028) und bei `WHERE c~kunnr IS NULL` (KA-029, Anti-Join) exakt das Gegenteil. Richtig ist eine Prädikataussage.

**Prüfergebnis: bestätigt für die Formulierung, widerlegt für die Sachaussage über CC-008 selbst.** v1 Z. 1362: „WHERE-Bedingung auf rechter Tabelle verwirft NULL-Company-Treffer. Verlagerung nach ON verändert Semantik." Für den vorliegenden Code (code Z. 8: `WHERE b~bukrs = @p_bukrs`) ist der Satz **wahr**: das Gleichheitsprädikat ist für NULL nicht erfüllt, die Zeilen ohne KNB1-Treffer fallen weg; B01 (v1 Z. 1421) und die beiden Prüfvektoren (v1 „Zusätzliche fachliche Prüfeingaben": company_match false → 0 Zeilen) sind konsistent. Der Fehler liegt darin, dass der Satz die **Position** („auf rechter Tabelle") als Ursache nennt statt das **Prädikat**. Ein Comparator, der die Sollaussage inhaltlich vergleicht (Prüfung §7 F01: „Inhaltliches Entailment bleibt separat"), würde eine Engine akzeptieren, die genau diese Verallgemeinerung gelernt hat — und die in KA-028/KA-029 falsch antwortet.

**Korrigierter Abschnitt (nur F04; F01–F03 siehe §7):**

| ID | Regelversion | Exakter Anker | Schwere* | Sollaussage | Quellen |
|---|---|---|---|---|---|
| CC-008-F04 | R08@1.0.0 | source.abap:4+30 (Token `WHERE`; Sekundäranker: source.abap:8) | medium | Das WHERE-Prädikat `b~bukrs = @p_bukrs` ist für NULL nicht erfüllt; Zeilen, für die der LEFT OUTER JOIN auf KNB1 keinen Treffer liefert, werden verworfen. Die Wirkung folgt aus dem Prädikat, nicht aus seiner Stellung im WHERE: `… OR b~bukrs IS NULL` behielte diese Zeilen, `WHERE c~kunnr IS NULL` wäre ein Anti-Join und das Gegenteil. Verlagerung des Prädikats in die ON-Bedingung verändert die Semantik. | SAP-SQL |

Tokenzählung: `SELECT`(0) `a~kunnr`(1) `b~bukrs`(2) `c~vkorg`(3) `c~vtweg`(4) `c~spart`(5) `FROM`(6) `kna1`(7) `AS`(8) `a`(9) `LEFT`(10) `OUTER`(11) `JOIN`(12) `knb1`(13) `AS`(14) `b`(15) `ON`(16) `b~kunnr`(17) `=`(18) `a~kunnr`(19) `LEFT`(20) `OUTER`(21) `JOIN`(22) `knvv`(23) `AS`(24) `c`(25) `ON`(26) `c~kunnr`(27) `=`(28) `a~kunnr`(29) **`WHERE`(30)** `b~bukrs`(31).

Ergänzung „Explizit unzulässige Schlussfolgerungen" (neu, CC-008 hat bisher keinen solchen Block): `source.abap:4+30` — kein allgemeiner Satz „WHERE auf einer LEFT-JOIN-Tabelle entfernt NULL-Zeilen"; die Aussage gilt nur für Prädikate, die NULL nicht zulassen.

Beleggrad: verifiziert (dokumentierte NULL-Semantik in ABAP SQL: Vergleichsprädikate sind für NULL nicht wahr; `IS NULL` prüft explizit). KA-028/KA-029 gehören als eigene v2-Fälle in K04 — nicht mein Auftrag, im Autorenbericht vermerkt.

**Begründung:** Eine Sollaussage, die als Regel lesbar ist, wird als Regel gelernt. Die Prädikatfassung ist für CC-008 genauso wahr und für die Gegenfälle nicht falsch.

---

## 4. CC-002 und CC-023 — `PARAMETERS p_kunnr TYPE c LENGTH 10` ohne ALPHA-Konvertierung (Fable KA-102)

**Fables Behauptung.** Der Parameter erhält keine ALPHA-Konvertierung; die Fachsätze B01/B02 („Kunde wird gelesen/geändert") gelten nur für zehnstellige Eingaben mit führenden Nullen; Prüfvektoren fehlen; der Korpus hat damit im eigenen Kernfall eine unbelegte Fachaussage.

**SAP-Sachverhalt (Beleggrad: verifiziert).** Konvertierungsroutinen hängen an Domänen. KNA1-KUNNR ist über Datenelement/Domäne KUNNR mit der Konvertierungsroutine ALPHA versehen; der Datenbankwert einer numerischen Kundennummer ist rechtsbündig mit führenden Nullen (`0000001000`). Ein `PARAMETERS … TYPE c LENGTH 10` hat keine Domäne, also keine Konvertierungsroutine: die Eingabe `1000` steht im Feld als `1000` linksbündig mit Leerzeichen, und `WHERE kunnr = @p_kunnr` vergleicht `1000␣␣␣␣␣␣` mit `0000001000` — kein Treffer. Nur eine Eingabe, die bereits das interne Format hat, trifft. (Zum Vergleich hat der Korpus in CC-005 genau diese Konvertierung als eigenen Fall — v1 Z. 916 ff. — und nutzt sie in CC-002/CC-023 nicht.)

**Prüfergebnis CC-023: bestätigt.** v1 Z. 3170 ff., code Z. 2: `PARAMETERS p_kunnr TYPE c LENGTH 10.` v1 Z. 3253, B02: „Außerhalb des Testmodus wird NAME1 des angegebenen Kunden direkt in KNA1 geändert." — ohne Formatbedingung. Mit Eingabe `1000` und `p_test = ' '` trifft der UPDATE (code Z. 10) keine Zeile, `sy-subrc = 4`, ROLLBACK WORK (code Z. 15), Ausgabe NO_UPDATE. Dieser Pfad ist in B03 (v1 Z. 3256) und im Skelett (Knoten `g`, `r`, `no`) modelliert — B02 nimmt ihn aber nicht auf. Die Fixture-Annahmen (v1 Z. 3176) sagen nichts zum Eingabeformat. Fables Vorwurf trifft.

**Prüfergebnis CC-002: teilweise bestätigt.** v1 Z. 495, code Z. 4: dieselbe Deklaration. Aber: kein Fachsatz behauptet einen Treffer. B01 (v1 Z. 570) „Nur eine nicht leere Kundennummer wird als Selektionsschlüssel aufgenommen" ist formatunabhängig wahr; B02 (Z. 573) betrifft die leere Schlüsselliste; B03 (Z. 576) die Projektion. Fables Zitat „Kunde wird gelesen" steht nicht in CC-002. Was fehlt, ist die **Vorbedingung** in den Profilannahmen (v1 Z. 487 schweigt zum Format) und der Prüfvektor; W03 (v1 Z. 615) nennt „Duplikatsemantik", nicht das Format. Also: Lücke bestätigt, „unbelegter Fachsatz" für CC-002 widerlegt.

**Beide Optionen, ausgearbeitet:**

*(a) Prüfvektoren ergänzen* — neuer Block „Zusätzliche fachliche Prüfeingaben" im v1-Format:

CC-002:
```json
{
  "kind": "input_format_fixture_only",
  "vectors": [
    { "p_kunnr": "1000",       "knb1_rows_for_0000001000": 2, "expected_rows": 0, "expected_output": "no line (lt_keys not empty, so no NO_INPUT; lt_company empty, loop writes nothing)" },
    { "p_kunnr": "0000001000", "knb1_rows_for_0000001000": 2, "expected_rows": 2, "expected_output": "2 lines" }
  ],
  "note": "PARAMETERS without DDIC reference carries no ALPHA conversion; no actual SAP table read."
}
```

CC-023:
```json
{
  "kind": "input_format_fixture_only",
  "vectors": [
    { "p_kunnr": "1000",       "p_test": " ", "kna1_row_for_0000001000": true, "expected_sy_subrc": 4, "expected_path": "ROLLBACK WORK", "expected_output": "NO_UPDATE" },
    { "p_kunnr": "0000001000", "p_test": " ", "kna1_row_for_0000001000": true, "expected_sy_subrc": 0, "expected_path": "COMMIT WORK AND WAIT", "expected_output": "UPDATE_COMMITTED" }
  ],
  "note": "Same declaration as CC-002; the miss lands in the existing ROLLBACK path (B03), not in an error."
}
```

*(b) Fachsätze bedingt formulieren* — geänderte Sätze im v1-Format:

**CC-023-B02** — Außerhalb des Testmodus wird NAME1 des Kunden geändert, dessen Schlüssel exakt der eingegebenen zehnstelligen Zeichenkette entspricht. Eine Eingabe ohne führende Nullen trifft keinen Satz, weil `p_kunnr` ohne DDIC-Bezug deklariert ist und keine ALPHA-Konvertierung erhält; sie endet im ROLLBACK-Pfad (B03).  
Anker: source.abap:10, source.abap:2. Kontext: /business_scope, /execution_assumptions (Eingabeformat).

**CC-002-B03** — Das Ergebnis enthält Kundennummer, Buchungskreis und Abstimmkonto der Company-Sätze, deren Schlüssel exakt der eingegebenen zehnstelligen Zeichenkette entspricht; nicht jede beliebige Stammdateneigenschaft, und bei Eingabe ohne führende Nullen keine Zeile (keine ALPHA-Konvertierung an `p_kunnr`).  
Anker: source.abap:13, source.abap:4, source.abap:16. Kontext: /business_scope, /execution_assumptions (Eingabeformat).

Zusätzlich in beiden Fällen unter **Profilannahmen** ein Satz: „Eingabe wird im internen zehnstelligen Format erwartet; das ist eine Ausführungsannahme, kein Codeverhalten."

**Empfehlung: (b), mit (a) als Beleg.** Das Ehrlichere ist die bedingte Formulierung: Der Fachsatz ist das, was der Comparator prüft (Prüfung §7 F01: erwartete atomare Claim-IDs, nicht Vektoren); ein Vektor allein ließe einen Satz stehen, der für eine plausible Eingabe falsch ist. Umgekehrt ist ein bedingter Satz ohne Vektor eine weitere unbelegte Behauptung. Wenn nur eines geht: (b).

**Optionaler Befund, nicht ausgearbeitet:** „Eingabeparameter ohne Konvertierungsroutine gegen Schlüsselfeld mit ALPHA" wäre statisch ableitbar (Deklaration ohne DDIC-Bezug, Zielfeld mit Domäne KUNNR) und ein eigener Befund in CC-002/CC-023. Keine v1-Regel trägt ihn; R23 („fehlende Kontrolle separat belegen") ist auf Grenzwerte/Währung gemünzt. Fehlende Regel → Autorenbericht.

---

## 5. KA-025 — FAE-Duplikateliminierung: in CC-002 relevant oder neuer Fall?

**Fables Fall.** `SELECT netwr FROM vbap FOR ALL ENTRIES IN lt WHERE vbeln = lt-vbeln` ohne Schlüssel in der Projektion: gleiche Ergebniszeilen werden eliminiert, eine Summe darüber ist falsch; eigener Befund (KA-025, Beleggrad verifiziert: SAP-dokumentiertes Verhalten).

**Entscheidung: nicht in CC-002 relevant — neuer Fall.**

Begründung (Beleggrad: verifiziert, dokumentierte FAE-Semantik: das Ergebnis wird wie bei `DISTINCT` von Duplikaten befreit; leere Treibertabelle selektiert alles):
1. CC-002 projiziert `kunnr, bukrs, akont` (code Z. 13). KNB1 hat den Schlüssel MANDT, KUNNR, BUKRS; die Projektion enthält den vollständigen Schlüssel ohne Mandant. Zwei Ergebniszeilen können daher nur gleich sein, wenn sie derselbe Datensatz sind — die Duplikateliminierung kann nichts entfernen.
2. Die Treibertabelle `lt_keys` hat höchstens einen Eintrag (code Z. 6–7). Auch die zweite FAE-Falle (Duplikate in der Treibertabelle) tritt nicht auf.
3. Kein Fachsatz in CC-002 summiert oder zählt.

Ein neuer Fall braucht: Projektion **ohne** Schlüssel (z. B. nur `netwr`), mehrere Treiberschlüssel, eine Aggregation über das Ergebnis (Summe, Zählung), und den Sollbefund „Summe ist falsch, weil gleiche Zeilen eliminiert werden" unter R08 (Projektion erhalten). Konvergenz für den Zusammenführer: Fable KA-025; Grok H-009 und GLM A-047 nennen die Treibertabellen-Duplikate — Vorsicht: A-047 („Duplikate multiplizieren Ergebnis") beschreibt JOIN-Verhalten, nicht FAE; bei FAE wird das Ergebnis dedupliziert. Das ist eine Sachkorrektur an einem Modellfall, die im neuen Fall als „explizit unzulässige Schlussfolgerung" stehen sollte.

Kleine Ehrlichkeitskorrektur an CC-002 selbst (optional): W03 (v1 Z. 615) „Duplikatsemantik prüfen" suggeriert ein Problem, das hier strukturell nicht auftreten kann. Vorschlag: „Duplikatsemantik: greift hier nicht, da der volle Schlüssel projiziert ist — bei Änderung der Projektion neu prüfen."

---

## 6. `cloud_view` → `cloud_api_surface` und `cloud_artefact` (Fable §5, KA-020, KA-104)

**Fables Behauptung.** `cloud_view = not_applicable` für Reports mit `WRITE`/`PARAMETERS` (CC-003, CC-016, CC-017, CC-025) ist irreführend: kein REPORT ist in ABAP Cloud aktivierbar; das Feld soll API-Oberfläche meinen, wird aber je Fall gelesen.

**Prüfergebnis: bestätigt.** v1 Z. 633 (CC-003), 2361 (CC-016), 2458 (CC-017), 3453 (CC-025): `Cloud-API: not_applicable`. v1 Z. 2730 (CC-019): `usable` — für einen REPORT. Die Fallmatrix (v1 Z. 186, Spaltenkopf „Cloud-API-Oberfläche") und die Fußnote (v1 Z. 214: „Cloud-API-Oberfläche ist keine Aussage, dass der gesamte REPORT in ABAP Cloud ausführbar sei") sagen, dass API-Oberfläche gemeint ist; §3 (v1 Z. 53) definiert `cloud_view` aber als **beides** („Benutzbarkeit der API-Oberfläche **und** Eignung der vorliegenden gesamten Implementierung"). Ein Feld, zwei Bedeutungen, und der Wert `not_applicable` beantwortet keine von beiden: Er sagt nicht, dass keine SAP-API berührt wird, und nicht, dass das Artefakt nicht aktivierbar ist.

**Vorgeschlagene v2-Semantik:**

- **`cloud_api_surface`** ∈ {usable, not_usable, unknown}: Sind **alle** im Scope referenzierten SAP-Objekte im Zielprofil für ABAP for Cloud freigegeben? `usable` bei leerer Menge ist vakuum wahr; ich empfehle als vierten Wert **`none`** („keine SAP-API berührt"), damit das Vakuum nicht wie eine Freigabe aussieht. Die Tabelle unten nutzt `usable (vakuum)` und markiert die Stellen.
- **`cloud_artefact`** ∈ {activatable, not_activatable, unknown}: Wäre das **gelieferte Artefakt** (Programmtyp + Syntax + Objektmenge) in der Sprachversion ABAP for Cloud im Zielprofil aktivierbar? Entscheidbar auch dann, wenn `cloud_api_surface` unknown ist — ein REPORT ist nie aktivierbar, egal was er aufruft.
- Die beiden Felder sind unabhängig: CC-019 ist `usable` / `not_activatable` (die Fable-Falle); CC-058 in `k19-profilpaare.md` ebenso; CC-059 dort ist `usable` / `activatable`.

**Alle 25 v1-Fälle** (Artefakttypen aus den ersten Statements der Quellen, v1 Z. 351–3451; `n.a.` = nicht aktivierbar):

| Fall | Artefakt(e) | v1 `Cloud-API` | v2 `cloud_api_surface` | v2 `cloud_artefact` | Grund |
|---|---|---|---|---|---|
| CC-001 | REPORT | not_usable | not_usable | not_activatable | REPORT; KNA1 |
| CC-002 | REPORT | not_usable | not_usable | not_activatable | REPORT; KNB1 |
| CC-003 | REPORT + lokale Klasse | not_applicable | usable (vakuum → `none`) | not_activatable | REPORT/WRITE; keine SAP-API |
| CC-004 | REPORT + lokale Klasse | not_usable | not_usable | not_activatable | REPORT; CL_HTTP_UTILITY notToBeReleased (R04: klassisch B bleibt) |
| CC-005 | REPORT | not_usable | not_usable | not_activatable | REPORT; CONVERSION_EXIT_ALPHA_* notToBeReleasedStable |
| CC-006 | REPORT | not_usable | not_usable | not_activatable | REPORT; klassischer FM |
| CC-007 | REPORT | not_usable | not_usable | not_activatable | REPORT; KNA1/KNB1/KNVV |
| CC-008 | REPORT | not_usable | not_usable | not_activatable | REPORT; KNA1/KNB1/KNVV |
| CC-009 | globale Klasse + Interface + REPORT | unknown | unknown | not_activatable (Scheibe enthält REPORT); Klasse/Interface allein: unknown | BAdI-Spot-Metadaten nicht geliefert |
| CC-010 | REPORT | not_usable | not_usable | not_activatable | REPORT; implizites Enhancement |
| CC-011 | REPORT | not_usable | not_usable | not_activatable | REPORT; klassischer FM (aufgelöst) |
| CC-012 | REPORT | unknown | unknown | not_activatable | REPORT; Ziel unaufgelöst |
| CC-013 | PROGRAM (Modulpool) | not_usable | not_usable | not_activatable | Dynpro |
| CC-014 | REPORT | not_usable | not_usable | not_activatable | REPORT; CALL SCREEN |
| CC-015 | REPORT | unknown | unknown | not_activatable | REPORT; Kernelaufruf (zweiter Grund, erinnert: `CALL cfunc` nicht in ABAP for Cloud) |
| CC-016 | REPORT | not_applicable | usable (vakuum → `none`) | not_activatable | REPORT; nur Literale |
| CC-017 | REPORT + lokale Klassen | not_applicable | usable (vakuum → `none`) | not_activatable | REPORT/WRITE |
| CC-018 | REPORT + lokale Klasse | unknown | unknown | not_activatable | REPORT; Basisklasse fehlt |
| CC-019 | REPORT | usable | usable | **not_activatable** | REPORT — die Falle: released RTTS macht den Report nicht cloud-fähig |
| CC-020 | REPORT | unknown | unknown | not_activatable | REPORT; dynamischer Typ |
| CC-021 | REPORT + fehlendes INCLUDE | unknown | unknown | not_activatable | REPORT; INCLUDE fehlt |
| CC-022 | REPORT | unknown | unknown | not_activatable | REPORT; Partnerobjekt fehlt |
| CC-023 | REPORT | not_usable | not_usable | not_activatable | REPORT; UPDATE KNA1 |
| CC-024 | REPORT | unknown | unknown | not_activatable | REPORT; Z-Tabelle (Cloud-Status der Tabelle nicht geliefert) |
| CC-025 | REPORT | not_applicable | usable (vakuum → `none`) | not_activatable | REPORT/WRITE |

**Was die Tabelle zeigt:** `cloud_artefact` ist in allen 25 Fällen `not_activatable`, weil jede Scheibe ein ausführbares Programm oder einen Modulpool enthält — v1 hat damit nie ein Artefakt bewertet, nur API-Oberflächen, und das Feld `cloud_view` hat beides vermischt. Die Trennung macht CC-019 lesbar (usable / not_activatable) und beantwortet die vier `not_applicable`-Fälle mit einem Wert, der etwas aussagt.

Beleggrad: verifiziert (ausführbare Programme, Selektionsbilder, Listausgabe und Dynpros sind in der Sprachversion ABAP for Cloud nicht enthalten). Offene Prüferfrage: Für CC-009 — ist ein kundeneigener Enhancement-Spot mit klassischem BAdI (`GET BADI`/`CALL BADI`) in ABAP for Cloud definierbar? (Nach meiner Kenntnis ja; nicht belegt.)

---

## 7. Gleichartig betroffene Anker außerhalb des Auftrags (mechanisch, zur Vollständigkeit)

Dieselbe Konvention (§0) betrifft weitere FROM-Zeilen-Anker; nicht Teil meines Auftrags, aber trivial und hier gelistet, damit der Zusammenführer den Korpus in einem Zug angleichen kann:

| Befund | v1 Anker (Zeile) | Statementbeginn | Korrigierter Anker | Tokenzählung |
|---|---|---|---|---|
| CC-001-F01 (v1 Z. 390) | source.abap:5 | code Z. 4 | source.abap:4+5 (Sek. :5) | SELECT(0) kunnr(1) name1(2) land1(3) FROM(4) kna1(5) |
| CC-002-F01 (v1 Z. 541) | source.abap:14 | code Z. 13 | source.abap:13+5 (Sek. :14) | SELECT(0) kunnr(1) bukrs(2) akont(3) FROM(4) knb1(5) |
| CC-008-F01 (v1 Z. 1359) | source.abap:5 | code Z. 4 | source.abap:4+7 (Sek. :5) | siehe §3 |
| CC-008-F02 (v1 Z. 1360) | source.abap:6 | code Z. 4 | source.abap:4+13 (Sek. :6) | siehe §3 |
| CC-008-F03 (v1 Z. 1361) | source.abap:7 | code Z. 4 | source.abap:4+23 (Sek. :7) | siehe §3 |
| CC-023-F01 (v1 Z. 3224) | source.abap:10 | code Z. 10 | source.abap:10+1 (Tabellentoken; Sek. :10) | UPDATE(0) kna1(1) |

Skelettknoten mit Bereichsanker (CC-008 `j`, v1 Z. 1434/1443: `source.abap:4–9`) → `source.abap:4` (Bereich sekundär). Die Objektanker in den Abschnitten „SAP-/Repository-Objekte" folgen jeweils.

---

## Autorenbericht

1. **Bestätigt:** CC-007 F01–F04 zwei (mit Skelett: drei) Ankerkonventionen (v1 Z. 1186–1189, 1261, 1275); CC-013 F01 als Uneinheitlichkeit (v1 Z. 2082) — der Anker `:1` ist unter der Statementbeginn-Konvention nicht falsch, nur undeklariert; CC-008 F04 als Regelformulierung (v1 Z. 1362); CC-023 B02 unbedingt trotz fehlender ALPHA-Konvertierung (v1 Z. 3253); `cloud_view = not_applicable` in CC-003/016/017/025 (v1 Z. 633, 2361, 2458, 3453) und `usable` für den REPORT CC-019 (v1 Z. 2730).
2. **Widerlegt bzw. eingeschränkt:** CC-008 F04 ist für den eigenen Code sachlich richtig (nur die Verallgemeinerung ist falsch). CC-002 hat keinen Fachsatz „Kunde wird gelesen" (v1 Z. 570–576); die Lücke ist eine fehlende Vorbedingung plus fehlender Vektor, kein falscher Satz.
3. **Entschieden:** KA-025 gehört nicht in CC-002 (Schlüssel vollständig projiziert, höchstens ein Treiberschlüssel), sondern in einen neuen K01-Fall unter R08; dabei GLM A-047 („Duplikate multiplizieren") als JOIN-, nicht FAE-Verhalten kennzeichnen.
4. **Empfehlung ALPHA:** bedingte Fachsätze (b) als Korrektur, Vektoren (a) als Beleg; wenn nur eines: (b).
5. **Regel gefehlt:** ein Eintrag für „Eingabeparameter ohne Konvertierungsroutine gegen ALPHA-Schlüsselfeld" (statisch ableitbar, kein v1-Träger; R23 passt nicht); ein Wert `none` für `cloud_api_surface`; die Tokenoffset-Zählweise (Kommas zählen nicht) ist mein Vorschlag, nicht abgestimmt.
6. **Unsicher:** ob `CALL cfunc` (CC-015) in ABAP for Cloud syntaktisch ausgeschlossen ist (zweiter Grund, das Urteil hängt nicht daran); ob kundeneigene Enhancement-Spots in ABAP for Cloud definierbar sind (CC-009, Prüferfrage). Alles andere ist Textprüfung gegen v1 oder dokumentierte ABAP-Semantik.
7. **Nicht getan:** KA-028/KA-029 (LEFT-JOIN-Gegenfälle) und der KA-025-Fall sind neue v2-Fälle, nicht Korrekturen — für die Autoren von K01/K04. Nichts ausgeführt; keine Hashes berechnet, weil sich mit den Korrekturen keine Quelle ändert (nur Anker, Sätze und Felder — Quellenhashes der fünf Fälle bleiben gültig, Kontexthashes müssen neu).
