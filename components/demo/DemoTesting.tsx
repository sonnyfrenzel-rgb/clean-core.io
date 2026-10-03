'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import { TestingMetaLine } from '@/components/testing/TestingHeader';
import ToolSection from '@/components/testing/ToolSection';
import HandChecks, { type HandCheckGap } from '@/components/testing/HandChecks';
import TestScopeLegend from '@/components/testing/TestScopeLegend';
import { LIVE_TEST_EXECUTION } from '@/lib/locked-paths';
import { catalogForReader } from '@/lib/messages/demo';
import { normaliseSeverity } from '@/lib/severity';
import type { DemoProject } from '@/lib/demo-project';

/**
 * The demo's Testing stage in the tool's own layout — the guided flow of the
 * real tool (owner 02.10.2026): write the scenarios, run them against mocks,
 * check by hand — so the demo and a project read the same way.
 *
 * Everything is the demo's engine run (`lib/demo-project.ts`): the coverage
 * report, the findings, the routines. What a project would add — scenarios a
 * model wrote, a run against mocks, a tenant connection — the demo has none
 * of, and each step that would show it says so instead of showing a figure.
 * There is no button: the demo has no model and no runner, and a button that
 * cannot act is a promise it cannot keep. No facet tiles either — like an
 * empty project, the demo has nothing to report on until step 3.
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

      <div data-testing-flow="" className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ToolSection
            id="testing-write"
            data-testing-step="write"
            step={{ n: 1, state: 'unavailable', word: 'Not in the demo' }}
            title="Write the scenarios"
            lead="In a project the testing model writes them from the target code, with one button here. They stay its proposal until a run gives them a verdict."
          >
            <p
              data-not-determined=""
              className="m-0 rounded-cc-row border border-dashed border-cc-field-border bg-cc-surface-muted px-3 py-3 cc-text-cell text-cc-ink-muted"
            >
              The demo writes no scenarios — it calls no model.
            </p>
          </ToolSection>

          <ToolSection
            id="testing-verified"
            data-testing-step="run"
            step={{ n: 2, state: 'unavailable', word: 'Not in the demo' }}
            title="Run them against mocks"
            lead="In a project the scenarios run in an isolated runner against SAP mocks — not in your S/4HANA system. Running tests on a tenant is locked."
          >
            <p
              data-not-determined=""
              className="m-0 rounded-cc-row border border-dashed border-cc-field-border bg-cc-surface-muted px-3 py-3 cc-text-cell text-cc-ink-muted"
            >
              Nothing has run: the demo has neither scenarios nor a runner, so there are no results to count.
            </p>
          </ToolSection>

          <ToolSection
            id="testing-hand"
            data-testing-step="hand"
            step={{ n: 3, state: 'open' }}
            title="Check by hand"
            aside={gaps.length}
            lead="What no generated test covers: every construct the engine did not judge, with the line it starts on."
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

        <aside aria-label="About this tool" className="flex min-w-0 flex-col gap-4">
          {/* The same legend as in a project: what can be tested where, said once for the stage. */}
          <TestScopeLegend isAbapCloud={null} tenantLocked={LIVE_TEST_EXECUTION.locked} />
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
