'use client';

import React, { useMemo, useState } from 'react';
import { Download, FileCode, FileText, ShieldAlert } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { PROVENANCE_VALUES } from '@/lib/provenance';
import { OBJECT_STATUS_VALUES } from '@/lib/object-status';
import { EVIDENCE_LEVEL_VALUES } from '@/lib/evidence-level';
import { CLEAN_CORE_LEVEL_VALUES } from '@/lib/clean-core-level';
import { RULE_PROPERTY_VALUES } from '@/lib/rule-property';
import { describeRunCost } from '@/lib/run-cost';
import CcAnchor from '@/components/cc/Anchor';
import CcArtefactRow from '@/components/cc/ArtefactRow';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcCodeSurface from '@/components/cc/CodeSurface';
import CcDialog from '@/components/cc/Dialog';
import { CcEmptyState, CcNoMatches } from '@/components/cc/EmptyState';
import CcField, { CcRequiredNote } from '@/components/cc/Field';
import CcFilterBar from '@/components/cc/FilterBar';
import CcIconButton from '@/components/cc/IconButton';
import CcLinkButton from '@/components/cc/LinkButton';
import { CcCleanCoreLevel, CcEvidenceLevel } from '@/components/cc/Identifier';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessagePopover, { type CcCheckMessage } from '@/components/cc/MessagePopover';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcObjectIdentifier from '@/components/cc/ObjectIdentifier';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcRunIndicator, { CcRunCost } from '@/components/cc/RunIndicator';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import CcTable from '@/components/cc/Table';
import { CcRulePropertyTag, CcTag } from '@/components/cc/Tag';
import CcToast from '@/components/cc/Toast';
import CcWhyPopover from '@/components/cc/WhyPopover';

/**
 * Every component of `DESIGN.md`, on one page, behind the admin gate.
 *
 * Two jobs, and the second is why it exists at all.
 *
 * For a person: one place where the whole language stands next to itself, so a
 * new chip that does not belong is visible before it is built into a screen.
 *
 * For the guards: a rendered surface. `tests/cc-*-guard.spec.ts` measure
 * *computed* style here — contrast, type size, chip form, focus ring — because
 * a source guard can be satisfied by a component that quietly accepts a
 * `className` override and computed style cannot. Every state of every
 * component is therefore on this page on purpose; a component that is not here
 * is a component nothing measures.
 *
 * **Nothing here is live product.** Roadmap step 1.5 builds the language, not
 * the screens: the new interface grows behind an admin-only switch until 3.0
 * (`docs/ROADMAP.md`, preamble). That switch does not exist yet — roadmap 1.4
 * builds it — so this page reuses the gate the admin console already has:
 * `profile.isAdmin`, checked the same way, in the same route group. A signed-in
 * community account sees exactly what it saw yesterday.
 */
const CODE_LINES = [
  {
    number: 410,
    tokens: [
      { kind: 'keyword' as const, text: '  IF' },
      { kind: 'plain' as const, text: ' lv_amount ' },
      { kind: 'plain' as const, text: '> ' },
      { kind: 'literal' as const, text: "'5000'" },
      { kind: 'plain' as const, text: '.' },
    ],
  },
  {
    number: 411,
    highlighted: true,
    tokens: [
      { kind: 'plain' as const, text: '    lv_tolerance = ' },
      { kind: 'literal' as const, text: "'0.05'" },
      { kind: 'plain' as const, text: '.  ' },
      { kind: 'comment' as const, text: '" tolerance 5 %' },
    ],
  },
  {
    number: 412,
    tokens: [
      { kind: 'keyword' as const, text: '    PERFORM' },
      { kind: 'plain' as const, text: ' ' },
      { kind: 'name' as const, text: 'check_limit' },
      { kind: 'plain' as const, text: '.' },
    ],
  },
  {
    number: 413,
    tokens: [
      { kind: 'keyword' as const, text: '  ENDIF' },
      { kind: 'plain' as const, text: '.' },
    ],
  },
];

