import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { parseAtc } from '../lib/abap/atc-parser';
import type { AtcReport } from '../lib/abap/atc-model';
import { TERMS_VERSION } from '../lib/constants';

/**
 * ATC-Import (roadmap 7.1), the same shape of guard `tests/usage-import-guard.spec.ts`
 * holds for the usage import: a file is parsed, a person sees exactly what
 * would be taken over before anything is stored, and what is stored is what
 * was shown — never a browser-invented structure of a browser-invented size.
 */

const csv = (body: string, name = 'atc.csv') => new File([body], name, { type: 'text/csv' });

test.describe('mandatory columns, and what a missing one means', () => {
  test('no object-name column at all is a hard, clear error', async () => {
    await expect(parseAtc(csv('MESSAGE;PRIORITY\nBad thing;1\n')))
      .rejects.toThrow(/Could not find an object name column/);
  });

  test('no finding-text column at all is a hard, clear error', async () => {
    await expect(parseAtc(csv('OBJECT_NAME;PRIORITY\nZFI_ORDERS;1\n')))
      .rejects.toThrow(/Could not find a finding-text column/);
  });

  test('a row missing either is quarantined by name, with its reason, and never reaches findings', async () => {
    const body =
      'OBJECT_NAME;MESSAGE;PRIORITY\n' +
      'ZOK;Direct table write;1\n' +          // row 2 — kept
      ';No object here;2\n' +                 // row 3 — no object name
      'ZEMPTY_MSG;;3\n';                      // row 4 — no finding text
    const r = await parseAtc(csv(body));
    expect(r.findings.map((f) => f.objectName)).toEqual(['ZOK']);
    expect(r.quarantined).toEqual([
      { row: 3, objectName: '—', reason: 'no object name' },
      { row: 4, objectName: 'ZEMPTY_MSG', reason: 'no finding text' },
    ]);
  });
});

test.describe('priority is read tolerantly, and "unknown" is never "minor"', () => {
  test('numeric SAP priorities (1/2/3) and English/German words all resolve', async () => {
    const body =
      'OBJECT_NAME;MESSAGE;PRIORITY\n' +
      'Z1;a;1\nZ2;b;Warning\nZ3;c;Hinweis\nZ4;d;FEHLER\n';
    const r = await parseAtc(csv(body));
    const by = (n: string) => r.findings.find((f) => f.objectName === n)?.priority;
    expect(by('Z1')).toBe('error');
    expect(by('Z2')).toBe('warning');
    expect(by('Z3')).toBe('info');
    expect(by('Z4')).toBe('error');
  });

  test('a priority column that recognises nothing keeps every row, marked "unknown" — never "info"', async () => {
    const r = await parseAtc(csv('OBJECT_NAME;MESSAGE;PRIORITY\nZFI;Something ATC flagged;9\n'));
    expect(r.findings[0].priority).toBe('unknown');
    expect(r.warnings.join(' ')).toMatch(/1 priority value not recognised.*kept as "unknown"/);
  });

  test('no priority column at all: every finding is "unknown", and the file says so once', async () => {
    const r = await parseAtc(csv('OBJECT_NAME;MESSAGE\nZFI;Something ATC flagged\n'));
    expect(r.findings[0].priority).toBe('unknown');
    expect(r.warnings.join(' ')).toMatch(/No priority column recognised/);
  });
});

test.describe('columns the parser does not recognise are named, not dropped in silence', () => {
  test('an unmapped column is listed in the warnings', async () => {
    const r = await parseAtc(csv('OBJECT_NAME;MESSAGE;PACKAGE\nZFI;a;ZPKG\n'));
    expect(r.warnings.join(' ')).toMatch(/Unmapped columns ignored: PACKAGE/);
  });
});

test.describe('exemption is read only where the export says so, never guessed', () => {
  test('a recognised true/false vocabulary sets the flag; anything else stays undefined', async () => {
    const body = 'OBJECT_NAME;MESSAGE;EXEMPTION\nZA;a;X\nZB;b;\nZC;c;Vielleicht\n';
    const r = await parseAtc(csv(body));
    expect(r.findings.find((f) => f.objectName === 'ZA')?.exempted).toBe(true);
    expect(r.findings.find((f) => f.objectName === 'ZB')?.exempted).toBe(false);
    expect(r.findings.find((f) => f.objectName === 'ZC')?.exempted).toBeUndefined();
  });
});

