/**
 * The rendered half of the AB-0 harness (plan
 * `docs/design/analyze-business-first-plan.md` §4.1): one seeded project and
 * the pages the layout guard measures, shared by the guard's files, one per
 * viewport group, so the shard plan can put them on different shards.
 *
 * Every state is measured and attached to the test (overlaps, clipping,
 * focus-out, sideways scroll, first-screen counts). A state fails on a finding
 * once it is in `ENFORCED`, which the package that rebuilds it fills: 3, 7 and
 * 17 with AB-2 (here), 1, 2 and 18 with AB-3.
 */
import fs from 'fs';
import { expect, type Page } from './test';
import { adminSetDoc } from './admin-seed';
import { seedStageProject, signInThroughForm, type SeededProject } from './seed-project';
import { examplePath } from './starter-example-files';
import { COACH_MARK_IDS, COACH_MARK_STORAGE_KEY } from '../../lib/coach-marks';
import { layoutClean, layoutLine, measureLayout, type LayoutReport } from './overlap';
import { countFirstScreen, type FirstScreenCount } from './first-screen-count';

export const VIEWPORT_GROUPS = {
  wide: [
    ['1920x1080', 1920, 1080],
    ['1440x900', 1440, 900],
    ['1280x800', 1280, 800],
  ],
  narrow: [
    ['1024x768', 1024, 768],
    ['768x1024', 768, 1024],
    ['phone', 390, 844],
  ],
} as const;

/**
 * The pages, named after the mockup state they stand for. Since AB-2 the
 * project opens in Analyze, Business (ADR-111): state 3 is its map page with
 * the names ready, state 7 the same page with a step's code open beside the
 * map (`#L42` opens the panel as a click on the step does), state 17 a return
 * visit (no `?first=1`, no banner, no hub). `analyze` is today's score page,
 * Analyze's IT view until AB-9 (state 12).
 */
export const LAYOUT_STATES = [
  { key: 'business', mockup: '03', path: (id: string) => `/project/${id}/analyze?view=business`, ready: '[data-analyze-business="ready"] [data-workspace-process="ready"]' },
  { key: 'code', mockup: '07', path: (id: string) => `/project/${id}/analyze?view=business#L42`, ready: '[data-analyze-code-panel]' },
  { key: 'return', mockup: '17', path: (id: string) => `/project/${id}`, ready: '[data-analyze-business="ready"] [data-workspace-process="ready"]' },
  { key: 'analyze', mockup: '12', path: (id: string) => `/project/${id}/analyze?view=it`, ready: '[data-stage-title]' },
] as const;

/**
 * States whose findings fail the guard, by mockup number: 3, 7 and 17 since
 * AB-2 (plan §4.1); AB-3 adds 1, 2 and 18. State 12 (IT) stays report-only
 * until AB-9 rebuilds it.
 */
export const ENFORCED: readonly string[] = ['03', '07', '17'];

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function idToken(email: string, password: string): Promise<string> {
  const res = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) },
  );
  return ((await res.json()) as { idToken: string }).idToken;
}

/** The PO approval example with a signed run: the project every state of the mockup shows. */
export async function seedLayoutProject(prefix: string): Promise<SeededProject & { po: string }> {
  const account = await seedStageProject({ prefix, acceptTerms: true });
  const token = await idToken(account.email, account.password);
  const po = `${account.projectId}-po`;
  const source = fs.readFileSync(examplePath('Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
  await adminSetDoc('projects', po, { name: 'Z_MM_PO_APPROVAL', userId: account.uid, createdAt: new Date(), status: 'created', legacyCode: source });
  const res = await fetch(`${BASE}/api/runs/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: po, s4Deployment: 'private', analysis: '', uploadedFileName: 'Z_MM_PO_APPROVAL.abap' }),
  });
  expect(res.ok, `the run of ${po} was not signed: ${res.status}`).toBe(true);
  return { ...account, po };
}

export interface LayoutMeasurement {
  name: string;
  report: LayoutReport;
  count: FirstScreenCount;
  errors: string[];
}

/** Signs in, opens each state at each viewport, measures it. The tips are dismissed: a tip is measured by its own spec. */
export async function measureStates(
  page: Page,
  seeded: SeededProject & { po: string },
  viewports: readonly (readonly [string, number, number])[],
): Promise<LayoutMeasurement[]> {
  await page.addInitScript(
    ([key, ids]) => window.localStorage.setItem(key as string, JSON.stringify(ids)),
    [COACH_MARK_STORAGE_KEY, [...COACH_MARK_IDS]] as const,
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signInThroughForm(page, seeded);
  const out: LayoutMeasurement[] = [];
  for (const state of LAYOUT_STATES) {
    for (const [vn, width, height] of viewports) {
      await page.setViewportSize({ width, height });
      errors.length = 0;
      await page.goto(state.path(seeded.po), { waitUntil: 'domcontentloaded' });
      await expect(page.locator(state.ready).first()).toBeVisible({ timeout: 90_000 });
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
      await page.evaluate(() => window.scrollTo(0, 0));
      const report = await measureLayout(page);
      const count = await countFirstScreen(page);
      out.push({ name: `${state.mockup}-${state.key}@${vn}`, report, count, errors: [...errors] });
    }
  }
  return out;
}

/** One line per state for the attachment, and the findings of the enforced states. */
export function summarise(measured: LayoutMeasurement[]): { text: string; failing: string[] } {
  const lines = measured.map(
    (m) => `${layoutLine(m.name, m.report)} actions=${m.count.actions} shell=${m.count.shellActions} primary=${m.count.primary} words=${m.count.words} errs=${m.errors.length}`,
  );
  const details = measured.flatMap((m) => [...m.report.overlaps, ...m.report.clipped, ...m.report.focusOut.map((f) => `focus out: ${f}`)].map((f) => `${m.name}: ${f}`));
  const failing = measured
    .filter((m) => ENFORCED.some((mockup) => m.name.startsWith(`${mockup}-`)))
    .filter((m) => !layoutClean(m.report) || m.errors.length > 0)
    .map((m) => layoutLine(m.name, m.report));
  return { text: [...lines, '', ...details].join('\n'), failing };
}
