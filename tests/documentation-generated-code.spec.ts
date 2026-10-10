import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminGetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';
import { DOCUMENTATION_PACKAGE_FILES, generationPrerequisites, workflowSteps } from '../lib/workflow-steps';
import type { Project } from '../lib/types';

/**
 * Roadmap 3.0.7, "Documentation lean", item 4 — a bug fix.
 *
 * The Documentation stage merged its two Markdown files into `generatedCode`
 * (`addOrUpdateFileInWorkspace`), and `hasGeneratedPackage`
 * (`lib/workflow-steps.ts`) counts any file of a package. So opening
 * Documentation before Transformation wrote a package holding only
 * documentation, and the project then said its code was generated: the
 * Transformation tool marked done, Testing no longer asked for code first.
 *
 * Held here: the page writes no package; a package an earlier build wrote with
 * only those files is not code; and Delivery still adds both files to the
 * bundle from the project's own fields.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PAGE = 'app/(app)/project/[projectId]/documentation/page.tsx';

const docsOnly = JSON.stringify([
  { path: 'docs/process-documentation.md', content: '# Process documentation' },
  { path: 'docs/business-documentation.md', content: '# Business layer' },
]);

const base = (over: Partial<Project>): Project => ({
  id: 'p', name: 'x', userId: 'u', legacyCode: 'REPORT z.', activeRunId: 'r', ...over,
} as unknown as Project);

const transformationState = (project: Project) => workflowSteps(project).find((s) => s.key === 'transformation')!.state;

test.describe('a package of documentation files is not generated code', () => {
  test('a package holding only the documentation files counts as no code', () => {
    const project = base({ generatedCode: docsOnly, solutionDesign: '# design' });
    expect(transformationState(project)).toBe('empty');
    expect(generationPrerequisites(project, 'testing').map((p) => p.id)).toContain('code');
  });

  test('every documentation file is ignored, including the name before UX-169', () => {
    for (const file of DOCUMENTATION_PACKAGE_FILES) {
      const project = base({ generatedCode: JSON.stringify([{ path: file, content: 'x' }]) });
      expect(transformationState(project), file).toBe('empty');
    }
  });

  test('a real package with the documentation files beside it is still code', () => {
    const project = base({
      generatedCode: JSON.stringify([...JSON.parse(docsOnly), { path: 'srv/service.ts', content: 'export {};' }]),
    });
    expect(transformationState(project)).toBe('done');
    // A flat source from before packages counts as it always did.
    expect(transformationState(base({ generatedCode: 'export const ok = true;' }))).toBe('done');
  });

  test('the page no longer merges its files into the package', () => {
    const src = read(PAGE);
    expect(src).not.toContain('addOrUpdateFileInWorkspace');
    expect(src).not.toContain('DOCUMENTATION_WORKSPACE_FILE');
    // The two writes name their fields; neither is the package.
    const docTx = src.slice(src.indexOf('const generateDocumentation = useCallback('), src.indexOf('const autoDocFor = useRef'));
    expect(docTx).toContain("tx.update(projectDoc, { documentation: stored, status: 'documented', businessDocumentation: '', ...cleanup })");
    const bizTx = src.slice(src.indexOf('async function runBusinessGeneration'), src.indexOf('const generateBusinessDocumentation'));
    expect(bizTx).toContain('tx.update(projectDoc, { businessDocumentation: responseText, ...cleanup })');
  });

  test('Delivery still adds both documentation files to the bundle from the project fields', () => {
    const delivery = read('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(delivery).toContain('docs.file(DOCUMENTATION_FILE, formatDocumentationToMarkdown(project.documentation))');
    expect(delivery).toContain('docs.file("business-documentation.md", formatBusinessDocsToMarkdown(project.businessDocumentation))');
  });
});

/* ------------------------------------------------------------------------- *
 * In a browser — needs the web server and the emulators.
 * ------------------------------------------------------------------------- */

test.describe('opening Documentation before Transformation', () => {
  const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const EMAIL = `doc-code-${STAMP}@cleancore-test.io`;
  const PASSWORD = 'DocCode123!';
  const FRESH = `doc-code-fresh-${STAMP}`;
  const OLD_PACKAGE = `doc-code-old-${STAMP}`;
  const RUN_ID = `doc-code-run-${STAMP}`;
  const SOURCE = read('public/starter-examples/Z_MM_PO_APPROVAL.abap').replace(/\r\n/g, '\n');

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Doc', lastName: 'Code', email: EMAIL,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });
    const fingerprint = {
      sha256: sha256Hex(SOURCE), fileName: 'Z_MM_PO_APPROVAL.abap', lineCount: SOURCE.split('\n').length,
      byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
    };
    // Analysed and designed, never transformed: no `generatedCode` at all —
    // and one whose package an earlier build filled with documentation only.
    for (const [id, extra] of [[FRESH, {}], [OLD_PACKAGE, { generatedCode: docsOnly }]] as const) {
      await adminSetDoc('projects', id, {
        name: 'Documentation before Transformation', userId: uid, createdAt: new Date(), status: 'designed',
        legacyCode: SOURCE,
        analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
        cleanCoreScore: 62,
        solutionDesign: '# Target architecture',
        activeRunId: RUN_ID,
        inputFingerprint: fingerprint,
        ...extra,
      });
      const unsignedRun = {
        runId: RUN_ID, projectId: id, userId: uid,
        createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: fingerprint,
      };
      const runHash = recomputeStoredRunHash(unsignedRun);
      await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
        ...unsignedRun, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
      });
    }
  });

  /** No model for this browser: opening the stage writes only what the engine reads. */
  async function modelOff(page: import('@playwright/test').Page) {
    await page.route('**/api/model-stages', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stages: {}, keyAvailable: false, keySource: null }),
    }));
    await page.route('**/api/gemini', (route) => route.abort());
  }

  test('the stored documentation leaves the package alone, and Transformation stays not started', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await modelOff(page);
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${FRESH}/documentation`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-process-document]')).toBeVisible({ timeout: 120000 });
    await expect.poll(async () => String((await adminGetDoc('projects', FRESH))?.documentation ?? ''), { timeout: 60000 })
      .toContain('engine-process-documentation');

    const stored = (await adminGetDoc('projects', FRESH)) as unknown as Project;
    // Before the fix: '[{"path":"docs/process-documentation.md",…}]'.
    expect(stored.generatedCode, 'Documentation wrote into the generated package').toBeUndefined();
    expect(transformationState(stored)).toBe('empty');
    expect(generationPrerequisites(stored, 'testing').map((p) => p.id)).toContain('code');
  });

  test('a package an earlier build filled with documentation only is cleaned, not kept as code', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await modelOff(page);
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${OLD_PACKAGE}/documentation`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-process-document]')).toBeVisible({ timeout: 120000 });
    await expect.poll(async () => String((await adminGetDoc('projects', OLD_PACKAGE))?.documentation ?? ''), { timeout: 60000 })
      .toContain('engine-process-documentation');
    const stored = (await adminGetDoc('projects', OLD_PACKAGE)) as unknown as Project;
    expect(JSON.parse(String(stored.generatedCode))).toEqual([]);
    expect(transformationState(stored)).toBe('empty');
  });
});
