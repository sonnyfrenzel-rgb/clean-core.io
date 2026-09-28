# Prozess-Benchmark — wie genau rekonstruiert Clean-Core.io den Prozess aus ABAP?

Stand 28.09.2026 · Grundlage: `tests/prozess-benchmark/` (Fälle, Sollantworten, Messwerkzeuge, Richterurteile)

## Ergebnis in fünf Sätzen

1. Auf 200 realistischen, blind geschriebenen und gegengeprüften ABAP-Fällen trifft das rekonstruierte
   Prozessskelett jetzt **81,1 %** der vergleichbaren Sollknoten — heute Morgen waren es **61,3 %**.
2. Die verdeckte Prüfhälfte, an der nie entwickelt wurde, liegt mit **82,1 %** sogar über der Lernhälfte;
   die Verbesserungen sind nicht auf die Beispiele zugeschnitten.
3. Eine dritte, bewusst schwere Welle (objektorientiert, mehrdateig, RAP/OData/Web Dynpro, Dialog) steigt
   von **39,5 %** auf **72,3 %**, ihre verdeckte Hälfte auf **70,4 %** — hier liegt die nächste Arbeit.
4. Die Fachsätze der Business-Sicht sagen fast nichts Falsches mehr (Aussagen, die dem Code widersprechen:
   236 → 11 von 2.273), bleiben aber technisch; das Modell (Weg B) trifft den fachlichen Sinn in **86,5 %**
   und ist deshalb jetzt — als Vorschlag mit Beleg und Widerspruchsmarkierung — in der Business-Sicht.
5. Das Ergebnis von Roadmap 17.8 („B schlägt A nicht“) war ein Messfehler des Wortmaßes; inhaltlich
   gemessen schlägt B A deutlich.

## 1. Wie gemessen wurde

**300 Fälle in drei Wellen**, je 20er-Paket fünf einfache bis sehr komplexe Fälle (Welle 3: 2/4/7/7):

| Welle | Inhalt | Fälle | Zeilen ABAP | Sollknoten | Fachsätze |
|---|---|---|---|---|---|
| 1 | Kernmodule: SD, MM/Lager, FI/CO, PP/PM/QM, Querschnitt | 100 | 19.500 | 4.049 | 1.126 |
| 2 | Randmodule mit ≥ 2 Grenzfällen je Fall: PM/CS/EHS, PS/RE-FX/PSM/FSCM/TRM, HCM, Branchen, Technik | 100 | 20.800 | 4.133 | 1.147 |
| 3 | verdeckte Prüfmenge, Schwerpunkt schwer: OO SD/MM, Mehrdatei FI/CO/HR, Gateway/RAP/BOPF/Web Dynpro/AMDP, Schnittstellen, Dialog | 100 | 25.400 | 5.051 | 1.142 |

**Blind und gegengeprüft.** Jeder Fall wurde von einem Autor-Agenten geschrieben, der die Engine weder las
noch ausführte, und von einem zweiten, unabhängigen Prüfer gegen die ABAP-Semantik geprüft (Protokoll je
Fall in `review.json`). Kein Fall wurde verworfen; die Prüfer korrigierten vor allem Struktur (fehlende
Blockenden, doppelt verdrahtete Aufrufe, Knoten auf reinen Zuweisungen) und fanden 13 echte fachliche oder
syntaktische Fehler (z. B. `VBUK-ABSTA` gibt es nicht; `BAPI_PO_GETDETAIL1` kennt `ITEMS` nicht;
`GET peras` gibt es nur in PNPCE).

**Eingefroren, bevor die Engine sie sah.** `frozen-*.json` hält die SHA-256 jeder Sollantwort und
Quelle; `validate.py` prüft sie bei jedem Lauf (eine geänderte Sollantwort macht den Lauf rot).

**Lern- und Prüfhälften**, per Hash festgelegt, bevor ein Einzelergebnis angesehen wurde
(`split.json`). Entwickelt wurde nur an Lernfällen; Prüfhälften wurden als Summe gemessen, die
Welle-3-Prüfhälfte genau einmal am Ende.

**Derselbe Vergleicher wie beim Referenzkorpus** (`tests/helpers/korpus-comparison.ts`; gegen die
Korpus-Baseline 0 Abweichungen bei 340 Urteilen). Gemessen wird so, wie ein Nutzer ein Programm mit
Includes ins Produkt einfügt: alle Dateien eines Falls als eine Quelle.

## 2. Das Prozessskelett

### Gesamt (Knoten-Treffer über die vergleichbaren Sollknoten)

