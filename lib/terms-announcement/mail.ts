import { createHash } from 'crypto';
import { buildUserMail, MAIL_IMPRINT_HTML } from '@/lib/user-mail';
import { wrapEmailDocument } from '@/lib/email-layout';
import { escapeHtml } from '@/lib/utils';
import { formatLegalDate, type LegalLang } from '@/lib/legal/open-values';
import { publishedWordingPath } from '@/lib/contract-confirmation-email';
import { LINE_BREAK, type DiffToken, type TermsChange, type TermsChanges } from './changes';

/**
 * The notice of an amendment of the Terms (Terms 10.1), German first, then
 * English. What 10.1 requires, and where it is:
 *
 * - **in text form, to the account's address**: the send script;
 * - **at least six weeks ahead**: the date in the subject and the body; the
 *   script refuses to send later than six weeks before it;
 * - **a clear indication of the provisions that change** and **the reason**:
 *   the list of changed clauses with their 10.4 letters and a short reason, and
 *   the full reasons, in the attachment;
 * - **the amended text**: in the attachment, which the body declares part of
 *   the notice: every changed clause in full, German and English, the English
 *   part with the word diff against the previous wording (Terms v2.2.0 exists
 *   in English only, so a German word diff against it would compare two
 *   languages).
 *
 * Short on purpose (owner decisions and legal statements of 06.11.2026): a
 * two-line intro, then the notice; what is planned next goes in a separate
 * community mail (`./community-update.ts`), not here. The body names every
 * changed clause in one generated sentence (`changedClausesSentence`); the
 * attachment, one text file, carries the wording, the marks and the reasons. No
 * dash in any text written here (owner, 06.11.2026); only the quoted wording of
 * the Terms keeps its own punctuation. One mail for everybody: no name, no
 * address, so one digest per part proves what every recipient got.
 */

export interface TermsAnnouncementInput {
  changes: TermsChanges;
  /** ISO day the amendment is proposed to take effect (TERMS_EFFECTIVE_DATE_ISO). */
  effectiveDateIso: string;
  /** Origin the links are written with, e.g. https://clean-core.io. */
  baseUrl: string;
}

export interface NoticeAttachment {
  filename: string;
  contentType: string;
  /** UTF-8 text of the file. */
  content: string;
  sha256: string;
}

export interface TermsAnnouncementMail {
  subject: string;
  /** The complete document, wrapped. */
  html: string;
  /** The text part, written for itself. */
  text: string;
  /** The full changed wording: one plain-text file, German and English. */
  attachments: NoticeAttachment[];
  /** Everything the attachment says in its own words, without the quoted wording of the Terms (for the no-dash check). */
  attachmentOwnText: string;
  /** Path of the full new wording, German and English. */
  paths: Record<LegalLang, string>;
  /** SHA-256 of the body (html + text), recorded with each send. */
  sha256: string;
}

/** Fixed address of the wording of a version in one language: /terms/versions/<id>/de|en. */
export function versionPath(versionId: string, lang: LegalLang): string {
  return publishedWordingPath('amendment', versionId, lang);
}

export function announcementSubject(effectiveDateIso: string): string {
  return `Änderung der Nutzungsbedingungen zum ${formatLegalDate(effectiveDateIso, 'de')} / Changes to the Terms of Service on ${formatLegalDate(effectiveDateIso, 'en')}`;
}

