import { test, expect } from '@playwright/test';

/**
 * The weekly admin report.
 *
 * Fixture figures rather than live data, so the assertions stay stable: what is
 * being guarded is that the mail survives a phone, keeps the adoption figure as its
 * headline, and links into the right tab of the admin panel. The metric computation
 * itself is exercised against production by the script's dry run.
 */
import { renderUsageReportEmail, renderUsageReportSubject } from '../lib/usage-report-email';
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
  newAccounts: [
    { name: 'Alexandra Bergmann-Hofstetter', email: 'alexandra.bergmann-hofstetter@sehr-lange-firmendomain.example', when: new Date() },
    { name: 'Tim Bauer', email: 'tim.bauer@example.com', when: new Date() },
  ],
  newlyActivated: [{ name: 'Maria Huber', email: 'maria.huber@example.com', runs: 4 }],
  reachedLimit: [{ name: 'Jonas Roth', email: 'jonas.roth@example.com' }],
  delivery: {
    sent: 7, delivered: 4, delayed: 1, bounced: 1, complained: 0, opened: 1, awaiting: 0,
    failures: [
      {
        to: 'felix.frenzel@sehr-lange-firmendomain.example',
        kind: 'welcome',
        status: 'email.bounced',
        detail: 'The recipient server rejected the message: 550 5.7.1 Message blocked by policy',
        at: new Date('2026-08-20T08:11:00Z'),
      },
    ],
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

    // A long address must not push the mail sideways on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} overflows by ${overflow}px`).toBeLessThanOrEqual(0);

    await page.screenshot({ path: `test-results/report-${name}.png`, fullPage: true });
  });
}

test.describe('mail delivery is in the report', () => {
  test('the counts are shown, and a bounce is named with its reason', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1400 });
    await page.setContent(renderUsageReportEmail(report), { waitUntil: 'load' });

    await expect(page.getByText('Mailzustellung')).toBeVisible();
    for (const label of ['Versendet', 'Zugestellt', 'Verzögert', 'Abgeprallt']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // The point of the section: who did not get it, and why. A count alone would
    // not tell the operator what to do next.
    await expect(page.getByText('Nicht angekommen')).toBeVisible();
    await expect(page.getByText(/felix\.frenzel@/)).toBeVisible();
    await expect(page.getByText(/Message blocked by policy/)).toBeVisible();
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
