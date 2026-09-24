import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { verifyResendSignature } from '../lib/email-events';
import { mockMailAllowed } from '../lib/mail-delivery-mode';
import { sendIdempotencyKey } from '../lib/survey/outbox';

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

  /**
   * The welcome mail goes to the account, not to a claim about it.
   *
   * `/api/send-approval-email` used to take `{ email, name }` out of the request
   * body, and the admin console filled them from `registration_requests/{uid}` —
   * a document the registering browser creates itself, and one `firestore.rules`
   * constrains only by document id (`requestId == request.auth.uid`), not by
   * field. So the recipient was chosen by the person awaiting approval: sign up,
   * write somebody else's address into your own row, and an approving
   * administrator sends a clean-core.io mail to them.
   *
   * The route did have a check — "F-04: Empfängeradresse validieren" — and it
   * passed, because it validated the *shape* of the address and never its
   * *binding* to the account. That is the distinction this test pins, and it is
   * why a stricter regex on the address would not have helped.
   *
   * Found by the security audit of bc2f786 (SEC-bc2f786-12), as the one part of
   * that finding that stands; the privilege claim in the rest of it does not.
   */
  test('the welcome mail reads its recipient from Firebase Auth, not from the request body', () => {
    const rel = 'app/api/send-approval-email/route.ts';
    const s = read(rel);

    // The old shape, exactly: `const { email, name: rawName } = body;`
    expect(
      /const\s*\{[^}]*\bemail\b[^}]*\}\s*=\s*body/.test(s),
      `${rel} destructures a recipient address out of the request body again`,
    ).toBe(false);

    // The new one: the address comes from the account the uid names.
    expect(s, `${rel} no longer looks the account up`).toMatch(/getUser\(\s*uid\s*\)/);
    expect(s, `${rel} should send to the address it read from the account`).toMatch(
      /const\s+email\s*=\s*account\.email/,
    );

    // And the caller must not be handing one over either — a route that ignores
    // the field is safe, but a caller still sending it means the next person to
    // read this will reasonably assume it is used.
    const caller = read('app/(app)/admin/page.tsx');
    const callSite = caller.slice(caller.indexOf("'/api/send-approval-email'"));
    const body = callSite.slice(0, callSite.indexOf('});'));
    expect(
      /email\s*:/.test(body),
      'the admin console passes an address to the welcome-mail route again',
    ).toBe(false);
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

test.describe('a bounce reaches the operator', () => {
  test('the welcome mail carries the uid, so a bounce knows whose it was', () => {
    const s = read('app/api/account/register/route.ts');
    // The webhook only ever sees a message id. Without the uid stored at send
    // time, the events pile up in a collection that joins to nothing.
    expect(s).toMatch(/label: 'welcome',[\s\S]{0,400}?\n\s*uid,/);
    expect(s).toContain('recordEmailSent(messageId, msg.to, msg.subject, msg.label, msg.uid)');
  });

  test('the verdict is mirrored where the operator already looks', () => {
    const s = read('lib/email-events.ts');
    // `email_events` is server-only because the documents carry recipient
    // addresses, so the admin console cannot read it. The registration request
    // is already on that page.
    expect(s).toContain("db.collection('registration_requests').doc(data.uid)");
    expect(s).toContain('welcomeMailStatus: status');
    // Only the welcome mail: the admin notification goes to a watched mailbox
    // and would land on the wrong person's row.
    expect(s).toContain("data.kind === 'welcome'");
  });

  test('a queued mail is not reported as an arrival', () => {
    const s = read('app/(app)/admin/page.tsx');
    const badge = s.slice(s.indexOf('function welcomeMailBadge'));
    // 'sent' means Resend accepted it — precisely the thing that turned out to
    // be worth nothing. It must not produce a reassuring badge.
    expect(badge).not.toContain("case 'email.sent'");
    for (const failed of ['email.bounced', 'email.complained', 'email.delivery_delayed']) {
      expect(badge).toContain(`case '${failed}'`);
    }
    // The two that mean the reader never saw it are the ones that read as red.
    expect(badge).toMatch(/case 'email\.bounced':[\s\S]{0,200}?bg-red-50/);
    expect(badge).toMatch(/case 'email\.complained':[\s\S]{0,200}?bg-red-50/);
  });
});

