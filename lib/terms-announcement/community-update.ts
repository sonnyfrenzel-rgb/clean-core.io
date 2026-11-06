import { buildUserMail, MAIL_IMPRINT_HTML } from '@/lib/user-mail';
import { wrapEmailDocument } from '@/lib/email-layout';
import { escapeHtml } from '@/lib/utils';
import { CONSENT_TEXTS, consentText } from '@/lib/legal/consent-texts';
import { formatLegalDate, type LegalLang } from '@/lib/legal/open-values';

/**
 * The short community mail on what is planned next — the "what you get" block
 * that the notice of the Terms amendment no longer carries (legal statements of
 * 06.11.2026, M1). It is community mail, not part of the notice: it goes only
 * to accounts that switched community mail on and are not on the suppression
 * list (`lib/community-mail.ts`), with an unsubscribe link in the body and in
 * the `List-Unsubscribe` header, sent by `scripts/send-community-update.ts`.
 *
 * Everything in it is planned, and it says so. German first, then English, like
 * the notice. No dash in any text written here. Pure: no database, no network.
 */

/** The outbox campaign id (`lib/survey/outbox.ts`): one record per recipient. */
export const COMMUNITY_UPDATE_CAMPAIGN = 'community-update-3.5-2026-11';

export interface CommunityUpdateInput {
  /** ISO day version 3.5 is planned for (the effective day of the Terms amendment). */
  plannedDayIso: string;
  /** ISO day the account switched community mail on, for the footer (C9); null when unknown. */
  consentedOnIso: string | null;
  /** The visible unsubscribe page (token in the fragment), `unsubscribeUrls(...).page`. */
  unsubscribeUrl: string;
  /** Origin of the one link, e.g. https://clean-core.io. */
  baseUrl: string;
}

export interface CommunityUpdateMail {
  subject: string;
  html: string;
  text: string;
}

export function communityUpdateSubject(): string {
  return 'Was als Nächstes geplant ist: Clean-Core.io 3.5 / What is planned next: Clean-Core.io 3.5';
}

function lines(lang: LegalLang, day: string): { intro: string; items: string[]; close: string } {
  if (lang === 'de') {
    return {
      intro: 'eine kurze Vorschau auf das, was wir als Nächstes planen. Alles hier ist geplant und nicht zugesagt; Termine können sich verschieben.',
      items: [
        `Version 3.5, geplant zum ${day}: eine deutlich einfachere Oberfläche.`,
        'Ihr eigener Claude-Schlüssel (Anthropic) neben Gemini, geplant: Wir schalten ihn frei, sobald die dafür nötigen Funktionen abgenommen sind.',
        'Eine aufgeräumte, klarere Startseite, geplant.',
      ],
      close: 'Was davon Ihnen am meisten hilft, sagen Sie uns gern mit einer Antwort an info@clean-core.io.',
    };
  }
  return {
    intro: 'a short preview of what we plan next. Everything here is planned, not promised; dates may move.',
    items: [
      `Version 3.5, planned for ${day}: a much simpler interface.`,
      'Your own Claude key (Anthropic) beside Gemini, planned: we enable it once the functions it requires have passed acceptance.',
      'A tidier, clearer start page, planned.',
    ],
    close: 'Tell us which of these helps you most with a line to info@clean-core.io.',
  };
}

function footer(lang: LegalLang, consentedOnIso: string | null): string {
  const date = consentedOnIso ? formatLegalDate(consentedOnIso, lang) : lang === 'de' ? '(Datum unbekannt)' : '(date unknown)';
  // C9's footer names the link; the layout shows the one unsubscribe URL below the footer.
  return consentText(CONSENT_TEXTS.communityMail.mailFooter, lang)
    .replace('{Datum}', date)
    .replace('{Link}', lang === 'de' ? 'der Link unten' : 'the link below');
}

const BULLET = '• ';

export function buildCommunityUpdateMail(input: CommunityUpdateInput): CommunityUpdateMail {
  const subject = communityUpdateSubject();
  const de = lines('de', formatLegalDate(input.plannedDayIso, 'de'));
  const en = lines('en', formatLegalDate(input.plannedDayIso, 'en'));
  const signature = 'Felix Frenzel';
  const html = wrapEmailDocument(
    buildUserMail({
      greeting: 'Liebe Clean-Core.io Community,',
      paragraphs: [
        '<em>English version below.</em>',
        escapeHtml(de.intro),
        de.items.map((i) => `${BULLET}${escapeHtml(i)}`).join('<br>'),
        escapeHtml(de.close),
        signature,
        '<strong>English version</strong>',
        'Dear Clean-Core.io community,',
        escapeHtml(en.intro),
        en.items.map((i) => `${BULLET}${escapeHtml(i)}`).join('<br>'),
        escapeHtml(en.close),
      ],
      link: { lead: 'Clean-Core.io:', url: input.baseUrl },
      signature,
      footer: [escapeHtml(footer('de', input.consentedOnIso)), escapeHtml(footer('en', input.consentedOnIso))],
      unsubscribeUrl: input.unsubscribeUrl,
    }),
    subject,
  );
  const text =
    [
      'Liebe Clean-Core.io Community,',
      '(English version below.)',
      de.intro,
      de.items.map((i) => `${BULLET}${i}`).join('\n'),
      de.close,
      signature,
      'ENGLISH VERSION',
      'Dear Clean-Core.io community,',
      en.intro,
      en.items.map((i) => `${BULLET}${i}`).join('\n'),
      en.close,
      `Clean-Core.io:\n${input.baseUrl}`,
      signature,
      footer('de', input.consentedOnIso),
      footer('en', input.consentedOnIso),
      `Abmelden / Unsubscribe: ${input.unsubscribeUrl}`,
      `Impressum / Imprint: ${MAIL_IMPRINT_HTML.replace('&szlig;', 'ß')}`,
    ].join('\n\n') + '\n';
  return { subject, html, text };
}
