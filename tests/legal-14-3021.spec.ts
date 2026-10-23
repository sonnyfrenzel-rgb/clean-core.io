import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { TERMS_VERSION } from '../lib/constants';
import { recordConsent } from '../lib/consent';
import {
  acceptanceEffectiveAt,
  berlinMidnight,
  effectiveDateAhead,
  termsVersionInEffectFor,
} from '../lib/terms-effective';
import { acceptedWording, buildContractConfirmationMail } from '../lib/contract-confirmation-email';
import { CONSENT_TEXTS, allConsentStrings, consentText } from '../lib/legal/consent-texts';
import { LEGAL_DOCUMENTS } from '../lib/legal/documents';
import { TRUST_EN } from '../lib/legal/texts/trust.en';
import { OPEN_VALUES, openValue } from '../lib/legal/open-values';
import { removeProfilePictureAddress, tokenCarriesPicture } from '../lib/profile-picture';
import { INVITATION_SUPPRESSIONS, invitationSuppressionKey, isInvitationSuppressed } from '../lib/invitation-suppression';
import { createUnsubscribeToken, verifyUnsubscribeToken } from '../lib/unsubscribe-token';
import { buildInvitationEmail } from '../lib/invitation-email';
import { sanitizeAtcFindings } from '../lib/abap/atc-privacy';
import type { AtcFinding } from '../lib/abap/atc-model';

/**
 * Fassung 1.1 of the legal texts, the lawyer's replacement texts G01–G23
 * (3.0.21, 23.10.2026), and the product they describe: the effective date of
 * an early acceptance (G13/G14), the profile picture address removed after a
 * Google sign-in (G10, Variante B), the invitation suppression list and the
 * portfolio invitation mail (G15/G16, C12), the ATC field list (G22), and the
 * published texts free of editorial marks. Server-free: pure modules,
 * stand-ins for Firestore and Auth, and source guards.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The two Firestore calls `recordConsent` makes, watched (as in legal-gaps-3021). */
function fakeConsentDb() {
  const writes: Array<{ op: 'create' | 'update'; path: string; data: Record<string, unknown> }> = [];
  let n = 0;
  const db = {
    collection: (name: string) => ({ doc: (id?: string) => ({ path: `${name}/${id ?? `auto${++n}`}` }) }),
    batch: () => {
      const staged: typeof writes = [];
      return {
        create: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'create', path: ref.path, data }),
        update: (ref: { path: string }, data: Record<string, unknown>) => staged.push({ op: 'update', path: ref.path, data }),
        commit: async () => {
          writes.push(...staged);
        },
      };
    },
  };
  return { writes, deps: { db, FieldValue: { serverTimestamp: () => 'SERVER_TIME' } } };
}

// ── G13/G14: an amendment accepted early takes effect on the announced day ──

