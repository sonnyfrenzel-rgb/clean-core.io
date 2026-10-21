import { test, expect } from './helpers/test';

/**
 * A visitor nobody signed in for is not shown an account (owner report 21.10.2026): the public pages under the
 * product shell — About, Knowledge — showed the account menu with an empty name, "Settings & Profile" and "Sign Out",
 * which read as being signed in to a pseudo account. Signed out, the shell offers "Sign in" instead.
 */
for (const path of ['/about', '/knowledge']) {
  test(`signed out, ${path} offers Sign in and no account menu`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('[data-shell-sign-in]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-shell-sign-in]')).toHaveText('Sign in');
    await expect(page.locator('[data-account-menu]')).toHaveCount(0);
    await expect(page.getByText('Settings & Profile')).toHaveCount(0);
  });
}
