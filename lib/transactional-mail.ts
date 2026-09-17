import { CONTACT_EMAIL } from '@/lib/constants';
import { recordEmailSent } from '@/lib/email-events';
import { mockMailAllowed } from '@/lib/mail-delivery-mode';

/**
 * One way out for the mails phase 5 sends, with the answer the caller has to act
 * on rather than a boolean it can ignore.
 *
 * Every existing sender in this repository carries its own copy of the same
 * twenty lines — the Resend call, the `reply_to`, the plain-text part, the
 * message-id bookkeeping, the console fallback and the 503 that stops a missing
 * key from being reported as a delivery. Three of those copies drifted apart far
 * enough that a QA review had to find the same finding three times (`14edf99a390c`,
 * see `lib/mail-delivery-mode.ts`). The two mails added for invitations share
 * this one instead.
 *
 * What it does **not** do is decide what a failure means. An invitation whose
 * mail never went out is a live grant nobody can use and has to be taken back;
 * a confirmation mail that fails is a retry. Only the caller knows which, so
 * the outcome is returned and never swallowed.
 */

export interface OutgoingMail {
  /** Recipient address. Always server-derived — never a value out of a body. */
  to: string;
  subject: string;
  /** The complete document, already through `wrapEmailDocument`. */
  html: string;
  /** For the log and for `email_events`, e.g. 'invitation'. */
  label: string;
  /** Sending identity; the default is the one the product mails under. */
  from?: string;
  /** Recorded with the send so a later bounce can find the person again. */
  uid?: string;
}

export type MailOutcome =
  | { delivered: true; mocked: boolean; messageId: string | null }
  | { delivered: false; reason: 'not-configured' | 'rejected'; detail: string };

const DEFAULT_FROM = 'Clean-Core.io Team <team@clean-core.io>';

export async function sendTransactionalMail(msg: OutgoingMail): Promise<MailOutcome> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Locally and against the emulators the console *is* the delivery channel
    // and the developer is reading it. On the deployment neither holds: nobody
    // was told anything, and saying otherwise is the finding this guard exists
    // for.
    if (mockMailAllowed()) {
      console.log('\n======================================================');
      console.log(`📬   [${msg.label.toUpperCase()} — MOCK DELIVERY]   📬`);
      console.log(`To: ${msg.to}`);
      console.log(`Subject: ${msg.subject}`);
      console.log('======================================================\n');
      return { delivered: true, mocked: true, messageId: null };
    }
    console.error(`[Email] RESEND_API_KEY missing in production — ${msg.label} not sent.`);
    return { delivered: false, reason: 'not-configured', detail: 'Email delivery is not configured.' };
  }

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: msg.from || DEFAULT_FROM,
        to: msg.to,
        subject: msg.subject,
        // `team@` is a sending identity, not a mailbox at the provider: a reply
        // to it bounces, and both invitation mails invite a reply.
        reply_to: CONTACT_EMAIL,
        html: msg.html,
        // HTML-only is a long-standing spam signal. Generated from the same
        // markup so it cannot drift from what the reader sees.
        text: htmlToText(msg.html),
      }),
    });
  } catch (err) {
    console.error(`[Email] Error sending ${msg.label}:`, err);
    return { delivered: false, reason: 'rejected', detail: 'The mail provider could not be reached.' };
  }

  if (!res.ok) {
    console.error(`[Email] Resend rejected ${msg.label}:`, await res.text().catch(() => ''));
    return { delivered: false, reason: 'rejected', detail: 'The mail provider rejected the message.' };
  }

  const body = (await res.json().catch(() => ({}))) as { id?: string };
  const messageId = typeof body.id === 'string' ? body.id : null;
  console.log(`[Email] Sent ${msg.label} to ${msg.to}. id=${messageId ?? 'unknown'}`);
  if (messageId) {
    // Best effort: the message is already away, and failing to write the join
    // key must not turn a delivered mail into an error for the caller.
    await recordEmailSent(messageId, msg.to, msg.subject, msg.label, msg.uid).catch((err) =>
      console.error(`[Email] Could not record sent event for ${msg.label}:`, err),
    );
  }
  return { delivered: true, mocked: false, messageId };
}

/**
 * A readable plain-text part derived from the HTML body.
 *
 * Deliberately crude — it keeps link targets, collapses the table scaffolding
 * and drops the styling. The point is that a `text/plain` alternative exists at
 * all; a hand-written second copy would drift from the HTML within one edit.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) =>
      `${String(label).replace(/<[^>]+>/g, '').trim()} (${href})`)
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&rsquo;|&#x27;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&rarr;/g, '->')
    .replace(/&bull;/g, '*')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}
