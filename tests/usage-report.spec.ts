import { test, expect } from '@playwright/test';

/**
 * The weekly admin report.
 *
 * Fixture figures rather than live data, so the assertions stay stable: what is
 * being guarded is that the mail survives a phone, keeps the adoption figure as its
 * headline, and links into the right tab of the admin panel. The metric computation
 * itself is exercised against production by the script's dry run.
 */
import { renderUsageReportEmail, renderUsageReportSubject, renderUsageReportText } from '../lib/usage-report-email';
import type { UsageReport } from '../lib/usage-report';

const report: UsageReport = {
  generatedAt: new Date('2026-08-21T10:00:00Z'),
  periodStart: new Date('2026-08-14T10:00:00Z'),
  periodEnd: new Date('2026-08-21T10:00:00Z'),
  current: { registrations: 3, activations: 2, activeAccounts: 5, runs: 9, projects: 5, units: 9 },
  previous: { registrations: 1, activations: 0, activeAccounts: 2, runs: 2, projects: 3, units: 2 },
  totals: {
    accounts: 34, activated: 8, neverStarted: 26, atLimit: 3, byok: 1,
    unitsUsed: 21, unitsGranted: 165, objectsAnalysed: 17, runsAllTime: 37,
  },
  newAccounts: 2,
  newlyActivated: [4, 1],
  reachedLimit: 3,
  delivery: {
    sent: 7, delivered: 4, delayed: 1, bounced: 1, complained: 0, opened: 1, awaiting: 0,
    failures: [{ kind: 'tenant access request received', status: 'email.bounced', count: 1 }],
  },
};

/** A week where mail went out and nothing came back — the webhook is not armed. */
const silentReport: UsageReport = {
  ...report,
  delivery: { sent: 5, delivered: 0, delayed: 0, bounced: 0, complained: 0, opened: 0, awaiting: 5, failures: [] },
};

test('subject names the adoption figure', () => {
  expect(renderUsageReportSubject(report)).toContain('8 von 34 Accounts aktiv');
});

for (const [name, width] of [['mobile-320', 320], ['mobile-375', 375], ['desktop-800', 800]] as const) {
  test(`report renders at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(renderUsageReportEmail(report), { waitUntil: 'load' });

    // German, and the hero number is adoption rather than consumption.
    await expect(page.getByText('Aktivierungsquote')).toBeVisible();
    await expect(page.getByText('24 %')).toBeVisible();
    await expect(page.getByText(/8 von 34/)).toBeVisible();
    // The section title, not the bare label: the hidden preheader also contains
    // "erstmals aktiviert" and getByText matches case-insensitively, so a loose
    // locator resolves to a display:none element and fails toBeVisible.
    await expect(page.getByText('Erstmals aktiviert diese Woche')).toBeVisible();

    // Every figure the report promises has to actually be on the page — a metric
    // silently dropped in a layout change is exactly what this guards against.
    for (const label of [
      'Neue Registrierungen', 'Erstmals aktiviert', 'Aktive Accounts',
      'Analysen durchgeführt', 'Neue Projekte', 'Verbrauchte Einheiten',
      'Accounts (ohne Testkonten)', 'Analysen insgesamt', 'Eindeutige ABAP-Objekte',
      'Einheiten verbraucht', 'Accounts am Limit', 'Noch nie gestartet',
      'Mit eigenem Gemini-Key (BYOK)',
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole('link', { name: /Im Admin-Panel öffnen/ })).toHaveAttribute(
      'href', 'https://clean-core.io/admin?tab=usage',
    );

    // Nothing may push the mail sideways on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} overflows by ${overflow}px`).toBeLessThanOrEqual(0);

    await page.screenshot({ path: `test-results/report-${name}.png`, fullPage: true });
  });
}