| Gruppe | Morgen | **Engine jetzt** | mit korrigiertem Vergleicher¹ |
|---|---|---|---|
| Welle 1+2, Lernhälfte | 60,6 % | **80,0 %** | 81,4 % |
| Welle 1+2, Prüfhälfte (verdeckt) | 61,9 % | **82,1 %** | 83,5 % |
| **Welle 1+2** | **61,3 %** | **81,1 %** | 82,5 % |
| Welle 3, Lernhälfte | 40,3 % | 74,3 % | 74,9 % |
| **Welle 3, Prüfhälfte (verdeckt, einmal gemessen)** | 38,8 % | **70,4 %** | 70,0 % |
| Welle 3 | 39,5 % | 72,3 % | 72,5 % |
| alle 300 | — | 77,9 % | 78,7 % |
| *Referenzkorpus (68, zum Vergleich, Morgen)* | *79,9 %* | | |

¹ Zwei Versäumnisse im Vergleicher, die älter sind als die heutigen Engine-Änderungen: ein Aufruf, den die
Engine genauer als *Versand* erkennt, und eine kleine Routine, die §5.8 nach ihrer Wirkung benennt, galten
als „falsche Art“; funktionale Methodensyntax (`obj->m( )`) war nicht vergleichbar. Getrennt ausgewiesen,
damit keine Messkorrektur als Engine-Fortschritt erscheint.

**Kanten:** Die Quote fällt von 72,5 % auf 68,2 %, obwohl absolut deutlich mehr Kanten treffen — weil jetzt
viel mehr Knoten aufgelöst werden, werden 900+ Sollkanten überhaupt erst vergleichbar.

### Wo es gut und wo es schwer ist (Engine jetzt)

| | Knoten-Treffer |
|---|---|
| einfach · mittel · komplex · sehr komplex | 89,4 % · 86,5 % · 77,1 % · 75,9 % |
| eine Datei · 2–3 Dateien · 4+ Dateien | 87,4 % · 79,5 % · 75,0 % |
| stärkste Pakete | W2 PM/CS/EHS 84,0 % · W2 Branchen 84,0 % · MM/Lager 83,6 % |
| schwächste Pakete | W3 OO-Geschäftsanwendungen 64,9 % · W3 Dialog 70,4 % · W2 HCM 74,1 % |

| Soll-Knotenart | Treffer | | Soll-Knotenart | Treffer |
|---|---|---|---|---|
| Sperre | 100 % | | Ende | 85,0 % |
| Schleife | 92,1 % | | Verzweigung | 71,8 % |
| Lesen | 92,0 % | | Ausgabe | 69,6 % |
| opaker Aufruf | 91,8 % | | Start | 68,0 % |
| Schreiben | 91,6 % | | Aufruf in den Fall | 65,1 % |

## 3. Was geändert wurde — und warum es allgemein ist

Jede Änderung ist aus ABAP-Semantik und `DESIGN.md` §5.8 begründet, trägt einen Guard-Test mit **neu
geschriebenem** Minimal-ABAP, und keine verliert eine Übereinstimmung im Referenzkorpus (die Ratsche hält
jetzt 128 statt 122 Übereinstimmungen).

| # | Befund | Änderung | Wirkung |
|---|---|---|---|
| D1 | Dynpro-Module und Funktionsbausteine fielen weg, sobald ein Ereignisblock existierte | Einstiege neben den Ereignissen | Modulpools vollständig |
| D2 | Methodenaufrufe erzeugten **keinen** Knoten | Teilprozess, wo die Quelle die Methode implementiert, sonst Aufruf; Auflösung über Klasse, Oberklassen, Interface (`lib/abap/method-resolution.ts`) | OO-Code sichtbar |
| D3 | Gerufene FORMs erschienen zusätzlich als Start | nur nie gerufene FORMs sind Einstieg | keine Doppelungen |
| D4 | `MESSAGE TYPE 'I'` (Popup) fehlte | User-Task | §5.8 umgesetzt |
| ADR-054 | Teilprozesse ohne sichtbaren Anfang; frühe Ausstiege liefen still ins gemeinsame Ende | Start je aufklappbarer Ebene; eigenes Ende je `RETURN`/`EXIT`/`STOP`, als „End (early)“ erkennbar; Ereignisse zählen nie als Schritt; `CHECK` bleibt bedingter Fluss | +9,3 pp |
| | `RAISE EVENT` galt als Fehler-Ende und schnitt den Ablauf ab | Aufruf der gebundenen Behandler (über `SET HANDLER`) | |
| | Nach `LEAVE TO SCREEN` lief der Fluss weiter | Dialogschritt endet | |
| | Callbacks (`ON END OF TASK`), ALV-Ereignisbehandler, BAdI-Methoden (`intf~meth`), `REDEFINITION`en ohne Oberklasse im Upload galten als „nicht erreicht“ | Einstiege, Trigger vermerkt, nicht geraten | W3 +8 pp |

**Bewusst nicht geändert** (Designentscheidungen, im Bericht als Konventionsunterschied ausgewiesen):
`IF sy-subrc` als Fehler-Randereignis (2.15, 284 Sollknoten „andere Art“); kleine Routinen als ein Schritt;
technische Helfer; `MESSAGE` S/W ohne Element; `AUTHORITY-CHECK` als Lane statt Schritt; polymorphe
Aufrufe mit offenem Ziel bleiben opak (D2: nicht raten).

