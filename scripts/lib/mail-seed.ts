/**
 * The deliverability seed test (roadmap 3.0.9): every mail the product sends,
 * rendered from the real templates and shaped exactly as production hands it
 * to Resend — only the recipient and a subject prefix differ.
 *
 * "Erst messen, dann drehen" only works if what is measured is the real thing.
 * A seed mail with a different sender, a missing text part or a missing
 * `List-Unsubscribe` header measures something nobody sends, so every entry
 * below copies the payload of its production call site field by field and
 * names that call site in `source`. Where production differs between mails —
 * only the survey carries RFC 8058 headers, the operator mails keep their own
 * senders — the seed differs the same way. Evening those out would be fixing
 * the mail inside the measuring instrument; a difference is fixed in the
 * product, and the seed follows.
 *
 * What the seed does check is whether production keeps the rules the first
 * measurement (run 20260924-a) taught: `mailPolicyWarnings` lists, per type, a
 * missing text part, an emoji or exclamation mark in the subject, a link
 * outside https://clean-core.io/ and a user mail under any sender but the one.
 * The dry run prints the list; `tests/mail-seed-test.spec.ts` fails on it.
 *
 * One template is not a module but a template literal inside a route handler:
 * the operator's copy of a tenant request (`request-tenant-access`, `emailHtml`;
 * the three tenant mails to users moved to `lib/tenant-email.ts` in 3.0.9). It
 * is read out of the route source here, the way `tests/email-responsive.spec.ts`
 * already does, and every `${…}` hole is
 * filled from an explicit table. An unknown hole is an error, not a blank: a
 * template that grew a new variable must stop the seed test, not ship a mail
 * with a gap in it. Every text part comes from the one converter every call
 * site uses, `lib/mail-text.ts`.
 *
 * What this module never does: write to Firestore, sign a token, or call a
 * route. Every link that production signs (survey vote, unsubscribe,
 * invitation, tenant approval, address confirmation) carries a token of the
 * right shape that no key has signed — a seed recipient who clicks, or a
 * gateway that pre-fetches, gets the product's "invalid link" answer and
 * nothing is recorded. `sendTransactionalMail` is deliberately not used: it
 * calls `recordEmailSent`, which writes `email_events/{id}` (and can mirror a
 * verdict onto `registration_requests`).
 *
 * No address is written in this file or its spec except at example.com — the
 * recipient list comes from a file outside the repository (public repo).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { APP_BASE_URL, CONTACT_EMAIL, USER_MAIL_FROM, USER_MAIL_REPLY_TO } from '../../lib/constants';
import { APP_VERSION } from '../../lib/version';
import { escapeHtml } from '../../lib/utils';
import { wrapEmailDocument } from '../../lib/email-layout';
import { htmlToText } from '../../lib/mail-text';
import { ownDomainVerifyEmailLink } from '../../lib/auth-action-link';
import { buildWelcomeEmail, WELCOME_EMAIL_SUBJECT } from '../../lib/welcome-email';
import { buildAdminSignupEmail, buildAdminSignupSubject } from '../../lib/admin-signup-email';
import {
  buildInvitationEmail,
  INVITATION_EMAIL_SUBJECT,
  buildAddressConfirmationEmail,
  ADDRESS_CONFIRMATION_SUBJECT,
} from '../../lib/invitation-email';
import { invitationLinkPath } from '../../lib/invitations';
import { SURVEY_CAMPAIGN, SURVEY_QUESTIONS, SURVEY_SUBJECT } from '../../lib/survey/definition';
import { renderSurveyInviteEmail, renderSurveyInviteText } from '../../lib/survey/invite-email';
import { summarise, type SurveyResponse } from '../../lib/survey/store';
import {
  renderSurveyDigestEmail,
  renderSurveyDigestSubject,
  renderSurveyDigestText,
} from '../../lib/survey/digest-email';
import type { UsageReport } from '../../lib/usage-report';
import {
  renderUsageReportEmail,
  renderUsageReportSubject,
  renderUsageReportText,
} from '../../lib/usage-report-email';
import { renderSecurityAlert } from '../../lib/security-alert-email';
import {
  buildTenantPendingEmail,
  TENANT_PENDING_SUBJECT,
  buildTenantApprovalEmail,
  TENANT_APPROVAL_SUBJECT,
  buildTenantRevokeEmail,
  TENANT_REVOKE_SUBJECT,
} from '../../lib/tenant-email';

const ROOT = path.resolve(__dirname, '..', '..');

/* ----------------------------------------------------------- the recipients */

