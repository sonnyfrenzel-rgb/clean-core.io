import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';
import { decisionOptionsView, type DecisionOptionsSource } from '../lib/decision-option-signals';
import {
  DECISION_OPTIONS,
  DECISION_OPTION_LABELS,
  optionOfArchitecture,
  optionOfCostKind,
} from '../lib/decision-options';
import { TARGET_ARCHITECTURES } from '../lib/project-commands';
import { ARCHITECTURE_OPTION } from '../lib/decision-draft';
import { decisionHeadline } from '../lib/decision-manager';
import { otherEditionLine, type StandardFit } from '../lib/standard-fit';
import type { ProjectDecision } from '../lib/project-decision';
import type { UsageReport } from '../lib/abap/usage-model';

/**
 * ADR-079 — the program decision as four options side by side (owner,
 * 06.10.2026: "The decision Keep / Rebuild / Move to SAP standard / Retire must
 * be captured much better in the Management view").
 *
 * The pure half holds the rules of `lib/decision-option-signals.ts` — one per
 * option, the proposal only when exactly one option has *for*, figures only
 * from the account's Economics, never green — and the vocabulary that ties
 * Design, Economics and the record together. The rendered half chooses Keep in
 * the Management view, the way a reader does, and reads back who chose it.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const FIT: StandardFit = {
  state: 'ready',
  basis: 'signed-run',
  platform: 'private',
  platformLabel: 'Private Edition',
  fits: 11,
  counted: 21,
  percent: 52,
  released: 3,
  successor: 8,
  blocking: 10,
  notSorted: 0,
  retire: 0,
  sentence: '11 of 21 SAP objects this code uses have a released path on Private Edition.',
  coverage: '',
  blockers: [],
  clear: [],
  groups: [],
};

function decisionWith(option: string | null): ProjectDecision {
  return {
    decisionId: 'DEC-1',
    revision: 1,
    status: 'draft',
    summary: '',
    bindings: [
      { key: 'option', label: 'option', revision: option, notDeterminedReason: option ? null : 'none', note: null, provenance: option ? 'confirmed' : 'not-determined' },
    ],
    conditions: [],
    timeline: [],
  } as unknown as ProjectDecision;
}

const src = (over: Partial<DecisionOptionsSource> = {}): DecisionOptionsSource => ({
  subject: 'Z_MM_PO_APPROVAL',
  mode: 'project',
  hasRun: true,
  fit: FIT,
  decision: decisionWith(null),
  status: 'draft',
  confirmation: null,
  signOff: null,
  engineRoute: 'rap',
  usage: null,
  economics: null,
  ...over,
});

const usage = (callCount: number | null, days: number | null): UsageReport =>
  ({
    records: [{ objectName: 'Z_MM_PO_APPROVAL', callCount, source: 'scmon' }],
    source: 'scmon',
    importedAt: '2026-09-10',
    warnings: [],
    ...(days === null ? {} : { window: { from: '2025-08-01', to: '2026-08-31', days } }),
  }) as UsageReport;

test.describe('ADR-079 — one vocabulary for the four options', () => {
  test('four options, in one order, with the owner’s words; Do nothing is Keep', () => {
    expect(DECISION_OPTIONS).toEqual(['keep', 'rebuild', 'standard', 'retire']);
    expect(DECISION_OPTIONS.map((o) => DECISION_OPTION_LABELS[o])).toEqual(['Keep', 'Rebuild', 'Move to SAP standard', 'Retire']);
    expect(optionOfCostKind('do-nothing')).toBe('keep');
    expect(optionOfCostKind('keep')).toBe('keep');
    for (const code of ['rap', 'cap', 'integration', 'event']) expect(optionOfArchitecture(code)).toBe('rebuild');
  });

  test('all four can be recorded: the sign-off accepts keep and standard, and the record names them', () => {
    expect(TARGET_ARCHITECTURES).toEqual(expect.arrayContaining(['keep', 'standard', 'retire', 'rap', 'cap']));
    expect(ARCHITECTURE_OPTION.keep).toEqual({ label: 'Keep', kind: 'keep' });
    expect(ARCHITECTURE_OPTION.standard).toEqual({ label: 'Move to SAP standard', kind: 'standard' });
    expect(decisionHeadline('keep · Keep')).toBe('Keep');
    expect(decisionHeadline('standard · Move to SAP standard')).toBe('Move to SAP standard');
  });

  test('labels a signed pack already carries are kept byte for byte — only added to', () => {
    const pack = read('lib/audit-pack.ts');
    for (const line of ["rap: 'In-App ABAP Cloud (RAP)'", "retire: 'Retire / Decommission'", "keep: 'Keep'", "standard: 'Move to SAP standard'"]) {
      expect(pack).toContain(line);
    }
    expect(ARCHITECTURE_OPTION.retire.label).toBe('Retire / Decommission');
  });
});

test.describe('ADR-079 — what the evidence says per option', () => {
  test('the four cards stand in order, each with a meaning, a reason and a place', () => {
    const v = decisionOptionsView(src());
    expect(v.question).toBe('Keep, rebuild, move to SAP standard or retire Z_MM_PO_APPROVAL?');
    expect(v.cards.map((c) => c.option)).toEqual(['keep', 'rebuild', 'standard', 'retire']);
    for (const c of v.cards) {
      expect(c.meaning.length).toBeGreaterThan(20);
      expect(c.reason.length).toBeGreaterThan(20);
      expect(c.provenance, `${c.option} is green`).not.toBe('proven');
    }
    expect(v.cards.find((c) => c.option === 'rebuild')?.choice).toBe('design');
    for (const o of ['keep', 'standard', 'retire']) expect(v.cards.find((c) => c.option === o)?.choice).toBe('direct');
  });

  test('Keep speaks against while objects stand in the way, for when none does', () => {
    expect(decisionOptionsView(src()).cards[0]).toMatchObject({ signal: 'against', provenance: 'reconstructed' });
    expect(decisionOptionsView(src()).cards[0].reason).toContain('10 SAP objects stand in the way');
    const clean: StandardFit = { ...FIT, blocking: 0, fits: 21 };
    expect(decisionOptionsView(src({ fit: clean })).cards[0].signal).toBe('for');
    const none: StandardFit = { state: 'none-used', basis: 'signed-run', platform: 'private', sentence: 'x' };
    expect(decisionOptionsView(src({ fit: none })).cards[0].signal).toBe('for');
  });

  test('Rebuild speaks for when SAP names a successor, against when SAP’s code was changed', () => {
    const v = decisionOptionsView(src());
    expect(v.cards[1]).toMatchObject({ signal: 'for' });
    expect(v.cards[1].reason).toContain('8 objects');
    const modified = {
      ...decisionWith(null),
      conditions: [{ id: 'C-1', text: 'x', source: 'contract-limit', status: 'open', statusBasis: 'derived', evidence: 'modification-unreset:3', attestation: null, provenance: 'reconstructed' }],
    } as unknown as ProjectDecision;
    expect(decisionOptionsView(src({ decision: modified })).cards[1]).toMatchObject({ signal: 'against' });
  });

  test('Move to SAP standard is never read from the code', () => {
    expect(decisionOptionsView(src()).cards[2]).toMatchObject({ signal: 'not-determined', provenance: 'not-determined', place: 'business' });
  });

  test('Retire speaks for only on a measured zero over at least 13 months — never "unused" for "not measured"', () => {
    expect(decisionOptionsView(src()).cards[3].signal).toBe('not-determined');
    expect(decisionOptionsView(src({ usage: usage(null, 396) })).cards[3].signal).toBe('not-determined');
    expect(decisionOptionsView(src({ usage: usage(0, 120) })).cards[3].signal).toBe('not-determined');
    expect(decisionOptionsView(src({ usage: usage(0, null) })).cards[3].signal).toBe('not-determined');
    expect(decisionOptionsView(src({ usage: usage(14, 396) })).cards[3]).toMatchObject({ signal: 'against', provenance: 'imported' });
    expect(decisionOptionsView(src({ usage: usage(0, 396) })).cards[3]).toMatchObject({ signal: 'for', provenance: 'imported' });
  });

  test('a count counts only when finite and not negative — a hand-edited report never reads as unused (3.0.6)', () => {
    for (const broken of [Number.NaN, Number.POSITIVE_INFINITY, -3]) {
      const card = decisionOptionsView(src({ usage: usage(broken, 396) })).cards[3];
      expect(card.signal, `count ${broken}`).toBe('not-determined');
      expect(card.reason).toContain('does not count executions');
    }
    // A window that is no number is no window: never "unused for long enough".
    for (const days of [Number.NaN, -400]) {
      expect(decisionOptionsView(src({ usage: usage(0, days) })).cards[3].signal, `window ${days}`).toBe('not-determined');
    }
  });

  test('the proposal is the one option with "for" — and when two have it, the evidence does not decide', () => {
    const one = decisionOptionsView(src());
    expect(one.proposed).toBe('rebuild');
    expect(one.cards.filter((c) => c.proposed).map((c) => c.option)).toEqual(['rebuild']);
    expect(one.proposal).toContain('points to Rebuild');
    const two = decisionOptionsView(src({ usage: usage(0, 396) }));
    expect(two.proposed).toBeNull();
    expect(two.proposal).toBe('The evidence does not decide between Rebuild and Retire — that is your call.');
  });

  test('without a signed run nothing is read, nothing proposed', () => {
    const v = decisionOptionsView(src({ hasRun: false }));
    expect(v.cards.every((c) => c.signal === 'not-determined')).toBe(true);
    expect(v.proposed).toBeNull();
    expect(v.answer).toBe('Not decided yet — the decision needs a signed run first.');
  });
});

test.describe('ADR-079 — where it stands, and who said so', () => {
  test('not decided, chosen with who and when, confirmed as a self-declaration', () => {
    expect(decisionOptionsView(src()).stage).toBe('not-decided');
    const chosen = decisionOptionsView(
      src({ decision: decisionWith('keep · Keep'), signOff: { code: 'keep', by: 'mara@example.invalid', at: '2026-10-06T09:00:00.000Z' } }),
    );
    expect(chosen).toMatchObject({ stage: 'chosen', answer: 'Keep is chosen, not confirmed yet.', who: 'Chosen by mara@example.invalid on 2026-10-06.' });
    expect(chosen.cards.find((c) => c.chosen)?.option).toBe('keep');
    const confirmed = decisionOptionsView(
      src({ decision: decisionWith('keep · Keep'), status: 'confirmed', confirmation: { account: 'mara@example.invalid', at: '2026-10-07T09:00:00.000Z' } }),
    );
    expect(confirmed.stage).toBe('confirmed');
    expect(confirmed.who).toBe('Confirmed by mara@example.invalid on 2026-10-07 — a self-declaration, not a mandate.');
    const moved = decisionOptionsView(src({ decision: decisionWith('keep · Keep'), status: 'confirmed', outdated: true, confirmation: null }));
    expect(moved.stage).toBe('outdated');
    // A Rebuild is named with its route, so the decision card under the answer
    // need not say the answer a second time at a finer grain (ADR-087).
    const rebuild = decisionOptionsView(src({ decision: decisionWith('rap · In-App ABAP Cloud (RAP)') }));
    expect(rebuild.answer).toBe('Rebuild as In-App ABAP Cloud (RAP) is chosen, not confirmed yet.');
    const rebuildDecided = decisionOptionsView(
      src({ decision: decisionWith('rap · In-App ABAP Cloud (RAP)'), status: 'confirmed', confirmation: { account: 'mara@example.invalid', at: '2026-10-07T09:00:00.000Z' } }),
    );
    expect(rebuildDecided.answer).toBe('Decided: Rebuild as In-App ABAP Cloud (RAP).');
  });

  test('without Economics figures, effort and cost are not determined with their reason — never a zero', () => {
    for (const c of decisionOptionsView(src()).cards) {
      expect(c.effort).toMatchObject({ value: null, provenance: 'not-determined' });
      expect(c.cost).toMatchObject({ value: null, provenance: 'not-determined' });
      expect(c.effort.reason).toBe('No figures entered in Economics yet.');
    }
  });

  test('the other edition is said in one line', () => {
    expect(otherEditionLine({ ...FIT, platform: 'public', platformLabel: 'Public Edition', fits: 6, counted: 21, blocking: 15 })).toBe(
      'On Public Edition: 6 of 21 SAP objects have a path to SAP standard, 15 stand in the way.',
    );
    expect(otherEditionLine(null)).toBeNull();
  });

  test('a view, never a record: the module is pure and writes nothing', () => {
    const lib = read('lib/decision-option-signals.ts');
    expect(lib).not.toMatch(/from ['"]react['"]|firebase|fetch\(/);
    const component = read('components/workspace/DecisionOptions.tsx');
    // The one write is the existing sign-off command, bound to the run read.
    expect(component).toContain("command: 'approve-architecture'");
    expect(component).toContain('expectedEvidenceDigest');
    expect(component).not.toMatch(/setDoc|updateDoc|addDoc/);
  });
});

/* ------------------------------------------------------------ rendered */
/* Needs the emulators and a dev server (`npx playwright test` as in CI). */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'DecisionOptions123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SOURCE = `REPORT z_decision_options.
DATA: lt_ekpo TYPE TABLE OF ekpo.
SELECT * FROM ekpo INTO TABLE lt_ekpo.
UPDATE ekpo SET loekz = 'L' WHERE ebeln = '1'.
CALL FUNCTION 'BAPI_PO_CREATE1'.
`;

test.describe('ADR-079 rendered — choosing an option in Management', () => {
  const OWNER = `${unique('decision-options')}@cleancore-test.io`;
  const ID = unique('decision-options');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, OWNER, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Decision', lastName: 'Options', email: OWNER,
      tier: 'pilot', status: 'approved', activatedAt: new Date(),
      // Current terms accepted, or the blocking terms gate covers the page.
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', ID, {
      name: 'Decision options', userId: cred.user.uid, createdAt: new Date(), status: 'analyzed',
      legacyCode: SOURCE, s4Deployment: 'private', activeRunId: 'run-1',
    });
    await adminSetDoc(`projects/${ID}/runs`, 'run-1', {
      runId: 'run-1', userId: cred.user.uid, createdAt: '2026-10-01T10:00:00.000Z', cleanCoreScore: 58,
      rulesetVersion: 'rules-v1.0', analyzerVersion: '2.9.0', sapApiCatalogVersion: 'cat-2026-08',
    });
  });

  async function open(page: Page) {
    await signInViaLanding(page, OWNER, PASSWORD);
    await page.goto(`/project/${ID}?view=management`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-decision-options]')).toBeVisible({ timeout: 90000 });
  }

  test('four cards in order, the question as heading; Keep chosen here names who chose it', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);
    await expect(page.locator('[data-executive-question]')).toHaveText('Keep, rebuild, move to SAP standard or retire Z_DECISION_OPTIONS?');
    const cards = page.locator('[data-decision-option]');
    await expect(cards).toHaveCount(4);
    expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-decision-option')))).toEqual(['keep', 'rebuild', 'standard', 'retire']);
    // Never green: no option reading claims proof.
    await expect(page.locator('[data-decision-options] [data-provenance="proven"]')).toHaveCount(0);
    // Rebuild goes through Design; the other three are chosen here.
    await expect(page.locator('[data-decision-option="rebuild"] [data-option-choose-design]')).toHaveAttribute('href', /\/design/);

    await page.locator('[data-option-choose="keep"]').click();
    const box = page.getByRole('dialog');
    await expect(box).toContainText('self-declaration');
    await box.getByRole('textbox').fill('The program runs fine on Private Edition; we keep it this year.');
    await box.getByRole('button', { name: 'Choose this option' }).click();

    await expect(page.locator('[data-decision-option="keep"][data-option-chosen]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-decision-answer]')).toContainText('Keep is chosen');
    await expect(page.locator('[data-decision-who]')).toContainText(OWNER);
    // Said once (ADR-087): the card under the answer has no headline of its
    // own; its Option row names the choice as the account's.
    await expect(page.locator('[data-decision-card] [data-decision-headline]')).toHaveCount(0);
    await expect(page.locator('[data-decision-card] [data-decision-pillar="option"]')).toContainText('Keep, as chosen by your account.');
    // One way to the amounts, under the four cards.
    await expect(page.locator('[data-options-compare-economics]')).toHaveCount(1);
  });

  test('a level chip in Management explains itself on keyboard focus', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);
    const trigger = page.locator('#standard-fit [data-cc-level-trigger]').first();
    await expect(trigger).toBeVisible({ timeout: 60000 });
    // A real keyboard move: the panel opens on `:focus-visible`, which a
    // programmatic focus after a mouse interaction does not set.
    await trigger.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    const level = await trigger.getAttribute('data-cc-level-trigger');
    await expect(page.locator(`[data-cc-level-explanation="${level}"]`).first()).toBeVisible();
  });

  test('on a phone the four cards stack and nothing scrolls sideways', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await open(page);
    const xs = await page.locator('[data-decision-option]').evaluateAll((els) =>
      [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().x)))],
    );
    expect(xs.length, 'the option cards do not stack on a phone').toBe(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });
});
