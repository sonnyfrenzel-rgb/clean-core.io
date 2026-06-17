import type { SupportFinding } from './class-model';
import { SUPPORT_MATRIX, howItWorksUrl } from './support-matrix';
import { extractSelects, parseSelect } from './select-parser';
import { matchCdsView } from './cds-catalog';
import { tableCount } from './sql-model';

export interface ComplexJoinOptions {
  /** Set true only when a result-set differential test passed for this select. */
  differentialVerified?: boolean;
}

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

      const verified = opts.differentialVerified && cds?.exact;
      const level = verified ? 'fully' : 'partial';

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
          ? `Replace the join with released view ${cds.view}; resolve quirks per rules; verify with a result-set differential test.`
          : 'Map to a released CDS view if one exists; otherwise verify the generated join with a differential test on the sandbox.',
        howItWorks: howItWorksUrl('complex-sql-join'),
        requiresSignOff: !verified,
        location: model.source,
        confidence: cds?.confidence,
      });
    }
  }
  return findings;
}
