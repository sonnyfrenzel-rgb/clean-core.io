import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import { escapeHtml } from '@/lib/utils';
import { CONTACT_EMAIL } from '@/lib/constants';

/**
 * Emails the Clean Core guide, as a PDF attachment, to an address the visitor types.
 *
 * This is an unauthenticated endpoint that sends mail from our domain to an
 * arbitrary recipient, which is the definition of a spam relay if it is built
 * carelessly. The domain also carries the community mailing list, so an abuse
 * incident here costs deliverability for everyone on it. Hence:
 *
 *   - Nothing the caller types reaches the subject line. It is a constant.
 *   - The only free text that reaches the body is a name, capped at 60 characters
 *     and stripped to letters and a few punctuation marks — which removes URLs,
 *     phone numbers and the "URGENT: verify your account" genre entirely.
 *   - Two rate limits: a per-IP one that stops a single abuser, and a global one
 *     that caps the blast radius if somebody arrives with a lot of IPs.
 *   - A honeypot field that bots fill in and humans never see.
 *   - No recipient address is stored anywhere.
 *
 * The attachment is the committed build artefact, so this route neither renders
 * nor caches anything.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PDF_PATH = path.join(process.cwd(), 'public', 'clean-core-explained.pdf');
const PDF_FILENAME = 'SAP-Clean-Core-Explained.pdf';
const GUIDE_URL = 'https://clean-core.io/clean-core-explained';

const FROM = 'Clean-Core.io <share@clean-core.io>';
const SUBJECT = 'SAP Clean Core, explained without the jargon';

/** Deliberately conservative: a person shares this once or twice, not thirty times. */
const PER_IP_MAX = 5;
const PER_IP_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_MAX = 120;
const GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Good enough to reject typos and obvious junk; the mail provider is the real validator. */
const EMAIL_RE = /^[^\s@,;<>"]{1,64}@[^\s@,;<>"]{1,190}\.[a-z]{2,24}$/i;

/**
 * Reduce a submitted name to something that cannot carry a payload: letters,
 * marks, spaces and a few name punctuation marks. Digits, colons, slashes and
 * everything else go, which is what stops a URL or a phone number.
 *
 * The dot needs one extra rule. Stripping the rest of a URL leaves "evil.example"
 * behind, and several mail clients autolink anything shaped like a domain — so a
 * dot that runs straight into a letter gets a space after it. "J.Smith" becomes
 * "J. Smith", which is no loss; "evil.example" becomes inert text.
 */