test.describe('mail delivery is in the report', () => {
  test('the counts are shown, and a bounce is counted by kind of mail', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1400 });
    await page.setContent(renderUsageReportEmail(report), { waitUntil: 'load' });

    await expect(page.getByText('Mailzustellung')).toBeVisible();
    for (const label of ['Versendet', 'Zugestellt', 'Verzögert', 'Abgeprallt']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Which kind of mail did not arrive, and how often — the operator's next
    // step (a welcome mail that bounced means an account without its guide).
    // Not to whom: the report carries figures only (30.09.2026).
    await expect(page.getByText('Nicht angekommen')).toBeVisible();
    await expect(page.getByText('1 × tenant access request received')).toBeVisible();
  });

  test('a clean week does not invent a failure section', async ({ page }) => {
    await page.setContent(
      renderUsageReportEmail({
        ...report,
        delivery: { sent: 6, delivered: 6, delayed: 0, bounced: 0, complained: 0, opened: 2, awaiting: 0, failures: [] },
      }),
      { waitUntil: 'load' },
    );
    await expect(page.getByText('Mailzustellung')).toBeVisible();
    await expect(page.getByText('Nicht angekommen')).toHaveCount(0);
    // Zero bounces is not worth a row of its own.
    await expect(page.getByText('Abgeprallt', { exact: true })).toHaveCount(0);
  });

  test('silence is reported as silence, not as success', async ({ page }) => {
    await page.setContent(renderUsageReportEmail(silentReport), { waitUntil: 'load' });
    // Five sent, nothing back. That is a finding about the webhook, and the mail
    // has to say so rather than showing 0 delivered as if delivery had failed.
    await expect(page.getByText('Ohne Rückmeldung')).toBeVisible();
    await expect(page.getByText(/Webhook nicht scharf/)).toBeVisible();
  });

  test('a week with no mail says so', async ({ page }) => {
    await page.setContent(
      renderUsageReportEmail({
        ...report,
        delivery: { sent: 0, delivered: 0, delayed: 0, bounced: 0, complained: 0, opened: 0, awaiting: 0, failures: [] },
      }),
      { waitUntil: 'load' },
    );
    await expect(page.getByText(/keine Mail versendet/)).toBeVisible();
  });
});

test.describe('the report names nobody', () => {
  /**
   * The three sections that used to list people — new, first analysis, at the
   * limit — are counts since 30.09.2026, and the delivery section counts per
   * kind of mail. What an operator still acts on is a number; "who" is in the
   * admin panel. `tests/usage-report-figures-only.spec.ts` proves the same for a
   * report built from seeded accounts, including the stored snapshot.
   */
  test('each former list is a count, in both parts of the mail', async ({ page }) => {
    const html = renderUsageReportEmail(report);
    const text = renderUsageReportText(report);
    await page.setContent(html, { waitUntil: 'load' });

    await expect(page.getByText('2 neue Registrierungen')).toBeVisible();
    await expect(page.getByText('2 Accounts mit erster Analyse')).toBeVisible();
    await expect(page.getByText('Analysen je Account diese Woche: 4, 1')).toBeVisible();
    await expect(page.getByText('3 Accounts am Limit')).toBeVisible();

    expect(text).toContain('2 neue Registrierungen');
    expect(text).toContain('2 Accounts, Analysen je Account: 4, 1');
    expect(text).toContain('3 Accounts am Limit');
    expect(text).toContain('1 x tenant access request received');

    // No address shape anywhere but the report's own sender domain.
    for (const [part, body] of [['html', html], ['text', text]] as const) {
      const addresses = (body.match(/[^\s@"'<>()]+@[^\s@"'<>()]+/g) ?? []).filter((a) => !a.endsWith('clean-core.io'));
      expect(addresses, `${part}: an address in the report`).toEqual([]);
    }
  });

  test('a value that reaches the markup arrives as text', async ({ page }) => {
    // The kind of mail is set by our own send calls, not by a user; it is
    // escaped anyway, so that never has to be re-checked.
    const hostile: UsageReport = {
      ...report,
      delivery: {
        ...report.delivery,
        failures: [{ kind: '<img src="https://tracker.example/p.gif">welcome', status: 'email.bounced', count: 1 }],
      },
    };
    await page.setContent(renderUsageReportEmail(hostile), { waitUntil: 'load' });
    expect(await page.locator('img[src^="https://tracker.example"]').count()).toBe(0);
    const hrefs = await page.locator('a').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || ''));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((h) => h.startsWith('https://clean-core.io'))).toBe(true);
  });
});
