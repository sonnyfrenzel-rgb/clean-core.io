import { test, expect } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-applet-config.json';
import { parseUsage, parseUsageDate } from '../lib/abap/usage-parser';
import { joinUsageWithEvidence } from '../lib/abap/usage-join';
import type { UsageReport } from '../lib/abap/usage-model';

/**
 * A usage import that can be believed (roadmap E03-F02, CR-24).
 *
 * Measured before the fix, one German SCMON line:
 *
 *   ZSD_ORDERS;-3;05.04.2026
 *
 * came in as 3 May with -3 calls. `new Date('05.04.2026')` reads month first,
 * which makes it 4 May, and `toISOString()` then subtracts the hour to UTC and
 * lands on the 3rd. The negative count was taken over as a measurement. The
 * "measurement period" was the span between the first and last execution, so a
 * six-week export turned a year-end program with zero calls into a retirement
 * candidate. And the whole report was never saved: it carried `undefined`
 * fields, which the Firestore client refuses, and the refusal was only logged.
 */

const csv = (body: string, name = 'usage.csv') => new File([body], name, { type: 'text/csv' });
const evidence = (names: string[]) =>
  ({ findings: names.map((objectName, i) => ({ id: `f${i}`, objectName, severity: 'Medium', kind: 'direct-table-access' })) }) as never;
const ROUTE = {} as never;
const TODAY = '2026-09-11';

