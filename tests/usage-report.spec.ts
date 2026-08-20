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
  current: { registrations: 3, activations: 2, runs: 9, projects: 5, units: 9 },
  previous: { registrations: 1, activations: 0, runs: 2, projects: 3, units: 2 },
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
