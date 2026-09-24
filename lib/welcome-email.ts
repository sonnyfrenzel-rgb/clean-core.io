import { APP_BASE_URL, COMMUNITY_QUOTA, CONTACT_EMAIL } from '@/lib/constants';
import { buildUserMail } from '@/lib/user-mail';

/**
 * The one email a new account receives.
 *
 * It replaces two: a "we are reviewing your application" note sent at signup and
 * a near-identical "you have been approved" note sent whenever an administrator
 * got round to it. With the approval gate gone there is nothing to wait for, so
 * the two messages collapse into one that has to do the whole job — confirm the
 * account, get the person to a first result, and answer the IT-security questions
 * their own organisation will ask before they are allowed to paste any ABAP into
 * it.
 *
 * **Plain on purpose** (roadmap 3.0.9). It used to be a card of tables with a
 * dark button, a badge, coloured panels and five links. The seed run of
 * 24.09.2026 put that in spam at web.de and the same content as plain
 * paragraphs with one link in the inbox, so it is now built with
 * `lib/user-mail.ts` like every other user mail.
 *
 * Both `name` and `recipient` must be HTML-escaped by the caller — this module
 * interpolates them into markup unchanged.
 */

export interface WelcomeEmailInput {
  /** HTML-escaped display name of the new user. */
  name: string;
  /** HTML-escaped recipient address; shown in the transactional footer. */
  recipient: string;
}

export const WELCOME_EMAIL_SUBJECT = 'Welcome to Clean-Core.io — your workspace is live';

/** Condensed from /first-run, which is the click-by-click version. One line each. */
const FIRST_RUN_STEPS: string[] = [
  'On the dashboard, scroll to <strong>Try it with an example</strong> and pick a card. No SAP connection, no code of your own.',
  'One click creates the project and stages the source. <strong>Z_MATERIAL_STOCK_CALC</strong> is a good first pick at 99 lines.',
  'Start the analysis. The deterministic engine finds the evidence first &mdash; findings with line numbers &mdash; and the AI writes around it.',
  'Walk stages 3 to 7, then download the abapGit package and the signed audit evidence pack.',
];

/** The block people forward to their security officer. Every line is implemented. */
const SECURITY_POINTS: string[] = [
  '<strong>EU processing.</strong> Google Cloud europe-west1 (Belgium), on an EU Firestore database.',
  '<strong>Your code does not train a model.</strong> Not used for training per the Gemini API terms; transient processing and caching may occur under those terms.',
  '<strong>Keys never reach the browser.</strong> Every model call goes through a server-side proxy; a BYOK key is encrypted at rest with AES-256-GCM in a server-only store.',
  '<strong>Evidence you can re-verify.</strong> Each analysis is an immutable, HMAC-signed Run, and the audit pack you download can be checked independently.',
  '<strong>Multi-factor authentication.</strong> Recommended for every account, and required before you connect a live S/4HANA tenant or store your own Gemini key. Set it up under Settings &rarr; Security with a TOTP authenticator app; from then on the factor is checked server-side on every sensitive request.',
  '<strong>Live SAP connections stay opt-in.</strong> Connecting a non-production sandbox is a separate, admin-reviewed request; read-only, and production endpoints are blocked.',
  '<strong>Erasure is self-service.</strong> Settings &rarr; Danger Zone deletes your profile, projects, runs, secrets and login (GDPR Art. 17).',
];

/**
 * Built with the plain user-mail layout (`lib/user-mail.ts`): paragraphs and
 * one link, the dashboard, at the end. The first-run guide, the Settings page
 * and the Trust page are named, not linked — every inline URL was part of what
 * put the old version in spam at web.de (seed run 24.09.2026).
 */
export function buildWelcomeEmail({ name, recipient }: WelcomeEmailInput): string {
  const quota = String(COMMUNITY_QUOTA);
  return buildUserMail({
    greeting: `Hello ${name},`,
    paragraphs: [
      '<strong>Your workspace is live.</strong> Your Clean-Core.io account is active &mdash; nothing to wait for and nobody to sign it off. Everything you need for a first result is below.',
      `<strong>Your first run &mdash; about fifteen minutes.</strong><br>${FIRST_RUN_STEPS.map((s, i) => `${i + 1}. ${s}`).join('<br>')}<br>The click-by-click version is <strong>Your First Run</strong>, linked in the footer of every page.`,
      `<strong>What &ldquo;free&rdquo; means.</strong> ${quota} free transformations. Only the analysis in stage 1 is metered &mdash; the six stages after it are included, and re-analysing the same source is free. The starter examples on your dashboard are free the first time you run each of them; starting the same example again is an ordinary analysis and uses one run, once that analysis completes. Add your own Gemini key under Settings for unlimited runs, still at no cost (storing a key needs multi-factor authentication on your account).`,
      `<strong>Security and data protection</strong> &mdash; the part to forward to whoever signs this off. <strong>Trust &amp; Transparency</strong>, also in the footer of every page, covers each point in detail.<br>${SECURITY_POINTS.join('<br>')}`,
      `<strong>Tell us where it is wrong.</strong> The findings are the part worth judging us on &mdash; reply to this mail or write to ${CONTACT_EMAIL}.`,
    ],
    link: { lead: 'Open your workspace:', url: `${APP_BASE_URL}/dashboard` },
    footer: [
      `Sent to ${recipient} because an account was created for that address on Clean-Core.io.`,
      'Data erasure (Art. 17 GDPR): remove your profile and login yourself under Settings &rarr; Danger Zone; encrypted backups age out within 30 days.',
    ],
  });
}