export function attachmentBaseName(label: string): string {
  return `aenderungen-nutzungsbedingungen-${label}`;
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/* ------------------------------------------------------------------ labels */

const KIND: Record<LegalLang, Record<TermsChange['kind'], string>> = {
  de: { changed: 'geändert', added: 'neu', removed: 'entfällt', heading: 'geändert' },
  en: { changed: 'changed', added: 'new', removed: 'removed', heading: 'changed' },
};

export function clauseLabel(c: Pick<TermsChange, 'id' | 'section' | 'heading'>, lang: LegalLang): string {
  const de = lang === 'de';
  if (c.id === 'preamble') return de ? 'Einleitung' : 'Opening paragraph';
  if (c.id === 'provider') return de ? 'Impressum' : 'Imprint';
  if (c.id === 'contact') return de ? 'Kontakt' : 'Contact';
  if (c.id.endsWith(':heading')) return de ? `Überschrift von Ziffer ${c.section}` : `Heading of section ${c.section}`;
  return `${de ? 'Ziffer' : 'Section'} ${c.id}`;
}

function letters(c: TermsChange): string {
  return c.reason ? c.reason.letters.join(', ') : '?';
}

/** Short name of a clause for the compact list: "2.1", "Einleitung", "Überschrift 4". */
function shortName(c: TermsChange, lang: LegalLang): string {
  if (c.id.endsWith(':heading')) return lang === 'de' ? `Überschrift ${c.section}` : `heading ${c.section}`;
  if (/^\d/.test(c.id)) return c.id;
  return clauseLabel(c, lang);
}

/**
 * The compact list of the body: one line per clause, "2.1 (c): short reason";
 * the editorial changes, which all share one reason, grouped in one line.
 */
export function clauseList(changes: TermsChange[], lang: LegalLang): string[] {
  const editorialShort = lang === 'de' ? 'sprachlich überarbeitet, Inhalt gleich' : 'reworded, same content';
  const editorial = changes.filter((c) => c.reason?.short[lang] === editorialShort);
  const lines: string[] = [];
  for (const c of changes) {
    if (editorial.includes(c)) continue;
    const short = c.reason ? c.reason.short[lang] : lang === 'de' ? '[Grund fehlt]' : '[reason missing]';
    lines.push(`${shortName(c, lang)} (${letters(c)}): ${short}`);
  }
  if (editorial.length) lines.push(`${editorial.map((c) => shortName(c, lang)).join(', ')} (e): ${editorialShort}`);
  return lines;
}

/**
 * The one sentence of the body that names every changed clause (legal
 * statement 17e, M3), generated from the change list so it cannot drift:
 * "Geändert sind: Einleitung, Impressum, Ziffer 1 (mit Überschrift), 2.1 bis
 * 2.5, 3, Überschrift von 4, 4.1 bis 4.3, …, 13 (mit Überschrift) und Kontakt."
 * Three or more consecutive subclauses of a section become a range.
 */
export function changedClausesSentence(changes: TermsChange[], lang: LegalLang): string {
  const de = lang === 'de';
  const ids = new Set(changes.map((c) => c.id));
  const sections: string[] = [];
  for (const c of changes) if (!sections.includes(c.section)) sections.push(c.section);
  const items: string[] = [];
  let firstNumber = true;
  const numbered = (s: string) => {
    if (!firstNumber) return s;
    firstNumber = false;
    return `${de ? 'Ziffer' : 'section'} ${s}`;
  };
  for (const s of sections) {
    if (s === 'preamble') { items.push(de ? 'Einleitung' : 'the introduction'); continue; }
    if (s === 'provider') { items.push(de ? 'Impressum' : 'the imprint'); continue; }
    if (s === 'contact') { items.push(de ? 'Kontakt' : 'Contact'); continue; }
    const heading = ids.has(`${s}:heading`);
    const whole = ids.has(s);
    if (whole) items.push(numbered(heading ? `${s} (${de ? 'mit Überschrift' : 'with heading'})` : s));
    else if (heading) {
      items.push(de ? `Überschrift von ${s}` : `the heading of ${s}`);
      firstNumber = false;
    }
    const subs = changes
      .filter((c) => c.section === s && c.id.startsWith(`${s}.`))
      .map((c) => Number(c.id.slice(s.length + 1)))
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b);
    let i = 0;
    while (i < subs.length) {
      let j = i;
      while (j + 1 < subs.length && subs[j + 1] === subs[j] + 1) j++;
      if (j - i >= 2) items.push(numbered(`${s}.${subs[i]} ${de ? 'bis' : 'to'} ${s}.${subs[j]}`));
      else for (let k = i; k <= j; k++) items.push(numbered(`${s}.${subs[k]}`));
      i = j + 1;
    }
  }
  const list = items.length > 1 ? `${items.slice(0, -1).join(', ')} ${de ? 'und' : 'and'} ${items[items.length - 1]}` : items.join('');
  return `${de ? 'Geändert sind' : 'Changed are'}: ${list}.`;
}