## 4. Die Fachsätze (Business-Sicht)

Fünf unabhängige Richter bewerteten alle 2.273 Sollsätze **inhaltlich** — je Sollsatz drei Varianten
nebeneinander, je Fall zufällig als X/Y/Z beschriftet; die Zuordnung wurde erst nach allen Urteilen
geöffnet (`judge/schluss/zuordnung.json`).

| | gleich | teilweise | abweichend | fehlt | widerspricht dem Code | verbotene Schlüsse |
|---|---|---|---|---|---|---|
| Weg A vorher (deterministisch) | 3,3 % | 80,4 % | 2,0 % | 14,2 % | 236 | 9 |
| **Weg A nachher** | 10,3 % | 76,6 % | **0,1 %** | 12,9 % | **11** | **4** |
| **Weg B (Gemini)** | **86,5 %** | 7,1 % | 0,3 % | 6,1 % | 39 | 19 |

Prüfhälfte: A nachher 9,3 % gleich, B 87,2 % — dasselbe Bild.

**Weg A** wurde von zwölf allgemeinen Fehlmustern befreit, die alle fünf Richter unabhängig fanden (u. a.
`CHECK` erfand „kleinere werden übersprungen“, jedes `sy-subrc` hieß „Treffer“, `GET PARAMETER` wurde zur
logischen Datenbank, jede Transaktion zur „Anlage“, `MESSAGE … INTO` zur Ausgabe). Er ist jetzt
verlässlich, bleibt aber technisch — ein Satzbaukasten kann `faksp` nicht in „Fakturasperre“ übersetzen,
ohne zu raten (eine allgemeine Liste von SAP-Standardbegriffen hilft, ersetzt das nicht).

**Weg B** ist seit Roadmap **17.10** in der Business-Sicht: auf Knopfdruck ein Modellvorschlag (Herkunft
„Vorschlag“), darunter der Satz aus A als Beleg, und eine deterministische Widerspruchsmarkierung. Die
Markierung ist ein **Sicherheitsnetz, keine Garantie**: Sie findet auf der Prüfhälfte 2 von 14 falschen
Modellaussagen bei 0,3 % Fehlalarmen. Nichts davon geht in Signatur, Lauf oder Audit-Pack; die
Modellquittung ist an ihre Stufe gebunden.

## 5. Lessons Learned

1. **Ein Maß, das auf ein Fallbuch kalibriert ist, generalisiert nicht.** Weg A traf im Referenzkorpus 41 %
   der Fachsätze nach Wortüberlappung, im unabhängig geschriebenen Benchmark 1 %. Inhaltlich gemessen war
   der Unterschied viel kleiner — das Wortmaß hat Stil gemessen, nicht Inhalt.
2. **Messen, wie der Nutzer arbeitet.** Einzeln gelesene Dateien verdeckten, dass Methodenaufrufe und
   Dynpro-Module im zusammengefügten Programm verschwanden (61 % statt 73 %).
3. **Ein fremder, schwerer Datensatz findet, was der eigene nicht findet.** Welle 3 legte Framework-Einstiege
   (Redefinitionen, ALV-Behandler) offen, die in Welle 1+2 kaum vorkamen.
4. **Eine verdeckte Prüfmenge ist nur einmal verdeckt.** Nach dem ersten Blick auf Welle 3 wurde sie
   halbiert; nur die Lernhälfte floss in die Arbeit.
5. **Vorschläge, die nur einem Fall helfen, weglassen** — auch wenn sie die Zielzahl allein erreicht hätten
   (eine Einstiegsregel hätte 80,8 % gebracht, half aber nur einem zusammengesetzten Fall).
6. **Sollantworten brauchen einen Gegencheck.** 70 % der Autorenantworten wurden korrigiert; ohne Prüfer
   wären Autorenfehler als Engine-Fehler gezählt worden.

## 6. Offen

- **Welle 3 unter 80 %**: polymorphe Aufrufe mit offenem Ziel (nicht raten vs. alle Kandidaten zeigen),
  kleine Methoden als ein Schritt, RAP/OData-Framework-Dispatch — Designfragen für Sonny.
- **Schleifenebenen mit eigenem Start** (entschieden 27.09., nächster Schritt).
- **Sprache der erzeugten Sätze** (deutsch) gegen ADR-009 (englisch).
- **Widerspruchsmarkierung** schärfen, gemessen an der Prüfhälfte.
- **Test-Suite**: Audit vom 27.09. — Laufzeit 26 min, davon ~12 min feste Pausen; Freigabe der Stufen offen.

## Werkzeuge

`evaluate.ts` (Messung; `BM_CONCAT=1` wie im Produkt, `BM_RANGE=a-b`), `report.py` (Aufschlüsselung),
`validate.py` (Struktur, Anker, eingefrorene Hashes), `weg-b.ts` (Modellsätze mit den Bausteinen des
Produkts), `judge/` (Richter-Briefe, Eingaben, Urteile), `split.json`, `frozen-*.json`.
