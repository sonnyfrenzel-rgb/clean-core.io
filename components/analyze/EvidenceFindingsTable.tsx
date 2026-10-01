'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import type { SemanticState } from '@/lib/provenance';
import { normaliseSeverity } from '@/lib/severity';
import CcCard from '@/components/cc/Card';
import CcTable from '@/components/cc/Table';
import CcFilterBar from '@/components/cc/FilterBar';
import CcSelect from '@/components/cc/Select';
import CcDisclosure from '@/components/cc/Disclosure';
import { CcNoMatches } from '@/components/cc/EmptyState';
import { CcTag } from '@/components/cc/Tag';
import { CcSeverity } from '@/components/cc/Identifier';
import { STATE_CLASSES } from '@/components/cc/state';
import { countFindings, findingTitle, groupEvidenceFindings, type SeverityKey } from './analysis-answer';

/**
 * The findings of the evidence engine, business wording first (mockup s4).
 *
 * Each row says what was found, how severe it is, and what it means for a
 * clean core — the engine's own `cleanCoreImpact`, written for a reader, not a
 * model's paraphrase. The technical half — the lines, the statements, the
 * pattern id, which part of the engine produced the row and the target options
 * — is one action deeper, under "Details" (with the meaning in full), never removed (§2.11).
 *
 * Search and the severity filter narrow the same deduplicated list the answer
 * above counts; five rows first, "Show all" for the rest.
 */
type SeverityFilter = 'All' | SeverityKey;

const COLUMNS = [
  { key: 'what', label: 'What was found' },
  { key: 'severity', label: 'Severity' },
  { key: 'meaning', label: 'What it means' },
  { key: 'replacement', label: 'SAP successor' },
  { key: 'details', label: 'Details' },
] as const;

/** A catalog match is imported evidence (information); a candidate is to be checked. */
function replacementState(confidence: string | undefined): SemanticState {
  if (confidence === 'Catalog Match' || confidence === 'Verified') return 'information';
  if (confidence === 'Candidate') return 'warning';
  return 'error';
}

function sourceLabel(source: EvidenceFinding['source']): string {
  if (source === 'static-parser') return 'Parser';
  if (source === 'catalog-match') return 'Catalog';
  return 'LLM';
}

export default function EvidenceFindingsTable({ findings }: { findings: readonly EvidenceFinding[] }) {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<SeverityFilter>('All');

  const groups = useMemo(() => groupEvidenceFindings(findings), [findings]);
  const counts = useMemo(() => countFindings(groups), [groups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter(({ finding, lines }) => {
      if (severity !== 'All' && finding.severity !== severity) return false;
      if (!q) return true;
      return [finding.title, finding.kind, finding.objectName ?? '', finding.cleanCoreImpact ?? '', lines.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [groups, query, severity]);

  if (groups.length === 0) return null;

  const clear = () => {
    setQuery('');
    setSeverity('All');
  };

  return (
    <div data-analysis-findings="">
      <CcCard title="Findings" level={2} count={counts.total}>
        <CcFilterBar
          noun="findings"
          shown={filtered.length}
          total={groups.length}
          search={query}
          onSearch={setQuery}
          active={severity !== 'All' || query !== ''}
          onClear={clear}
        >
          <CcSelect<SeverityFilter>
            label="Severity"
            value={severity}
            onChange={setSeverity}
            options={(['All', 'Critical', 'High', 'Medium', 'Low'] as const).map((level) => ({
              value: level,
              label:
                level === 'All'
                  ? `All severities (${counts.total})`
                  : `${level} (${counts.bySeverity[level]})`,
            }))}
          />
        </CcFilterBar>

        <div className="mt-3">
          {filtered.length === 0 ? (
            <CcNoMatches onClear={clear} />
          ) : (
            <CcTable
              caption="Findings of the evidence engine, one row per pattern and object"
              limit={5}
              columns={COLUMNS}
              rows={filtered.map(({ finding: ef, lines, snippets }, idx) => {
                const sev = normaliseSeverity(ef.severity);
                return {
                  key: `${ef.kind}-${ef.objectName ?? ef.title}-${idx}`,
                  cells: {
                    what: (
                      <>
                        <div className="cc-text-cell font-semibold text-cc-ink">
                          {findingTitle(ef.title)}
                          {lines.length > 1 ? ` (${lines.length}×)` : ''}
                        </div>
                        <div className="cc-text-meta text-cc-ink-muted mt-1">
                          {lines.length === 1 ? 'Line' : 'Lines'} {lines.join(', ')}
                        </div>
                      </>
                    ),
                    severity: sev ? (
                      <CcSeverity value={sev} />
                    ) : (
                      <span className="cc-text-meta text-cc-ink-muted">{ef.severity || '—'}</span>
                    ),
                    meaning: (
                      <span className="cc-text-cell text-cc-ink-muted line-clamp-2" title={ef.cleanCoreImpact}>
                        {ef.cleanCoreImpact || '—'}
                      </span>
                    ),
                    replacement: ef.sapReplacement ? (
                      <div className="inline-block min-w-0">
                        <div className="cc-text-cell font-medium text-cc-ink break-all">{ef.sapReplacement.objectName}</div>
                        <span className={clsx('cc-text-meta', STATE_CLASSES[replacementState(ef.sapReplacement.confidence)].text)}>
                          {ef.sapReplacement.confidence}
                          {ef.sapReplacement.catalogVersion && (
                            <span className="text-cc-ink-muted ml-1">(v{ef.sapReplacement.catalogVersion})</span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <span className="cc-text-meta text-cc-ink-muted">None named</span>
                    ),
                    details: (
                      <CcDisclosure title="Details">
                        <div className="space-y-2 min-w-0">
                          {ef.cleanCoreImpact && <p className="m-0 cc-text-cell text-cc-ink">{ef.cleanCoreImpact}</p>}
                          {snippets.slice(0, 2).map((s, i) => (
                            <code
                              key={i}
                              className="block cc-text-meta font-medium font-cc-mono bg-cc-surface-muted border border-cc-line text-cc-ink px-2 rounded-cc-row max-w-xs overflow-hidden text-ellipsis whitespace-nowrap"
                              title={s}
                            >
                              {s}
                            </code>
                          ))}
                          {snippets.length > 2 && (
                            <span className="cc-text-meta text-cc-ink-muted">+{snippets.length - 2} more</span>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="cc-text-meta font-cc-mono text-cc-ink-muted">{ef.kind}</span>
                            {/* Which part of the engine produced the row — a plain label, not a proof mark. */}
                            <CcTag>{sourceLabel(ef.source)}</CcTag>
                          </div>
                          {(ef.targetOptions || []).length > 0 && (
                            <p className="cc-text-meta text-cc-ink-muted">
                              Target options: {(ef.targetOptions || []).join(' · ')}
                            </p>
                          )}
                        </div>
                      </CcDisclosure>
                    ),
                  },
                };
              })}
            />
          )}
        </div>
      </CcCard>
    </div>
  );
}