test.describe('G13/G14 — acceptance time and effective date are two facts', () => {
  test('the announced day begins at midnight in Germany, summer and winter', () => {
    expect(berlinMidnight('2026-12-01').toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(berlinMidnight('2027-07-01').toISOString()).toBe('2027-06-30T22:00:00.000Z');
  });

  test('an amendment accepted before the day takes effect on it; after it, or at sign-up, at once', () => {
    const early = new Date('2026-11-01T10:00:00Z');
    const late = new Date('2026-12-05T10:00:00Z');
    expect(acceptanceEffectiveAt('amendment', early, '2026-12-01').toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(acceptanceEffectiveAt('amendment', late, '2026-12-01')).toEqual(late);
    expect(acceptanceEffectiveAt('sign-up', early, '2026-12-01')).toEqual(early);
    // While the day is not set there is no later day to wait for.
    expect(acceptanceEffectiveAt('amendment', early, null)).toEqual(early);
    expect(effectiveDateAhead(early, '2026-12-01')).toBe(true);
    expect(effectiveDateAhead(late, '2026-12-01')).toBe(false);
  });

  test('until the effective date the version accepted before is the one in effect', () => {
    const state = { termsVersionAccepted: TERMS_VERSION, termsVersionPrevious: '2026-10-03', termsEffectiveAt: new Date('2026-11-30T23:00:00Z') };
    expect(termsVersionInEffectFor(state, new Date('2026-11-15T00:00:00Z'))).toBe('2026-10-03');
    expect(termsVersionInEffectFor(state, new Date('2026-12-01T00:00:00Z'))).toBe(TERMS_VERSION);
    // A Firestore Timestamp reads the same.
    const ts = { ...state, termsEffectiveAt: { toMillis: () => Date.parse('2026-11-30T23:00:00Z') } };
    expect(termsVersionInEffectFor(ts, new Date('2026-11-15T00:00:00Z'))).toBe('2026-10-03');
    expect(termsVersionInEffectFor({ termsVersionAccepted: '2026-10-03' })).toBe('2026-10-03');
    expect(termsVersionInEffectFor({})).toBeNull();
  });

  test('the record keeps acceptance and effective date apart, and the profile the version still in effect', async () => {
    const { writes, deps } = fakeConsentDb();
    const now = new Date('2026-11-01T10:00:00Z');
    const out = await recordConsent(
      { uid: 'u1', email: 'a@example.org', source: 'spec', termsLanguage: 'de', occasion: 'amendment', previousVersion: '2026-10-03', now, effectiveDateIso: '2026-12-01' },
      deps,
    );
    const event = writes.find((w) => w.path.startsWith('consent_events/'))!;
    expect(event.data.occasion).toBe('amendment');
    expect(event.data.acceptedAt).toEqual(now);
    expect((event.data.effectiveAt as Date).toISOString()).toBe('2026-11-30T23:00:00.000Z');
    const profile = writes.find((w) => w.path === 'users/u1')!;
    expect(profile.data.termsVersionAccepted).toBe(TERMS_VERSION);
    expect(profile.data.termsVersionPrevious).toBe('2026-10-03');
    expect((profile.data.termsEffectiveAt as Date).toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(out).toMatchObject({ acceptedAt: now.toISOString(), effectiveAt: '2026-11-30T23:00:00.000Z' });
  });

  test('a sign-up, or an amendment after the day, is in effect at once and keeps no previous version', async () => {
    for (const input of [
      { occasion: 'sign-up' as const, previousVersion: null },
      { occasion: 'amendment' as const, previousVersion: '2026-10-03', now: new Date('2026-12-05T10:00:00Z') },
    ]) {
      const { writes, deps } = fakeConsentDb();
      const now = input.now ?? new Date('2026-11-01T10:00:00Z');
      await recordConsent({ uid: 'u2', email: null, source: 'spec', ...input, now, effectiveDateIso: '2026-12-01' }, deps);
      const profile = writes.find((w) => w.path === 'users/u2')!;
      expect(profile.data.termsVersionPrevious).toBeNull();
      expect(profile.data.termsEffectiveAt).toEqual(now);
    }
  });

  test('the consent route passes the occasion and the version accepted before, and the mail gets both times', () => {
    const route = read('app/api/consent/route.ts');
    expect(route).toMatch(/^ {6}occasion,\r?$/m);
    expect(route).toContain("previousVersion: typeof profile.termsVersionAccepted === 'string' ? profile.termsVersionAccepted : null,");
    expect(route).toContain('effectiveAt: recorded.effectiveAt,');
  });

  test('the confirmation mail of an early acceptance names the effective day; otherwise it says "at once"', () => {
    const accepted = acceptedWording('amendment', 'de')!;
    const base = { occasion: 'amendment' as const, language: 'de' as const, recipient: 'a@example.org', firstName: 'Ada', ...accepted };
    const early = buildContractConfirmationMail({ ...base, acceptedAt: '2026-11-01T10:00:00Z', effectiveAt: '2026-11-30T23:00:00Z' }).html;
    expect(early).toContain('Die Änderung wird für Sie am 1. Dezember 2026 wirksam; bis dahin gilt für Sie die bisherige Fassung (Ziffer 10.2).');
    const now = buildContractConfirmationMail({ ...base, acceptedAt: '2026-12-05T10:00:00Z', effectiveAt: '2026-12-05T10:00:00Z' }).html;
    expect(now).toContain('Die Änderung gilt für Sie ab Ihrer Annahme (Ziffer 10.2).');
    const signUp = buildContractConfirmationMail({ ...base, ...acceptedWording('sign-up', 'en')!, occasion: 'sign-up', language: 'en', acceptedAt: '2026-11-01T10:00:00Z' }).html;
    expect(signUp).not.toContain('The amendment takes effect');
    expect(signUp).not.toContain('The amendment applies');
    for (const html of [early, now, signUp]) expect(html).not.toContain('{Wirksamkeit');
  });

  test('C2: the dialog names the effective date, and Accept and Decide later are equal in design', () => {
    const gate = read('components/TermsReacceptGate.tsx');
    expect(gate).not.toContain("renderOpenValue('releaseDate'");
    for (const key of ['lead', 'afterList', 'afterListPastDate', 'checkbox'] as const) {
      for (const lang of ['de', 'en'] as const) expect(CONSENT_TEXTS.amendment[key][lang], `${key}/${lang}`).toContain('{{termsEffectiveDate}}');
    }
    const accept = /<CcButton data-terms-gate-accept[^>]*variant="([a-z]+)"/.exec(gate)?.[1];
    const later = /<CcButton data-terms-gate-decline[^>]*variant="([a-z]+)"/.exec(gate)?.[1];
    expect(accept).toBeTruthy();
    expect(later, 'Decide later is styled differently from Accept').toBe(accept);
    expect(CONSENT_TEXTS.amendment.afterList.de).toContain('wirksam wird sie für Sie erst am {{termsEffectiveDate}}');
    expect(CONSENT_TEXTS.amendment.checkbox.en).toContain('with effect from {{termsEffectiveDate}}');
    // Unset, the day renders as the visible marker the release gate looks for.
    expect(consentText(CONSENT_TEXTS.amendment.checkbox, 'en')).toContain('[open: effective date of the amended Terms]');
    expect(consentText(CONSENT_TEXTS.amendment.notice, 'de')).toContain('dem Wirksamkeitstag');
  });

  test('the Additional Agreement asks for the version in effect, not merely the one accepted', () => {
    const route = read('app/api/secrets/gemini/route.ts');
    expect(route).toContain('if (!termsAllowAddendum(termsVersionInEffectFor(profile)))');
    expect(route).not.toContain('if (!termsAllowAddendum(profile.termsVersionAccepted))');
  });

  test('the effective date is an open value, a fact, not pre-filled', () => {
    const v = openValue('termsEffectiveDate');
    expect(v.isFact).toBe(true);
    expect(v.ownerConfirmed).toBe(false);
    expect(read('lib/legal/open-values.ts')).toContain('export const TERMS_EFFECTIVE_DATE_ISO: string | null = null;');
  });
});

// ── G10–G12, Variante B: the picture address leaves the Auth record ─────────

test.describe('G10 — the profile picture address is removed after a Google sign-in', () => {
  test('a token with a picture claim clears photoURL; one without makes no call', async () => {
    const calls: Array<[string, unknown]> = [];
    const deps = { updateUser: async (uid: string, props: unknown) => void calls.push([uid, props]) };
    expect(await removeProfilePictureAddress({ uid: 'u1', picture: 'https://lh3.example/p.jpg' }, deps)).toBe(true);
    expect(calls).toEqual([['u1', { photoURL: null }]]);
    expect(await removeProfilePictureAddress({ uid: 'u2' }, deps)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(tokenCarriesPicture({ picture: '' })).toBe(false);
  });

  test('a failing Auth call never fails the request', async () => {
    const deps = { updateUser: async () => Promise.reject(new Error('auth down')) };
    expect(await removeProfilePictureAddress({ uid: 'u3', picture: 'x' }, deps)).toBe(false);
  });

  test('it runs right after sign-up and at every later Google sign-in', () => {
    expect(read('app/api/account/register/route.ts')).toContain('await removeProfilePictureAddress(decodedToken);');
    const signedIn = read('app/api/account/signed-in/route.ts');
    expect(signedIn).toContain('const decoded = await verifyRequestAuth(req);');
    expect(signedIn).toContain('await removeProfilePictureAddress(decoded);');
    const hook = read('hooks/useUserProfile.ts');
    expect(hook).toContain("if (!user.providerData.some((p) => p.providerId === 'google.com')) return;");
    expect(hook).toContain("fetch('/api/account/signed-in'");
    expect(hook).toContain('reportGoogleSignIn(user);');
  });

  test('T-B: nothing outside the removal reads photoURL or the picture claim', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx|mjs)$/.test(e.name) && rel !== 'lib/profile-picture.ts' && !rel.startsWith('lib/legal/')) {
          if (/photoURL|photoUrl|\.picture\b/.test(read(rel))) hits.push(rel);
        }
      }
    };
    for (const dir of ['app', 'components', 'hooks', 'lib']) walk(dir);
    expect(hits).toEqual([]);
  });

  test('the texts no longer speak of showing the picture, and its open check replaced the objection', () => {
    expect(OPEN_VALUES.some((v) => v.key === 'profilePictureObjection')).toBe(false);
    for (const lang of ['de', 'en'] as const) {
      const privacy = LEGAL_DOCUMENTS.find((d) => d.id === 'privacy' && d.lang === lang)!.source;
      expect(privacy).toContain('{{profilePictureRemoved}}');
      expect(privacy).not.toMatch(/Profilbild,|profile picture,/);
    }
  });
});

