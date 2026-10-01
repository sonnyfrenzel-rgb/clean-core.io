/**
 * One populated project and the account that owns it — the fixture every
 * rendered walk through the seven stages needs.
 *
 * Lifted out of `tests/workflow-style-guard.spec.ts` (Block D, D.2) so the
 * rendered design guard (`tests/design-rendered-guard.spec.ts`) walks the same
 * project the stage-title comparison walks: populated enough that no stage
 * renders an empty state, because an empty state has a different header and a
 * different page, and a measurement of it would be vacuous.
 *
 * Three options, all off by default so the stage-title spec seeds exactly what it
 * always seeded:
 *
 *   - `admin` — `isAdmin`, the `admin` custom claim and the workspace switch
 *     (`workspaceShell`), which is what `/project/[id]` and `/admin/workspace`
 *     need today (`lib/workspace-shell.ts`: flag *and* administrator).
 *   - `acceptTerms` — the account accepted the current `TERMS_VERSION`, stored
 *     the way `recordConsent` stores it. Without it every signed-in page carries
 *     the Terms re-accept card, and a measurement of the page measures the card.
 *   - `rich` — the fuller project `tests/capture-screens.spec.ts` photographs:
 *     an analysis with gaps and a plan, a worklist, a real report as source,
 *     generated files, passed *and* failed tests. The stage-title fixture is
 *     enough for a header; a walk that measures whole pages needs the rows,
 *     chips and states a used project shows, or it measures empty cards.
 */
import type { Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetCustomClaim, adminSetDoc } from './admin-seed';
import firebaseConfig from '../../firebase-config.json';
import { TERMS_VERSION } from '../../lib/constants';
import { archivedTermsSha256 } from '../../lib/terms-versions';

export interface SeededProject {
  email: string;
  password: string;
  uid: string;
  projectId: string;
  runId: string;
}

export interface SeedOptions {
  /** Prefix of the address and the ids, so a leftover document says which spec wrote it. */
  prefix: string;
  password?: string;
  admin?: boolean;
  acceptTerms?: boolean;
  rich?: boolean;
}

/** A realistic analysis payload — the shape the stages parse (from capture-screens). */
const RICH_ANALYSIS = JSON.stringify({
  cleanCoreScore: 62,
  extensibilityRouting: 'Side-by-Side (SAP BTP)',
  standardFit: {
    potential: 'Medium',
    targetStandardProcess: 'SAP S/4HANA Sales — Credit Management (FSCM)',
    rationale:
      'Most of the custom credit check duplicates Advanced Credit Management. The residual scoring rule has no standard equivalent and belongs side-by-side on BAIP.',
  },
  gaps: [
    { title: 'Custom credit scoring rule', detail: 'No released equivalent; candidate for a BTP microservice.' },
    { title: 'Direct VBAK/VBAP reads', detail: 'Re-point to released CDS views.' },
  ],
  plainEnglishActionPlan: [
    'Confirm with the business whether SAP FSCM covers the credit case.',
    'Re-point the three direct table reads to released views.',
    'Move the residual scoring rule side-by-side.',
  ],
});

const RICH_WORKLIST = [
  { id: 'w1', title: 'Re-point VBAK read to I_SalesDocument', status: 'open', severity: 'High' },
  { id: 'w2', title: 'Re-point VBAP read to I_SalesDocumentItem', status: 'open', severity: 'High' },
  { id: 'w3', title: 'Credit scoring rule — architect decision', status: 'open', severity: 'Medium' },
];

const RICH_LEGACY = `REPORT zcredit_check.
DATA: ls_order TYPE vbak,
      lt_items TYPE STANDARD TABLE OF vbap.

SELECT SINGLE * FROM vbak INTO ls_order WHERE vbeln = p_vbeln.
SELECT * FROM vbap INTO TABLE lt_items WHERE vbeln = p_vbeln.

CALL FUNCTION 'CREDIT_LIMIT_CHECK'
  EXPORTING kunnr = ls_order-kunnr.

WRITE: / 'Credit check complete.'.
`;