test.describe('personal data never reaches an AtcFinding', () => {
  test('author, reviewer and last-changed-by columns are read and ignored, not stored', async () => {
    const body = 'OBJECT_NAME;MESSAGE;PRIORITY;AUTHOR;RESPONSIBLE;LAST_CHANGED_BY\nZFI;a;1;M.Mueller;H.Schmidt;A.Weber\n';
    const r = await parseAtc(csv(body));
    expect(r.warnings.join(' ')).toMatch(/Unmapped columns ignored: AUTHOR, RESPONSIBLE, LAST_CHANGED_BY/);
    // `exempted` stays absent entirely — the row named no exemption column,
    // so there is nothing to report, not a false "not exempted".
    const finding = r.findings[0] as unknown as Record<string, unknown>;
    expect(Object.keys(finding).sort()).toEqual(['message', 'objectName', 'priority'].sort());
    expect(JSON.stringify(finding)).not.toMatch(/Mueller|Schmidt|Weber/);
  });
});

test.describe('the rest of the contract', () => {
  test('the report holds no undefined anywhere — Firestore would refuse the save', async () => {
    const r = await parseAtc(csv('OBJECT_NAME,MESSAGE\nZONE,a\nZTWO,b\n'));
    const walk = (v: unknown, where: string): string[] =>
      v === undefined ? [where]
        : Array.isArray(v) ? v.flatMap((x, i) => walk(x, `${where}[${i}]`))
          : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => walk(x, `${where}.${k}`))
            : [];
    expect(walk(r, 'report')).toEqual([]);
  });

  test('object names are normalized to upper case, the same join key the engine uses', async () => {
    const r = await parseAtc(csv('OBJECT_NAME,MESSAGE\nzfi_orders,a\n'));
    expect(r.findings[0].objectName).toBe('ZFI_ORDERS');
  });

  test('source is always "atc"', async () => {
    const r: AtcReport = await parseAtc(csv('OBJECT_NAME,MESSAGE\nZFI,a\n'));
    expect(r.source).toBe('atc');
  });
});

// ── The whole path: declare, preview, confirm, stored ────────────────────────

const EMU = `http://127.0.0.1:8080/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;

type RestValue = {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  nullValue?: null;
  mapValue?: { fields?: Record<string, RestValue> };
  arrayValue?: { values?: RestValue[] };
};

function decode(v: RestValue | undefined): unknown {
  if (v == null) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if ('nullValue' in v) return null;
  if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  if (v.arrayValue) return (v.arrayValue.values || []).map(decode);
  return undefined;
}

test.describe('the analyze page stores nothing before confirmation, and then the right thing', () => {
  const EMAIL = `atcimport-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'AtcImport123!';
  const PROJECT_ID = `atcimport-${Date.now()}`;

  const storedAtc = async (): Promise<AtcReport | undefined> => {
    const res = await fetch(`${EMU}/projects/${PROJECT_ID}`, { headers: { Authorization: 'Bearer owner' } });
    const json = (await res.json()) as { fields?: Record<string, RestValue> };
    return decode(json.fields?.atcReport) as AtcReport | undefined;
  };

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const uid = (await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD)).user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Atc', lastName: 'Import', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'ATC import fixture', userId: uid, createdAt: new Date(), status: 'uploaded',
      legacyCode: 'REPORT z_atc.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
    });
  });

  test('declare nothing, preview, confirm — and the stored report is the one that was shown', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);
    await page.goto(`/project/${PROJECT_ID}/analyze`, { waitUntil: 'domcontentloaded' });

    await page.locator('[data-atc-file]').setInputFiles({
      name: 'atc.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'OBJECT_NAME;MESSAGE;PRIORITY\n' +
        'ZFI_ORDERS;Direct write to standard table;1\n' +
        'ZMM_STOCK;Legacy BDC call;2\n' +
        ';No object name here;1\n',
      ),
    });

    const preview = page.locator('[data-atc-preview]');
    await expect(preview).toBeVisible({ timeout: 30000 });
    await expect(preview).toContainText('2 findings would be imported');
    await expect(page.locator('[data-atc-quarantine]')).toContainText('no object name');

    // Nothing stored yet.
    expect(await storedAtc()).toBeUndefined();

    await page.locator('[data-atc-confirm]').click();
    await expect(page.locator('[data-atc-imported]')).toContainText('2 findings');

    await expect.poll(async () => (await storedAtc()) !== undefined, { timeout: 15000 }).toBe(true);
    const stored = (await storedAtc())!;
    expect(stored.source).toBe('atc');
    expect(stored.findings.map((f) => f.objectName).sort()).toEqual(['ZFI_ORDERS', 'ZMM_STOCK']);
    expect(stored.quarantined).toEqual([{ row: 4, objectName: '—', reason: 'no object name' }]);
    // This fixture project never ran a full analysis (no `analysis`/
    // `activeRunId`), and the comparison panel sits in the section of the page
    // that depends on one existing — the same gate `UsageRiskMatrixFor` sits
    // behind. That is a fact about the page's layout, not about the import;
    // the next test seeds a completed analysis and checks the panel itself.
  });
});