// ── G15/G16, C10/C12: one suppression list for both invitation mails ───────

test.describe('C10/C12 — the invitation suppression list', () => {
  const ENV = { PSEUDONYM_PEPPER: 'p'.repeat(40) };

  test('keyed by the HMAC of the address, never the address; nothing without the pepper', async () => {
    const key = invitationSuppressionKey('Reader@Example.org ', ENV)!;
    expect(key).toMatch(/^hmac1_[0-9a-f]{64}$/);
    expect(key).toBe(invitationSuppressionKey('reader@example.org', ENV));
    expect(invitationSuppressionKey('reader@example.org', {})).toBeNull();
    const seen: string[] = [];
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => {
            seen.push(`${name}/${id}`);
            return { exists: id === key };
          },
        }),
      }),
    };
    expect(await isInvitationSuppressed(db, 'reader@example.org', ENV)).toBe(true);
    expect(await isInvitationSuppressed(db, 'other@example.org', ENV)).toBe(false);
    expect(seen[0]).toBe(`${INVITATION_SUPPRESSIONS}/${key}`);
    expect(await isInvitationSuppressed(db, 'reader@example.org', {})).toBe(false);
  });

  test('an invitation token never unsubscribes from community mail, nor the other way round', () => {
    const before = process.env.PILOT_APPROVAL_SECRET;
    process.env.PILOT_APPROVAL_SECRET = 's'.repeat(32);
    try {
      const inv = createUnsubscribeToken('r@example.org', undefined, 'inv-unsub');
      expect(verifyUnsubscribeToken(inv, 'inv-unsub')).toBe('r@example.org');
      expect(() => verifyUnsubscribeToken(inv)).toThrow();
      expect(() => verifyUnsubscribeToken(createUnsubscribeToken('r@example.org'), 'inv-unsub')).toThrow();
    } finally {
      if (before === undefined) delete process.env.PILOT_APPROVAL_SECRET;
      else process.env.PILOT_APPROVAL_SECRET = before;
    }
  });

  test('both invitation routes refuse a suppressed address before anything is written or sent', () => {
    for (const rel of ['app/api/projects/[projectId]/invitations/route.ts', 'app/api/portfolio/selections/[selectionId]/invitations/route.ts']) {
      const src = read(rel);
      const check = src.indexOf('isInvitationSuppressed(');
      expect(check, rel).toBeGreaterThan(-1);
      // Before the invitation mail is sent (the project route also mails an inviter's address confirmation).
      expect(check, rel).toBeLessThan(src.search(/subject: (INVITATION_EMAIL_SUBJECT|PORTFOLIO_INVITATION_SUBJECT)/));
      expect(src, rel).toContain('unsubscribeUrl: invitationUnsubscribeUrl(');
    }
    const project = read('app/api/projects/[projectId]/invitations/route.ts');
    expect(project.indexOf('isInvitationSuppressed(')).toBeLessThan(project.indexOf('db.runTransaction('));
    const portfolio = read('app/api/portfolio/selections/[selectionId]/invitations/route.ts');
    expect(portfolio.indexOf('isInvitationSuppressed(')).toBeLessThan(portfolio.indexOf('createSelectionInvitation('));
    expect(portfolio).toContain('inviterNameForMail(invitation.invitedBy.name)');
  });

  test('the unsubscribe route stores only the keyed hash on the invitation list', () => {
    const src = read('app/api/unsubscribe/invitations/route.ts');
    expect(src).toContain("verifyUnsubscribeToken(await tokenFrom(req), 'inv-unsub')");
    expect(src).toContain('.collection(INVITATION_SUPPRESSIONS)');
    expect(src).toContain("{ list: 'invitations', keyed: true, source: 'confirmation-page', unsubscribedAt: FieldValue.serverTimestamp() }");
    expect(read('app/unsubscribe/invitations/page.tsx')).toContain('<UnsubscribeClient list="invitations" />');
  });

  test('the project invitation mail carries one mail, no reminder, and the unsubscribe link', () => {
    const html = buildInvitationEmail({
      inviterName: 'A',
      recipient: 'r@example.com',
      link: 'https://clean-core.io/invitation/p/i',
      expires: '1 Nov 2026',
      unsubscribeUrl: 'https://clean-core.io/unsubscribe/invitations#t=x',
    });
    expect(html).toContain('You receive exactly this one e-mail; we send no reminder and no advertising.');
    expect(html).toContain('Unsubscribe: <a href="https://clean-core.io/unsubscribe/invitations#t=x"');
  });

  test('the privacy policy describes a portfolio invitation as the overview only', () => {
    const de = LEGAL_DOCUMENTS.find((d) => d.id === 'privacy' && d.lang === 'de')!.source;
    const en = LEGAL_DOCUMENTS.find((d) => d.id === 'privacy' && d.lang === 'en')!.source;
    expect(de).toContain('kein Projekt und kein Quellcode wird dabei geöffnet');
    expect(en).toContain('no project and no source code is opened');
  });
});

