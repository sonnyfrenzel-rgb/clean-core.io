/**
 * Roadmap 3.0.20, step F8 (part) — the standard option in Management reads the
 * confirmed fit-to-standard design (`docs/design/fit-to-standard-concept.md`
 * §5.3; owner decision 7).
 *
 * Acceptance: *for* only with no open gap and every standard candidate
 * confirmed by the account (provenance *Confirmed*, never *Proven*); *against*
 * while open gaps remain, naming them as conditions; without a confirmed
 * design on the current run *not determined*, as before.
 *
 * Server-free.
 */
import { test, expect } from '@playwright/test';
import { decisionOptionsView, type DecisionOptionsSource } from '../lib/decision-option-signals';
import { summaryOf, type FitToStandardRevision } from '../lib/fit-to-standard-store';
import { countEntries, type FitEntry } from '../lib/fit-to-standard-design';

const entry = (elementId: string, over: Partial<FitEntry>): FitEntry => ({
  elementId, label: elementId, plainLabel: elementId, kind: 'task', anchor: { lineStart: 1, lineEnd: 1 }, anchorBasis: 'code',
  comparability: 'business-comparable', disposition: 'given-up', standardRef: null, evidenceLevel: 'E0', provenance: 'confirmed',
  why: '', gateClass: 'A', note: null, ...over,
});
const summary = (entries: FitEntry[]) => {
  const rev: FitToStandardRevision = {
    formatVersion: 1, revision: 2, kind: 'confirmation', runId: 'run-1', sourceSha256: 's', edition: 'public', engineVersion: 'v3.0.19',
    gateClasses: ['A'], againstGate: null, entries, counts: countEntries(entries), createdBy: { uid: 'u', name: 'Owner' }, createdAt: '2026-10-21T10:00:00.000Z',
  };
  return summaryOf(rev, null);
};
const src = (over: Partial<DecisionOptionsSource> = {}): DecisionOptionsSource => ({
  subject: 'Z_FIT',
  mode: 'project',
  hasRun: true,
  fit: { state: 'not-determined', why: 'unread', reason: 'x', platform: 'public' },
  decision: null,
  status: null,
  confirmation: null,
  signOff: null,
  engineRoute: null,
  usage: null,
  economics: null,
  ...over,
});
const standard = (s: DecisionOptionsSource) => decisionOptionsView(s).cards.find((c) => c.option === 'standard')!;
const REF = { kind: 'api' as const, id: 'API_SALES_ORDER_SRV', title: null, check: 'catalog' as const, source: 'catalog' };

test('without a confirmed design the code still cannot answer — not determined, and the way is the design', () => {
  expect(standard(src())).toMatchObject({ signal: 'not-determined', provenance: 'not-determined', place: 'design' });
});

test('open gaps speak against moving to standard, as conditions; the account\'s answer is Confirmed, never Proven', () => {
  const card = standard(src({ fitDesign: summary([entry('a', {}), entry('b', { disposition: 'gap-open', provenance: 'reconstructed' })]) }));
  expect(card).toMatchObject({ signal: 'against', provenance: 'confirmed' });
  expect(card.reason).toContain('Each is a condition of the decision');
});

test('a candidate nobody confirmed keeps it not determined; every step resolved and confirmed speaks for it', () => {
  const candidate = entry('c', { disposition: 'covered', provenance: 'reconstructed', evidenceLevel: 'E1', standardRef: REF });
  expect(standard(src({ fitDesign: summary([entry('a', {}), candidate]) }))).toMatchObject({ signal: 'not-determined', provenance: 'confirmed' });
  const confirmed = { ...candidate, provenance: 'confirmed' as const, evidenceLevel: 'E4' as const };
  const keyUser = entry('k', { disposition: 'gap-key-user' });
  const card = standard(src({ fitDesign: summary([entry('a', {}), confirmed, keyUser]) }));
  expect(card).toMatchObject({ signal: 'for', provenance: 'confirmed' });
  expect(card.reason).toContain('1 given up, 1 gap (1 key user, 0 organisational, 0 open)');
  expect(card.reason).toContain('not something the code shows');
});
