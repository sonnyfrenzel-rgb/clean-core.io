import { test, expect } from '@playwright/test';
import { createUnsubscribeToken } from '../lib/unsubscribe-token';
import { adminDocExists } from './helpers/admin-seed';
import { createHash } from 'crypto';

process.env.PILOT_APPROVAL_SECRET = process.env.PILOT_APPROVAL_SECRET || 'test-approval-secret-key-1234567890';

const suppressionId = (email: string) => createHash('sha256').update(email.toLowerCase()).digest('hex');

/**
 * RFC 8058 one-click unsubscribe. Gmail and Yahoo require this of bulk senders and
 * will filter the mail without it, so these are compliance tests, not nice-to-haves.
 */
test.describe('One-click unsubscribe', () => {
  test('a signed token suppresses the address on POST', async ({ request }) => {
    const email = `unsub-e2e-${Date.now()}@cleancore-test.io`;
    const token = createUnsubscribeToken(email);

    expect(await adminDocExists('email_suppressions', suppressionId(email))).toBe(false);

    // Mail providers POST with no session and no body — exactly this shape.
    const res = await request.post(`/api/unsubscribe?t=${encodeURIComponent(token)}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);

    expect(await adminDocExists('email_suppressions', suppressionId(email))).toBe(true);
  });

  test('repeating the request stays successful and does not duplicate', async ({ request }) => {
    const email = `unsub-idem-${Date.now()}@cleancore-test.io`;
    const token = createUnsubscribeToken(email);

    for (let i = 0; i < 3; i++) {
      const res = await request.post(`/api/unsubscribe?t=${encodeURIComponent(token)}`);
      expect((await res.json()).success).toBe(true);
    }
    expect(await adminDocExists('email_suppressions', suppressionId(email))).toBe(true);
  });

  test('a forged token suppresses nobody, and still answers 200', async ({ request }) => {
    const email = `unsub-forged-${Date.now()}@cleancore-test.io`;
    const good = createUnsubscribeToken(email);
    // Keep the payload, break the signature — the classic forgery attempt.
    const forged = `${good.split('.')[0]}.${'0'.repeat(64)}`;

    const res = await request.post(`/api/unsubscribe?t=${encodeURIComponent(forged)}`);
    // 200 on purpose: a non-2xx here is read by providers as a broken unsubscribe.
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(false);

    expect(await adminDocExists('email_suppressions', suppressionId(email))).toBe(false);
  });

  test('an expired token is rejected', async ({ request }) => {
    const email = `unsub-expired-${Date.now()}@cleancore-test.io`;
    const token = createUnsubscribeToken(email, -1000);

    const res = await request.post(`/api/unsubscribe?t=${encodeURIComponent(token)}`);
    expect((await res.json()).success).toBe(false);
    expect(await adminDocExists('email_suppressions', suppressionId(email))).toBe(false);
  });

  test('the token in a JSON body works, and a body past the bound is not read', async ({ request }) => {
    // Our own confirmation page sends `{ t }` in the body.
    const small = `unsub-body-${Date.now()}@cleancore-test.io`;
    const ok = await request.post('/api/unsubscribe', { data: { t: createUnsubscribeToken(small) } });
    expect((await ok.json()).success).toBe(true);
    expect(await adminDocExists('email_suppressions', suppressionId(small))).toBe(true);

    // The route is open to anyone and used to parse a body of any size before
    // looking at the token (QA review of a7e0ae36c896). The same valid token,
    // padded past the bound, is not read: nobody is suppressed.
    const large = `unsub-large-${Date.now()}@cleancore-test.io`;
    const padded = await request.post('/api/unsubscribe', {
      data: { t: createUnsubscribeToken(large), pad: 'x'.repeat(64 * 1024) },
    });
    expect(padded.status()).toBe(200);
    expect((await padded.json()).success).toBe(false);
    expect(await adminDocExists('email_suppressions', suppressionId(large))).toBe(false);
  });

  test('GET does not unsubscribe — it hands the reader the confirmation page', async ({ request, page }) => {
    const email = `unsub-get-${Date.now()}@cleancore-test.io`;
    const token = createUnsubscribeToken(email);

    // Scanners and prefetchers follow GETs; acting on one would opt people out by accident.
    const res = await request.get(`/api/unsubscribe?t=${encodeURIComponent(token)}`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers()['location']).toContain('/unsubscribe');
    // The redirect hands the token on in the fragment, which the browser never
    // sends back, so the second request of an old link logs no token
    // (QA finding 8e25777f1339).
    const location = new URL(res.headers()['location']);
    expect(location.search, 'the redirect puts the token back into a logged query').toBe('');
    expect(location.hash).toBe(`#t=${encodeURIComponent(token)}`);
    expect(await adminDocExists('email_suppressions', suppressionId(email))).toBe(false);

    // A mail sent before 30.09.2026 links to the page with `?t=`. It still
    // works, and the page takes the token out of the address bar at once.
    await page.goto(`/unsubscribe?t=${encodeURIComponent(token)}`);
    await expect(page.getByRole('heading', { name: /Community updates/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirm unsubscribe/i })).toBeEnabled();
    expect(new URL(page.url()).search, 'the old query link kept its token in the address bar').toBe('');
    expect(await adminDocExists('email_suppressions', suppressionId(email))).toBe(false);

    await page.getByRole('button', { name: /Confirm unsubscribe/i }).click();
    await expect(page.getByRole('heading', { name: /You are unsubscribed/i })).toBeVisible({ timeout: 15000 });
    expect(await adminDocExists('email_suppressions', suppressionId(email))).toBe(true);
  });

  test('the link in a new mail carries the token in the fragment, and the page acts on it', async ({ page }) => {
    const email = `unsub-fragment-${Date.now()}@cleancore-test.io`;
    const token = createUnsubscribeToken(email);
    // Every request the page makes on the way in: none may carry the token.
    const requested: string[] = [];
    page.on('request', (r) => requested.push(r.url()));

    await page.goto(`/unsubscribe#t=${encodeURIComponent(token)}`);
    await expect(page.getByRole('button', { name: /Confirm unsubscribe/i })).toBeEnabled();
    expect(new URL(page.url()).hash, 'the fragment stayed in the address bar').toBe('');
    expect(await adminDocExists('email_suppressions', suppressionId(email))).toBe(false);

    await page.getByRole('button', { name: /Confirm unsubscribe/i }).click();
    await expect(page.getByRole('heading', { name: /You are unsubscribed/i })).toBeVisible({ timeout: 15000 });
    expect(await adminDocExists('email_suppressions', suppressionId(email))).toBe(true);
    const leaked = requested.filter((u) => u.includes(encodeURIComponent(token)) || u.includes(token));
    expect(leaked, 'a request carried the token in its URL').toEqual([]);
  });

  test('a link with no token tells the reader instead of failing silently', async ({ page }) => {
    await page.goto('/unsubscribe');
    await expect(page.getByRole('heading', { name: /That did not work/i })).toBeVisible();
  });
});

test.describe('a verified opt-out that could not be stored is retryable, not acknowledged', () => {
  /**
   * The route wrapped the token check and the Firestore write in one `catch` and
   * answered 200 to both. Firestore being briefly unavailable therefore produced
   * a successful-looking one-click unsubscribe with no suppression stored: the
   * provider does not retry a 200, and the person goes on receiving community
   * mail after asking not to (QA review of 33471220d6e9, finding 0a0ff08e1793).
   *
   * The distinction is the whole fix, so it is the distinction that is guarded:
   * a token that will never verify keeps its 200, and a write that failed asks
   * to be sent again.
   */
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/unsubscribe/route.ts'), 'utf8');
  const post = src.slice(src.indexOf('export async function POST'), src.indexOf('export async function GET'));

  test('the two failures are separate branches with separate statuses', () => {
    const verify = post.indexOf('verifyUnsubscribeToken(token)');
    const tokenAnswer = post.indexOf('{ status: 200 }');
    const store = post.indexOf('await suppress(email');
    const storeAnswer = post.indexOf('{ status: 503 }');

    for (const [name, at] of Object.entries({ verify, tokenAnswer, store, storeAnswer })) {
      expect(at, `${name} is missing — the two failures are back in one catch`).toBeGreaterThan(-1);
    }
    // Order: verify, answer 200 for a bad token, then store, then 503 for a
    // failed write. A single catch cannot produce this shape.
    expect(verify).toBeLessThan(tokenAnswer);
    expect(tokenAnswer).toBeLessThan(store);
    expect(store).toBeLessThan(storeAnswer);
    // And the success answer is reached only after the write returned.
    expect(post.indexOf('{ success: true }')).toBeGreaterThan(storeAnswer);
    expect((post.match(/} catch \(error\) \{/g) || []).length).toBe(2);
  });

  test('the successful path is unchanged: 200, stored, and idempotent', async ({ request }) => {
    const email = `unsub-503-${Date.now()}@cleancore-test.io`;
    const token = createUnsubscribeToken(email);
    const res = await request.post(`/api/unsubscribe?t=${encodeURIComponent(token)}`);
    expect(res.status()).toBe(200);
    expect((await res.json())).toEqual({ success: true });
    expect(await adminDocExists('email_suppressions', suppressionId(email))).toBe(true);
  });
});