// ── G09: no community-mail switch in the sign-up dialogs ──────────────────

test('G09: the sign-up dialogs carry no community-mail switch; it lives in the settings only', () => {
  for (const rel of ['components/LandingModals.tsx', 'components/UserOnboarding.tsx', 'components/legal/SignupConsent.tsx']) {
    const src = read(rel);
    expect(src, rel).not.toContain('communityMail');
    expect(src, rel).not.toContain('/api/community-mail');
    expect(src, rel).not.toContain('COMMUNITY_MAIL_FIELD');
  }
});

// ── G22: the ATC field list ───────────────────────────────────────────────

test('G22: an ATC import keeps the nine check fields and drops every person field', () => {
  const row = {
    objectName: 'ZCL_X',
    objectType: 'CLAS',
    checkId: 'CI_1',
    checkTitle: 'Check',
    message: 'msg',
    priority: 'error',
    line: 3,
    include: 'ZCL_X====CM001',
    exempted: false,
    author: 'JDOE',
    lastChangedBy: 'MMUSTER',
    exemptionApprover: 'BOSS',
  } as unknown as AtcFinding;
  expect(Object.keys(sanitizeAtcFindings([row])[0]).sort()).toEqual(
    ['checkId', 'checkTitle', 'exempted', 'include', 'line', 'message', 'objectName', 'objectType', 'priority'].sort(),
  );
  expect(read('lib/project-commands.ts')).toMatch(/const ATC_FINDING_KEYS = \[\s*'objectName',\s*'objectType',\s*'checkId',\s*'checkTitle',\s*'message',\s*'priority',\s*'line',\s*'exempted',\s*'include',\s*\] as const;/);
});

