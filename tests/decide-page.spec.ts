import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import {
  codeOfChoice,
  decideCostLine,
  decideDialogLead,
  decideDialogLines,
  decideDialogTitle,
  followedIndicationReason,
  nothingBuiltFollows,
  reasonRequired,
  rebuildRoutes,
  standardNote,
  type DecideDialogFacts,
} from '../lib/decide';
import { initialCostAssumptions } from '../components/tco/OptionComparison';
import { proposeEffort, proposeMaintenanceBaseline } from '../lib/cost-assumptions';
import { typicalPatch } from '../lib/typical-assumptions';
import type { StandardTouch } from '../lib/standard-touch';

/**
 * ADR-145, steps S3, S5 and S6, server-free: the pure half of the Decide page (`lib/decide.ts`) and the guards on its
 * source. The rendered walk is `redesign-decision-ends.spec.ts`; the command is `decide-command.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');
const code = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const proposals = (loc: number | null) => ({ effort: proposeEffort(loc), baseline: loc === null ? null : proposeMaintenanceBaseline(loc, 58) });

test.describe('the cost line: a simulation, never a stored figure it did not read', () => {
  test('without stored figures: typical assumptions, computed and marked, for all four options', () => {
    const line = decideCostLine({ stored: null, seed: initialCostAssumptions(), proposals: proposals(1200) });
    expect(line.basis).toBe('typical');
    expect(line.typical).toBe(true);
    // A range, or "about" one amount where an option's effort has no spread (Keep's upkeep).
    for (const o of ['keep', 'rebuild', 'standard', 'retire'] as const) expect(line.cost[o], o).toMatch(/^(about )?EUR [\d,]+(–[\d,]+)?$/);
    expect(line.period).toBe('5 years');
    expect(line.chips.map((c) => c.label)).toEqual(['Developer day', 'Key-user day', 'Period', 'Releases']);
  });

  test('stored figures that price all four win, and say whether they are typical', () => {
    const seed = initialCostAssumptions();
    const stored = { ...seed, ...typicalPatch(seed, proposals(800)) };
    const line = decideCostLine({ stored, seed, proposals: proposals(1200) });
    expect(line.basis).toBe('stored');
    expect(line.typical).toBe(true);
    // Own figures: the stored ones, unchanged, not completed with typical values.
    const own = { ...stored, typical: undefined, options: stored.options.map((o) => ({ ...o, typical: undefined })) };
    const mine = decideCostLine({ stored: own, seed, proposals: proposals(1200) });
    expect(mine).toMatchObject({ basis: 'stored', typical: false });
    expect(mine.cost).toEqual(line.cost);
  });

  test('no source to size from: nothing is priced, and nothing is invented', () => {
    const line = decideCostLine({ stored: null, seed: initialCostAssumptions(), proposals: proposals(null) });
    expect(line).toMatchObject({ basis: 'none', chips: [], period: null });
    expect(Object.values(line.cost).every((v) => v === null)).toBe(true);
  });
});

test.describe('the reason: asked only when the choice departs from the indication', () => {
  test('the four cases', () => {
    expect(reasonRequired({ option: 'retire', route: null, indicated: 'rebuild', engineRoute: 'rap' })).toBe(true);
    expect(reasonRequired({ option: 'retire', route: null, indicated: 'retire', engineRoute: 'rap' })).toBe(false);
    expect(reasonRequired({ option: 'standard', route: null, indicated: null, engineRoute: 'rap' })).toBe(true);
    expect(reasonRequired({ option: 'rebuild', route: 'rap', indicated: 'rebuild', engineRoute: 'rap' })).toBe(false);
    expect(reasonRequired({ option: 'rebuild', route: 'cap', indicated: 'rebuild', engineRoute: 'rap' })).toBe(true);
    expect(reasonRequired({ option: 'rebuild', route: 'rap', indicated: null, engineRoute: null })).toBe(false);
  });

  test('following an indication records the analysis\' own sentence, said in the dialog', () => {
    const reason = followedIndicationReason('retire', 'Zero executions of Z_X from 2026-01-01 to 2026-10-01 (273 days).');
    expect(reason).toBe('Follows the analysis, which indicates Retire: Zero executions of Z_X from 2026-01-01 to 2026-10-01 (273 days).');
  });

  test('the code a choice records, and the routes a Rebuild may take', () => {
    expect(codeOfChoice('keep', null)).toBe('keep');
    expect(codeOfChoice('rebuild', 'cap')).toBe('cap');
    expect(codeOfChoice('rebuild', 'retire')).toBeNull();
    expect(rebuildRoutes('rap')).toEqual(['rap', 'cap']);
    expect(rebuildRoutes('keyuser')).toEqual(['keyuser', 'rap', 'cap']);
  });
});

test.describe('box B: no box without signals', () => {
  const touch = (gate: StandardTouch['gate']): StandardTouch => ({
    areas: [{ component: 'MM-PUR', objects: ['BAPI_PO_CREATE1', 'EBAN'] }],
    areasNotRecorded: false,
    departures: [{ kind: 'batch-input', label: 'Batch input on a standard transaction', anchors: [{ lineStart: 515, lineEnd: null }], objects: [] }],
    gate,
    sentence: '',
  });
  const offered = touch({ outcome: 'offered', classes: ['C'], signals: [{ cls: 'C', text: 'It drives a standard transaction by batch input.', anchors: [{ lineStart: 475, lineEnd: null }] }] });

  test('shown while the choice is open, Keep or Rebuild; never for Standard or Retire, nor with Retire indicated', () => {
    expect(standardNote(offered, null, 'rebuild')?.head).toBe('SAP standard may fit better than keeping or rebuilding this code.');
    expect(standardNote(offered, 'keep', 'rebuild')?.head).toBe('SAP standard may fit better than keeping this code.');
    expect(standardNote(offered, 'rebuild', 'rebuild')?.head).toBe('SAP standard may fit better than a rebuild.');
    expect(standardNote(offered, 'standard', 'rebuild')).toBeNull();
    expect(standardNote(offered, 'retire', 'rebuild')).toBeNull();
    expect(standardNote(offered, null, 'retire')).toBeNull();
  });

  test('only with signals: not offered, not determined, D alone or nothing read is no box', () => {
    expect(standardNote(null, null, 'rebuild')).toBeNull();
    expect(standardNote(touch({ outcome: 'not-determined', sentence: 'x' }), null, 'rebuild')).toBeNull();
    expect(standardNote(touch({ outcome: 'not-offered', exclusion: 'own-persistence', sentence: 'x', anchors: [] }), null, 'rebuild')).toBeNull();
    expect(standardNote(touch({ outcome: 'offered', classes: ['D'], signals: [{ cls: 'D', text: 'x', anchors: [] }] }), null, 'rebuild')).toBeNull();
  });

  test('says the first sign in plain words, with the lines, and never claims the fit', () => {
    const note = standardNote(offered, null, 'rebuild')!;
    expect(note.sub).toBe('This code calls a standard SAP transaction. We cannot prove the fit.');
    const two = touch({
      outcome: 'offered',
      classes: ['A', 'C'],
      signals: [
        { cls: 'A', text: 'It hooks into or changes a standard process.', anchors: [] },
        { cls: 'C', text: 'It drives a standard transaction by batch input.', anchors: [] },
      ],
    });
    expect(standardNote(two, null, null)?.sub).toBe('This code changes a standard SAP process. And 1 more sign. We cannot prove the fit.');
    expect(note.signs[0]).toEqual({ text: 'It drives a standard transaction by batch input.', lines: ['L475'] });
    expect(note.area).toBe('It works mainly in the SAP area MM-PUR: BAPI_PO_CREATE1, EBAN.');
    const all = [note.head, note.sub, ...note.signs.map((s) => s.text), note.area ?? ''].join(' ');
    expect(all).not.toMatch(/\b(covered|supported|fits)\b/i);
    expect(all).not.toContain('—');
  });
});

test.describe('the one dialog lists what is recorded', () => {
  const base: DecideDialogFacts = {
    account: 'owner@example.invalid',
    option: 'rebuild',
    route: 'rap',
    edition: 'SAP Cloud ERP Private',
    runDate: '24 Nov 2026',
    costBasis: 'typical',
    answers: { total: 3, open: 1 },
    limits: 4,
    reason: '',
    indicated: 'rebuild',
    reasonFollowsIndication: false,
  };

  test('Rebuild: option, route, edition, run, costs, answers and limits', () => {
    expect(decideDialogTitle('rebuild')).toBe('Record: Rebuild?');
    expect(decideDialogLead('owner@example.invalid')).toBe('owner@example.invalid records this decision. A self-declaration by the signed-in account, not an organisational mandate.');
    expect(decideDialogLines(base)).toEqual([
      'Rebuild as On-stack, RAP, for SAP Cloud ERP Private.',
      'Bound to the signed run of 24 Nov 2026.',
      'The costs shown are a simulation on typical assumptions; they are not part of the record.',
      '3 business questions: 2 answered, 1 open. Open ones stay open in the design.',
      '4 limits of the architecture contract stay visible with the decision.',
    ]);
  });

  test('another option: nothing built, the reason, and the departure named', () => {
    const lines = decideDialogLines({ ...base, option: 'retire', route: null, reason: 'The plant closed.', costBasis: 'stored' });
    expect(lines).toEqual([
      'Retire: nothing is built, for SAP Cloud ERP Private.',
      'Bound to the signed run of 24 Nov 2026.',
      'The costs shown come from the figures stored in Economics; their revision is recorded with the decision.',
      'Your reason: “The plant closed.”',
      "Departs from the analysis' indication (Rebuild); the reason is on the record.",
    ]);
    const follows = decideDialogLines({ ...base, option: 'retire', route: null, indicated: 'retire', reason: 'Follows the analysis.', reasonFollowsIndication: true });
    expect(follows[3]).toBe("Follows the analysis' indication. Recorded as the reason: “Follows the analysis.”");
  });

  test('no model is called by it: no provider, no "write the design" in any line', () => {
    for (const option of ['keep', 'rebuild', 'standard', 'retire'] as const) {
      const text = [decideDialogTitle(option), decideDialogLead(null), ...decideDialogLines({ ...base, option, reason: 'x' })].join(' ');
      expect(text).not.toMatch(/Gemini|Google|Anthropic|model|AI-generated|write the design/i);
    }
  });

  test('what follows an option that builds nothing', () => {
    expect(nothingBuiltFollows('retire')[0]).toContain('Nothing is built.');
    expect(nothingBuiltFollows('keep')[0]).toContain('what blocks clean core stays');
  });
});

test.describe('the page: no button without effect, nothing pre-selected, no model call', () => {
  const page = code('components/redesign/RedesignPage.tsx');
  const view = code('components/redesign/DecideView.tsx');

  test('nothing is pre-selected, and the one button records only when a click records something', () => {
    expect(page).toContain('const [choice, setChoice] = useState<DecisionOption | null>(null);');
    expect(page).toMatch(/const recordable = Boolean\(choice\) && canDecide && !reading && !busy && !reasonMissing && !rebuildBlocked && read !== null;/);
    expect(page).toMatch(/data-decide-record=""/);
    expect(page).toMatch(/disabled=\{!recordable\}/);
    // The production bug of 3.5.3: a confirm button whose click only set the address it already had.
    expect(page).not.toContain('window.location.assign');
  });

  test('the options are one radio group; the indication is a tag, not a choice', () => {
    expect(view).toContain('role="radiogroup"');
    expect(view).toContain('role="radio"');
    expect(view).toContain('aria-checked={checked}');
    expect(view).toContain('Indicated by the analysis');
    expect(view).toContain('an indication, not a decision.');
  });

  test('it writes only through the commands route, and calls no model', () => {
    for (const src of [page, view, code('components/redesign/DecideResult.tsx'), code('components/redesign/StandardNoteBox.tsx')]) {
      expect(src).not.toMatch(/setDoc|updateDoc|addDoc|callGemini|\/api\/gemini|fetch\(/);
    }
    expect(page).toContain("command: 'decide'");
    expect(page).toContain("command: 'withdraw-decision'");
    // The result opens Transformation by a plain link; Transformation's own button starts and names the provider.
    expect(page).toContain('href={`${base}/transformation`}');
    expect(page).not.toMatch(/transformation\?generate/);
  });

  test('the demo records nothing and offers no button in its bar', () => {
    const demo = code('components/demo/DemoRedesign.tsx');
    expect(demo).toContain('<DecideView');
    expect(demo).toMatch(/action=\{null\}/);
    expect(demo).not.toMatch(/runProjectCommand|fetch\(/);
  });
});