function richProject(): Record<string, unknown> {
  return {
    name: 'ZCREDIT_CHECK — Credit Management',
    legacyCode: RICH_LEGACY,
    analysis: RICH_ANALYSIS,
    complexityScore: 48,
    criticalityScore: 71,
    extensibilityRoute: 'Side-by-Side (SAP BTP)',
    s4Deployment: 'private',
    worklist: RICH_WORKLIST,
    generatedCode: JSON.stringify({
      'srv/credit-check.ts': 'export async function checkCredit(customerId: string) {\n  return customerId.length > 0;\n}\n',
      'db/schema.cds': 'entity CreditDecision { key ID : UUID; customer : String; }\n',
    }),
    testCases: [
      { id: 't1', name: 'Credit limit within bounds', category: 'Unit', status: 'Passed' },
      { id: 't2', name: 'Credit limit exceeded', category: 'Unit', status: 'Passed' },
      { id: 't3', name: 'Missing customer master', category: 'Edge', status: 'Failed' },
    ],
    documentation: '# Credit Check — Solution Blueprint\n\n## Level 1 — Business context\n\nThe custom credit check runs before order confirmation.\n',
  };
}

export async function seedStageProject(options: SeedOptions): Promise<SeededProject> {
  const { prefix, admin = false, acceptTerms = false, rich = false } = options;
  const password = options.password ?? 'StageStyle123!';
  // `fullyParallel` runs a `beforeAll` once per worker, at the same millisecond:
  // a timestamp alone collides with `auth/email-already-in-use`.
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${prefix}-${tag}@cleancore-test.io`;
  const projectId = `${prefix}-${tag}`;
  const runId = `${prefix}-run-${tag}`;

  // Look for the DEFAULT app rather than "any app", and hand it to getAuth
  // explicitly. `if (!getApps().length) initializeApp(...)` followed by a bare
  // `getAuth()` fails with "No Firebase App '[DEFAULT]' has been created" when
  // an earlier spec in the same worker left a *named* app in the registry: the
  // list is non-empty, so initialisation is skipped, and the default the
  // argument-less getAuth() looks for was never created. It only shows up when
  // a spec runs late in a full suite, which is the worst way to find out.
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch { /* already connected */ }

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  const consent: Record<string, unknown> = {};
  if (acceptTerms) {
    const acceptedAt = new Date();
    await adminSetDoc('consent_events', `${prefix}-consent-${uid}`, {
      uid, userId: uid, email,
      termsVersion: TERMS_VERSION, privacyVersion: TERMS_VERSION,
      contentSha256: archivedTermsSha256(TERMS_VERSION),
      locale: null, source: 'api/consent', createdAt: acceptedAt,
    });
    consent.termsVersionAccepted = TERMS_VERSION;
    consent.termsAcceptedAt = acceptedAt;
  }
  if (admin) await adminSetCustomClaim(uid, { admin: true });

  await adminSetDoc('users', uid, {
    firstName: 'Stage', lastName: 'Style', email,
    tier: 'pilot', status: 'approved',
    transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    ...(admin ? { isAdmin: true, workspaceShell: true } : {}),
    ...consent,
  });

  // Populated enough that no stage renders an empty state.
  await adminSetDoc('projects', projectId, {
    name: 'Stage style fixture',
    userId: uid,
    createdAt: new Date(),
    status: 'documented',
    legacyCode: 'REPORT z_style.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
    analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
    cleanCoreScore: 62,
    solutionDesign: '# Target architecture\n\nSide-by-side on BAIP.\n',
    generatedCode: 'export const ok = true;\n',
    testCases: [{ id: 't1', name: 'Case', category: 'Unit', status: 'Passed' }],
    documentation: '# Blueprint\n\nLevel 1.\n',
    activeRunId: runId,
    ...(rich ? richProject() : {}),
  });

  await adminSetDoc(`projects/${projectId}/runs`, runId, {
    runId, projectId, userId: uid,
    createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
    ...(rich
      ? { extensibilityRoute: 'Side-by-Side (SAP BTP)', analysis: RICH_ANALYSIS, worklist: RICH_WORKLIST, legacyCode: RICH_LEGACY }
      : {}),
  });

  return { email, password, uid, projectId, runId };
}

/**
 * Signs in through the real access dialog on the landing page and returns once
 * the dialog has sent the account on (`LandingModals`: to `/dashboard` unless a
 * `next` says otherwise) — a condition, not a pause, so a fast production build
 * and a compiling dev server both wait exactly as long as they need.
 */
export async function signInThroughForm(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', account.email);
  await page.fill('input[type="password"]', account.password);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForURL((url) => url.pathname.startsWith('/dashboard'), { timeout: 90000 });
}
