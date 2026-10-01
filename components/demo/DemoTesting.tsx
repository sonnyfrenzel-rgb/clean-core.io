'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import TestingHeader, { TestingMetaLine } from '@/components/testing/TestingHeader';
import SectionAnchorBar from '@/components/testing/SectionAnchorBar';
import ToolSection from '@/components/testing/ToolSection';
import TestPipeline from '@/components/testing/TestPipeline';
import HandChecks, { type HandCheckGap } from '@/components/testing/HandChecks';
import TabExplainer from '@/components/testing/TabExplainer';
import { LIVE_TEST_EXECUTION } from '@/lib/locked-paths';
import { catalogForReader } from '@/lib/messages/demo';
import { normaliseSeverity } from '@/lib/severity';
import type { DemoProject } from '@/lib/demo-project';

/**
 * The demo's Testing stage in the tool's own layout — proposal A, owner
 * decision 01.10.2026 — so the demo and a project read the same way.
 *
 * Everything is the demo's engine run (`lib/demo-project.ts`): the coverage
 * report, the findings, the routines. What a project would add — scenarios a
 * model wrote, a run against mocks, a tenant connection — the demo has none
 * of, and every place that would show it says so instead of showing a figure.
 * There is no run button: the demo has no runner, and a button that cannot run
 * is a promise it cannot keep.
 */
export default function DemoTesting({ demo }: { demo: DemoProject }) {
  const coverage = demo.analyze.coverage;
  const gaps: HandCheckGap[] = coverage.gaps.map((g) => ({
    label: g.label,
    count: g.count,
    firstLine: g.firstLine,
    why: coverage.unassessed.find((u) => u.gap === g.gap)?.why,
  }));
  const ticks = demo.analyze.findings.flatMap((f) => {
    const severity = normaliseSeverity(f.severity);
    return severity ? [{ id: f.id, line: f.lineStart, severity, title: f.title }] : [];
  });

  return (
    <div data-demo-testing="">
      <TestingMetaLine
        parts={[
          { value: demo.sourceFile },
          { value: `${demo.totalLines} lines` },
          { label: 'catalog', value: catalogForReader(demo.catalogVersion), title: demo.catalogVersion },
          { label: 'snapshot', value: demo.catalogSnapshot },
        ]}
      />
      <TestingHeader
        scenarios={{
          count: demo.testing.verdicts.total,
          rejected: false,
          emptyReason: 'The demo writes none — in a project the testing model writes them from the generated code',
        }}
        run={{ kind: 'none' }}
        blocked={false}
        isAbapCloud={false}
        handChecks={{ count: gaps.length, lines: gaps.map((g) => g.firstLine) }}
        tenantLocked={LIVE_TEST_EXECUTION.locked}
        status={[
          { label: 'Suite', value: 'none in the demo', tone: 'plain' },
          { label: 'Runner', value: 'none in the demo', tone: 'plain' },
          { label: 'Tenant', value: 'connection check only', tone: 'plain' },
        ]}
      />

      <SectionAnchorBar
        items={[
          { id: 'testing-verified', label: 'From written to verified' },
          { id: 'testing-scenarios', label: 'Scenarios', count: demo.testing.verdicts.total },
          { id: 'testing-hand', label: 'Check by hand', count: gaps.length },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ToolSection
            id="testing-verified"
            title="From written to verified"
            lead="Nothing here has run. In a project the scenarios run in the restricted test runner, against mocks; running tests on a tenant is locked. The demo has neither scenarios nor a runner."
          >
            <TestPipeline written={demo.testing.verdicts.total} run={{ kind: 'none' }} />
          </ToolSection>

          <ToolSection id="testing-scenarios" title="Scenarios">
            <p
              data-not-determined=""
              className="m-0 rounded-cc-row border border-dashed border-cc-field-border bg-cc-surface-muted px-3 py-3 cc-text-cell text-cc-ink-muted"
            >
              The demo writes no scenarios. In a project the testing model writes them from the generated code — they are
              listed here one row each, marked as its proposal, with their last verdict.
            </p>
          </ToolSection>

          <ToolSection
            id="testing-hand"
            title="What a tester checks by hand"
            aside={gaps.length}
            lead="Straight from the engine’s coverage report: every construct it did not judge."
          >
            <div data-testid="demo-manual-areas">
              <HandChecks
                noSource={false}
                gaps={gaps}
                strip={{
                  lines: demo.totalLines,
                  bands: demo.testing.routines,
                  ticks,
                  marks: gaps.map((g) => ({ line: g.firstLine, label: `${g.count} × ${g.label.toLowerCase()}` })),
                }}
              />
            </div>
          </ToolSection>
        </div>

        <aside aria-label="About running tests" className="flex min-w-0 flex-col gap-4">
          <TabExplainer
            items={[
              { text: 'Runs the generated suite in a restricted Node.js process' },
              { text: 'Uses SAP mocks, not your system' },
              { text: 'Does not run generated tests on a tenant', not: true },
            ]}
            note="In a project. The demo runs nothing."
          />
          <CcCard title="Tenant connection" level={2}>
            <p className="m-0 cc-text-cell text-cc-ink">
              In a project, bring your own tenant (BYOT) opens a connection check, a metadata read and one read-only OData
              call. Running tests on a tenant stays locked. The demo connects to nothing.
            </p>
          </CcCard>
        </aside>
      </div>
    </div>
  );
}