test.describe('dates are read as declared, never guessed', () => {
  test('de-DE: 05.04.2026 is 5 April — the acceptance, word for word', async () => {
    expect(parseUsageDate('05.04.2026', 'de-DE')).toEqual({ ok: true, value: '2026-04-05' });
    const report = await parseUsage(csv('OBJECT_NAME;CALLS;LAST_USED\nZSD_ORDERS;12;05.04.2026\n'), {
      dateLocale: 'de-DE', today: TODAY,
    });
    expect(report.records[0].lastUsed).toBe('2026-04-05');
  });

  test('the other declared orders, and the two forms that need no declaration', () => {
    expect(parseUsageDate('04/05/2026', 'en-US')).toEqual({ ok: true, value: '2026-04-05' });
    expect(parseUsageDate('05/04/2026', 'en-GB')).toEqual({ ok: true, value: '2026-04-05' });
    expect(parseUsageDate('2026-04-05')).toEqual({ ok: true, value: '2026-04-05' });
    expect(parseUsageDate('2026-04-05T23:30:00+02:00')).toEqual({ ok: true, value: '2026-04-05' });
    expect(parseUsageDate('20260405')).toEqual({ ok: true, value: '2026-04-05' });
  });

  test('an undeclared, impossible or two-digit-year date is refused with a reason', () => {
    expect(parseUsageDate('05.04.2026')).toMatchObject({ ok: false, reason: expect.stringMatching(/declare the export's date format/) });
    expect(parseUsageDate('31.02.2026', 'de-DE')).toMatchObject({ ok: false });
    expect(parseUsageDate('05.04.26', 'de-DE')).toMatchObject({ ok: false, reason: expect.stringMatching(/two-digit year/) });
    expect(parseUsageDate('05.04.2026', 'iso')).toMatchObject({ ok: false });
    expect(parseUsageDate('next Tuesday', 'de-DE')).toMatchObject({ ok: false });
    expect(parseUsageDate('')).toBeNull();
  });

  test('the reader never touches the Date parser', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib/abap/usage-parser.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // `new Date(someString)` is where 5 April became 3 May.
    expect(src).not.toMatch(/new Date\(\s*(str|raw|s|text|value)\s*\)/);
  });
});

test.describe('bad rows are quarantined, not taken over', () => {
  const BODY =
    'OBJECT_NAME;CALLS;LAST_USED\n' +
    'ZOK;7;01.06.2026\n' +      // row 2
    'ZNEG;-3;01.06.2026\n' +    // row 3
    'ZIMPOSSIBLE;5;31.02.2026\n' + // row 4
    ';9;01.06.2026\n' +         // row 5 — no object name
    'ZFUTURE;1;01.12.2026\n' +  // row 6 — after the import date
    'ZEMPTY;;01.06.2026\n' +    // row 7 — no count: unknown, not zero, not rejected
    'ZTEXT;n/a;01.06.2026\n';   // row 8 — unreadable count: unknown, with a warning

  test('each rejection names its row and its reason, and none reaches the records', async () => {
    const r = await parseUsage(csv(BODY), { dateLocale: 'de-DE', today: TODAY });
    expect(r.records.map((x) => x.objectName).sort()).toEqual(['ZEMPTY', 'ZOK', 'ZTEXT']);
    expect(r.quarantined).toEqual([
      { row: 3, objectName: 'ZNEG', reason: 'negative call count (-3)' },
      { row: 4, objectName: 'ZIMPOSSIBLE', reason: expect.stringMatching(/31\.02\.2026/) },
      { row: 5, objectName: '—', reason: 'no object name' },
      { row: 6, objectName: 'ZFUTURE', reason: expect.stringMatching(/after the import date/) },
    ]);
  });

  test('an empty count stays unknown and a measured zero stays zero', async () => {
    const r = await parseUsage(csv('OBJECT_NAME;CALLS\nZEMPTY;\nZZERO;0\n'), { today: TODAY });
    expect(r.records.find((x) => x.objectName === 'ZEMPTY')?.callCount).toBeNull();
    expect(r.records.find((x) => x.objectName === 'ZZERO')?.callCount).toBe(0);
    expect(r.quarantined).toEqual([]);
  });

  test('an unreadable count is unknown, and the import says how many', async () => {
    const r = await parseUsage(csv(BODY), { dateLocale: 'de-DE', today: TODAY });
    expect(r.records.find((x) => x.objectName === 'ZTEXT')?.callCount).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/1 call count could not be read/);
  });
});

test.describe('the monitoring window is declared, and decides what a zero means', () => {
  const BODY = 'OBJECT_NAME;CALLS;LAST_USED\nZYEAR_END;0;\nZDAILY;900;20.04.2026\nZWEEKLY;40;10.03.2026\n';

  test('it is kept apart from the span the executions show', async () => {
    const r = await parseUsage(csv(BODY), { dateLocale: 'de-DE', today: TODAY, window: { from: '2026-02-01', to: '2026-04-30' } });
    expect(r.window).toEqual({ from: '2026-02-01', to: '2026-04-30', days: 89 });
    expect(r.observedFrom).toBe('2026-03-10');
    expect(r.observedTo).toBe('2026-04-20');
    // The old names meant "observed" while reading like "declared". New reports do not carry them.
    expect(r.measuredFrom).toBeUndefined();
    expect(r.measuredTo).toBeUndefined();
  });

  test('a short window warns, and no zero in it becomes a retirement candidate', async () => {
    const r = await parseUsage(csv(BODY), { dateLocale: 'de-DE', today: TODAY, window: { from: '2026-02-01', to: '2026-04-30' } });
    expect(r.warnings.join(' ')).toMatch(/89 days — less than 13 months, and no year-end/);
    const row = joinUsageWithEvidence(r, evidence(['ZYEAR_END']), ROUTE).find((x) => x.objectName === 'ZYEAR_END')!;
    expect(row.usage).toBe('unobserved');
    expect(row.quadrant).not.toBe('retire-candidate');
  });

  test('no declared window: the same, with its own warning', async () => {
    const r = await parseUsage(csv(BODY), { dateLocale: 'de-DE', today: TODAY });
    expect(r.window).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/No monitoring window was declared/);
    const row = joinUsageWithEvidence(r, evidence(['ZYEAR_END']), ROUTE).find((x) => x.objectName === 'ZYEAR_END')!;
    expect(row.quadrant).not.toBe('retire-candidate');
  });

  test('over 13 months, a measured zero is still evidence of disuse', async () => {
    const r = await parseUsage(csv(BODY), { dateLocale: 'de-DE', today: TODAY, window: { from: '2025-03-01', to: '2026-04-30' } });
    const row = joinUsageWithEvidence(r, evidence(['ZYEAR_END']), ROUTE).find((x) => x.objectName === 'ZYEAR_END')!;
    expect(row.usage).toBe('dormant');
    expect(row.quadrant).toBe('retire-candidate');
  });

  test('a window that cannot be true is refused before anything is read', async () => {
    await expect(parseUsage(csv(BODY), { window: { from: '2026-05-01', to: '2026-04-01' }, today: TODAY }))
      .rejects.toThrow(/ends .* before it starts/);
    await expect(parseUsage(csv(BODY), { window: { from: '2026-01-01', to: '2026-12-31' }, today: TODAY }))
      .rejects.toThrow(/ends in the future/);
  });

  test('a last use after the declared end is quarantined', async () => {
    const r = await parseUsage(csv(BODY), { dateLocale: 'de-DE', today: TODAY, window: { from: '2026-02-01', to: '2026-04-15' } });
    expect(r.quarantined).toEqual([
      { row: 3, objectName: 'ZDAILY', reason: 'last use 2026-04-20 lies after the declared window end 2026-04-15' },
    ]);
  });
});

