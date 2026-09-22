/**
 * Die Baseline neu schreiben — `npx tsx tests/helpers/korpus-baseline-write.ts`.
 *
 * Bis zur Schärfung des Vergleichers (Roadmap 1.9) gab es dieses Werkzeug
 * nicht: `tests/korpus/baseline.json` war von Hand geführt. Das ging, solange
 * ein Eintrag aus vier Feldern bestand; mit Zähler, Nenner und fünf
 * Teilprüfungen je Facette geht es nicht mehr, und eine von Hand gepflegte
 * Zahl ist ohnehin keine Messung.
 *
 * **Das Werkzeug entscheidet nichts.** Es schreibt auf, was der Vergleich
 * gerade sagt. Ob ein Fall, der von `agree` auf `disagree` fällt, ein Defekt
 * der Engine oder eine offene Frage an die Fallautoren ist, steht im `verdict`,
 * das `compareCase` vergibt — und die Ratsche in `tests/korpus-engine.spec.ts`
 * besteht darauf, dass jemand diesen Unterschied gelesen hat, bevor die Datei
 * neu geschrieben wird.
 */
import { writeFileSync } from 'fs';
import { compareAll, readManifest, baselinePath, type Baseline } from './korpus-comparison';

const manifest = readManifest();
const results = compareAll();

const baseline: Baseline = {
  book: { path: manifest.book.path, sha256: manifest.book.sha256 },
  written: new Date().toISOString().slice(0, 10),
  entries: results.map((result) => ({
    case: result.case,
    class: result.class,
    state: result.state,
    verdict: result.verdict,
    scope: result.scope,
    aspects: result.aspects,
    reason: result.evidence,
  })),
};

writeFileSync(baselinePath(), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');

const byState = new Map<string, number>();
for (const entry of baseline.entries) byState.set(entry.state, (byState.get(entry.state) ?? 0) + 1);
process.stdout.write(
  `${baselinePath()} geschrieben: ${baseline.entries.length} Einträge, ` +
    `${byState.get('agree') ?? 0} agree, ${byState.get('disagree') ?? 0} disagree.\n`,
);