export interface SeedRecipient {
  /** Short provider name, e.g. `gmail` — what the placement sheet calls it. */
  label: string;
  address: string;
}

const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const ADDRESS = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

/**
 * One recipient per line, `<label> <address>`; `#` starts a comment, blank
 * lines are ignored. An error names the line number and never repeats the
 * address — the message may end up somewhere a list of addresses should not.
 */
export function parseRecipientFile(text: string): SeedRecipient[] {
  const out: SeedRecipient[] = [];
  const labels = new Set<string>();
  const addresses = new Set<string>();
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const parts = line.split(/\s+/);
    const where = `recipient file line ${i + 1}`;
    if (parts.length !== 2) throw new Error(`${where}: expected "<label> <address>", found ${parts.length} field(s)`);
    const [label, rawAddress] = parts;
    if (!LABEL.test(label)) throw new Error(`${where}: label must be letters, digits, '.', '_' or '-' (max. 40)`);
    const address = rawAddress.trim().toLowerCase();
    if (!ADDRESS.test(address)) throw new Error(`${where}: the second field is not an e-mail address`);
    if (labels.has(label)) throw new Error(`${where}: label "${label}" is used twice`);
    if (addresses.has(address)) throw new Error(`${where}: the same address is listed twice`);
    labels.add(label);
    addresses.add(address);
    out.push({ label, address });
  });
  if (out.length === 0) throw new Error('the recipient file names nobody');
  return out;
}

/** `gmail.com` from an address — enough to read a log without holding a list. */
export function addressDomain(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1);
}

/* ---------------------------------------------------------------- run ids */

const RUN_ID = /^[A-Za-z0-9-]{4,32}$/;

export function isValidRunId(id: string): boolean {
  return RUN_ID.test(id);
}

export function newRunId(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `${day}-${crypto.randomBytes(2).toString('hex')}`;
}

/* ------------------------------------------------------ the production shape */

/** Exactly the fields the production call site hands to `POST /emails`. */
export interface ProductionMail {
  from: string;
  /** `undefined` where production sends no `reply_to` (security alert). */
  replyTo?: string;
  subject: string;
  html: string;
  /** `undefined` where production sends HTML only — which the policy flags. */
  text?: string;
  /** Mail headers, e.g. RFC 8058 on the survey. */
  headers?: Record<string, string>;
}

export interface SeedContext {
  runId: string;
  recipient: SeedRecipient;
  /** Fixed for a run, so that a rendered mail does not depend on the clock. */
  now: Date;
}

export interface SeedMailType {
  /** Short id, used in the subject prefix, file names and the placement sheet. */
  type: string;
  /** `nutzer` = goes to a person using the product; `betrieb` = to the operator. */
  audience: 'nutzer' | 'betrieb';
  /** The production call site whose payload this copies. */
  source: string;
  /** The template the body comes from. */
  template: string;
  build(ctx: SeedContext): ProductionMail;
}

/** A value shaped like a signed token that no key has signed. Deterministic per run. */
export function unsignedToken(purpose: string, ctx: SeedContext): string {
  const payload = `seed-3.0.9.${purpose}.${ctx.runId}.${ctx.recipient.label}.not-signed`;
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHash('sha256').update(`unsigned|${payload}`).digest('hex');
  return `${b64}.${sig}`;
}

function sampleId(prefix: string, ctx: SeedContext): string {
  return `${prefix}-${ctx.runId}-${ctx.recipient.label}`.toLowerCase();
}

const SEED_NAME = 'Seed Test';