// ── The published texts carry no editorial marks of the draft ─────────────

test('no published text carries a change tag, a lawyer question, a variant or a placeholder', () => {
  const sources = [
    ...LEGAL_DOCUMENTS.map((d) => ({ name: `${d.id}/${d.lang}`, text: d.source })),
    { name: 'trust/en', text: TRUST_EN },
    ...allConsentStrings().flatMap(({ path: p, text }) => [
      { name: `${p}/de`, text: text.de },
      { name: `${p}/en`, text: text.en },
    ]),
  ];
  for (const { name, text } of sources) {
    expect(text, name).not.toMatch(/\[Ä\d|⚠|\[Variante|PLATZHALTER|\[Anwalt/);
  }
});

test('G21: no text states a Resend period of 30 days; each names the open value instead', () => {
  const sources = [...LEGAL_DOCUMENTS.map((d) => d.source), TRUST_EN, ...allConsentStrings().flatMap(({ text }) => [text.de, text.en])];
  for (const text of sources) {
    expect(text).not.toMatch(/Resend[^.]{0,80}30 (Tage|days)|30 (Tagen|days)[^.]{0,40}Resend/);
  }
  expect(LEGAL_DOCUMENTS.find((d) => d.id === 'privacy' && d.lang === 'de')!.source.split('{{resendRetentionDays}}').length - 1).toBe(5);
  expect(TRUST_EN.split('{{resendRetentionDays}}').length - 1).toBe(2);
  const v = openValue('resendRetentionDays');
  expect(v.value).toBeNull();
  expect(v.ownerConfirmed).toBe(false);
});