test.describe('the rest of the contract', () => {
  test('counts from different sources are never summed', () => {
    const mixed = {
      records: [
        { objectName: 'ZX', callCount: 5, source: 'scmon' },
        { objectName: 'ZX', callCount: 50, source: 'st03n' },
      ],
      source: 'scmon', importedAt: '', warnings: [],
    } as UsageReport;
    expect(() => joinUsageWithEvidence(mixed, evidence(['ZX']), ROUTE)).toThrow(/different sources/);
  });

  test('the report holds no undefined anywhere — Firestore would refuse the save', async () => {
    const r = await parseUsage(csv('OBJECT_NAME,CALLS\nZONE,3\nZTWO,\n'), { today: TODAY });
    const walk = (v: unknown, where: string): string[] =>
      v === undefined ? [where]
        : Array.isArray(v) ? v.flatMap((x, i) => walk(x, `${where}[${i}]`))
          : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => walk(x, `${where}.${k}`))
            : [];
    expect(walk(r, 'report')).toEqual([]);
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

/** The emulator's REST shape, decoded. */
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
  const EMAIL = `usageimport-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'UsageImport123!';
  const PROJECT_ID = `usageimport-${Date.now()}`;

  const storedUsage = async (): Promise<UsageReport | undefined> => {
    const res = await fetch(`${EMU}/projects/${PROJECT_ID}`, { headers: { Authorization: 'Bearer owner' } });
    const json = (await res.json()) as { fields?: Record<string, RestValue> };
    return decode(json.fields?.usageReport) as UsageReport | undefined;
  };

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const uid = (await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD)).user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Usage', lastName: 'Import', email: EMAIL, tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, termsVersionAccepted: '2026-07-07', createdAt: new Date(),
    });
    // Source staged, no analysis yet: the stage where the usage import lives.
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Usage import fixture', userId: uid, createdAt: new Date(), status: 'uploaded',
      legacyCode: 'REPORT z_usage.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
    });
  });

  test('declare, see the rejected rows, confirm — and the stored report is the one that was shown', async ({ page }) => {
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

    await page.locator('[data-usage-window-from]').fill('2026-02-01');
    await page.locator('[data-usage-window-to]').fill('2026-04-30');
    await page.locator('[data-usage-file]').setInputFiles({
      name: 'scmon.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'OBJECT_NAME;CALLS;LAST_USED\n' +
        'ZFI_YEAR_END;0;\n' +
        'ZSD_ORDERS;1.234;05.04.2026\n' +
        'ZMM_BAD;-3;01.03.2026\n',
      ),
    });

    // Undeclared format: the German date is refused, not guessed.
    const preview = page.locator('[data-usage-preview]');
    await expect(preview).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-usage-quarantine]')).toContainText("declare the export's date format");

    // Declared: it is read, and only the negative count remains rejected.
    await page.locator('[data-usage-date-locale]').selectOption('de-DE');
    await expect(preview).toContainText('2 objects would be imported');
    await expect(page.locator('[data-usage-quarantine]')).toContainText('negative call count (-3)');
    await expect(page.locator('[data-usage-quarantine]')).not.toContainText('declare');
    await expect(preview).toContainText('less than 13 months');

    // Nothing stored yet.
    expect(await storedUsage()).toBeUndefined();

    await page.locator('[data-usage-confirm]').click();
    await expect(page.locator('[data-usage-imported]')).toContainText('2026-02-01 – 2026-04-30, 89 days');

    await expect.poll(async () => (await storedUsage()) !== undefined, { timeout: 15000 }).toBe(true);
    const stored = (await storedUsage())!;
    expect(stored.window).toEqual({ from: '2026-02-01', to: '2026-04-30', days: 89 });
    expect(stored.dateLocale).toBe('de-DE');
    const orders = stored.records.find((r) => r.objectName === 'ZSD_ORDERS');
    expect(orders).toMatchObject({ lastUsed: '2026-04-05', callCount: 1234 });
    expect(stored.quarantined).toEqual([{ row: 4, objectName: 'ZMM_BAD', reason: 'negative call count (-3)' }]);
  });
});