function sanitiseName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{M} .'’-]/gu, '')
    .replace(/\.(?=\p{L})/gu, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function buildHtml(senderName: string): string {
  const from = senderName
    ? `<strong>${escapeHtml(senderName)}</strong> thought this might be useful to you.`
    : 'Someone thought this might be useful to you.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>SAP Clean Core, explained</title>
<style>
  @media only screen and (max-width: 600px) {
    .wrap { padding: 20px 12px !important; }
    .card { padding: 24px 20px !important; border-radius: 18px !important; }
    h1.headline { font-size: 21px !important; line-height: 1.2 !important; }
    .body-text { font-size: 16px !important; }
    .cta { display: block !important; width: 100% !important; padding: 16px 12px !important; box-sizing: border-box !important; }
  }
  body, table, td, p, a { -webkit-text-size-adjust: 100%; }
  a { word-break: break-word; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc;">
<div class="wrap" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 24px; background-color: #f8fafc; color: #0f172a;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; height:0; width:0;">
    A plain-language guide to SAP Clean Core &mdash; attached as a PDF.
  </div>

  <div class="card" style="background-color:#ffffff; border:1px solid #e2e8f0; border-radius:24px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); padding:40px;">
    <div style="font-size:22px; font-weight:800; color:#0f172a; letter-spacing:-0.02em; line-height:1.2;">
      Clean-Core<span style="color:#10b981;">.io</span>
    </div>
    <div style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.12em; margin-top:4px; padding-bottom:22px; border-bottom:1px solid #f1f5f9;">
      Free Community SAP Modernization Platform
    </div>

    <h1 class="headline" style="font-size:25px; font-weight:800; color:#0f172a; margin:26px 0 18px 0; letter-spacing:-0.03em; line-height:1.15;">
      SAP Clean Core, explained without the jargon
    </h1>

    <p class="body-text" style="font-size:15px; line-height:1.6; color:#334155; margin:0 0 18px 0;">${from}</p>

    <p class="body-text" style="font-size:15px; line-height:1.6; color:#334155; margin:0 0 18px 0;">
      It is a complete guide to SAP Clean Core, written without assuming you already know the
      vocabulary. It starts at what &ldquo;the core&rdquo; is and why modifying it breaks upgrades,
      then works through the in-app versus side-by-side decision, RAP versus CAP, and a model for
      grading custom ABAP from A to D. About twenty minutes.
    </p>

    <p class="body-text" style="font-size:15px; line-height:1.6; color:#334155; margin:0 0 24px 0;">
      <strong>The PDF is attached.</strong> The same guide is on the web, where it stays current:
    </p>

    <div style="text-align:center; margin-bottom:24px;">
      <a class="cta" href="${GUIDE_URL}" style="display:inline-block; background:#0f172a; color:#ffffff; text-decoration:none; padding:16px 32px; border-radius:12px; font-size:14px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em;">
        Read it online
      </a>
    </div>

    <p style="font-size:13px; line-height:1.6; color:#64748b; margin:0; padding-top:20px; border-top:1px solid #f1f5f9;">
      Clean-Core.io is a free community project for SAP Clean Core modernisation. Questions go to
      <a href="mailto:${CONTACT_EMAIL}" style="color:#047857; font-weight:700;">${CONTACT_EMAIL}</a>.
    </p>
  </div>

  <div style="text-align:center; margin-top:24px; padding:0 16px; color:#94a3b8; font-size:11px; line-height:1.6;">
    <p style="margin:0 0 8px 0;">
      You received this because someone used the &ldquo;share&rdquo; button on
      <a href="${GUIDE_URL}" style="color:#64748b; text-decoration:underline;">clean-core.io</a>.
      This is a one-off message &mdash; your address was not stored and you are not on any list.
    </p>
    <p style="margin:0; font-weight:600;">
      Imprint: Felix Frenzel &bull; Hellerstra&szlig;e 9 &bull; 96047 Bamberg &bull; Germany &bull; ${CONTACT_EMAIL}
    </p>
  </div>
</div>
</body>
</html>`;
}

function buildText(senderName: string): string {
  const from = senderName
    ? `${senderName} thought this might be useful to you.`
    : 'Someone thought this might be useful to you.';

  return `${from}

SAP CLEAN CORE, EXPLAINED WITHOUT THE JARGON

A complete guide to SAP Clean Core, written without assuming you already know the
vocabulary. It starts at what "the core" is and why modifying it breaks upgrades,
then works through the in-app versus side-by-side decision, RAP versus CAP, and a
model for grading custom ABAP from A to D. About twenty minutes.

The PDF is attached. The same guide is on the web, where it stays current:

  ${GUIDE_URL}

Clean-Core.io is a free community project for SAP Clean Core modernisation.
Questions go to ${CONTACT_EMAIL}.

---
You received this because someone used the "share" button on clean-core.io. This
is a one-off message - your address was not stored and you are not on any list.

Imprint: Felix Frenzel, Hellerstrasse 9, 96047 Bamberg, Germany, ${CONTACT_EMAIL}
`;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  // Honeypot: a hidden field no human ever fills in. Answer 200 so a bot learns
  // nothing from the difference between success and rejection.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : '';
  if (!to || to.length > 254 || !EMAIL_RE.test(to)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const senderName = sanitiseName(body.senderName);

  try {
    await assertRateLimit(`share-guide:${getClientIp(request)}`, PER_IP_MAX, PER_IP_WINDOW_MS);
    await assertRateLimit('share-guide:global', GLOBAL_MAX, GLOBAL_WINDOW_MS);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Too many requests. Please try again later.' },
      { status: error?.status || 429 },
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('[share/guide] RESEND_API_KEY missing — cannot send.');
    return NextResponse.json(
      { error: 'Email delivery is not configured. Please use the download instead.' },
      { status: 503 },
    );
  }

  let attachment: string;
  try {
    attachment = (await fs.readFile(PDF_PATH)).toString('base64');
  } catch (error) {
    console.error('[share/guide] PDF missing at', PDF_PATH, error);
    return NextResponse.json(
      { error: 'The PDF is temporarily unavailable. Please use the link instead.' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: CONTACT_EMAIL,
        subject: SUBJECT,
        html: buildHtml(senderName),
        text: buildText(senderName),
        attachments: [{ filename: PDF_FILENAME, content: attachment }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('[share/guide] Resend rejected the send:', res.status, detail);
      return NextResponse.json(
        { error: 'The message could not be sent. Please try the download instead.' },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('[share/guide] send failed:', error);
    return NextResponse.json(
      { error: 'The message could not be sent. Please try the download instead.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
