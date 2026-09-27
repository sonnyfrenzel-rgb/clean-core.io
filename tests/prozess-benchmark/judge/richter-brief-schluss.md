# Brief: Schlussrichter für Fachsätze (drei Varianten, blind)

Du bewertest, ob Fachsätze **inhaltlich** dasselbe sagen wie die Sollsätze eines Benchmarks.
Wortwahl ist egal: „Es werden Kunden selektiert“ und „Kundenstammdaten werden gelesen“ sind
gleichbedeutend. Je Sollsatz liegen **drei Varianten** vor, `X`, `Y` und `Z` — drei verschiedene
Erzeuger, deren Herkunft du nicht kennst und nicht erraten sollst. Die Zuordnung ist je Fall
zufällig. Bewerte jede Variante für sich, mit demselben Maßstab.

## Eingabe

`schluss/in/BM-nnn.json`. Je Fall: Titel, Prozessbeschreibung, verbotene
Schlüsse, und je Sollsatz: `soll`, `zeilen`, `code` (diese Zeilen aus der Quelle) und `X`, `Y`,
`Z` (alle Sätze der jeweiligen Variante, die an einer dieser Zeilen verankert sind — leer heißt:
die Variante sagt dort nichts). Der ganze Quelltext liegt unter
`tests/prozess-benchmark/cases/BM-nnn/`; bei mehreren
Dateien beziehen sich `zeilen` auf die zusammengefügte Quelle (Datei mit REPORT/PROGRAM/
FUNCTION-POOL zuerst, dann die übrigen in Byte-Reihenfolge der Dateinamen). Lies nichts unter
`lib/` und keine anderen Dateien unter `judge2/` als `in/` und `brief.md`.

## Urteil je Sollsatz und Variante

- `gleich` — ein Satz der Variante sagt fachlich dasselbe (darf auf zwei Sätze verteilt sein).
- `teilweise` — ein Teil richtig, aber der fachliche Kern fehlt, oder nur technisch
  (Variablennamen/Anweisungen), so dass ein Fachanwender den Sinn nicht erkennt.
- `abweichend` — die Variante sagt dort etwas, das dem Sollsatz oder dem Code widerspricht.
- `fehlt` — die Variante sagt dort nichts, oder nichts zum Sollsatz.

Dazu `mangel` je Variante (alle zutreffenden, sonst leer): `technisch`, `redundant`, `falsch`,
`unvollstaendig`, `grammatik`, `zu_allgemein` — Bedeutungen wie gewohnt; `falsch` = eine
Aussage widerspricht dem Code, auch wenn der Rest stimmt.

Je Fall außerdem `verboten_verletzt`: Liste `{"variante":"X","satz":"…","grund":"…"}` für jeden
Satz einer Variante, der einen der verbotenen Schlüsse zieht.

Sei streng und einheitlich, im Zweifel die schlechtere Stufe. Bewerte gegen den **Code**; ist
ein Sollsatz selbst falsch, notiere das in `soll_zweifel` und bewerte gegen den Code.

## Ausgabe

`schluss/out/BM-nnn.json`:
```json
{"id":"BM-nnn",
 "urteile":[{"id":"BM-nnn-B01",
   "X":{"urteil":"gleich|teilweise|abweichend|fehlt","mangel":[]},
   "Y":{"urteil":"…","mangel":[]},
   "Z":{"urteil":"…","mangel":[]},
   "kurz":"ein Satz, was die Varianten unterscheidet"}],
 "verboten_verletzt":[], "soll_zweifel":[]}
```
Genau ein Eintrag je Sollsatz, jeweils alle drei Varianten. Nichts außerhalb von `out/`
schreiben, keine Git-Befehle.

Zum Schluss: Tabelle gleich/teilweise/abweichend/fehlt **je Variante** über deine Fälle und je
Variante die drei häufigsten Mängel mit einem wörtlichen Beispiel.


**Zuordnung:** `schluss/zuordnung.json` nennt je Fall, welcher Buchstabe welcher Erzeuger war (`A_alt` = Weg A vor den Fachsatz-Korrekturen, `A_neu` = danach, `B` = Weg B, Gemini). Die Richter kannten sie nicht; sie wurde erst nach allen Urteilen geöffnet.
