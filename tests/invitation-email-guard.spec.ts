import { test, expect } from '@playwright/test';
import { wrapEmailDocument } from '../lib/email-layout';
import {
  buildInvitationEmail,
  buildAddressConfirmationEmail,
  INVITATION_EMAIL_SUBJECT,
} from '../lib/invitation-email';
import { INVITATION_DEFAULT_DAYS, INVITATION_MAX_DAYS } from '../lib/invitations';
import { APP_BASE_URL, CONTACT_EMAIL } from '../lib/constants';

/**
 * The invitation mail is the only place we can reach the person it is about.
 *
 * Their address came from the owner who typed it, not from them, so Art. 14
 * GDPR applies: controller, what is held, why, on what basis, for how long,
 * where it came from, and the rights. A promise nobody tests is one somebody
 * deletes on the next edit of a template, which is why every part of the notice
 * is named here rather than checked as "some legal text is present".
 *
 * The rendering half matters as well: the notice made the mail longer, and a
 * mail that reaches past the right edge of a phone is a notice nobody reads.
 * Same construction as `tests/registration-email-guard.spec.ts` — three ways a
 * client may hand the markup to its renderer, including the two that throw the
 * `<style>` block and the viewport meta away.
 */

const LONG_ADDRESS = 'a-fairly-long-address@some-customer-domain.example.com';

const invitation = () =>
  buildInvitationEmail({
    inviterName: 'Sonny Frenzel',
    recipient: LONG_ADDRESS,
    link: `${APP_BASE_URL}/invitation/project-abc/Ab3-_1758153600000`,
    expires: '02 Oct 2026',
  });

