'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import CcCard from '@/components/cc/Card';
import CcCheckbox from '@/components/cc/Checkbox';
import CcField from '@/components/cc/Field';
import CcLinkButton from '@/components/cc/LinkButton';
import CcSwitch from '@/components/cc/Switch';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import { TestingPieChart, type TestingPieSlice } from '@/components/TestingCharts';
import { stateChartColor } from '@/lib/chart-colors';

/**
 * What waves 2 to 4 of block D still asked of the library — step D.31.
 *
 * A file of its own, like the other gallery additions, so this step adds one
 * import and one section to `page.tsx`. `tests/cc-d31-addenda.spec.ts` drives
 * what is on this page. The figures are sample figures, as everywhere on this
 * page — nothing here is read from a project.
 */
const SAMPLE_VERDICTS = { passed: 7, failed: 2, inconclusive: 3 };

export default function D31AddendaGallery() {
  const [accepted, setAccepted] = useState(false);
  const [anchors, setAnchors] = useState(true);
  const [name, setName] = useState('');

  const total = SAMPLE_VERDICTS.passed + SAMPLE_VERDICTS.failed + SAMPLE_VERDICTS.inconclusive;
  const verdicts = SAMPLE_VERDICTS.passed + SAMPLE_VERDICTS.failed;
  const pieData: TestingPieSlice[] = [
    { name: 'Tests passed', value: SAMPLE_VERDICTS.passed, color: stateChartColor('information').value },
    { name: 'Tests failed', value: SAMPLE_VERDICTS.failed, color: stateChartColor('error').value },
    { name: 'Tests without a verdict', value: SAMPLE_VERDICTS.inconclusive, color: 'var(--cc-surface-muted)', notDetermined: true },
  ];

  return (
    <div data-cc-demo="d31" className="grid gap-3 md:grid-cols-2">
      <CcCard title="Verdicts — an SVG chart that counts states">
        <div data-cc-demo-verdict-chart="" className="flex flex-col items-center gap-3">
          <TestingPieChart
            pieData={pieData}
            stats={{
              total,
              passed: SAMPLE_VERDICTS.passed,
              failed: SAMPLE_VERDICTS.failed,
              inconclusive: SAMPLE_VERDICTS.inconclusive,
              verdicts,
              passRate: Math.round((SAMPLE_VERDICTS.passed / verdicts) * 100),
              categoryStats: [],
            }}
          />
          <p className="m-0 cc-text-cell text-cc-ink-muted">
            A pass is information, a failure is error, and a test without a verdict is the dashed
            not-determined area — never green, never amber. Under a contrast theme every slice becomes an
            outline in the theme&apos;s text colour, and the slice without a verdict keeps its dashes.
          </p>
        </div>
      </CcCard>

      <CcCard title="A key figure">
        <div className="flex flex-col gap-2">
          <span className="cc-text-label text-cc-ink-muted">Payback period</span>
          <p data-cc-demo-figure="" className="m-0 cc-text-figure text-cc-ink">
            88.1 <span className="cc-text-meta text-cc-ink-muted">months</span>
          </p>
          <p className="m-0 cc-text-cell text-cc-ink-muted">
            <code>cc-text-figure</code> — 22 / 800 with tabular digits, the title&apos;s scale for the number a tile
            exists for.
          </p>
        </div>
      </CcCard>

      <CcCard title="Controls that carry a name and a link">
        <div className="flex flex-col gap-3">
          <CcCheckbox
            data-cc-demo-checkbox="rich"
            label={
              <>
                I have read the{' '}
                <Link href="/terms" className="underline underline-offset-2">
                  Terms
                </Link>
              </>
            }
            checked={accepted}
            onChange={setAccepted}
          />
          <CcSwitch data-cc-demo-switch="anchors" label="Show line anchors" checked={anchors} onChange={setAnchors} />
          <CcField data-cc-demo-field="name" label="Reader name">
            {(control) => (
              <input
                id={control.id}
                aria-describedby={control.describedBy}
                className={control.className}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </CcField>
        </div>
      </CcCard>

      <CcCard title="A link that leaves the product">
        <div className="flex flex-col gap-3">
          <div>
            <CcLinkButton href="https://api.sap.com" external="opens in a new tab" data-cc-demo-external="">
              SAP Business Accelerator Hub
            </CcLinkButton>
          </div>
          <p className="m-0 cc-text-cell text-cc-ink-muted">
            A new tab, announced twice: the arrow out of the box after the text, and the words in the
            link&apos;s name for a screen reader.
          </p>
        </div>
      </CcCard>

      <div className="md:col-span-2" data-cc-demo-accordion="">
        <CollapsibleAccordion
          title="Code inventory"
          badge="12 objects · 3 high-risk tables"
          badgeSeverity="warning"
          tooltip="All recognised ABAP artefacts in the uploaded code, by type and module. Reachable by keyboard: Tab to the info button, Escape closes."
        >
          <p className="m-0 cc-text-cell text-cc-ink-muted">Sample content of an open section.</p>
        </CollapsibleAccordion>
      </div>
    </div>
  );
}
