# Brief: semantischer Richter für Fachsätze

Du bewertest, ob die Fachsätze einer Engine **inhaltlich** dasselbe sagen wie die Sollsätze eines
Benchmarks. Eine reine Wortüberlappung misst das nicht: „Es werden Kunden selektiert“ und
„Kundenstammdaten werden gelesen“ sind gleichbedeutend.

## Eingabe

`<lauf>/in/BM-nnn.json` (hier: `ausgang/`, der Stand vor jeder Fachsatz-Änderung). Je Fall: Titel, Prozessbeschreibung, verbotene
Schlüsse, und je Sollsatz: `soll` (Text), `zeilen` (Ankerzeilen), `code` (diese Zeilen aus dem
Quelltext) und `engine` (alle Sätze, die die Engine an einer dieser Zeilen erzeugt hat — oft
mehrere, oft technisch, manchmal wiederholt).

Den ganzen Quelltext findest du bei Bedarf unter
`tests/prozess-benchmark/cases/BM-nnn/` (bei mehreren Dateien
beziehen sich `zeilen` auf die zusammengefügte Quelle: Datei mit REPORT/PROGRAM/FUNCTION-POOL
zuerst, dann alphabetisch). Lies **nichts** unter `lib/` — du bewertest Aussagen, nicht Code
der Engine.

## Urteil je Sollsatz

- `gleich` — mindestens ein Engine-Satz sagt fachlich dasselbe (Wortwahl egal; eine Aussage,
  die der Sollsatz macht, darf auf zwei Engine-Sätze verteilt sein).
- `teilweise` — die Engine sagt einen Teil richtig, aber es fehlt der fachliche Kern (z. B. nur
  „a~smtp_addr des Satzes wird gelesen“ statt „die E-Mail-Adresse des Kunden wird ermittelt“),
  oder sie sagt es nur technisch (Variablennamen, Anweisungen), so dass ein Fachanwender den
  Sinn nicht erkennt.
- `abweichend` — die Engine sagt an dieser Stelle etwas, das dem Sollsatz oder dem Code
  widerspricht.
- `fehlt` — kein Engine-Satz an diesen Zeilen, oder keiner hat mit dem Sollsatz zu tun.

Zusätzlich je Sollsatz ein Feld `mangel` mit **allen** zutreffenden Kategorien der Engine-Sätze
an dieser Stelle (leer, wenn es keine gibt):
`technisch` (Variablen-/Feldnamen statt Fachbegriffe), `redundant` (derselbe Inhalt mehrfach),
`falsch` (Aussage widerspricht dem Code), `unvollstaendig` (Bedingung/Folge fehlt),
`grammatik` (fehlerhaftes Deutsch, z. B. falscher Artikel vor Variablennamen),
`zu_allgemein` (sagt nichts Fachliches, z. B. „Seine Wirkung ist nicht belegt“).

Prüfe außerdem je Fall, ob ein Engine-Satz einen der **verbotenen Schlüsse** zieht → Liste
`verboten_verletzt` mit Satz und Begründung (meist leer).

Sei streng und einheitlich. Im Zweifel zwischen zwei Stufen die schlechtere. Bewerte gegen den
**Code**, nicht nur gegen den Sollsatz: Ist der Sollsatz selbst falsch, notiere das in
`soll_zweifel` und bewerte die Engine gegen den Code.

## Ausgabe

`<lauf>/out/BM-nnn.json`:
```json
{"id":"BM-nnn","urteile":[{"id":"BM-nnn-B01","urteil":"gleich|teilweise|abweichend|fehlt","mangel":["technisch"],"kurz":"ein Satz Begründung"}],
 "verboten_verletzt":[],"soll_zweifel":[]}
```
Genau ein Urteil je Sollsatz. Nichts außerhalb von `out/` schreiben, keine Git-Befehle.

Zum Schluss: Tabelle je Fall (gleich/teilweise/abweichend/fehlt) und die drei häufigsten Mängel
mit je einem wörtlichen Beispiel.