/* ----------------------------------------- templates that live inside a route */

const routeCache = new Map<string, string>();
function routeSource(rel: string): string {
  if (!routeCache.has(rel)) routeCache.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  return routeCache.get(rel)!;
}

/**
 * Reads `const <name> = \`…\`` out of a source file and fills every `${expr}`
 * from `scope`, keyed by the expression text. Throws on an unknown expression
 * and on any escape sequence other than an escaped backtick — both would mean
 * the template no longer looks the way this reader was written for.
 */
export function renderSourceTemplate(source: string, name: string, scope: Record<string, string>): string {
  const decl = source.indexOf(`const ${name} = \``);
  if (decl < 0) throw new Error(`template ${name} not found`);
  const open = source.indexOf('`', decl);
  let out = '';
  let i = open + 1;
  for (;;) {
    if (i >= source.length) throw new Error(`template ${name} is not closed`);
    const ch = source[i];
    if (ch === '\\') {
      if (source[i + 1] !== '`') throw new Error(`template ${name}: unsupported escape \\${source[i + 1]}`);
      out += '`';
      i += 2;
      continue;
    }
    if (ch === '`') break;
    if (ch === '$' && source[i + 1] === '{') {
      const end = source.indexOf('}', i + 2);
      const expr = source.slice(i + 2, end).trim();
      if (!(expr in scope)) throw new Error(`template ${name}: no seed value for \${${expr}}`);
      out += scope[expr];
      i = end + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/* --------------------------------------------------------- sample payloads */

function sampleUsageReport(now: Date): UsageReport {
  const day = 24 * 60 * 60 * 1000;
  const person = (n: string) => ({ name: `Seed Person ${n}`, email: `seed-person-${n.toLowerCase()}@example.com` });
  return {
    generatedAt: now,
    periodStart: new Date(now.getTime() - 7 * day),
    periodEnd: now,
    current: { registrations: 3, activations: 2, activeAccounts: 5, runs: 14, projects: 4, units: 11 },
    previous: { registrations: 2, activations: 1, activeAccounts: 4, runs: 9, projects: 3, units: 8 },
    totals: {
      accounts: 40, activated: 12, neverStarted: 28, atLimit: 1, byok: 1,
      unitsUsed: 61, unitsGranted: 200, objectsAnalysed: 57, runsAllTime: 131,
    },
    newAccounts: [
      { ...person('A'), when: new Date(now.getTime() - 2 * day) },
      { ...person('B'), when: new Date(now.getTime() - 4 * day) },
    ],
    newlyActivated: [{ ...person('A'), runs: 3 }],
    reachedLimit: [person('C')],
    delivery: {
      sent: 6, delivered: 4, delayed: 0, bounced: 1, complained: 0, opened: 2, awaiting: 1,
      failures: [{
        to: 'seed-person-d@example.com', kind: 'welcome', status: 'email.bounced',
        detail: 'Seed sample: mailbox does not exist', at: new Date(now.getTime() - day),
      }],
    },
  };
}

function sampleSurveyResponses(now: Date): SurveyResponse[] {
  const answers = (pick: number): Record<string, string | string[]> =>
    Object.fromEntries(SURVEY_QUESTIONS.map((q) => {
      const o = q.options[Math.min(pick, q.options.length - 1)].id;
      return [q.id, q.multi ? [o] : o];
    }));
  const r = (n: number, pick: number, comment: string | null): SurveyResponse => ({
    campaign: SURVEY_CAMPAIGN,
    uid: `seed-uid-${n}`,
    email: `seed-person-${n}@example.com`,
    name: `Seed Person ${n}`,
    answers: answers(pick),
    comment,
    linkFetchedAt: now,
    confirmedAt: now,
    updatedAt: now,
  });
  return [
    r(1, 0, 'Seed sample comment — written for the 3.0.9 deliverability test, not by a person.'),
    r(2, 1, null),
    r(3, 0, null),
  ];
}

/* --------------------------------------------------------- the catalogue */

const REGISTER = 'app/api/account/register/route.ts';
const APPROVAL = 'app/api/send-approval-email/route.ts';
const TENANT_REQ = 'app/api/request-tenant-access/route.ts';
const TENANT_OK = 'app/api/send-tenant-approval-email/route.ts';
const TENANT_REVOKE = 'app/api/send-tenant-revoke-email/route.ts';

/**
 * Every mail the product sends, in the order a new user would meet them.
 * `tests/mail-seed-test.spec.ts` checks that every Resend call site in the
 * repository is named by one of these `source` values.
 */
export const SEED_MAIL_TYPES: SeedMailType[] = [
  {
    type: 'welcome',
    audience: 'nutzer',
    source: REGISTER,
    template: 'lib/welcome-email.ts',
    build: ({ recipient }) => {
      const html = wrapEmailDocument(buildWelcomeEmail({ name: escapeHtml(SEED_NAME), recipient: escapeHtml(recipient.address) }));
      return {
        from: USER_MAIL_FROM,
        replyTo: CONTACT_EMAIL,
        subject: WELCOME_EMAIL_SUBJECT,
        html,
        text: htmlToText(html),
      };
    },
  },
  {
    // The same template through the admin console's "approve" path. It went out
    // without a text part until run 20260924-a put it in spam at Microsoft 365
    // next to the identical welcome mail with one in the inbox.
    type: 'welcome-approval',
    audience: 'nutzer',
    source: APPROVAL,
    template: 'lib/welcome-email.ts',
    build: ({ recipient }) => {
      const html = wrapEmailDocument(buildWelcomeEmail({ name: escapeHtml(SEED_NAME), recipient: escapeHtml(recipient.address) }));
      return { from: USER_MAIL_FROM, replyTo: CONTACT_EMAIL, subject: WELCOME_EMAIL_SUBJECT, html, text: htmlToText(html) };
    },
  },
  {
    type: 'invitation',
    audience: 'nutzer',
    source: 'app/api/projects/[projectId]/invitations/route.ts',
    template: 'lib/invitation-email.ts',
    build: (ctx) => {
      const link = `${APP_BASE_URL}${invitationLinkPath(sampleId('seed-project', ctx), sampleId('seed-invitation', ctx))}`;
      const expires = new Date(ctx.now.getTime() + 14 * 24 * 60 * 60 * 1000).toUTCString().slice(5, 16);
      const html = wrapEmailDocument(
        buildInvitationEmail({ inviterName: escapeHtml(SEED_NAME), recipient: escapeHtml(ctx.recipient.address), link, expires }),
        'Clean-Core.io — invitation',
      );
      // lib/transactional-mail.ts: DEFAULT_FROM, reply_to USER_MAIL_REPLY_TO, text from htmlToText.
      return { from: USER_MAIL_FROM, replyTo: USER_MAIL_REPLY_TO, subject: INVITATION_EMAIL_SUBJECT, html, text: htmlToText(html) };
    },
  },
  {
    type: 'address-confirmation',
    audience: 'nutzer',
    source: 'app/api/projects/[projectId]/invitations/[invitationId]/accept/route.ts',
    template: 'lib/invitation-email.ts',
    build: (ctx) => {
      // Production: Firebase Admin `generateEmailVerificationLink` (a link on the
      // project's authDomain), rewritten by `ownDomainVerifyEmailLink` onto
      // /auth/action on our own domain. Same shape here, through the same
      // function; an oobCode Firebase never issued.
      const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase-config.json'), 'utf8')) as { authDomain: string; apiKey: string };
      const q = new URLSearchParams({ mode: 'verifyEmail', oobCode: unsignedToken('oob', ctx).replace('.', ''), apiKey: cfg.apiKey, lang: 'en' });
      const link = ownDomainVerifyEmailLink(`https://${cfg.authDomain}/__/auth/action?${q}`);
      const html = wrapEmailDocument(
        buildAddressConfirmationEmail({ recipient: escapeHtml(ctx.recipient.address), link }),
        'Clean-Core.io — confirm your address',
      );
      return { from: USER_MAIL_FROM, replyTo: USER_MAIL_REPLY_TO, subject: ADDRESS_CONFIRMATION_SUBJECT, html, text: htmlToText(html) };
    },
  },
  {
    type: 'tenant-pending',
    audience: 'nutzer',
    source: TENANT_REQ,
    template: 'lib/tenant-email.ts (buildTenantPendingEmail)',
    build: ({ recipient }) => {
      const html = wrapEmailDocument(buildTenantPendingEmail({ name: escapeHtml(SEED_NAME), recipient: escapeHtml(recipient.address) }));
      return { from: USER_MAIL_FROM, replyTo: CONTACT_EMAIL, subject: TENANT_PENDING_SUBJECT, html, text: htmlToText(html) };
    },
  },
  {
    type: 'tenant-approval',
    audience: 'nutzer',
    source: TENANT_OK,
    template: 'lib/tenant-email.ts (buildTenantApprovalEmail)',
    build: ({ recipient }) => {
      const html = wrapEmailDocument(buildTenantApprovalEmail({ name: escapeHtml(SEED_NAME), recipient: escapeHtml(recipient.address) }));
      return { from: USER_MAIL_FROM, replyTo: CONTACT_EMAIL, subject: TENANT_APPROVAL_SUBJECT, html, text: htmlToText(html) };
    },
  },
  {
    type: 'tenant-revoke',
    audience: 'nutzer',
    source: TENANT_REVOKE,
    template: 'lib/tenant-email.ts (buildTenantRevokeEmail)',
    build: ({ recipient }) => {
      const html = wrapEmailDocument(buildTenantRevokeEmail({ name: escapeHtml(SEED_NAME), recipient: escapeHtml(recipient.address) }));
      return { from: USER_MAIL_FROM, replyTo: CONTACT_EMAIL, subject: TENANT_REVOKE_SUBJECT, html, text: htmlToText(html) };
    },
  },
  {
    type: 'survey',
    audience: 'nutzer',
    source: 'scripts/send-survey.ts',
    template: 'lib/survey/invite-email.ts',
    build: (ctx) => {
      // send-survey.ts builds the unsubscribe URL on a fixed https://clean-core.io.
      const unsubscribeUrl = `https://clean-core.io/api/unsubscribe?t=${encodeURIComponent(unsignedToken('unsub', ctx))}`;
      const closesOn = new Date(ctx.now.getTime() + 7 * 24 * 60 * 60 * 1000)
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const input = {
        name: escapeHtml('Seed'),
        recipient: escapeHtml(ctx.recipient.address),
        token: unsignedToken('survey', ctx),
        closesOn,
        unsubscribeUrl,
      };
      return {
        from: USER_MAIL_FROM,
        replyTo: USER_MAIL_REPLY_TO,
        subject: SURVEY_SUBJECT,
        html: wrapEmailDocument(renderSurveyInviteEmail(input), 'Clean-Core.io survey'),
        text: renderSurveyInviteText(input),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:info@clean-core.io?subject=Unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      };
    },
  },
  {
    type: 'admin-signup',
    audience: 'betrieb',
    source: REGISTER,
    template: 'lib/admin-signup-email.ts',
    build: (ctx) => {
      const html = wrapEmailDocument(buildAdminSignupEmail({
        name: escapeHtml(SEED_NAME),
        email: escapeHtml(ctx.recipient.address),
        uid: escapeHtml(sampleId('seed-uid', ctx)),
        motivation: escapeHtml('Seed test 3.0.9 — deliverability measurement, not a real sign-up.'),
        authMethod: 'Email / password',
        termsVersion: '2026-09-18',
        signedUpAt: ctx.now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      }));
      return {
        from: 'Clean-Core <system@clean-core.io>',
        replyTo: CONTACT_EMAIL,
        subject: buildAdminSignupSubject(SEED_NAME),
        html,
        text: htmlToText(html),
      };
    },
  },
  {
    type: 'tenant-request',
    audience: 'betrieb',
    source: TENANT_REQ,
    template: `${TENANT_REQ} (emailHtml)`,
    build: (ctx) => {
      const src = routeSource(TENANT_REQ);
      const uid = sampleId('seed-uid', ctx);
      const url = (action: string) =>
        `${APP_BASE_URL}/admin/approve-tenant?${new URLSearchParams({ uid, token: unsignedToken(`tenant-${action}`, ctx), action })}`;
      const scope = {
        name: escapeHtml(SEED_NAME), email: escapeHtml(ctx.recipient.address), uid,
        motivation: escapeHtml('Seed test 3.0.9 — deliverability measurement, not a real request.'),
        approveUrl: url('approve'), rejectUrl: url('reject'), APP_VERSION,
      };
      const html = wrapEmailDocument(renderSourceTemplate(src, 'emailHtml', scope));
      return {
        from: 'Clean-Core.io <system@clean-core.io>',
        replyTo: CONTACT_EMAIL,
        subject: renderSourceTemplate(src, 'emailSubject', scope),
        html,
        text: htmlToText(html),
      };
    },
  },
  {
    type: 'survey-digest',
    audience: 'betrieb',
    source: 'scripts/send-survey-digest.ts',
    template: 'lib/survey/digest-email.ts',
    build: ({ now }) => {
      const summary = summarise(SURVEY_CAMPAIGN, 12, sampleSurveyResponses(now));
      return {
        from: 'Clean-Core.io Report <info@clean-core.io>',
        replyTo: 'info@clean-core.io',
        subject: renderSurveyDigestSubject(summary, 4),
        html: wrapEmailDocument(renderSurveyDigestEmail(summary, 4), 'Survey interim result'),
        text: renderSurveyDigestText(summary, 4),
      };
    },
  },
  {
    type: 'usage-report',
    audience: 'betrieb',
    source: 'scripts/send-usage-report.ts',
    template: 'lib/usage-report-email.ts',
    build: ({ now }) => {
      const report = sampleUsageReport(now);
      return {
        from: 'Clean-Core.io Report <info@clean-core.io>',
        replyTo: 'info@clean-core.io',
        subject: renderUsageReportSubject(report),
        html: renderUsageReportEmail(report),
        text: renderUsageReportText(report),
      };
    },
  },
  {
    type: 'security-alert',
    audience: 'betrieb',
    source: 'scripts/send-security-alert.ts',
    template: 'lib/security-alert-email.ts',
    build: ({ now }) => {
      const mail = renderSecurityAlert({
        failedJobs: ['Dependency audit (npm audit)'],
        runUrl: 'https://github.com/sonnyfrenzel-rgb/clean-core.io/actions/runs/1',
        runStartedAt: now.toISOString(),
        test: false,
      });
      // Production sends no reply_to here.
      return { from: 'Clean-Core.io Security <info@clean-core.io>', subject: mail.subject, text: mail.text, html: mail.html };
    },
  },
];

/* ------------------------------------------------------------ the seed run */

export function seedSubject(type: string, runId: string, subject: string): string {
  return `[Seed 3.0.9 ${type} ${runId}] ${subject}`;
}

/** Resend's `Idempotency-Key`: stable per run, type and address — and never the address itself. */
export function seedIdempotencyKey(runId: string, type: string, address: string): string {
  const h = crypto.createHash('sha256').update(address.trim().toLowerCase()).digest('hex').slice(0, 24);
  return `seed-${runId}-${type}-${h}`;
}

/** Every distinct `scheme://host` a message links to, HTML and text part together. */
export function linkHosts(mail: Pick<ProductionMail, 'html' | 'text' | 'headers'>): string[] {
  const hay = [mail.html, mail.text || '', ...Object.values(mail.headers || {})].join('\n');
  const hosts = new Set<string>();
  for (const m of hay.matchAll(/\b(https?):\/\/([^/\s"'<>)?#]+)/gi)) hosts.add(`${m[1].toLowerCase()}://${m[2].toLowerCase()}`);
  for (const m of hay.matchAll(/\bmailto:([^\s"'<>?)]+)/gi)) hosts.add(`mailto:${addressDomain(m[1].toLowerCase())}`);
  return [...hosts].sort();
}

/* ------------------------------------------------------------ the policy */

/**
 * Links a mail may carry outside https://clean-core.io/, per type, with the
 * reason. Only operator mails have any: they go to one watched mailbox.
 */
export const LINK_EXCEPTIONS: Record<string, { hosts: string[]; why: string }> = {
  'security-alert': {
    hosts: ['https://github.com'],
    why: 'links the failed GitHub Actions run; operator mail, never to a user',
  },
};

// Emoji and their building blocks: pictographs, variation selector 16, keycaps,
// regional indicators (flags).
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{20E3}\u{1F1E6}-\u{1F1FF}]/u;

/**
 * What seed run 20260924-a and ordinary practice say every product mail must
 * keep. An empty list is a pass; each entry is one sentence naming the rule.
 *
 * - a `text/plain` part (M365: the same mail without one went to spam);
 * - a plain subject: no emoji, no exclamation mark; no emoji in the body either;
 * - user mails in the plain layout (roadmap 3.0.9, round 2): exactly one link,
 *   shown as its URL (the survey may add its unsubscribe link), no button,
 *   table or image markup;
 * - every link on https://clean-core.io/ (mailto: is not a link to a site),
 *   apart from the documented `LINK_EXCEPTIONS`;
 * - user mails under the one sender, `USER_MAIL_FROM` with replies to
 *   `USER_MAIL_REPLY_TO`. Operator mails keep their own and are not checked.
 */
export function mailPolicyWarnings(
  t: Pick<SeedMailType, 'type' | 'audience'>,
  mail: ProductionMail,
  /** Extra origins counted as own — only for a render whose APP_BASE_URL is not production (specs). */
  alsoOwn: string[] = [],
): string[] {
  const out: string[] = [];
  if (mail.text === undefined || mail.text.trim() === '') out.push('no text/plain part');
  if (EMOJI.test(mail.subject)) out.push(`emoji in the subject: "${mail.subject}"`);
  if (mail.subject.includes('!')) out.push(`exclamation mark in the subject: "${mail.subject}"`);
  const allowed = new Set([...(LINK_EXCEPTIONS[t.type]?.hosts ?? []), ...alsoOwn]);
  const foreign = linkHosts(mail).filter((h) => h !== 'https://clean-core.io' && !h.startsWith('mailto:') && !allowed.has(h));
  if (foreign.length) out.push(`links outside https://clean-core.io/: ${foreign.join(' ')}`);
  // Emoji anywhere in the message, not only in the subject: a badge like
  // "⚡ Approve" is as much a bulk-mail marker in the body.
  if (EMOJI.test(mail.html) || EMOJI.test(mail.text ?? '')) out.push('emoji in the body');
  if (t.audience === 'nutzer') {
    // The plain layout (lib/user-mail.ts): one link, shown as its URL, and no
    // button, table scaffolding or image. The survey's unsubscribe link is the
    // one allowed extra, and only in a mail that declares List-Unsubscribe.
    const allowedLinks = 1 + (mail.headers?.['List-Unsubscribe'] ? 1 : 0);
    const links = htmlLinkCount(mail.html);
    if (links !== allowedLinks) out.push(`user mail has ${links} link(s), not ${allowedLinks}`);
    for (const m of mail.html.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      if (m[2].trim() !== m[1]) out.push(`user mail link not shown as its URL: "${m[2].trim().slice(0, 40)}"`);
    }
    if (/<table\b|<img\b|<button\b/i.test(mail.html)) out.push('user mail has table, image or button markup');
    if (/<a\s[^>]*style="[^"]*(?:background|padding|display)/i.test(mail.html)) out.push('user mail has a link styled as a button');
    if (!mail.html.includes('data-mail-layout="plain"')) out.push('user mail not built with lib/user-mail.ts');
    if (mail.from !== USER_MAIL_FROM) out.push(`user mail not from "${USER_MAIL_FROM}": "${mail.from}"`);
    if (mail.replyTo !== USER_MAIL_REPLY_TO) out.push(`user mail reply-to is not ${USER_MAIL_REPLY_TO}: ${mail.replyTo ?? '(none)'}`);
  }
  return out;
}

/** How many `<a href>` the HTML part carries — buttons and plain links alike. */
export function htmlLinkCount(html: string): number {
  return (html.match(/<a\s[^>]*href=/gi) || []).length;
}

export interface SeedMessage {
  type: string;
  audience: SeedMailType['audience'];
  source: string;
  label: string;
  /** Only the domain, for anything that is printed. */
  domain: string;
  to: string;
  subject: string;
  htmlBytes: number;
  textBytes: number | null;
  headers: Record<string, string>;
  hosts: string[];
  /** Links that do not start with https://clean-core.io/ — roadmap 3.0.9 wants none. */
  foreignHosts: string[];
  /** Number of links in the HTML part. */
  linkCount: number;
  /** `mailPolicyWarnings` for this message; empty is a pass. */
  warnings: string[];
  idempotencyKey: string;
  html: string;
  /** The exact JSON body for `POST https://api.resend.com/emails`. */
  payload: Record<string, unknown>;
}

export function buildSeedMessage(t: SeedMailType, ctx: SeedContext): SeedMessage {
  const mail = t.build(ctx);
  const subject = seedSubject(t.type, ctx.runId, mail.subject);
  const payload: Record<string, unknown> = { from: mail.from, to: [ctx.recipient.address], subject };
  if (mail.replyTo) payload.reply_to = mail.replyTo;
  payload.html = mail.html;
  if (mail.text !== undefined) payload.text = mail.text;
  if (mail.headers) payload.headers = mail.headers;
  const hosts = linkHosts(mail);
  return {
    type: t.type,
    audience: t.audience,
    source: t.source,
    label: ctx.recipient.label,
    domain: addressDomain(ctx.recipient.address),
    to: ctx.recipient.address,
    subject,
    htmlBytes: Buffer.byteLength(mail.html, 'utf8'),
    textBytes: mail.text === undefined ? null : Buffer.byteLength(mail.text, 'utf8'),
    headers: mail.headers || {},
    hosts,
    foreignHosts: hosts.filter((h) => h !== 'https://clean-core.io' && !h.startsWith('mailto:')),
    linkCount: htmlLinkCount(mail.html),
    warnings: mailPolicyWarnings(t, mail),
    idempotencyKey: seedIdempotencyKey(ctx.runId, t.type, ctx.recipient.address),
    html: mail.html,
    payload,
  };
}

export function selectTypes(only: string | undefined): SeedMailType[] {
  if (!only) return SEED_MAIL_TYPES;
  const wanted = only.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = wanted.filter((w) => !SEED_MAIL_TYPES.some((t) => t.type === w));
  if (unknown.length) throw new Error(`unknown mail type(s): ${unknown.join(', ')}`);
  return SEED_MAIL_TYPES.filter((t) => wanted.includes(t.type));
}

export function planSeed(types: SeedMailType[], recipients: SeedRecipient[], runId: string, now: Date): SeedMessage[] {
  if (!isValidRunId(runId)) throw new Error('run id must be 4-32 letters, digits or dashes');
  const out: SeedMessage[] = [];
  for (const t of types) for (const recipient of recipients) out.push(buildSeedMessage(t, { runId, recipient, now }));
  return out;
}

/** The placement sheet Sonny fills in: one row per type and provider, verdict empty. */
export function placementCsv(types: SeedMailType[], recipients: SeedRecipient[]): string {
  const rows = ['typ,anbieter,ordner,notiz'];
  for (const t of types) for (const r of recipients) rows.push(`${t.type},${r.label},,`);
  return rows.join('\n') + '\n';
}

/** Allowed values of the `ordner` column. */
export const PLACEMENT_FOLDERS = ['inbox', 'promotions', 'spam', 'quarantaene', 'nicht-angekommen'] as const;
