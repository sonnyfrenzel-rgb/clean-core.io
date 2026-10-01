import { test, expect, type Page } from '@playwright/test';
import { createSurveyToken } from '../lib/survey/token';
import { SURVEY_CAMPAIGN, SURVEY_QUESTIONS } from '../lib/survey/definition';

/**
 * What the survey page says it saved is what the server holds, when requests
 * overlap (QA full review of v2.20.0, findings 189c0c1ee18e and 34bd87651752).
 *
 * The delay lives inside the page, as in tests/survey-guard.spec.ts: Playwright
 * route handlers run one at a time and would serialise the overlap under test.
 */

const HOUR = 60 * 60 * 1000;

type Plan = { slowKey: string; delayMs: number; failKey: string | null };

async function installFetch(page: Page, plan: Plan) {
  await page.addInitScript((cfg: Plan) => {
    const w = window as unknown as { __voteDone: string[] };
    w.__voteDone = [];
    const real = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (href.includes('/api/survey/vote') && init && init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { optionId?: string; comment?: string };
        const key = body.optionId ?? body.comment ?? '';
        const wait = key === cfg.slowKey ? cfg.delayMs : 0;
        const status = key === cfg.failKey ? 500 : 200;
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            w.__voteDone.push(key);
            resolve(new Response(status === 200 ? '{"ok":true}' : '{"error":"x"}', {
              status,
              headers: { 'Content-Type': 'application/json' },
            }));
          }, wait);
        });
      }
      return real(input, init);
    };
  }, plan);
}

const done = (page: Page) =>
  page.evaluate(() => (window as unknown as { __voteDone: string[] }).__voteDone);

test.describe('the survey read-back follows the server under overlapping requests', () => {
  test.setTimeout(120 * 1000);

  test('a superseded answer that saved stays in the read-back when the newer one fails', async ({ page }) => {
    const QUESTION = SURVEY_QUESTIONS.find((q) => q.where === 'page' && !q.multi)!;
    const FIRST = QUESTION.options[0];
    const SECOND = QUESTION.options[1];
    await installFetch(page, { slowKey: FIRST.id, delayMs: 3000, failKey: SECOND.id });

    const token = createSurveyToken(SURVEY_CAMPAIGN, `qa220-a-${Date.now()}`, Date.now() + HOUR);
    await page.goto(`/survey/${encodeURIComponent(token)}`);
    await expect(page.getByRole('heading', { name: QUESTION.prompt })).toBeVisible();

    await page.getByRole('button', { name: FIRST.label, exact: false }).click();
    await page.getByRole('button', { name: SECOND.label, exact: false }).click();
    await page.waitForFunction(() => (window as unknown as { __voteDone: string[] }).__voteDone.length >= 2, null, {
      timeout: 30000,
    });

    // The server accepted FIRST and refused SECOND, so it holds FIRST.
    expect(await done(page)).toEqual([FIRST.id, SECOND.id]);
    const row = page.locator('dl > div').filter({ hasText: QUESTION.prompt });
    await expect(row.locator('dd')).toHaveText(FIRST.label, { timeout: 15000 });
    await expect(page.getByText('That did not save. Please tap it again.')).toBeVisible();
  });

  test('an older note that lands last does not replace the newer one', async ({ page }) => {
    const A = 'first note from the qa220 spec';
    const B = 'second note from the qa220 spec';
    await installFetch(page, { slowKey: A, delayMs: 3000, failKey: null });

    const token = createSurveyToken(SURVEY_CAMPAIGN, `qa220-c-${Date.now()}`, Date.now() + HOUR);
    await page.goto(`/survey/${encodeURIComponent(token)}`);

    const box = page.locator('#survey-comment');
    const send = page.getByRole('button', { name: 'Send this note' });
    await box.fill(A);
    await send.click();
    // Editing re-enables the button while the first send is still in flight.
    await box.fill(B);
    await send.click();

    await page.waitForFunction(() => (window as unknown as { __voteDone: string[] }).__voteDone.length >= 2, null, {
      timeout: 30000,
    });
    // The server's last write is the last send...
    const order = await done(page);
    expect(order[order.length - 1], `the older note settled last: ${order.join(' → ')}`).toBe(B);
    // ...and the page reports the note on screen as the one sent.
    await expect(page.getByText('Sent — thank you.')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Not sent yet — this button sends the note, nothing else.')).toHaveCount(0);
  });
});
