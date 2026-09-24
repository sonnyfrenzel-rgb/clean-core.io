'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcDateText from '@/components/cc/DateText';
import CcDisclosure from '@/components/cc/Disclosure';
import CcObjectIdentifier from '@/components/cc/ObjectIdentifier';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcSkeleton from '@/components/cc/Skeleton';
import CcTable from '@/components/cc/Table';
import CcTabs from '@/components/cc/Tabs';

/**
 * Loading, folding, tabs and the table limit — block D, step D.5c.
 *
 * A file of its own, like `FormControlsGallery.tsx`, so the steps that add to
 * the gallery in parallel each add one import and one section to `page.tsx`.
 * `tests/cc-disclosure-tabs.spec.ts` drives what is on this page.
 *
 * The two timed demos take longer than their thresholds on purpose — the busy
 * save 2.5 s, the load 1.5 s — so the indicator (after 400 ms) and the skeleton
 * (after 300 ms) are there to be seen and measured.
 */
const RULES = [
  'Orders above 5,000 need a second approval',
  'A blocked vendor stops the order',
  'Tolerance is 5 % of the net value',
  'Emergency orders skip the budget check',
  'The approver cannot be the requester',
  'Approval expires after 14 days',
  'A changed order is approved again',
] as const;

const FINDINGS = Array.from({ length: 12 }, (_, i) => ({
  id: `F-${String(i + 1).padStart(3, '0')}`,
  title: [
    'Direct update of EKKO',
    'SELECT without WHERE on MARA',
    'Call of an unreleased function module',
    'Modification of a standard include',
  ][i % 4],
  line: 120 + i * 37,
}));

export default function LoadingDisclosureGallery() {
  const [saving, setSaving] = useState(false);
  const [saves, setSaves] = useState(0);
  const [reads, setReads] = useState(0);
  const [loading, setLoading] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  return (
    <div data-cc-demo="loading" className="grid gap-3 md:grid-cols-2">
      <CcCard title="Busy on the button">
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[13px] font-medium text-cc-ink-muted">
            The indicator appears after 400 ms, the button keeps its width, the rest stays usable.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <CcButton
              variant="primary"
              icon={<Save size={16} aria-hidden={true} />}
              busy={saving}
              data-cc-demo-save=""
              onClick={() => {
                setSaving(true);
                setSaves((n) => n + 1);
                after(2500, () => setSaving(false));
              }}
            >
              Save decision
            </CcButton>
            <CcButton data-cc-demo-read="" onClick={() => setReads((n) => n + 1)}>
              Mark as read
            </CcButton>
          </div>
          <p data-cc-demo-counts="" className="m-0 text-[12px] font-medium text-cc-ink-muted">
            Saved {saves} · marked {reads}
          </p>
        </div>
      </CcCard>

      <CcCard title="Skeleton shapes">
        <div className="flex flex-col gap-4">
          <CcSkeleton shape="header" label="the project header" />
          <CcSkeleton shape="text" label="the summary" />
        </div>
      </CcCard>

      <CcCard title="Findings" count={FINDINGS.length}>
        <div className="flex flex-col gap-3">
          <div>
            <CcButton
              variant="secondary"
              busy={loading}
              data-cc-demo-load=""
              onClick={() => {
                setLoading(true);
                after(1500, () => setLoading(false));
              }}
            >
              Load again
            </CcButton>
          </div>
          {loading ? (
            <CcSkeleton shape="table" label="findings" count={5} />
          ) : (
            <CcTable
              caption="Twelve findings, five shown at first"
              limit={5}
              columns={[
                { key: 'finding', label: 'Finding' },
                { key: 'line', label: 'Line', numeric: true, width: '90px' },
                { key: 'status', label: 'Status', width: '140px' },
              ]}
              rows={FINDINGS.map((f) => ({
                key: f.id,
                cells: {
                  finding: <CcObjectIdentifier title={f.title} identifier={f.id} />,
                  line: String(f.line),
                  status: <CcObjectStatus value="draft" />,
                },
              }))}
            />
          )}
        </div>
      </CcCard>

      <CcCard title="Folded, with its count">
        <div className="flex flex-col gap-2">
          <CcDisclosure title="Business rules" count={RULES.length} level={4}>
            <ol data-cc-demo-rules="" className="m-0 list-decimal space-y-1 pl-5 text-[13px] font-medium text-cc-ink">
              {RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ol>
          </CcDisclosure>
          <CcDisclosure title="Details" defaultOpen>
            <p className="m-0 font-cc-mono text-[12px] font-semibold text-cc-ink-muted">
              P-0422 · manifest 3f9a2c · engine 2.19.0 · rules 2026-09-15
            </p>
          </CcDisclosure>
        </div>
      </CcCard>

      <CcCard title="Dates">
        <dl data-cc-demo-dates="" className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px] font-medium text-cc-ink">
          <dt className="text-cc-ink-muted">In text</dt>
          <dd className="m-0">
            <CcDateText value="2026-09-15T14:05:00Z" format="text" />
          </dd>
          <dt className="text-cc-ink-muted">In a table</dt>
          <dd className="m-0">
            <CcDateText value="2026-09-15T14:05:00Z" format="iso" />
          </dd>
          <dt className="text-cc-ink-muted">With the time</dt>
          <dd className="m-0">
            <CcDateText value="2026-09-15T14:05:00Z" format="datetime" />
          </dd>
          <dt className="text-cc-ink-muted">Not recorded</dt>
          <dd className="m-0">
            <CcDateText value={null} format="iso" />
          </dd>
        </dl>
      </CcCard>

      <CcCard title="Tabs">
        <CcTabs
          label="About this rule"
          tabs={[
            {
              value: 'source',
              label: 'Source',
              content: (
                <p className="m-0 text-[13px] font-medium text-cc-ink">
                  Z_MM_PO_CHECK, lines 410 to 413 — the tolerance check before the approval.
                </p>
              ),
            },
            {
              value: 'open',
              label: 'Not determined',
              count: 2,
              content: (
                <ul className="m-0 list-disc space-y-1 pl-5 text-[13px] font-medium text-cc-ink">
                  <li>Whether the tolerance applies to framework orders</li>
                  <li>Who maintains the vendor block list</li>
                </ul>
              ),
            },
            {
              value: 'what',
              label: 'What it does',
              content: (
                <p className="m-0 text-[13px] font-medium text-cc-ink">
                  An order more than 5 % above the requisition goes back to the requester.
                </p>
              ),
            },
          ]}
        />
      </CcCard>
    </div>
  );
}
