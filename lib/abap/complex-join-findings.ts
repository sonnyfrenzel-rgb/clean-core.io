import type { SupportFinding } from './class-model';
import { SUPPORT_MATRIX, howItWorksUrl } from './support-matrix';
import { extractSelects, parseSelect } from './select-parser';
import { matchCdsView } from './cds-catalog';
import { tableCount } from './sql-model';

/**
 * No options.
 *
 * There used to be one: `differentialVerified`, a **run-wide** boolean. It was
 * set by nobody — its only caller would have been the fake Differential Sandbox
 * Tester, removed earlier — but the shape was the trap. One flag for a whole
 * run, combined with `cds?.exact`, would have marked *every* exact table-set
 * match "fully verified" on the strength of a single test, or of no test at all.
 *
 * Verification is per query. If it comes back, it comes back keyed to a query,
 * not to a run.
 */
export interface ComplexJoinOptions {}

export function detectComplexJoinFindings(
  sources: { file: string; content: string }[],
  opts: ComplexJoinOptions = {},
): SupportFinding[] {
  const findings: SupportFinding[] = [];
  const e = SUPPORT_MATRIX['complex-sql-join'];

  for (const src of sources) {
    for (const sel of extractSelects(src.content)) {
      const model = parseSelect(sel.text, src.file, sel.line);
      const isComplex = tableCount(model) >= 3 || !!model.forAllEntries;
      if (!isComplex) continue;

      const cds = matchCdsView(model);
      const quirks = model.quirks.filter((q) => q.affectsResult).map((q) => q.type);

      // Nothing here can establish equivalence: the table set matched, which is
      // a reason to look, not a proof that the query means the same thing.
      const level = 'partial';

      const detailParts = [
        `${tableCount(model)} tables` + (model.forAllEntries ? ' + FOR ALL ENTRIES' : ''),
        cds ? `CDS match: ${cds.view} (${cds.exact ? 'exact' : 'superset'}, conf ${cds.confidence})` : 'no CDS match — generated join',
        quirks.length ? `result-affecting quirks: ${quirks.join(', ')}` : 'no result-affecting quirks',
      ];

      findings.push({
        construct: 'complex-sql-join',
        level,
        title: e.title,
        detail: detailParts.join('; ') + '.',
        recommendation: cds
          ? `Check released view ${cds.view} — the table set matches, but join predicates, cardinality and selected fields were not compared. Resolve quirks per rules and verify with a result-set differential test before replacing.`
          : 'Map to a released CDS view if one exists; otherwise verify the generated join with a differential test on the sandbox.',
        howItWorks: howItWorksUrl('complex-sql-join'),
        requiresSignOff: true,
        location: model.source,
        confidence: cds?.confidence,
      });
    }
  }
  return findings;
}
