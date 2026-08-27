import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { verifyResendSignature } from '../lib/email-events';

/**
 * The platform used to learn nothing about a message after Resend accepted it.
 *
 * `POST /emails` returning 200 means "queued", and that was logged as success.
 * A welcome mail sitting in a corporate quarantine and one in an inbox produced
 * identical logs — while the entire registration flow hangs on that message.
 * Thirty community accounts were onboarded that way, with no means of telling
 * whether any of them received anything.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SECRET = 'whsec_' + Buffer.from('a-test-signing-secret-32-bytes!!').toString('base64');

function sign(body: string, id: string, ts: number, secret = SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return 'v1,' + crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
}

test.describe('the webhook trusts a signature and nothing else', () => {
  const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'm1', to: ['a@b.c'] } });
  const id = 'msg_2abc';
  const ts = Math.floor(Date.now() / 1000);

  test('a correctly signed payload is accepted', () => {
    const r = verifyResendSignature({
      body, svixId: id, svixTimestamp: String(ts),
      svixSignature: sign(body, id, ts), secret: SECRET,
    });
    expect(r.valid).toBe(true);
  });

  test('a tampered body is rejected', () => {
    const sig = sign(body, id, ts);
    const r = verifyResendSignature({
      body: body.replace('bounced', 'delivered'),
      svixId: id, svixTimestamp: String(ts), svixSignature: sig, secret: SECRET,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('signature-mismatch');
  });

  test('a replayed old payload is rejected', () => {
    const old = ts - 3600;
    const r = verifyResendSignature({
      body, svixId: id, svixTimestamp: String(old),
      svixSignature: sign(body, id, old), secret: SECRET,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('stale-timestamp');
  });

  test('a signature from a different secret is rejected', () => {
    const other = 'whsec_' + Buffer.from('a-different-secret-of-32-bytes!!').toString('base64');
    const r = verifyResendSignature({
      body, svixId: id, svixTimestamp: String(ts),
      svixSignature: sign(body, id, ts, other), secret: SECRET,
    });
    expect(r.valid).toBe(false);
  });

  test('missing headers are rejected rather than skipped', () => {
    for (const missing of ['svixId', 'svixTimestamp', 'svixSignature'] as const) {
      const args: any = {
        body, svixId: id, svixTimestamp: String(ts),
        svixSignature: sign(body, id, ts), secret: SECRET,
      };
      args[missing] = null;
      expect(verifyResendSignature(args).valid, `${missing} was not required`).toBe(false);
    }
  });

  test('several candidate signatures are allowed, for secret rotation', () => {
    const good = sign(body, id, ts);
    const r = verifyResendSignature({
      body, svixId: id, svixTimestamp: String(ts),
      svixSignature: `v1,bm90LXRoZS1yaWdodC1vbmU= ${good}`, secret: SECRET,
    });
    expect(r.valid).toBe(true);
  });
});

test.describe('the route refuses to run unconfigured', () => {
  test('no secret means no writes, not unsigned writes', () => {
    const file = read('app/api/webhooks/resend/route.ts');
    expect(file).toContain('RESEND_WEBHOOK_SECRET');
    // The handler body only — the imports at the top name everything, so
    // ordering assertions against the whole file measure the import list.
    const s = file.slice(file.indexOf('export async function POST'));
    // The 503 must come before any parsing or recording.
    const guard = s.indexOf('Webhook not configured');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(s.indexOf('recordEmailEvent'));
    // And the signature is checked against the raw body, not a re-serialised one.
    expect(s).toContain('await req.text()');
    expect(s.indexOf('verifyResendSignature')).toBeLessThan(s.indexOf('JSON.parse'));
  });

  test('the events collection is server-only', () => {
    const rules = read('firestore.rules');
    const i = rules.indexOf('match /email_events/');
    expect(i).toBeGreaterThan(-1);
    expect(rules.slice(i, i + 200)).toContain('allow read, write: if false');
  });
});

test.describe('a send is traceable to its delivery', () => {
  test('the message id is kept, not thrown away', () => {
    const s = read('app/api/account/register/route.ts');
    // Without the id, an event arriving later cannot be joined to the send.
    expect(s).toContain('recordEmailSent');
    expect(s).toMatch(/id=\$\{messageId/);
  });

  test('every mail carries a plain-text part and a reply address that exists', () => {
    const s = read('app/api/account/register/route.ts');
    // HTML-only is a long-standing spam signal, and both mails were HTML-only.
    expect(s).toContain('text: htmlToText(msg.html)');
    // `team@` and `system@` are sending identities, not mailboxes; a reply to
    // either bounces, and the welcome mail asks the reader to reply.
    expect(s).toContain('reply_to: CONTACT_EMAIL');
  });

  test('no outbound mail is sent without a reply address', () => {
    const senders = [
      'app/api/account/register/route.ts',
      'app/api/request-tenant-access/route.ts',
      'app/api/send-approval-email/route.ts',
      'app/api/send-tenant-approval-email/route.ts',
      'app/api/send-tenant-revoke-email/route.ts',
    ];
    for (const rel of senders) {
      const s = read(rel);
      const sends = (s.match(/api\.resend\.com\/emails/g) || []).length;
      const replies = (s.match(/reply_to:/g) || []).length;
      expect(replies, `${rel}: ${sends} send(s), ${replies} reply_to`).toBeGreaterThanOrEqual(sends);
    }
  });
});
