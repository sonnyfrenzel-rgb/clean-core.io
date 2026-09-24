import { APP_BASE_URL, CONTACT_EMAIL } from '@/lib/constants';
import { buildUserMail } from '@/lib/user-mail';

/**
 * The three mails about live S/4HANA tenant access that go to the *user*:
 * request received, access granted, access withdrawn.
 *
 * They were template literals inside their route handlers, each with its own
 * card, gradient button, badges and emoji headings. Roadmap 3.0.9 (round 2)
 * moved them here and onto the plain user-mail layout, `lib/user-mail.ts`:
 * paragraphs and one link, the dashboard, at the end. The administrator's copy
 * of a request (`app/api/request-tenant-access/route.ts`, `emailHtml`) stays in
 * its route; it goes to one watched mailbox, not to a user.
 *
 * Both inputs must be HTML-escaped by the caller. The `to` of the send is the
 * raw address and never one of these values — escaping belongs to the markup,
 * not to the envelope.
 */

export interface TenantMailInput {
  /** HTML-escaped display name. */
  name: string;
  /** HTML-escaped recipient address, shown in the footer. */
  recipient: string;
}

const ERASURE_NOTE =
  'Data erasure (Art. 17 GDPR): remove your profile and login yourself under Settings &rarr; Danger Zone; encrypted backups age out within 30 days.';

const dashboardLink = (lead: string) => ({ lead, url: `${APP_BASE_URL}/dashboard` });

/* --------------------------------------------------------- request received */

export const TENANT_PENDING_SUBJECT = 'Clean-Core.io: your S/4HANA tenant access request is under review';

export function buildTenantPendingEmail({ name, recipient }: TenantMailInput): string {
  return buildUserMail({
    greeting: `Hello ${name},`,
    paragraphs: [
      'We have received your request to connect your own S/4HANA tenant (BYOT) in stage 5, Testing.',
      'Every custom sandbox endpoint is reviewed by hand before access is granted; this usually takes up to 24 hours. You will get a mail once access is active.',
      'In the meantime: use non-production development or test tenants only. Basic authentication or OAuth 2.0 client credentials can be stored for the connection. Connection checks are sent from the Clean-Core.io server as read-only requests; business, transactional and master data from your tenant is not stored.',
    ],
    link: dashboardLink('Your workspace:'),
    footer: [`Sent to ${recipient} to confirm your tenant access request on Clean-Core.io.`],
  });
}

/* ------------------------------------------------------------ access granted */

export const TENANT_APPROVAL_SUBJECT = 'Your S/4HANA tenant access on Clean-Core.io is active';

export function buildTenantApprovalEmail({ name, recipient }: TenantMailInput): string {
  return buildUserMail({
    greeting: `Hello ${name},`,
    paragraphs: [
      'Your request to connect a live S/4HANA Public Cloud tenant has been reviewed and approved. You can now connect your non-production SAP environment in stage 5 to check the connection and read OData metadata. Running the generated tests against the tenant stays locked until the isolated live runner is switched on; until then they run against mocks.',
      'In stage 5, open the tab "Check tenant connection", enter your credentials and choose "Test Connection".',
      '<strong>Credentials stay on the server.</strong> They are encrypted with AES-256-GCM in a server-only store, decrypted only for the server-side calls to your tenant, and never returned to the browser.',
      '<strong>Guidelines for a safe connection.</strong> Prefer importing the connection as a BTP HTTP destination (JSON) over entering credentials by hand. Use OAuth 2.0 SAML bearer assertions where you want user-specific identity propagation and audit logs in the target system. For on-premise development tenants, route traffic through the SAP Cloud Connector so your firewall stays closed. Connection checks and metadata reads are read-only requests from the Clean-Core.io server.',
      '<strong>What is available now.</strong> A connection check, the OData metadata and one read-only call against your non-production tenant; the stored credentials; and a log of the read-only requests sent to the tenant.',
    ],
    link: dashboardLink('Your workspace:'),
    footer: [`Sent to ${recipient} because tenant access was granted for this account on Clean-Core.io.`, ERASURE_NOTE],
  });
}

/* ---------------------------------------------------------- access withdrawn */

export const TENANT_REVOKE_SUBJECT = 'Your S/4HANA tenant access on Clean-Core.io has been suspended';

export function buildTenantRevokeEmail({ name, recipient }: TenantMailInput): string {
  return buildUserMail({
    greeting: `Hello ${name},`,
    paragraphs: [
      'Your access for connecting a live S/4HANA Public Cloud tenant has been suspended by the Clean-Core.io administration. Typical reasons are the end of an evaluation period, an administrative change or routine security housekeeping.',
      'Your projects remain intact. Connection checks against your tenant are unavailable until access is granted again. Generated tests always run against mocks, so they keep working as before, and your connection credentials remain stored encrypted.',
      `<strong>To restore access</strong>, write to ${CONTACT_EMAIL} for a review, or submit a new request under Settings with an updated description of your scenario. Your own Gemini key (BYOK) keeps working for everything else.`,
    ],
    link: dashboardLink('Your workspace:'),
    footer: [`Sent to ${recipient} because tenant access for this account on Clean-Core.io changed.`, ERASURE_NOTE],
  });
}
