/**
 * Roadmap 3.0.20 — the four gate disagreements, accepted as they are (owner
 * decision 21.10.2026): Z_SALES_ORDER_CREATOR on Public, Z_MM_PO_APPROVAL (own
 * tables), Z_BUSINESS_PARTNER_SYNC (ADRC) and Z_ORDER_INTEGRITY_CHECK. The
 * gate does not change; what this spec holds is that each of them says why it
 * does not offer — in the IT view's reason line and in the Design tool — and
 * that the account can still ask for the design against the gate, which then
 * carries, visibly, that the engine does not recommend it (owner decision 3 of
 * 18.10.2026) and qualifies the decision that binds it.
 *
 * Server-free: the engine's readings of the shipped examples, the components
 * rendered with esbuild + renderToStaticMarkup.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFitToStandard, designFromReading } from '../lib/fit-to-standard-read';
import { fitGateReasonLine } from '../lib/fit-to-standard-gate';
import { AGAINST_GATE_SENTENCE } from '../lib/fit-to-standard-design';
import { catalogSnapshotKeyForProject } from '../lib/abap/catalog-snapshots';
import { summaryOf, type FitToStandardRevision } from '../lib/fit-to-standard-store';
import { standardDesignBasisOf } from '../lib/decision-draft';
import { buildProjectDecision } from '../lib/project-decision-build';
import { decisionCoverage } from '../lib/project-decision';
import { readExample } from './helpers/starter-example-files';

type Component = (props: Record<string, unknown>) => React.ReactElement | null;

async function load(file: string, name = 'default'): Promise<Component> {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'tmp', 'fit-gate-accepted', String(process.pid), `${path.basename(file)}.cjs`);
  await build({
    entryPoints: [path.join(root, file)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': root },
    logLevel: 'silent',
  });
  return require(out)[name];
}

const readingOf = (file: string) =>
  readFitToStandard({
    source: readExample(file),
    fileName: file,
    edition: 'public',
    catalogSnapshot: catalogSnapshotKeyForProject({ s4Deployment: 'public' }),
    engineVersion: 'v3.0.19',
    mode: 'demo',
    hasRun: true,
    analyzeState: 'done',
    signedSourceSha256: null,
  });

/** The four, with the exclusion the gate answers on Public and what its reason names. */
const ACCEPTED: ReadonlyArray<[string, string, RegExp]> = [
  ['Z_SALES_ORDER_CREATOR.txt', 'no-signal', /nothing in it points to a standard process to fit to\. \(L\d+/],
  ['Z_MM_PO_APPROVAL.abap', 'own-persistence', /own business data in its own tables[\s\S]*\(L\d+/],
  ['Z_BUSINESS_PARTNER_SYNC.txt', 'no-signal', /nothing in it points to a standard process to fit to\. \(L\d+/],
  ['Z_ORDER_INTEGRITY_CHECK.txt', 'nothing-comparable', /no business step to compare with the standard/],
];

test('each of the four says why it is not offered — in IT and in the Design tool', async () => {
  const Reason = await load('components/fit/FitGateReason.tsx', 'FitGateReasonLine');
  const View = await load('components/fit/FitToStandardView.tsx');
  for (const [file, exclusion, says] of ACCEPTED) {
    const { gate } = readingOf(file);
    expect(gate.outcome, file).toBe('not-offered');
    if (gate.outcome !== 'not-offered') continue;
    expect(gate.exclusion, file).toBe(exclusion);
    expect(fitGateReasonLine(gate), file).toMatch(says);

    const it = renderToStaticMarkup(React.createElement(Reason, { gate, designHref: '/project/p/design#fit-to-standard' }));
    expect(it, file).toContain('data-fit-gate="not-offered"');
    expect(it, file).toMatch(/data-fit-gate-reason=""[^>]*>Not offered\. /);
    expect(it, file).toContain('Ask for a design anyway in Design');

    const design = renderToStaticMarkup(React.createElement(View, { gate, design: null, stored: null, isOwner: true }));
    expect(design, file).toContain('data-fit-gate-reason=""');
    expect(design, file).toContain('data-fit-make-against=""');
    expect(design, file).toContain('Make one anyway — not recommended');
  }
});

test('the override with its warning: Z_MM_PO_APPROVAL against the gate', async () => {
  const r = readingOf('Z_MM_PO_APPROVAL.abap');
  expect(designFromReading(r, false), 'no design is made silently').toBeNull();
  const design = designFromReading(r, true)!;
  expect(design.againstGate).toEqual({ sentence: AGAINST_GATE_SENTENCE, gateReason: r.gate.outcome === 'not-offered' ? r.gate.reason : '' });
  expect(design.gateClasses).toEqual([]);
  // Nothing is "covered" above a candidate, and the gaps stay gaps.
  expect(design.entries.every((e) => e.disposition !== 'covered' || e.evidenceLevel === 'E1')).toBe(true);
  expect(design.counts.gapOpen).toBeGreaterThan(0);

  const View = await load('components/fit/FitToStandardView.tsx');
  const stored = { revision: 1, kind: 'engine', stale: false, createdAt: '2026-10-21T10:00:00.000Z', createdBy: 'Owner' };
  const html = renderToStaticMarkup(React.createElement(View, { gate: r.gate, design, stored, isOwner: true }));
  expect(html).toContain('data-fit-against-gate=""');
  expect(html).toContain(AGAINST_GATE_SENTENCE.replace(/'/g, '&#x27;'));
  expect(html).toContain('own business data in its own tables');
  expect(html).toContain('data-fit-confirm=""');

  // Confirmed and chosen, it binds the decision — qualified, never a recommendation.
  const revision: FitToStandardRevision = {
    formatVersion: 1,
    revision: 2,
    kind: 'confirmation',
    runId: 'run-1',
    sourceSha256: r.sourceSha256,
    edition: 'public',
    engineVersion: 'v3.0.19',
    gateClasses: design.gateClasses,
    againstGate: design.againstGate,
    entries: design.entries,
    counts: design.counts,
    createdBy: { uid: 'u1', name: 'Owner' },
    createdAt: '2026-10-21T10:05:00.000Z',
  };
  const decision = buildProjectDecision({
    summary: 'Move this object to SAP standard, as the account chose.',
    runId: 'run-1',
    evidenceDigest: 'd'.repeat(64),
    contract: null,
    assumptions: null,
    comparison: null,
    chosenOptionId: 'standard · Move to SAP standard',
    chosenOptionKind: 'standard',
    need: { revision: 3, confirmedDrops: 0, undecided: 0 },
    handedOver: false,
    signOff: { by: 'owner@example.com', at: '2026-10-21T10:06:00.000Z', reason: 'We take the standard.', notCurrent: null },
    standardDesign: standardDesignBasisOf(summaryOf(revision, 3)),
    timeline: { draftedAt: '2026-10-21T10:07:00.000Z' },
  });
  expect(decision.bindings.find((b) => b.key === 'standard-design')!.revision).toMatch(/^against-gate:fit\/r2@run-1\+/);
  expect(decisionCoverage(decision).gaps.map((g) => g.code)).toContain('standard-design-against-gate');
  expect(decision.conditions.filter((c) => c.source === 'fit-gap').length).toBe(design.counts.gapOpen + design.counts.unknown);
});
