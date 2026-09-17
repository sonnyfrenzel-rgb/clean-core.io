# Referenzkorpus v2 — Architektur-Gegenreview

**Datum:** 16.09.2026 · **Status:** REVIEW-2.0.1-proposed / nicht blindes KI-Gegenreview.

Dies ist keine externe menschliche Freigabe. Die inhaltliche Stufe A wurde bearbeitet; Stufen B/C, Produktengine, v2-Comparator und native SAP-Ausführung sind nicht vollständig geprüft bzw. nicht ausgeführt.

## Lesen

1. `architekturreview.md`: Urteil, 35-Regelregister, wichtige Widersprüche, Quellen und Korrekturfolge.
2. `fallpruefung-stufe-a.md`: zehn vollständige Gegenreviewbögen, auch einzeln in `fallboegen/`.
3. `decisions/`: maschinenlesbare Regel-, Fall- und Befundentscheidungen.
4. `counterexamples/`: acht konstruierte, **nicht** SAP-aktivierte Zusatzbeispiele.
5. `evidence/`: echte lokale Ergebnisse, Quellenbeobachtungen und Scopegrenzen.
6. `inputs/`: unveränderte v2-Dateien plus gekennzeichneter v1-Regelherkunftsauszug.
7. `sources-extracted/`: alle 63 aus dem Markdown extrahierten ABAP-Dateien; keine Aktivierungszusage.

## Lokale Prüfungen wiederholen

Python 3.10 oder neuer; ausschließlich Standardbibliothek. Im Wurzelordner:

```sh
python tools/recheck_sources.py
python -m unittest discover -s tools -p 'test_countermodels.py' -v
python tools/verify_manifest.py
```

`recheck_sources.py` prüft Text, Hashes und nummerierte Abdrucke. Die 15 Countermodeltests verwenden Python und eine isolierte In-Memory-SQLite-Datenbank. Sie stellen keinen SAP-/HANA-/ATC-/Produktenginelauf dar. Kein Skript meldet sich an einem SAP-System an, verändert eine Originaldatei oder erteilt eine externe Freigabe.

Die historischen SAP-Quellen dienen nur dem jeweils ausgewiesenen klassischen Sprachkontext. Beobachtete Katalogauszüge sind kein vollständiger nativer, commitgepinnter Snapshot. Ein lokaler Hash beweist keine fachliche Wahrheit.

## Vertraulichkeit

Die Ausgangsunterlagen wurden vom Nutzer für dieses Review übergeben. Das Paket wurde nur im Arbeitscontainer erstellt und nicht in ein öffentliches Repository oder einen externen Kollaborationsdienst hochgeladen. Eine weitere Veröffentlichung der Ausgangsunterlagen ist damit nicht autorisiert.