const FINDINGS = [
  { id: 'CC-017', name: 'GUI_UPLOAD', level: 'D' as const, line: 'L412' },
  { id: 'CC-018', name: 'BAPI_PO_CREATE1', level: 'B' as const, line: 'L87' },
  { id: 'CC-019', name: 'Z_MM_TOLERANCE', level: 'C' as const, line: 'L231' },
];

const CHECKS: CcCheckMessage[] = [
  {
    id: 'br-002',
    state: 'warning',
    text: 'Gateway “Price deviation > 5 %?” deviates from the code without a target condition (BR-002).',
    targetId: 'ds-check-gateway',
    targetLabel: 'Gateway Price deviation',
  },
  {
    id: 'br-003',
    state: 'warning',
    text: 'BR-003 is dropped, but the path “Plant 1000?” still exists in the model.',
    targetId: 'ds-check-plant',
    targetLabel: 'Path Plant 1000',
  },
  {
    id: 'lane-approver',
    state: 'information',
    text: 'Lane “Approver” is only reconstructed — no AUTHORITY-CHECK found.',
    targetId: 'ds-check-lane',
    targetLabel: 'Lane Approver',
  },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8" aria-labelledby={id}>
      <h2
        id={id}
        className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignSystemGallery() {
  const { profile, loading } = useUserProfile();

  const [view, setView] = useState<'business' | 'it' | 'management'>('business');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('any');
  const [boxOpen, setBoxOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invitee, setInvitee] = useState('');

  const filtered = useMemo(
    () =>
      FINDINGS.filter(
        (f) =>
          (search === '' || f.name.toLowerCase().includes(search.toLowerCase())) &&
          (level === 'any' || f.level === level),
      ),
    [search, level],
  );
  const filtersActive = search !== '' || level !== 'any';
  const clearFilters = () => {
    setSearch('');
    setLevel('any');
  };

  const cost = describeRunCost({
    profile,
    metered: true,
    callsModel: false,
  });

  if (loading) {
    return (
      <div className="mx-auto my-12 max-w-md text-center text-[13px] font-medium text-cc-ink-muted">
        Loading
      </div>
    );
  }

  // The same gate as the admin console, written in the language this page is
  // about: the denial is part of the page, so it is not exempt from its own
  // rules. `tests/cc-token-guard.spec.ts` therefore needs no exception here.
  if (!profile || !profile.isAdmin) {
    return (
      <div className="mx-auto my-12 max-w-md rounded-cc-card border border-cc-error-border bg-cc-surface p-8 text-center shadow-cc">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-cc-card border border-cc-error-border bg-cc-error-bg text-cc-error">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="mb-2 text-[15px] font-bold text-cc-ink">Access denied</h2>
        <p className="text-[13px] leading-relaxed font-medium text-cc-ink-muted">
          This page is restricted to Clean-Core.io system administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="cc bg-cc-page px-6 py-8" data-cc-gallery="">
      <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">
        Design system — DESIGN.md as components
      </h1>
      <p className="mt-1 max-w-3xl text-[14px] leading-relaxed font-medium text-cc-ink-muted">
        Roadmap step 1.5. Nothing on this page is wired into a project screen; it is the language
        the 3.0 workspace is built from, and the surface the style, contrast and provenance guards
        measure.
      </p>

      <Section id="ds-buttons" title="Buttons — exactly four">
        <CcCard title="Variants">
          <div className="flex flex-wrap items-center gap-2">
            <CcButton variant="primary">Run analysis</CcButton>
            <CcButton variant="secondary">Import usage</CcButton>
            <CcButton variant="ghost">Cancel</CcButton>
            <CcButton variant="ghost" tone="danger">
              Delete project
            </CcButton>
            <CcButton variant="dark">Record the decision</CcButton>
            <CcIconButton label="Close panel">
              <FileText size={16} aria-hidden={true} />
            </CcIconButton>
            {/* A control that goes somewhere, wearing one of the four styles
                rather than becoming a fifth (roadmap 1.4). It is here so the
                rendered guard below measures it against the real buttons. */}
            <CcLinkButton href="/admin/design-system">Open a stage</CcLinkButton>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CcButton variant="primary" density="cozy">
              Run analysis
            </CcButton>
            <CcButton variant="ghost" density="cozy">
              Cancel
            </CcButton>
            <CcIconButton label="Download package" density="cozy">
              <Download size={16} aria-hidden={true} />
            </CcIconButton>
          </div>
          <div className="mt-3">
            <CcSegmentedControl
              label="View"
              value={view}
              onChange={setView}
              segments={[
                { value: 'business', label: 'Business' },
                { value: 'it', label: 'IT' },
                { value: 'management', label: 'Management' },
              ]}
            />
          </div>
        </CcCard>
      </Section>

      <Section id="ds-provenance" title="Provenance — the nine values, in three forms">
        <CcCard title="Where a statement comes from" count={PROVENANCE_VALUES.length}>
          <div className="flex flex-wrap items-center gap-2">
            {PROVENANCE_VALUES.map((value) => (
              <CcProvenanceChip key={value} value={value} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CcProvenanceChip value="stale" note="source changed" />
            <CcProvenanceChip value="proposed" note="names" />
          </div>
        </CcCard>
      </Section>

      <Section id="ds-vocabularies" title="The other fixed lists — each with its own form">
        <div className="grid gap-3 md:grid-cols-2">
          <CcCard title="Object status" count={OBJECT_STATUS_VALUES.length}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {OBJECT_STATUS_VALUES.map((value) => (
                <CcObjectStatus key={value} value={value} />
              ))}
            </div>
          </CcCard>
          <CcCard title="Evidence level" count={EVIDENCE_LEVEL_VALUES.length}>
            <div className="flex flex-wrap items-center gap-2">
              {EVIDENCE_LEVEL_VALUES.map((value) => (
                <CcEvidenceLevel key={value} value={value} />
              ))}
            </div>
          </CcCard>
          <CcCard title="Clean-core level" count={CLEAN_CORE_LEVEL_VALUES.length}>
            <div className="flex flex-wrap items-center gap-2">
              {CLEAN_CORE_LEVEL_VALUES.map((value) => (
                <CcCleanCoreLevel key={value} value={value} />
              ))}
              <CcCleanCoreLevel value="D" withLabel />
            </div>
          </CcCard>
          <CcCard title="Rule property" count={RULE_PROPERTY_VALUES.length}>
            <div className="flex flex-wrap items-center gap-2">
              {RULE_PROPERTY_VALUES.map((value) => (
                <CcRulePropertyTag key={value} value={value} />
              ))}
              <CcTag>Demo</CcTag>
            </div>
          </CcCard>
        </div>
      </Section>

      <Section id="ds-anchors" title="Anchors, artefact rows and Why?">
        <div className="grid gap-3 md:grid-cols-2">
          <CcCard title="Anchors">
            <p className="text-[14px] leading-relaxed font-medium text-cc-ink">
              Tolerance 5 % <CcAnchor>L412</CcAnchor>, plant 1000 <CcAnchor>L87</CcAnchor>, vendor
              block list <CcAnchor tone="hot">L231</CcAnchor>. One sentence is not backed:{' '}
              <CcAnchor tone="unlinked">no anchor</CcAnchor>.
            </p>
            <p className="mt-3 flex items-center gap-2 text-[14px] font-medium text-cc-ink">
              Traceability 92 %
              <CcWhyPopover
                subject="Traceability 92%"
                provenance="reconstructed"
                basis="Engine 2.11.0, rule set 1.3 — 42 findings across 668 of 668 lines"
                evidence={<CcAnchor>CC-017</CcAnchor>}
                recorded="2026-09-15"
              />
            </p>
          </CcCard>
          <CcCard title="Artefacts" count={3}>
            <div className="flex flex-col gap-1.5">
              <CcArtefactRow
                icon={<FileText size={16} aria-hidden={true} />}
                title="Audit pack"
                detail="ZIP, 12 artefacts · 2026-09-15"
                status={<CcProvenanceChip value="proven" />}
              />
              <CcArtefactRow
                icon={<FileCode size={16} aria-hidden={true} />}
                title="Process model"
                detail="BPMN 2.0 XML"
                status={<CcProvenanceChip value="reconstructed" />}
              />
              <CcArtefactRow
                icon={<FileText size={16} aria-hidden={true} />}
                title="Cost options"
                detail="Assumptions revision 4"
                status={<CcObjectStatus value="draft" />}
              />
            </div>
          </CcCard>
        </div>
      </Section>

      <Section id="ds-messages" title="Messages">
        <div className="flex flex-col gap-2">
          <CcMessageStrip state="information" headline="Example project — fictitious code.">
            The findings and the signature are real engine output on a program written for
            demonstration.
          </CcMessageStrip>
          <CcMessageStrip state="warning" headline="This result is out of date.">
            The source changed after the last run.
          </CcMessageStrip>
          <CcMessageStrip
            state="error"
            headline="Business names were not created."
            actions={
              <>
                <CcButton variant="ghost">Keep technical names</CcButton>
                <CcButton variant="secondary">Retry</CcButton>
              </>
            }
          >
            The model did not answer within 60 s. The skeleton, findings and anchors are saved.
          </CcMessageStrip>
          <CcMessageStrip state="success" headline="Run signed.">
            Ed25519 signature recorded on the run.
          </CcMessageStrip>
          <CcMessageStrip state="neutral" headline="Nothing to report.">
            No rule in this program reads a customizing table.
          </CcMessageStrip>
          <div className="flex flex-wrap gap-2">
            <CcButton variant="ghost" onClick={() => setBoxOpen(true)}>
              Open message box
            </CcButton>
            <CcButton variant="ghost" onClick={() => setToastOpen(true)}>
              Show toast
            </CcButton>
          </div>
        </div>
      </Section>

      {/* D.5a: the modal for a form or an explanation, and the collected
          checks of an edit with the jump to their element (§2.6). */}
      <Section id="ds-dialog" title="Dialog and message popover">
        <div className="grid gap-3 md:grid-cols-2">
          <CcCard title="Dialog">
            <p className="text-[13px] leading-relaxed font-medium text-cc-ink">
              For a form or an explanation. Confirmation before something irreversible stays with
              the message box.
            </p>
            <div className="mt-3">
              <CcButton variant="ghost" onClick={() => setDialogOpen(true)}>
                Open dialog
              </CcButton>
            </div>
          </CcCard>
          <CcCard title="Edit mode" count={CHECKS.length}>
            <div className="flex flex-col gap-1.5">
              <div
                id="ds-check-gateway"
                className="rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2 text-[13px] font-medium text-cc-ink"
              >
                Gateway “Price deviation &gt; 5 %?”
              </div>
              <div
                id="ds-check-plant"
                className="rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2 text-[13px] font-medium text-cc-ink"
              >
                Path “Plant 1000?”
              </div>
              <div
                id="ds-check-lane"
                className="rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2 text-[13px] font-medium text-cc-ink"
              >
                Lane “Approver”
              </div>
            </div>
            <div
              role="group"
              aria-label="Edit mode"
              className="mt-3 flex flex-wrap items-center gap-2 border-t border-cc-line pt-3"
            >
              <span className="text-[13px] font-semibold text-cc-warning">Unsaved changes · 5 rules</span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <CcMessagePopover messages={CHECKS} />
                <CcButton variant="ghost">Discard</CcButton>
                <CcButton variant="primary">Save as revision 2</CcButton>
              </span>
            </div>
          </CcCard>
        </div>
      </Section>

      <Section id="ds-form" title="Form and value states">
        <CcCard title="Import usage" actions={<CcRequiredNote />}>
          <div className="grid gap-3 md:grid-cols-2">
            <CcField
              label="SCMON or SUSG export"
              required
              valueState="success"
              message="Checked: 13 months including a year-end close, 3 systems, 34,120 calls."
            >
              {(control) => (
                <input
                  id={control.id}
                  aria-describedby={control.describedBy}
                  required={control.required}
                  defaultValue="scmon_po_2026Q3.zip"
                  className={control.className}
                />
              )}
            </CcField>
            <CcField
              label="Window start"
              required
              valueState="error"
              message="Enter a date like 2026-06-12. It must lie inside the file."
            >
              {(control) => (
                <input
                  id={control.id}
                  aria-describedby={control.describedBy}
                  aria-invalid={control.invalid}
                  required={control.required}
                  placeholder="YYYY-MM-DD"
                  className={control.className}
                />
              )}
            </CcField>
            <CcField
              label="Systems"
              valueState="warning"
              message="The file also holds DEV — check whether it belongs in."
            >
              {(control) => (
                <select
                  id={control.id}
                  aria-describedby={control.describedBy}
                  defaultValue="prd-qas"
                  className={control.className}
                >
                  <option value="prd-qas">PRD, QAS</option>
                  <option value="all">All systems</option>
                </select>
              )}
            </CcField>
            <CcField
              label="Note for the project"
              help="Shown with the import."
              valueState="information"
              message="It does not change any number."
            >
              {(control) => (
                <textarea
                  id={control.id}
                  aria-describedby={control.describedBy}
                  defaultValue="Exported by basis team after the quarter close."
                  className={control.className}
                />
              )}
            </CcField>
          </div>
        </CcCard>
      </Section>

      <Section id="ds-filters" title="Filter bar — matches, no matches, empty">
        <div className="grid gap-3 md:grid-cols-2">
          <CcCard title="Findings">
            <div data-cc-demo="findings">
            <CcFilterBar
              noun="findings"
              shown={filtered.length}
              total={FINDINGS.length}
              search={search}
              onSearch={setSearch}
              active={filtersActive}
              onClear={clearFilters}
            >
              <CcField label="Level">
                {(control) => (
                  <select
                    id={control.id}
                    value={level}
                    onChange={(event) => setLevel(event.target.value)}
                    className={control.className}
                  >
                    <option value="any">Any level</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                )}
              </CcField>
            </CcFilterBar>
            <div className="mt-3">
              {filtered.length === 0 ? (
                <CcNoMatches
                  reason="GUI_UPLOAD exists at level D, not A."
                  onClear={clearFilters}
                />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filtered.map((finding) => (
                    <CcArtefactRow
                      key={finding.id}
                      icon={<CcCleanCoreLevel value={finding.level} />}
                      title={finding.name}
                      detail={finding.id}
                      status={<CcAnchor>{finding.line}</CcAnchor>}
                    />
                  ))}
                </div>
              )}
            </div>
            </div>
          </CcCard>
          <CcCard title="Findings" count={0}>
            <CcEmptyState
              title="No findings yet"
              action={<CcButton variant="primary">Run analysis</CcButton>}
              cost={<CcRunCost cost={cost} />}
            >
              Run the analysis to see what this code uses and where it would break.
            </CcEmptyState>
          </CcCard>
        </div>
      </Section>

      {/* Roadmap 1.8 added the two pieces §2.4 always needed and 1.5 did not
          build: the Object Identifier and the table itself. They are here for
          the same reason as everything else on this page — a component that is
          not here is a component nothing measures. */}
      <Section id="ds-table" title="Table">
        <CcCard title="Projects" count={3}>
          <CcTable
            caption="Three projects, one of them with nothing on it"
            columns={[
              { key: 'project', label: 'Project' },
              { key: 'lines', label: 'Lines', numeric: true, width: '110px' },
              { key: 'findings', label: 'Findings', numeric: true, width: '120px' },
              { key: 'status', label: 'Status', width: '260px' },
            ]}
            rows={[
              {
                key: 'demo',
                cells: {
                  project: (
                    <CcObjectIdentifier
                      title="Demo · Z_MM_PO_APPROVAL"
                      identifier="Fully worked example · fictitious code"
                      meta={<CcTag>Demo</CcTag>}
                    />
                  ),
                  lines: '668',
                  findings: '42',
                  status: <CcObjectStatus value="partial" />,
                },
              },
              {
                key: 'staged',
                cells: {
                  project: (
                    <CcObjectIdentifier title="Staged, never analysed" identifier="P-0422" />
                  ),
                  lines: '2,410',
                  findings: (
                    <span className="text-[12px] font-medium text-cc-ink-muted">not analysed</span>
                  ),
                  status: <CcObjectStatus value="draft" />,
                },
              },
              {
                key: 'stale',
                cells: {
                  project: (
                    <CcObjectIdentifier title="Source changed after the run" identifier="P-0359" />
                  ),
                  lines: '1,812',
                  findings: '61',
                  status: (
                    <span className="flex flex-col items-start gap-1">
                      <CcObjectStatus value="partial" />
                      <CcProvenanceChip value="stale" note="source changed" />
                    </span>
                  ),
                },
              },
            ]}
          />
        </CcCard>
      </Section>

      <Section id="ds-code" title="Code surface">
        <CcCard title="Z_MM_PO_CHECK — lines 410 to 413">
          <CcCodeSurface lines={CODE_LINES} label="Z_MM_PO_CHECK, lines 410 to 413" />
        </CcCard>
      </Section>

      <Section id="ds-run" title="Long runs">
        <CcCard title="Analysis in progress" meta={<CcProvenanceChip value="reconstructed" />}>
          <CcRunIndicator
            scope="Reading 3 programs, 10,400 lines"
            survivesLeaving={false}
            onCancel={() => undefined}
            onLeave={() => undefined}
            counters={[
              { label: 'lines', value: '6,204' },
              { label: 'findings', value: '38' },
            ]}
            stages={[
              {
                id: 'read',
                label: 'Code read',
                status: 'done',
                result: '668 lines, 3 programs',
              },
              {
                id: 'process',
                label: 'Process recognised',
                status: 'running',
                detail: 'reading include Z_MM_PO_TOP',
              },
              { id: 'naming', label: 'In business language', status: 'pending' },
              { id: 'reveal', label: 'This is your process', status: 'pending' },
            ]}
            error={{
              headline: 'Business names were not created.',
              detail: 'The model did not answer within 60 s. The skeleton and anchors are saved.',
              actions: <CcButton variant="secondary">Retry</CcButton>,
            }}
          />
        </CcCard>
      </Section>

      <CcMessageBox
        open={boxOpen}
        title="Delete this project?"
        confirmLabel="Delete project"
        onCancel={() => setBoxOpen(false)}
        onConfirm={() => setBoxOpen(false)}
      >
        The source, every run and the signed audit packs go with it. Readers you invited lose access
        immediately. This cannot be undone.
      </CcMessageBox>

      <CcDialog
        open={dialogOpen}
        title="Invite a reader"
        lead="Read access to this project, bound to one confirmed e-mail address, including the source code."
        onClose={() => setDialogOpen(false)}
        onSubmit={() => setDialogOpen(false)}
        actions={
          <>
            <CcButton variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </CcButton>
            <CcButton variant="primary" type="submit">
              Send invitation
            </CcButton>
          </>
        }
      >
        <CcField label="E-mail address" required help="The link works only for this address.">
          {(control) => (
            <input
              id={control.id}
              type="email"
              aria-describedby={control.describedBy}
              required={control.required}
              value={invitee}
              onChange={(event) => setInvitee(event.target.value)}
              className={control.className}
            />
          )}
        </CcField>
      </CcDialog>

      <CcToast open={toastOpen} onDismiss={() => setToastOpen(false)}>
        Export downloaded
      </CcToast>
    </div>
  );
}
