import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { TERMS_DE } from '../lib/legal/texts/terms.de';
import { TERMS_EN } from '../lib/legal/texts/terms.en';
import { PRIVACY_DE } from '../lib/legal/texts/privacy.de';
import { PRIVACY_EN } from '../lib/legal/texts/privacy.en';
import { REPORT_DE } from '../lib/legal/texts/report.de';
import { REPORT_EN } from '../lib/legal/texts/report.en';
import { TRUST_EN } from '../lib/legal/texts/trust.en';
import { CONSENT_TEXTS } from '../lib/legal/consent-texts';
import { ANTHROPIC_OWN_KEY_STATUS } from '../lib/model-providers';
import { buildInvitationEmail, INVITATION_EMAIL_SUBJECT } from '../lib/invitation-email';
import { buildPortfolioInvitationEmail, PORTFOLIO_INVITATION_SUBJECT } from '../lib/portfolio/invitation-email';
import { PORTFOLIO_MESSAGES } from '../lib/messages/portfolio';

/**
 * Legal texts Fassung 1.1 — the owner's decisions of 06.11.2026 (A1, A2, A4,
 * A5, B, C), each held to its wording in German (authoritative) and English,
 * and, where a sentence states a fact about the product, to the code.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('A4 — reported illegal content is blocked and kept, never deleted at once', () => {
  test('Terms 7: the retention sentence follows the police sentence, in both languages', () => {
    expect(TERMS_DE).toContain(
      'informiert die Strafverfolgungsbehörden. Ein gesperrter Inhalt bleibt unverändert und für niemanden zugänglich gespeichert – auch nicht für das betroffene Konto –, bis die Strafverfolgungsbehörde über seine Sicherstellung entschieden oder mitgeteilt hat, dass sie ihn nicht benötigt, längstens 90 Tage nach ihrer Unterrichtung, solange die Behörde nicht um längere Aufbewahrung bittet; danach löscht der Betreiber ihn. Besteht kein Verdacht einer Straftat, bleibt ein Inhalt bis zur Entscheidung gesperrt und wird danach freigegeben oder gelöscht.',
    );
    expect(TERMS_EN).toContain('Blocked content remains stored unchanged and accessible to no one — not even to the account concerned —');
    expect(TERMS_EN).toContain('at most 90 days after the authority was informed, unless the authority asks for longer retention; the operator then deletes it.');
  });

  test('/report: not deleted at once, and no viewing or copy for CSAM', () => {
    expect(REPORT_DE).toContain(
      'informieren die Strafverfolgungsbehörden. Den Inhalt löschen wir nicht sofort, damit die Behörden ihn sichern können; bis dahin ist er gesperrt und für niemanden zugänglich. Bei Darstellungen sexuellen Missbrauchs von Kindern sehen wir den Inhalt nicht an und fertigen keine Kopie.',
    );
    expect(REPORT_EN).toContain('We do not delete the content at once, so that the authorities can secure it; until then it is blocked and accessible to no one.');
    expect(REPORT_EN).toContain('we do not look at the content and make no copy.');
  });

  test('DSE 6: blocked content has its own row; the report keeps its six months', () => {
    expect(PRIVACY_DE).toContain(
      '- **Nach einer Meldung gesperrte Inhalte:** bis die Strafverfolgungsbehörde über ihre Sicherstellung entschieden hat, längstens 90 Tage nach ihrer Unterrichtung; ohne Verdacht einer Straftat bis zur Entscheidung über die Meldung.',
    );
    expect(PRIVACY_DE).toContain('- **Meldungen rechtswidriger Inhalte:** sechs Monate nach Abschluss der Prüfung');
    expect(PRIVACY_EN).toContain('- **Content blocked after a report:**');
    // Nothing says the content goes at once, and CSAM is not looked at "as far as needed" any more.
    for (const t of [PRIVACY_DE, PRIVACY_EN, TERMS_DE, TERMS_EN, REPORT_DE, REPORT_EN]) {
      expect(t).not.toMatch(/gesperrt oder gelöscht|blocked or deleted|nicht weiter an, als zur Sperrung|no further than needed to block/);
    }
    expect(read('docs/DATA-RETENTION.md')).toContain('`content_holds/{holdId}`');
  });
});

test('A5 — a person examines promptly, and tells decision and reasons unless the authorities ask for restraint', () => {
  for (const t of [TERMS_DE, REPORT_DE, PRIVACY_DE]) {
    expect(t).toContain('die Entscheidung und ihre Gründe mit');
    expect(t).toContain('soweit Strafverfolgungsbehörden nicht um Zurückhaltung bitten');
    expect(t).not.toContain('soweit möglich, die Gründe');
  }
  expect(TERMS_DE).toContain('Ein Mensch prüft die Meldung zeitnah');
  expect(REPORT_DE).toContain('Ein Mensch prüft die Meldung zeitnah');
  for (const t of [TERMS_EN, REPORT_EN, PRIVACY_EN]) {
    expect(t).toContain('unless law-enforcement authorities ask for restraint');
    expect(t).not.toContain('where possible, the reasons');
  }
});

test.describe('A1 — what a portfolio reader sees', () => {
  test('DSE 8 says the set is fixed at sending and the figures are current', () => {
    expect(PRIVACY_DE).toContain(
      'Welche Projekte die Übersicht zeigt, legt der Stand beim Versand der Einladung fest: Ein Projekt, das Sie später hinzufügen, wird für Leser erst sichtbar, wenn Sie es gesondert freigeben, und ein Projekt, das Sie entfernen, sehen sie nicht mehr. Die Kennzahlen dieser Projekte berechnen wir bei jedem Aufruf aus ihrem aktuellen Stand; nichts in der Übersicht ist signiert. Ein Projekt selbst öffnet sich für einen Leser nur, wenn Sie es ihm als Projekt gesondert freigeben.',
    );
    // The overview shows the names of includes not uploaded; the list says so.
    expect(read('components/portfolio/PortfolioOverview.tsx')).toContain('p.includesNotRead.join');
    expect(PRIVACY_DE).toContain('die Namen von Includes, die nicht mit hochgeladen wurden');
    expect(PRIVACY_EN).toContain('the names of includes that were not uploaded with them');
  });

  test('the share dialog says what the reader will see, object names included, also where projects are released', () => {
    const scope = PORTFOLIO_MESSAGES['portfolio.shareScope'];
    expect(scope).toMatch(/names of the SAP objects it uses — your own Z and Y objects included/);
    expect(scope).toMatch(/kinds of findings/);
    expect(scope).toMatch(/names of includes that were not uploaded/);
    const panel = read('components/portfolio/SharePanel.tsx');
    expect(panel.match(/wt\('portfolio\.shareScope'\)/g)).toHaveLength(2);
    expect(CONSENT_TEXTS.portfolioInvitation.scope.de).toContain('(auch eigene Z- und Y-Objekte)');
  });
});

test('A2 — the status sentence of the own Claude key in DSE 2, Terms 5.2 and the Trust page', () => {
  const de = 'Den eigenen Anthropic-Schlüssel schalten wir frei, sobald die dafür nötigen Funktionen abgenommen sind; bis dahin lässt sich kein Anthropic-Schlüssel hinterlegen, und die Einstellungen zeigen den aktuellen Stand.';
  expect(PRIVACY_DE).toContain(de);
  expect(TERMS_DE).toContain(de);
  for (const t of [PRIVACY_EN, TERMS_EN, TRUST_EN]) expect(t).toContain(ANTHROPIC_OWN_KEY_STATUS);
  expect(TRUST_EN).not.toContain('available once the Additional Agreement is live');
});

test.describe('B — blocklists, invitation mails, ATC import, Terms 1.5', () => {
  test('no blocklist is kept "without end"; removal on request is named', () => {
    for (const t of [PRIVACY_DE, PRIVACY_EN, TRUST_EN, JSON.stringify(CONSENT_TEXTS), read('lib/invitation-email.ts')]) {
      expect(t).not.toMatch(/ohne zeitliche Begrenzung|Sperrliste, unbefristet|without time limit|without end/);
    }
    expect(PRIVACY_DE).toContain('solange wir Einladungen versenden oder bis Sie verlangen, dass wir den Eintrag entfernen');
    expect(PRIVACY_EN).toContain('for as long as we send invitations or until you ask us to remove it');
  });

  test('both invitation mails are German and English, German first, each with its Art. 14 notice', () => {
    const project = buildInvitationEmail({ inviterName: '', recipient: 'a@example.test', link: 'https://clean-core.io/invitation/p/i', expires: '02 Oct 2026', expiresAt: '2026-10-02T10:00:00.000Z', unsubscribeUrl: 'https://clean-core.io/u' });
    const portfolio = buildPortfolioInvitationEmail({ inviterName: '', recipient: 'a@example.test', link: 'https://clean-core.io/portfolio/invitation/s/i', expires: '02 Oct 2026', expiresAt: '2026-10-02T10:00:00.000Z', unsubscribeUrl: 'https://clean-core.io/u' });
    for (const [html, de, en] of [
      [project, 'Sie wurden eingeladen, ein Projekt auf Clean-Core.io zu lesen.', 'You have been invited to read a project on Clean-Core.io.'],
      [portfolio, 'Sie wurden eingeladen, eine Portfolio-Übersicht auf Clean-Core.io zu lesen.', 'You have been invited to read a portfolio overview on Clean-Core.io.'],
    ] as const) {
      expect(html.indexOf(de)).toBeGreaterThan(-1);
      expect(html.indexOf(de)).toBeLessThan(html.indexOf(en));
      expect(html).toContain('Diese Einladung läuft am 2. Oktober 2026 ab.');
      expect(html.indexOf('Art. 14 DSGVO')).toBeLessThan(html.indexOf('Art. 14 GDPR'));
      expect(html).toContain('Abschnitt 8.');
      expect(html.match(/<a /g)?.length, 'one link and the unsubscribe link, as before').toBe(2);
    }
    expect(INVITATION_EMAIL_SUBJECT.startsWith('Einladung')).toBe(true);
    expect(PORTFOLIO_INVITATION_SUBJECT.startsWith('Einladung')).toBe(true);
  });

  test('DSE 3: names inside an ATC message text are not recognised — remove them first', () => {
    expect(PRIVACY_DE).toContain('Namen, die im Meldungstext selbst stehen, erkennen wir nicht; entfernen Sie sie vor dem Hochladen.');
    expect(PRIVACY_EN).toContain('Names inside the message text itself we do not recognise; remove them before uploading.');
  });

  test('Terms 1.5: an own key that no longer counts as tested closes the owner\'s side, readers keep reading', () => {
    // B6 of the legal review of 06.11.2026: readers keep the overview, the owner can only delete, his projects stay open.
    expect(TERMS_DE).toContain('die eingeladenen Personen behalten die Übersicht eines geteilten Portfolios und lesen sie weiter. Sie selbst können eine Auswahl dann nur noch löschen');
    expect(TERMS_DE).toContain('Ihre Projekte, auch die aus einem Massen-Upload, bleiben einzeln zugänglich');
    expect(TERMS_EN).toContain('the people you invited keep the overview of a shared portfolio and go on reading it. You yourself can then only delete a selection');
    expect(TERMS_EN).toContain('Your projects, including those from a bulk upload, stay individually accessible');
    // Deleting a selection and withdrawing a share need no key (mode 'manage'); no project route reads the portfolio gate.
    expect(read('app/api/portfolio/selections/[selectionId]/route.ts')).toMatch(/DELETE[^]*?mode: 'manage'/);
    expect(read('app/api/portfolio/selections/[selectionId]/invitations/[invitationId]/route.ts')).toContain("mode: 'manage'");
    for (const rel of ['app/(app)/project/[projectId]/page.tsx', 'lib/project-loader.ts']) {
      expect(read(rel), rel).not.toMatch(/readPortfolioAccess|portfolioAccessOf|PORTFOLIO_CLOSED_CODE/);
    }
    // The code it describes: readers read without a key; every owner route but removal asks for a tested key.
    const view = read('app/api/portfolio/view/route.ts');
    expect(view).toMatch(/if \(role === 'owner'\) \{\s*const access = await readPortfolioAccess/);
    expect(read('lib/firebase-admin.ts')).toContain("tx.update(profileRef, { byokTestedAt: FieldValue.delete()");
  });
});

test('C — Firebase sends the password-reset and re-verification mails itself, under the Cloud DPA', () => {
  expect(PRIVACY_DE).toContain('versendet Firebase Authentication diese Mail selbst, nicht unser Mailanbieter Resend; Google verarbeitet Ihre Adresse dabei als unser Auftragsverarbeiter nach dem Cloud Data Processing Addendum (Abschnitt 4). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.');
  expect(PRIVACY_EN).toContain('Firebase Authentication sends that mail itself, not our mail provider Resend');
  // And the code: the client SDK sends both.
  expect(read('components/LandingModals.tsx')).toContain('sendPasswordResetEmail');
  expect(read('app/(app)/settings/page.tsx')).toContain('sendEmailVerification');
  // The security record is described the same way in C7 and on the Trust page as in DSE 2/5/6.
  expect(CONSENT_TEXTS.accountDeletion.text.de).toContain('der Handlungen, die Sie selbst vorgenommen haben (24 Monate ab der Handlung, mit einem schlüsselbasierten Hashwert');
  expect(TRUST_EN).toContain('and of the actions you took yourself (24 months from the action, with a keyed hash');
});