test.describe('Art. 14 GDPR notice in the invitation mail', () => {
  test('the invitation mail states every element Art. 14 asks for', () => {
    const html = invitation();

    // Where the address came from — the one fact that makes this Art. 14 and
    // not Art. 13, and the first thing the reader wants to know.
    expect(html, 'the mail no longer says the address came from the inviter').toMatch(
      /The person who invited you typed your address; you never gave it to us\./,
    );

    // The controller, in full. The imprint line in the footer is the same
    // identity, but Art. 14 owes it inside the notice itself.
    expect(html).toContain('Controller: Felix Frenzel, Hellerstra&szlig;e 9, 96047 Bamberg, Germany');
    expect(html).toContain(`mailto:${CONTACT_EMAIL}`);

    // What is held: the address now, the account uid and account address after
    // an acceptance. `lib/invitations.ts` stores nothing else about the invited
    // person, and the notice may not claim less or more.
    expect(html).toMatch(/account&rsquo;s id and the address on that account/);

    // Why, and the legal basis.
    expect(html).toContain('Art. 6(1)(f) GDPR');
    expect(html).toMatch(/legitimate interest in running an invitation feature a user asked for/);

    // How long — the two numbers come from the module that enforces them, so a
    // change to the policy cannot leave the mail stating the old one.
    expect(html).toContain(`after ${INVITATION_DEFAULT_DAYS} days by default and ${INVITATION_MAX_DAYS} at the most`);
    expect(html).toMatch(/deleted with the project/);
    expect(html).toMatch(/deleted if you delete a Clean-Core\.io account carrying this address/);

    // Who else gets the address — Art. 14(1)(e). Both are verified in the code:
    // `lib/transactional-mail.ts` posts it to api.resend.com, and the route
    // writes the invitation, address included, into Firestore with the Admin SDK.
    expect(html, 'the notice no longer names the mail provider').toContain('Resend');
    expect(html, 'the notice no longer names the hosting/database provider').toContain('Google Firebase');
    expect(html).toMatch(/Two processors handle it on our behalf/);

    // Third-country transfer — Art. 14(1)(f). Same two grounds, in the same
    // order, as section 4 of `app/datenschutz/page.tsx`; the mail may not tell a
    // reader something the policy it links to does not.
    expect(html).toContain('EU-U.S. Data Privacy Framework');
    expect(html).toContain('adequacy decision of 10 July 2023');
    expect(html).toContain('Art. 45 GDPR');
    expect(html).toContain('EU Standard Contractual Clauses');
    expect(html).toContain('Art. 46 GDPR');

    // The rights, all six.
    for (const right of ['access', 'rectification', 'erasure', 'restriction']) {
      expect(html, `the notice lost the right to ${right}`).toContain(right);
    }
    expect(html).toContain('Art. 21 GDPR');
    expect(html).toContain('complain to a supervisory authority');

    // …and which one. "A supervisory authority" leaves the reader to work out
    // ours from the controller's address; Art. 14 does not ask them to.
    expect(html, 'the competent authority is no longer named').toContain(
      'Bayerisches Landesamt f&uuml;r Datenschutzaufsicht (BayLDA)',
    );
    expect(html, 'the authority is named without an address to write to').toContain(
      'Promenade 18, 91522 Ansbach, Germany',
    );

    // The privacy policy, as a link and not as prose.
    const privacyUrl = `${APP_BASE_URL}/datenschutz#project-access`;
    expect(html, 'the privacy policy link is gone').toContain(`href="${privacyUrl}"`);
    expect(html).toContain(privacyUrl);
  });

  test('the notice stays behind the invitation, not in front of it', () => {
    const html = invitation();
    // The button is what the reader came for. Position is the whole of "keep it
    // visually secondary" that a string test can check, and it is the half that
    // gets lost when somebody moves a block while editing something else.
    const cta = html.indexOf('Open the invitation');
    const notice = html.indexOf('Art. 14 GDPR');
    expect(cta).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(cta);
    // …and it is small print: 12px, not the 15px of the invitation copy.
    expect(html).toMatch(/font-size: 12px;[^"]*"\s*>\s*<strong[^>]*>How we got your address/);
  });

  test('the confirmation mail deliberately carries no Art. 14 notice', () => {
    // It goes to somebody who already holds an account and gave us the address
    // themselves — Art. 13, answered by the privacy policy they accepted. A copy
    // of the Art. 14 notice here would be wrong, not merely redundant.
    const html = buildAddressConfirmationEmail({ recipient: LONG_ADDRESS, link: `${APP_BASE_URL}/verify` });
    expect(html).not.toContain('Art. 14');
    expect(html).not.toContain('Art. 6(1)(f)');
  });

  test('nothing in the notice is interpolated from a caller value', () => {
    // This module escapes nothing — `app/api/projects/[projectId]/invitations/route.ts`
    // does it at the call site. The guard is that the notice adds no new
    // interpolation of its own: built with hostile input in every field, the
    // notice's own text comes out identical.
    const hostile = buildInvitationEmail({
      inviterName: '"><script>alert(1)</script>',
      recipient: '"><img src=x onerror=alert(1)>',
      link: 'javascript:alert(1)',
      expires: '"><b>',
    });
    // Only the notice: the transactional footer below it repeats the recipient
    // by design ("Sent to …"), and that one is escaped by the route.
    const cut = (html: string) => {
      const from = html.indexOf('How we got your address');
      const to = html.indexOf('section 8.', from);
      expect(from, 'the notice is gone').toBeGreaterThan(-1);
      expect(to, 'the notice no longer ends with the privacy policy reference').toBeGreaterThan(from);
      return html.slice(from, to);
    };
    expect(cut(hostile)).toBe(cut(invitation()));
  });

  test('the subject still says what the mail is', () => {
    expect(INVITATION_EMAIL_SUBJECT.toLowerCase()).toContain('invited');
  });
});

/* ------------------------------------------- the notice may not break a phone */

const SHELLS: { label: string; wrap: (inner: string) => string }[] = [
  { label: 'full shell', wrap: (i) => wrapEmailDocument(i) },
  {
    label: 'style block stripped',
    wrap: (i) =>
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;">${i}</body></html>`,
  },
  {
    label: 'no viewport meta',
    wrap: (i) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;">${i}</body></html>`,
  },
];

for (const shell of SHELLS) {
  for (const width of [320, 375]) {
    test(`invitation mail fits ${width}px — ${shell.label}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1400 });
      await page.setContent(shell.wrap(invitation()), { waitUntil: 'load' });

      const result = await page.evaluate((vw) => {
        const past: string[] = [];
        document.querySelectorAll<HTMLElement>('*').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > vw + 1) {
            past.push(`<${el.tagName.toLowerCase()}> reaches ${Math.round(r.right)}px`);
          }
        });
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          past: past.slice(0, 5),
        };
      }, width);

      expect(result.overflow, `page scrolls sideways by ${result.overflow}px`).toBeLessThanOrEqual(0);
      expect(result.past, `content past the right edge: ${result.past.join(', ')}`).toEqual([]);
    });
  }
}