/* ------------------------------------------------------------------ the body */

interface Body {
  intro: string;
  noticeLead: string;
  effective: string;
  choice: string[];
  summaryLead: string;
  summary: string[];
  /** Every changed clause, one sentence (M3). */
  changed: string;
  attachmentLine: string;
  fullText: string;
}

function body(lang: LegalLang, i: TermsAnnouncementInput, file: string): Body {
  const day = formatLegalDate(i.effectiveDateIso, lang);
  const from = i.changes.from.label;
  const to = i.changes.to.label;
  const host = i.baseUrl.replace(/^https?:\/\//, '');
  const deUrl = `${host}${versionPath(i.changes.to.version, 'de')}`;
  const enUrl = `${host}${versionPath(i.changes.to.version, 'en')}`;
  const changed = changedClausesSentence(i.changes.changes, lang);
  if (lang === 'de') {
    return {
      intro: `wir ändern die Nutzungsbedingungen von Clean-Core.io. Die neue Fassung ${to} soll für Ihr Konto am ${day} wirksam werden.`,
      noticeLead: 'Mitteilung nach Ziffer 10.1 der Nutzungsbedingungen',
      effective: `Wirksam ab: ${day}.`,
      choice: [
        `Sie haben zwei Möglichkeiten. Sie nehmen die neue Fassung in der App an; nach der Anmeldung erscheint dafür ein Dialog. Auch dann gilt sie für Sie erst ab dem ${day} (Ziffer 10.2).`,
        `Oder Sie tun nichts. Schweigen und Weiternutzung gelten nicht als Annahme, und Sie nutzen Clean-Core.io weiter nach der bisherigen Fassung ${from} (Ziffer 10.3).`,
      ],
      summaryLead: 'Was Sie im Alltag merken:',
      summary: [
        'Eigener Claude-Schlüssel (Anthropic) neben Gemini, über eine gesonderte Zusatzvereinbarung; wir schalten ihn frei, sobald die dafür nötigen Funktionen abgenommen sind. Anfragen darauf werden in den USA verarbeitet (5.2, 5.3).',
        'Automatische KI-Schritte: Einige Schritte startet die Plattform ohne Ihren Klick. Ein Schalter in den Einstellungen schaltet sie alle aus (5.4).',
        'Was ein Modell schreibt, ist als KI-generiert gekennzeichnet (4.1).',
        'Kein gesetzliches Widerrufsrecht: Die Nutzung ist unentgeltlich, und wir verarbeiten Ihre Daten nur, um die Plattform bereitzustellen. Sie können den Vertrag weiterhin jederzeit ohne Frist beenden; dafür gibt es die Funktion „Vertrag widerrufen / beenden“ in den Einstellungen (13, 2.3).',
        'Batch-Upload und Portfolio nur mit eigenem, geprüftem Modellschlüssel (1.5).',
      ],
      changed,
      attachmentLine: `Alle geänderten Bestimmungen, ihre Gründe nach Ziffer 10.4 und den markierten Wortlaut finden Sie im Anhang; er ist Teil dieser Mitteilung. Er liegt deutsch und englisch bei, als Textdatei ${file}. Die bisherige Fassung ${from} gibt es nur auf Englisch.`,
      fullText: `Die neue Fassung im vollen Wortlaut: ${deUrl} (deutsch) und ${enUrl} (englisch).`,
    };
  }
  return {
    intro: `we are changing the Clean-Core.io Terms of Service. The new version ${to} is proposed to take effect for your account on ${day}.`,
    noticeLead: 'Notice under section 10.1 of the Terms of Service',
    effective: `Effective from: ${day}.`,
    choice: [
      `You have two options. You accept the new version in the app; a dialog appears after you sign in. It still applies to you only from ${day} (section 10.2).`,
      `Or you do nothing. Silence and continued use are not acceptance, and you keep using Clean-Core.io under the previous version ${from} (section 10.3).`,
    ],
    summaryLead: 'What you will notice:',
    summary: [
      'Your own Claude key (Anthropic) beside Gemini, under a separate Additional Agreement; we enable it once the functions it requires have passed acceptance. Requests on it are processed in the United States (5.2, 5.3).',
      'Automatic AI steps: the Platform starts some steps without your click. One switch in Settings turns them all off (5.4).',
      'What a model writes is marked as AI-generated (4.1).',
      'No statutory right of withdrawal: the use is free of charge, and we process your data only to provide the Platform. You can still end the contract at any time without notice; the function “Withdraw from / end the contract” in Settings does this (13, 2.3).',
      'Bulk upload and portfolio only with your own tested model key (1.5).',
    ],
    changed,
    attachmentLine: `You find all changed provisions, their reasons under section 10.4 and the marked wording in the attachment; it is part of this notice. It comes in German and English, as the text file ${file}.`,
    fullText: `The new version in full: ${enUrl} (English) and ${deUrl} (German).`,
  };
}

/** Every sentence of the body in one language, for the text part and the no-dash check. */
function bodyLines(b: Body): string[] {
  return [
    b.intro,
    b.noticeLead.toUpperCase(),
    b.effective,
    ...b.choice,
    `${b.summaryLead}\n${bulletLines(b.summary)}`,
    b.changed,
    b.attachmentLine,
    b.fullText,
  ];
}

const BULLET = '• ';

function bulletLines(items: string[]): string {
  return items.map((b) => `${BULLET}${b}`).join('\n');
}

function bulletsHtml(items: string[]): string {
  return items.map((b) => `${BULLET}${escapeHtml(b)}`).join('<br>');
}

function bodyHtml(b: Body): string[] {
  return [
    escapeHtml(b.intro),
    `<strong>${escapeHtml(b.noticeLead)}</strong><br>${escapeHtml(b.effective)}`,
    ...b.choice.map(escapeHtml),
    `<strong>${escapeHtml(b.summaryLead)}</strong><br>${bulletsHtml(b.summary)}`,
    escapeHtml(b.changed),
    escapeHtml(b.attachmentLine),
    escapeHtml(b.fullText),
  ];
}

/* ------------------------------------------------------------------ the attachment */

/**
 * One paragraph of the word diff. Marked runs are wrapped (HTML: <del>/<ins>;
 * text: [- -]/{+ +}); a hard line break of the address block stays one.
 */
function diffPara(tokens: DiffToken[], side: 'old' | 'new', format: 'html' | 'text'): string {
  const out: string[] = [];
  let run: string[] = [];
  let marked = false;
  const flush = () => {
    if (!run.length) return;
    const raw = run.join(' ');
    if (format === 'html') {
      const t = escapeHtml(raw);
      out.push(marked ? (side === 'old' ? `<del>${t}</del>` : `<ins>${t}</ins>`) : t);
    } else {
      out.push(marked ? (side === 'old' ? `[-${raw}-]` : `{+${raw}+}`) : raw);
    }
    run = [];
  };
  for (const tok of tokens) {
    if (tok.text === LINE_BREAK) {
      flush();
      out.push(format === 'html' ? '<br>' : '\n');
      continue;
    }
    if (tok.mark !== marked) {
      flush();
      marked = tok.mark;
    }
    run.push(tok.text);
  }
  flush();
  return out.join(' ').replace(/ ?(<br>|\n) ?/g, '$1');
}

function reasonLine(c: TermsChange, lang: LegalLang): string {
  if (!c.reason) return lang === 'de' ? 'Grund: [fehlt]' : 'Reason: [missing]';
  return lang === 'de' ? `Grund (Ziffer 10.4 ${letters(c)}): ${c.reason.de}` : `Reason (section 10.4 ${letters(c)}): ${c.reason.en}`;
}

/**
 * Blocks of the attachment, rendered once as HTML and once as text. `quoted`
 * marks the verbatim wording of the Terms, which keeps its own punctuation.
 */
type Block = { kind: 'h1' | 'h2' | 'h3' | 'p' | 'label'; html: string; text: string; quoted: boolean };

const own = (kind: Block['kind'], s: string): Block => ({ kind, html: escapeHtml(s).replace(/\n/g, '<br>'), text: s, quoted: false });
const quote = (s: string): Block => ({ kind: 'p', html: escapeHtml(s).replace(/\n/g, '<br>'), text: s, quoted: true });

function germanBlocks(c: TermsChange): Block[] {
  const out: Block[] = [own('h3', `${clauseLabel(c, 'de')} (${KIND.de[c.kind]})`), own('p', reasonLine(c, 'de'))];
  if (c.kind === 'removed') return [...out, own('p', 'Diese Bestimmung entfällt. Ihren bisherigen Wortlaut finden Sie im englischen Teil.')];
  out.push(own('label', 'Neuer Wortlaut:'));
  for (const p of c.newParas.de) out.push(quote(p));
  return out;
}

function englishBlocks(c: TermsChange): Block[] {
  const out: Block[] = [own('h3', `${clauseLabel(c, 'en')} (${KIND.en[c.kind]})`), own('p', reasonLine(c, 'en'))];
  if (c.oldParas.length) {
    out.push(own('label', 'Previous wording, removed words struck through and marked [- -]:'));
    for (const p of c.diff.old) out.push({ kind: 'p', html: diffPara(p, 'old', 'html'), text: diffPara(p, 'old', 'text'), quoted: true });
  } else out.push(own('label', 'Previous wording: none, this provision is new.'));
  if (c.kind === 'removed') return [...out, own('label', 'New wording: none, this provision is removed.')];
  out.push(own('label', 'New wording, added words underlined and marked {+ +}:'));
  for (const p of c.diff.new) out.push({ kind: 'p', html: diffPara(p, 'new', 'html'), text: diffPara(p, 'new', 'text'), quoted: true });
  return out;
}

function attachmentBlocks(i: TermsAnnouncementInput): Block[] {
  const { from, to, changes, digest } = i.changes;
  const de = formatLegalDate(i.effectiveDateIso, 'de');
  const en = formatLegalDate(i.effectiveDateIso, 'en');
  return [
    own('h1', `Nutzungsbedingungen ${to.label}: die Änderungen / Terms of Service ${to.label}: the changes`),
    own(
      'p',
      `Teil der Mitteilung nach Ziffer 10.1 / part of the notice under section 10.1. Bisherige Fassung / previous version: ${from.label} (${from.version}). ` +
        `Neue Fassung / new version: ${to.label} (${to.version}). Wirksam ab / effective from: ${de} / ${en}. Prüfsumme der Änderungsliste / digest of the list of changes: ${digest}.`,
    ),
    own('h2', 'Die geänderten Bestimmungen und ihre Gründe nach Ziffer 10.4 (a bis e)'),
    ...clauseList(changes, 'de').map((l) => own('p', l)),
    own('h2', 'The changed provisions and their reasons under section 10.4 (a to e)'),
    ...clauseList(changes, 'en').map((l) => own('p', l)),
    own('h2', 'Deutsche Fassung: der neue Wortlaut jeder geänderten Bestimmung'),
    own(
      'p',
      `Die bisherige Fassung ${from.label} gibt es nur auf Englisch. Ihren Wortlaut und die Markierung jeder Änderung Wort für Wort finden Sie im englischen Teil. Neu ist außerdem, dass es die Nutzungsbedingungen insgesamt auf Deutsch gibt.`,
    ),
    ...changes.flatMap(germanBlocks),
    own('h2', 'English version: the changed provisions, changes marked'),
    ...changes.flatMap(englishBlocks),
  ];
}

function attachmentText(blocks: Block[]): string {
  return `${blocks.map((b) => (b.kind === 'h1' || b.kind === 'h2' ? b.text.toUpperCase() : b.text)).join('\n\n')}\n`;
}

/* ------------------------------------------------------------------ the mail */

/** Signed with the full name at the end of each language part (owner, 06.11.2026). */
const SIGNATURE = 'Felix Frenzel';

const FOOTER = [
  'Sie erhalten diese Mitteilung, weil Sie ein Konto auf Clean-Core.io haben. Sie ist die Mitteilung einer Vertragsänderung nach Ziffer 10.1, keine Werbung, und geht deshalb auch an Konten ohne Community-Mails.',
  'You receive this notice because you have an account on Clean-Core.io. It is the notice of an amendment of the contract under section 10.1, not marketing, and therefore also goes to accounts without community mail.',
];

export function buildTermsAnnouncementMail(input: TermsAnnouncementInput): TermsAnnouncementMail {
  const subject = announcementSubject(input.effectiveDateIso);
  const base = attachmentBaseName(input.changes.to.label);
  const blocks = attachmentBlocks(input);
  const textFile = attachmentText(blocks);
  // One attachment, the text file (legal review of 06.11.2026): it carries the full
  // wording, the marked changes ([- -] removed, {+ +} added) and the reasons. The
  // HTML twin it had showed the same marks in colour and added nothing, so it is gone.
  const attachments: NoticeAttachment[] = [
    { filename: `${base}.txt`, contentType: 'text/plain; charset=utf-8', content: textFile, sha256: sha256(textFile) },
  ];
  const de = body('de', input, attachments[0].filename);
  const en = body('en', input, attachments[0].filename);
  const paths = { de: versionPath(input.changes.to.version, 'de'), en: versionPath(input.changes.to.version, 'en') };
  const linkUrl = `${input.baseUrl}${paths.de}`;

  const html = wrapEmailDocument(
    buildUserMail({
      greeting: 'Liebe Clean-Core.io Community,',
      paragraphs: [
        '<em>English version below.</em>',
        ...bodyHtml(de),
        SIGNATURE,
        '<strong>English version</strong>',
        'Dear Clean-Core.io community,',
        ...bodyHtml(en),
      ],
      link: { lead: 'Die neue Fassung / The new version:', url: linkUrl },
      signature: SIGNATURE,
      footer: FOOTER,
    }),
    subject,
  );

  const text =
    [
      'Liebe Clean-Core.io Community,',
      '(English version below.)',
      ...bodyLines(de),
      SIGNATURE,
      'ENGLISH VERSION',
      'Dear Clean-Core.io community,',
      ...bodyLines(en),
      `Die neue Fassung / The new version:\n${linkUrl}`,
      SIGNATURE,
      ...FOOTER,
      `Impressum / Imprint: ${MAIL_IMPRINT_HTML.replace('&szlig;', 'ß')}`,
    ].join('\n\n') + '\n';

  const bodySha = createHash('sha256').update(html, 'utf8').update('\u0000').update(text, 'utf8').digest('hex');
  return {
    subject,
    html,
    text,
    attachments,
    attachmentOwnText: blocks.filter((b) => !b.quoted).map((b) => b.text).join('\n'),
    paths,
    sha256: bodySha,
  };
}
