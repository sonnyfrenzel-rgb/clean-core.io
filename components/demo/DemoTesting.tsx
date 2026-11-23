'use client';

import React, { useState } from 'react';
import CcLinkButton from '@/components/cc/LinkButton';
import AnswerCard from '@/components/family/AnswerCard';
import FamilyChip from '@/components/family/FamilyChip';
import PageAnchorBar from '@/components/PageAnchorBar';
import { PAGE_ANCHOR_LABELS, testingAnchors } from '@/lib/page-anchors';
import ToolSection from '@/components/testing/ToolSection';
import HandChecks, { type HandCheckGap } from '@/components/testing/HandChecks';
import CounterChecks from '@/components/testing/CounterChecks';
import RuleResults from '@/components/testing/RuleResults';
import NotProvenList from '@/components/testing/NotProvenList';
import { useMaterialRules } from '@/hooks/useMaterialRules';
import { notProvenItems, TESTING_SECTION_IDS } from '@/lib/testing-answer';
import { normaliseSeverity } from '@/lib/severity';
import { APP_VERSION } from '@/lib/version';
import type { DemoProject } from '@/lib/demo-project';

/**
 * The demo's Testing tool in the tool's own layout (ADR-131, mock-up S12): the demo tests nothing and says so in the
 * answer, then shows what is real — the engine's business rules, the acceptance checks a business tester can run for
 * each, and the places no generated test would cover. One action: upload your own program.
 *
 * Everything is the demo's engine reading of the shipped example (`lib/demo-project.ts`). What a project would add —
 * scenarios a model wrote, a run against mocks, a result from your SAP system — the demo has none of, and nothing here
 * shows a figure for it. There is no run button: the demo has no model and no runner.
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
  const rules = useMaterialRules(demo.analyze.source, APP_VERSION);
  const [acceptance, setAcceptance] = useState<number | null>(null);
  const notProven = notProvenItems({
    abap: false,
    cases: 1, // the demo lists what no test would cover, not "nothing has run": it has nothing to run
    modelCases: 0,
    missingRules: [],
    places: gaps,
    onlyYourSystem: [],
    ranHere: false,
  });
  const placeCount = gaps.reduce((sum, g) => sum + g.count, 0);
  const ruleCount = rules.rules ? rules.rules.length : null;

  return (
    <div data-demo-testing="">
      <AnswerCard
        id="testing-answer"
        question="Is the example program tested?"
        chips={<FamilyChip kind="not-determined" note="demo" />}
        answer={
          <span data-testing-answer="demo">
            The demo tests nothing: it writes no scenario and runs none. What it shows is real: the engine&apos;s business rules,
            the checks a business tester can run for each, and the places no generated test would cover.
          </span>
        }
        condition="In your own project the engine and a model write the scenarios, and they run against SAP mocks or in your SAP system. A made-up result is the one thing this page may never show."
        action={
          <CcLinkButton href="/dashboard" variant="primary">
            Upload your own program
          </CcLinkButton>
        }
        actionNote="Starts a project in My workspace. Free; your code stays in your project."
        facets={[
          { id: 'scenarios', label: 'Scenarios', value: 'None in a demo', note: 'The demo makes no model call.' },
          {
            id: 'rules',
            label: 'Business rules',
            value: ruleCount === null ? 'Being read' : `${ruleCount} read from the code`,
            note: 'By the engine. The demo writes no case for them.',
            chip: <FamilyChip kind="engine" />,
            href: `#${TESTING_SECTION_IDS.tested}`,
          },
          { id: 'result', label: 'Result', value: 'None in a demo', note: 'Nothing ran: there is nothing to run.' },
          {
            id: 'open',
            label: 'Not proven',
            value: `${placeCount} ${placeCount === 1 ? 'place' : 'places'}`,
            note: 'No generated test would cover them.',
            href: `#${TESTING_SECTION_IDS.open}`,
          },
        ]}
      />

      {/* The shared bar, as on a project (ADR-126 (3)): no "Where it ran" and no developer depth in a demo. */}
      <PageAnchorBar
        anchors={testingAnchors({ rules: ruleCount, ran: false, notProven: notProven.length, acceptance, developers: false })}
        label={PAGE_ANCHOR_LABELS.testing}
        name="testing-anchor"
        plural="testing-anchors"
      />

      <div data-testing-flow="" className="grid grid-cols-1 items-start gap-6">
        <ToolSection
          id="testing-tested"
          data-testing-tested=""
          title="What was tested"
          titleExtra={<FamilyChip kind="engine" note="rules" />}
          lead="The business rules the engine read from the code. In your own project each gets its scenarios here, with the result and where it ran."
        >
          {rules.rules ? (
            <RuleResults
              rules={rules.rules.map((r) => ({
                id: r.id,
                text: r.text || r.label,
                decision: null,
                lines: r.ranges.length > 0 ? r.ranges.map((x) => (x.lineStart === x.lineEnd ? `L${x.lineStart}` : `L${x.lineStart}–L${x.lineEnd}`)).join(', ') : null,
                cases: [],
              }))}
              untraced={[]}
              placeNote={null}
              emptyNote="The demo writes no scenarios: it calls no model. The acceptance checks below are the engine's, and real."
            />
          ) : (
            <p className="m-0 cc-text-cell text-cc-ink-muted">The rules of the example are being read.</p>
          )}
        </ToolSection>

        <ToolSection
          id="testing-open"
          data-testing-open=""
          title="Not proven"
          aside={notProven.length > 0 ? notProven.length : undefined}
          lead="What no generated test would cover in this program, read from the code by the engine."
        >
          <NotProvenList items={notProven}>
            <div id="testing-hand" data-testing-hand="" data-testid="demo-manual-areas" className="mt-5 scroll-mt-32 border-t border-cc-line pt-4">
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
          </NotProvenList>
        </ToolSection>

        <ToolSection
          id="testing-acceptance"
          data-testing-acceptance=""
          title="Acceptance checks for a business tester"
          titleExtra={<FamilyChip kind="engine" />}
          lead="How someone in the business department checks each rule in a test system, without ABAP: one case where the rule applies, and its counter-check where it must not. A check is a question, not a result: nothing here has run."
        >
          <CounterChecks source={demo.analyze.source} engineVersion={APP_VERSION} onCount={setAcceptance} />
        </ToolSection>
      </div>
    </div>
  );
}
