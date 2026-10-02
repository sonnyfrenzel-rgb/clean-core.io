/**
 * Rewrite the baseline — `npx tsx tests/helpers/korpus-baseline-write.ts`.
 *
 * Until the comparer was sharpened (roadmap 1.9) this tool did not exist:
 * `tests/korpus/baseline.json` was maintained by hand. That worked while an
 * entry had four fields; with a numerator, a denominator and five sub-checks
 * per facet it no longer does, and a number maintained by hand is not a
 * measurement anyway.
 *
 * **The tool decides nothing.** It writes down what the comparison says right
 * now. Whether a case that drops from `agree` to `disagree` is an engine defect
 * or an open question for the case authors is in the `verdict` that
 * `compareCase` assigns — and the ratchet in `tests/korpus-engine.spec.ts`
 * insists that someone has read that difference before the file is rewritten.
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
  `${baselinePath()} written: ${baseline.entries.length} entries, ` +
    `${byState.get('agree') ?? 0} agree, ${byState.get('disagree') ?? 0} disagree.\n`,
);