test.describe('the comparison panel, once an analysis exists', () => {
  const EMAIL = `atccompare-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'AtcCompare123!';
  const PROJECT_ID = `atccompare-${Date.now()}`;

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const uid = (await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD)).user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Atc', lastName: 'Compare', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, termsVersionAccepted: TERMS_VERSION, createdAt: new Date(),
    });
    // A completed analysis (mirrors tests/claims-honesty-guard.spec.ts's
    // seedProject): `SELECT * FROM vbak` reliably produces a real
    // standard-table-read evidence finding on VBAK, independent of any model
    // call — `evidenceReport` is computed client-side from `legacyCode` alone.
    // The ATC report is seeded directly, the way the server would have stored
    // it after a real upload, so this test exercises the render path rather
    // than the upload UI a second time.
    const atcReport: AtcReport = {
      findings: [
        { objectName: 'VBAK', message: 'Direct read from standard table VBAK', priority: 'warning' },
        { objectName: 'ZCUSTOM_OBJ', message: 'Unreleased API used', priority: 'error' },
      ],
      source: 'atc',
      importedAt: new Date().toISOString(),
      warnings: [],
    };
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'ATC comparison fixture',
      userId: uid,
      createdAt: new Date(),
      status: 'analyzed',
      legacyCode: 'REPORT z_atc_compare.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
      analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
      cleanCoreScore: 62,
      extensibilityRoute: 'In-App (ABAP Cloud)',
      originalRecommendation: 'In-App (ABAP Cloud)',
      activeRunId: `${PROJECT_ID}-run`,
      atcReport,
    });
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, `${PROJECT_ID}-run`, {
      runId: `${PROJECT_ID}-run`,
      projectId: PROJECT_ID,
      userId: uid,
      createdAt: new Date().toISOString(),
      status: 'completed',
      cleanCoreScore: 62,
      extensibilityRoute: 'In-App (ABAP Cloud)',
    });
  });

  test('shows both a "both" and an "atc-only" object, each with the honest wording — never merged, never a verdict', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);
    await page.goto(`/project/${PROJECT_ID}/analyze`, { waitUntil: 'domcontentloaded' });

    const panel = page.locator('[data-atc-findings-panel]');
    await expect(panel).toBeVisible({ timeout: 30000 });

    // VBAK: ATC and the engine both name it — 'both', never combined into one count.
    await expect(panel.locator('[data-atc-row="VBAK"]')).toContainText('1 ATC');
    await expect(panel.locator('[data-atc-row="VBAK"]')).toContainText('engine');
    await page.locator('[data-atc-row="VBAK"]').click();
    await expect(panel).toContainText('Direct read from standard table VBAK');
    await expect(panel).toContainText('Reported by ATC');
    await expect(panel).toContainText('Detected by the engine');

    // ZCUSTOM_OBJ: ATC only — the engine column says so without accusing the engine of missing anything.
    await page.locator('[data-atc-row="ZCUSTOM_OBJ"]').click();
    await expect(panel).toContainText('Unreleased API used');
    await expect(panel).toContainText('Not a statement that the engine is wrong');
  });
});