test('the send record does not overwrite a verdict that already arrived', () => {
  const s = read('lib/email-events.ts');
  const fn = s.slice(s.indexOf('export async function recordEmailSent'));
  // Resend can report a hard bounce before the send call's own bookkeeping has
  // landed. A blind `status: 'email.sent'` would erase it.
  expect(fn).not.toContain("status: 'email.sent',");
  expect(fn).toContain("const status: string = existing.status || 'email.sent'");
  expect(fn).toContain('runTransaction');
});

test('a verdict that outran the send record still reaches the user row', () => {
  const s = read('lib/email-events.ts');
  const fn = s.slice(s.indexOf('export async function recordEmailSent'));
  // recordEmailEvent mirrors by reading uid and kind off the document. An event
  // that arrives before the document exists finds neither and skips the mirror,
  // so the badge would never appear for the fastest bounce of all. This is the
  // only other place that knows both the message id and the person.
  expect(fn).toContain("uid && kind === 'welcome' && status !== 'email.sent'");
  expect(fn).toContain("db.collection('registration_requests').doc(uid)");
});

test.describe('the survey send records before it asks the provider', () => {
  /**
   * The send record used to be added after Resend had accepted the message. A
   * crash or a failed Firestore write in that window left a delivered mail with
   * no record, and the next run — seeing no record — sent it again (QA review of
   * da8af9df98fb, b6a9e1c54314). The record now exists under a deterministic id
   * before the provider is asked, moves to `sent` or `failed` afterwards, and a
   * record stuck in `sending` is neither resent nor counted.
   *
   * The transactions themselves live in lib/survey/outbox.ts and are exercised
   * against the emulator in tests/survey-outbox.spec.ts. The script is an entry
   * point and cannot be imported without running, so what this reads from its
   * source is the wiring: that the outbox is what the loop calls, in this order.
   */
  const src = read('scripts/send-survey.ts');
  const loop = src.slice(src.indexOf('for (const [index, r] of recipients.entries())'), src.indexOf('console.log(`${sent} of'));

  test('the loop claims through the outbox before the provider call and settles through it after', () => {
    const claim = loop.indexOf('await claimSend(db, SURVEY_CAMPAIGN, r)');
    const provider = loop.indexOf('await sendWithRetry(');
    const failed = loop.indexOf('await failSend(db, SURVEY_CAMPAIGN, r.uid,');
    const sent = loop.indexOf('await completeSend(db, SURVEY_CAMPAIGN, r.uid, id)');
    for (const [name, at] of Object.entries({ claim, provider, failed, sent })) expect(at, `${name} is not wired`).toBeGreaterThan(-1);
    expect(claim, 'the provider is asked before the claim').toBeLessThan(provider);
    expect(provider).toBeLessThan(failed);
    expect(failed).toBeLessThan(sent);
    expect(loop).toMatch(/if \(!claimed\) \{[\s\S]*?continue;/);
    // No writes to the outbox behind the module's back.
    expect(loop, 'a direct write to email_sends is back').not.toMatch(/collection\('email_sends'\)/);
    expect(src, 'a per-send increment is back').not.toMatch(/invited: FieldValue\.increment/);
  });

  test('the count is recorded through the outbox after the loop and before the run reports', () => {
    const loopStart = src.indexOf('for (const [index, r] of recipients.entries())');
    const lastSent = src.lastIndexOf('await completeSend(');
    const counted = src.indexOf('const invited = await recordInvited(db, SURVEY_CAMPAIGN, campaignRef);');
    const reported = src.indexOf("console.log(`${sent} of");
    expect(counted).toBeGreaterThan(-1);
    expect(counted, 'the count is taken before the loop').toBeGreaterThan(loopStart);
    expect(counted, 'the count is taken before the last record reaches sent').toBeGreaterThan(lastSent);
    expect(counted, 'the count is taken after the run reported').toBeLessThan(reported);
    expect(src, 'the count is written outside the outbox').not.toMatch(/campaignRef\.set\(\{ invited/);
  });

  test('a record in sending is skipped, reported, and never counted as sent', () => {
    const load = src.slice(src.indexOf('async function loadRecipients'), src.indexOf('async function main'));
    expect(load).toMatch(/if \(state === 'failed'\) continue;/);
    expect(load).toMatch(/if \(state === 'sending'\) unresolved\.push\(email\);/);
    expect(load).toMatch(/alreadySent\.add\(email\);/);
    expect(src).toMatch(/unresolved: \$\{unresolved\.length\} send\(s\) started and never recorded/);
  });
});

test.describe('a retry of a bulk send cannot become a second copy', () => {
  /**
   * The outbox record stops the *next run* asking again. It does not stop this
   * one: `sendWithRetry` repeats a request that timed out or came back 429 or
   * 5xx, and any of those can reach the caller after Resend has accepted the
   * message (QA review of 33471220d6e9, findings 2b0cacd91960, 6d40362efbf6).
   * The provider deduplicates on the key, so the key has to be the same in
   * every attempt of every run — and different for anyone else.
   */
  test('the key is derived from the campaign and the normalised address, and from nothing else', () => {
    const a = sendIdempotencyKey('survey-2026-09', 'Person@Example.COM');
    expect(sendIdempotencyKey('survey-2026-09', ' person@example.com ')).toBe(a);
    expect(sendIdempotencyKey('survey-2026-09', 'other@example.com')).not.toBe(a);
    expect(sendIdempotencyKey('community-update-v2.3', 'person@example.com')).not.toBe(a);
    // No timestamp, no random: the same input a week later is the same key.
    expect(sendIdempotencyKey('survey-2026-09', 'person@example.com')).toBe(a);
    // Header-safe and inside Resend's 256 characters, even for a long campaign id.
    const long = sendIdempotencyKey('x'.repeat(300), 'person@example.com');
    expect(long.length).toBeLessThanOrEqual(256);
    expect(long).toMatch(/^[A-Za-z0-9._-]+$/);
    // The address itself never travels in the header.
    expect(a).not.toContain('example.com');
  });

  test('the bulk sender sends the key with every attempt', () => {
    // scripts/send-community-mail.ts, the second bulk sender, was removed with
    // its two sent mails on 24.09.2026 (decision Sonny); the survey sender is
    // the one left.
    const survey = read('scripts/send-survey.ts');
    // The header sits inside sendWithRetry, so it is on the retry as well as the
    // first attempt — not at the call site, which runs once.
    const retry = survey.slice(survey.indexOf('async function sendWithRetry'), survey.indexOf('const APPLY ='));
    expect(retry).toContain("'Idempotency-Key': idempotencyKey");
    expect(retry).toMatch(/for \(let attempt = 1; attempt <= ATTEMPTS; attempt\+\+\)/);
    expect(survey).toContain('sendIdempotencyKey(SURVEY_CAMPAIGN, r.email)');
  });
});

test.describe('a mail nobody could send is not reported as sent', () => {
  /**
   * Three admin routes logged the message to the console whenever `RESEND_API_KEY`
   * was absent and answered `{ success: true }` anyway. Locally that is right —
   * the log is the delivery channel. In production it told an administrator that
   * a welcome mail had gone out when no request had been made (QA review of
   * 33471220d6e9, finding 14edf99a390c).
   */
  const withEnv = (nodeEnv: string | undefined, emulator: string | undefined) => {
    const prevNode = process.env.NODE_ENV;
    const prevEmu = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
    try {
      // NODE_ENV is readonly in the Next types; the runtime value is what the guard reads.
      (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
      (process.env as Record<string, string | undefined>).NEXT_PUBLIC_USE_FIREBASE_EMULATOR = emulator;
      return mockMailAllowed();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNode;
      (process.env as Record<string, string | undefined>).NEXT_PUBLIC_USE_FIREBASE_EMULATOR = prevEmu;
    }
  };

  test('the console is a delivery channel locally and against the emulators, never on the deployment', () => {
    expect(withEnv('development', undefined)).toBe(true);
    expect(withEnv('test', undefined)).toBe(true);
    // CI runs a production build against the emulators with no mail key, which is
    // not a misconfiguration — printing the mail is the delivery channel there.
    expect(withEnv('production', 'true')).toBe(true);
    // The real deployment: neither holds, and nobody was told anything.
    expect(withEnv('production', undefined)).toBe(false);
    expect(withEnv('production', 'false')).toBe(false);
  });

  test('all three routes gate the mock on it and answer 503 instead of success', () => {
    for (const rel of [
      'app/api/send-approval-email/route.ts',
      'app/api/send-tenant-approval-email/route.ts',
      'app/api/send-tenant-revoke-email/route.ts',
    ]) {
      const s = read(rel);
      expect(s, `${rel} does not import the guard`).toContain("from '@/lib/mail-delivery-mode'");
      expect(s, `${rel} logs the mock unguarded`).toContain('} else if (mockMailAllowed()) {');
      // The 503 has to come before the success answer, or the fallthrough is back.
      const refusal = s.indexOf('{ status: 503 }');
      // A prefix, not the whole literal: the tenant routes answer `{ success: true, to }`
      // since SEC-2026-235, and the order is what this pin is about.
      const success = s.indexOf('NextResponse.json({ success: true');
      expect(refusal, `${rel} has no 503 for a missing mail configuration`).toBeGreaterThan(-1);
      expect(refusal, `${rel} answers success before it refuses`).toBeLessThan(success);
    }
  });
});

test.describe('a verdict keeps the reason that belongs to it', () => {
  /**
   * A welcome mail bounced with a reason, then a scanner opened it. The status
   * correctly stayed bounced — and the reason, and the time, were rewritten with
   * the scanner's, on the summary and on the account's row in the admin console.
   * The operator was left with a failed onboarding mail and nothing to diagnose
   * it with (QA review of 33471220d6e9, finding 5dbe58873773).
   */
  test('only the event that wins the status writes the detail and the time', () => {
    const s = read('lib/email-events.ts');
    const fn = s.slice(s.indexOf('export async function recordEmailEvent'), s.indexOf('export async function recordEmailSent'));
    expect(fn).toContain('const statusWins =');
    expect(fn).toMatch(/const lastDetail = statusWins \? input\.detail \?\? null : data\.lastDetail \?\? null;/);
    expect(fn).toMatch(/const lastEventAt = statusWins\s*\n?\s*\? input\.occurredAt/);
    // The mirror onto the registration request writes the same two values, not
    // the incoming event's.
    const mirror = fn.slice(fn.indexOf("db.collection('registration_requests')"));
    expect(mirror).toContain('welcomeMailDetail: lastDetail');
    expect(mirror).toContain('welcomeMailAt: lastEventAt');
    expect(mirror).not.toMatch(/input\.detail|input\.occurredAt/);
  });
});

test('the signup notification does not claim a queued mail arrived', () => {
  const s = read('lib/admin-signup-email.ts');
  // "has gone to the user" was a delivery claim made in the same request that
  // posted the message to Resend (finding 6500f93e60fd).
  expect(s).not.toContain('has gone to the user');
  expect(s).toContain('submitted for delivery');
  expect(s).toMatch(/whether it arrived is on the account/i);
});

test('the weekly admin report escapes every name it was handed', () => {
  const s = read('lib/usage-report-email.ts');
  const fn = s.slice(s.indexOf('function personList'), s.indexOf('function deliveryPanel'));
  // A first name of `<a href>` or `<img src>` put a working link, or a remote
  // call, into the administrator's own report (finding 230989f67624).
  for (const raw of ['${p.name}', '${p.suffix}', '${p.email}', '${title}', '${emptyText}']) {
    expect(fn, `personList still interpolates ${raw} unescaped`).not.toContain(raw);
  }
  for (const escaped of ['escapeHtml(p.name)', 'escapeHtml(p.suffix)', 'escapeHtml(p.email)', 'escapeHtml(title)', 'escapeHtml(emptyText)']) {
    expect(fn, `personList does not escape with ${escaped}`).toContain(escaped);
  }
});
