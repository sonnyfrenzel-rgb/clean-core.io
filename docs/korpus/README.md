# Referenzkorpus

`referenzkorpus-v2.1.md` ist das Fallbuch: 68 ABAP-Fälle, zu denen die richtige Antwort feststeht, **bevor** die Engine gefragt wird — Befunde je Zeile, SAP-Nachfolger, Clean-Core-Level A–D, Prozessskelett, Fachsätze. Es ist der Maßstab, an dem `lib/abap/` widerlegt werden kann.

Es ist **nicht** unabhängig freigegeben: kein SAP-Architekt hat gegengezeichnet, und jeder Fall trägt selbst, welche Prüfungen ihn getroffen haben und welche fehlt (§2). Es ist **kein** Prompt- und kein Trainingsmaterial für das Modell, das es prüft. Fundstellen aus fremden Repositories stehen hier **nur als SHA-256 des Ausschnitts** — kein fremder Code, kein URL, keine Commit-ID; der vollständige Beleg liegt außerhalb des Repositories (§9.2), und `tests/korpus-engine.spec.ts` macht den Lauf rot, falls je wieder ein Zeiger hineingerät.

**Bündel bauen:** `node scripts/korpus/build-bundle.mjs` liest das Fallbuch und schreibt `tests/korpus/cases/CC-nnn/` mit `source.abap`, `profile.json` und `expected.json` je Fall plus `tests/korpus/manifest.json`. Der Lauf ist deterministisch und prüft jeden Quelltext gegen den `Quellenhash:` seines Falls; `--check` schreibt nichts und meldet nur Abweichungen. Was das Fallbuch nicht sagt, steht als `null` — nichts wird ergänzt.

**Spec lesen:** `npx playwright test tests/korpus-engine.spec.ts` lässt die Engine über alle Fälle laufen und vergleicht je Aussageklasse (Befunde, Level, Objekte, Skelettknoten, Fachsatzanker). `tests/korpus/baseline.json` hält jede Fall-und-Klasse als `agree` oder als `disagree` mit einem Urteil — `engine-defekt` (der Fall hat recht), `korpus-offen` (die Sollantwort ist fraglich, sie wird trotzdem nicht geändert) oder `nicht-vergleichbar` (die Engine führt diese Aussage nicht) — und einem Grund, der die Zahlen des Laufs nennt. Ein verlorenes `agree`, eine still verschwundene Abweichung, ein geändertes Urteil und ein Bündel, das nicht mehr zum Fallbuch passt, machen den Lauf rot.

`anhang/` enthält das Autorenbriefing, die vier Modellreviews, die Korrekturen an v1 und das Gegenreview-Paket.
