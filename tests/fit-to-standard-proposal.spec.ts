/**
 * Roadmap 3.0.20, step F5 — a model's standard candidates, checked
 * (`docs/design/fit-to-standard-concept.md` §4.3 step 6, §7 risk 1, §8 F5;
 * owner decision 5).
 *
 * Acceptance: injected wrong IDs are never shown as verified; a mismatch is
 * dropped and SAP's title is shown beside it; a kept candidate is E1 at most
 * with provenance *Model proposal*; only open steps take one; the design works
 * with the model off. The IDs of the QM/FI/SD/CO reviews (F2358, 19M, 1EG,
 * SAP_COM_0093, API_JOURNALENTRYITEMBASIC_SRV) are the probe.
 *
 * Server-free.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyFitProposals, fitProposalPrompt, FIT_PROPOSAL_SCHEMA } from '../lib/fit-to-standard-proposal';
import { responseSchemaForStage, RESPONSE_SHAPE_STAGE } from '../lib/model-response-schema';
import { loadSapNameLists } from '../lib/sap-identifiers';
import type { FitEntry } from '../lib/fit-to-standard-design';

const entry = (elementId: string, over: Partial<FitEntry> = {}): FitEntry => ({
  elementId, label: elementId, plainLabel: `Step ${elementId}`, kind: 'task', anchor: { lineStart: 10, lineEnd: 12 }, anchorBasis: 'code',
  comparability: 'business-comparable', disposition: 'gap-open', standardRef: null, evidenceLevel: 'E0', provenance: 'reconstructed',
  why: '', gateClass: null, note: null, ...over,
});
const ENTRIES = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => entry(id)).concat([
  entry('given', { disposition: 'given-up' }),
  entry('tech', { comparability: 'technical', disposition: 'goes-with-program' }),
]);

const REVIEW_IDS = [
  { elementId: 'a', kind: 'fiori-app', id: 'F2358', title: 'Process Collections Worklist' },
  { elementId: 'b', kind: 'scope-item', id: '19M', title: 'Collections Management' },
  { elementId: 'c', kind: 'scope-item', id: '1EG', title: 'Cost Center Accounting' },
  { elementId: 'd', kind: 'api', id: 'SAP_COM_0093', title: 'Credit Management Integration' },
  { elementId: 'e', kind: 'api', id: 'API_JOURNALENTRYITEMBASIC_SRV', title: 'Replacement for BSID, BSAD and BSEG' },
];

test.beforeAll(async () => {
  await loadSapNameLists();
});

test('the review IDs are never shown as verified; a mismatch is dropped with SAP\'s title beside it', () => {
  const out = applyFitProposals(ENTRIES, JSON.stringify({ proposals: REVIEW_IDS }));
  expect(out.unreadable).toBe(false);
  for (const e of out.entries) expect(e.standardRef?.check ?? 'none').not.toBe('verified');
  const f2358 = out.dropped.find((d) => d.id === 'F2358')!;
  expect(f2358.sapTitle).toBe('Monitor Purchase Order Items');
  expect(f2358.reason).toContain('Does not match SAP data');
  expect(out.dropped.map((d) => d.id)).toEqual(expect.arrayContaining(['F2358', '19M', '1EG']));
  // Whatever was kept is a candidate: E1, a model's proposal, SAP's title only.
  for (const e of out.entries.filter((x) => x.disposition === 'covered')) {
    expect(e).toMatchObject({ evidenceLevel: 'E1', provenance: 'model-proposal' });
    expect(e.why).toContain('whether it does the step is for the workshop');
    expect(e.standardRef!.title === null || !/Replacement for BSID|Credit Management Integration/.test(e.standardRef!.title)).toBe(true);
  }
});

test('an identifier with SAP\'s own title stays a checked candidate — still E1, still a model\'s proposal, still to verify for the step', () => {
  const out = applyFitProposals(ENTRIES, { proposals: [{ elementId: 'a', kind: 'fiori-app', id: 'F2358', title: 'Monitor Purchase Order Items' }] });
  expect(out.kept).toBe(1);
  const a = out.entries.find((e) => e.elementId === 'a')!;
  expect(a).toMatchObject({ disposition: 'covered', evidenceLevel: 'E1', provenance: 'model-proposal' });
  expect(a.standardRef).toMatchObject({ id: 'F2358', title: 'Monitor Purchase Order Items', check: 'verified' });
  expect(a.why).toContain('whether it does the step is for the workshop');
});

test('only an open business step takes a candidate; an invented identifier is left out; the answer that is not the schema changes nothing', () => {
  const out = applyFitProposals(ENTRIES, {
    proposals: [
      { elementId: 'given', kind: 'fiori-app', id: 'F0380', title: 'Process Collections Worklist' },
      { elementId: 'tech', kind: 'fiori-app', id: 'F0380', title: 'Process Collections Worklist' },
      { elementId: 'nope', kind: 'fiori-app', id: 'F0380', title: 'x' },
      { elementId: 'f', kind: 'fiori-app', id: 'MAKE_IT_UP', title: 'Invented' },
      { elementId: 'a', kind: 'transaction', id: 'VA01', title: 'Create Sales Order' },
    ],
  });
  expect(out.kept).toBe(0);
  expect(out.entries.find((e) => e.elementId === 'given')!.disposition).toBe('given-up');
  expect(out.entries.find((e) => e.elementId === 'tech')!.disposition).toBe('goes-with-program');
  expect(out.dropped.find((d) => d.id === 'MAKE_IT_UP')?.reason).toContain('Not an SAP identifier');
  expect(applyFitProposals(ENTRIES, 'not json')).toMatchObject({ unreadable: true, kept: 0 });
  expect(applyFitProposals(ENTRIES, '{"other":[]}')).toMatchObject({ unreadable: true });
});

test('the prompt names only the open steps and forbids guessing; the schema is the Design stage\'s own shape', () => {
  const prompt = fitProposalPrompt({ programName: 'Z_X', edition: 'public', entries: ENTRIES });
  expect(prompt).toContain('- a: "Step a"');
  expect(prompt).not.toContain('- given:');
  expect(prompt).not.toContain('- tech:');
  expect(prompt).toContain('Never invent or guess an identifier.');
  expect(RESPONSE_SHAPE_STAGE['design-fit-proposal']).toBe('design');
  expect(responseSchemaForStage('design', 'design-fit-proposal')).toBe(FIT_PROPOSAL_SCHEMA);
  expect(responseSchemaForStage('design')).toBeUndefined();
});

test('route source: a proposal is stored only with the proxy\'s receipt of a Design-stage call, checked with the synced lists', () => {
   
  const src: string = require('fs').readFileSync(path.join(__dirname, '..', 'app', 'api', 'projects', '[projectId]', 'fit-to-standard', 'route.ts'), 'utf8');
  expect(src).toContain("verifyModelReceipt(body.receipt, { uid: gate.uid, text: body.text, key, stage: 'design' })");
  expect(src).toContain('await loadSapNameLists();');
  expect(src).toContain("kind: 'proposal'");
});

test('with the model off the design is offered without the proposal button', async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'tmp', 'fit-to-standard-proposal', String(process.pid), 'View.cjs');
  await build({
    entryPoints: [path.join(root, 'components', 'fit', 'FitToStandardView.tsx')],
    outfile: out, bundle: true, format: 'cjs', platform: 'node', jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': root }, logLevel: 'silent',
  });
   
  const View = require(out).default;
  const gate = { outcome: 'offered', classes: ['A'], primary: 'A', strength: 'strong', edition: 'public', editionAssumed: false, signals: [], sentence: '', editionNote: null };
  const design = { entries: ENTRIES, counts: { elements: 8, givenUp: 1, covered: 0, configuration: 0, gapKeyUser: 0, gapOrganisational: 0, gapOpen: 6, goesWithProgram: 1, unknown: 0 }, againstGate: null, edition: 'public' };
  const stored = { revision: 1, kind: 'engine', stale: false, createdAt: '2026-10-21T10:00:00.000Z', createdBy: 'Owner' };
  const off = renderToStaticMarkup(React.createElement(View, { gate, design, stored, isOwner: true }));
  expect(off).not.toContain('data-fit-propose');
  expect(off).toContain('data-fit-confirm=""');
  const on = renderToStaticMarkup(React.createElement(View, { gate, design, stored, isOwner: true, onPropose: () => {} }));
  expect(on).toContain('data-fit-propose=""');
  const dropped = renderToStaticMarkup(React.createElement(View, {
    gate, stored, isOwner: true,
    design: { ...design, modelProposal: { provider: 'google', modelId: 'gemini-3.8-flash', byok: false, kept: 0, dropped: [{ elementId: 'a', id: 'F2358', sapTitle: 'Monitor Purchase Order Items', reason: 'Does not match SAP data: SAP lists F2358 as "Monitor Purchase Order Items" — left out.' }] } },
  }));
  expect(dropped).toContain('data-fit-dropped="F2358"');
  expect(dropped).toContain('Monitor Purchase Order Items');
});
