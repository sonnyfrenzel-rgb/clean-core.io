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
 * Short on purpose (owner decisions 06.11.2026): a two-line intro, a separate
 * "what you get" block that is not part of the notice, then the notice. No
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
  /** The full changed wording: an HTML file and its plain-text twin. */
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

/* ------------------------------------------------------------------ the body */

interface Body {
  intro: string;
  getLead: string;
  get: string[];
  noticeLead: string;
  effective: string;
  choice: string[];
  summaryLead: string;
  summary: string[];
  attachmentLine: string;
  fullText: string;
}

function body(lang: LegalLang, i: TermsAnnouncementInput, files: string[]): Body {
  const day = formatLegalDate(i.effectiveDateIso, lang);
  const from = i.changes.from.label;
  const to = i.changes.to.label;
  const host = i.baseUrl.replace(/^https?:\/\//, '');
  const deUrl = `${host}${versionPath(i.changes.to.version, 'de')}`;
  const enUrl = `${host}${versionPath(i.changes.to.version, 'en')}`;
  if (lang === 'de') {
    return {
      intro: `wir ändern die Nutzungsbedingungen von Clean-Core.io. Die neue Fassung ${to} soll für Ihr Konto am ${day} wirksam werden.`,
      getLead: 'Was Sie bekommen (nicht Teil der Mitteilung):',
      get: [
        `Version 3.5, geplant zum ${day}: eine deutlich einfachere Oberfläche.`,
        'Analyze beginnt mit dem Geschäftsprozess: Sie sehen in klarer Sprache, was Ihr Z-Programm fachlich tut, mit Zeilenbezug. Für Process Owner und Product Owner, nicht nur für Entwickler.',
        'Ihr eigener Claude-Schlüssel (Anthropic) neben Gemini.',
        'Eine aufgeräumte Startseite.',
      ],
      noticeLead: 'Mitteilung nach Ziffer 10.1 der Nutzungsbedingungen',
      effective: `Wirksam ab: ${day}.`,
      choice: [
        `Sie haben zwei Möglichkeiten. Sie nehmen die neue Fassung in der App an; nach der Anmeldung erscheint dafür ein Dialog. Auch dann gilt sie für Sie erst ab dem ${day} (Ziffer 10.2).`,
        `Oder Sie tun nichts. Schweigen und Weiternutzung gelten nicht als Annahme, und Sie nutzen Clean-Core.io weiter nach der bisherigen Fassung ${from} (Ziffer 10.3).`,
      ],
      summaryLead: 'Was Sie im Alltag merken:',
      summary: [
        'Eigener Claude-Schlüssel (Anthropic) neben Gemini, über eine gesonderte Zusatzvereinbarung. Anfragen darauf werden in den USA verarbeitet (5.2, 5.3).',
        'Automatische KI-Schritte: Mit dem Plattform-Schlüssel startet ein Schritt von selbst. Sie schalten ihn in den Einstellungen ab. Mit eigenem Schlüssel läuft er nur, wenn Sie ihn einschalten (5.4).',
        'Was ein Modell schreibt, ist als KI-generiert gekennzeichnet (4.1).',
        'Kein gesetzliches Widerrufsrecht, weil die Nutzung kostenlos ist. Kündigen können Sie weiterhin jederzeit ohne Frist (13, 2.3).',
        'Batch-Upload und Portfolio nur mit eigenem, geprüftem Modellschlüssel (1.5).',
      ],
      attachmentLine: `Alle geänderten Bestimmungen, ihre Gründe nach Ziffer 10.4 und den markierten Wortlaut finden Sie im Anhang; er ist Teil dieser Mitteilung. Er liegt deutsch und englisch bei, als ${files.join(' und als ')}. Die bisherige Fassung ${from} gibt es nur auf Englisch.`,
      fullText: `Die neue Fassung im vollen Wortlaut: ${deUrl} (deutsch) und ${enUrl} (englisch).`,
    };
  }
  return {
    intro: `we are changing the Clean-Core.io Terms of Service. The new version ${to} is proposed to take effect for your account on ${day}.`,
    getLead: 'What you get (not part of the notice):',
    get: [
      `Version 3.5, planned for ${day}: a much simpler interface.`,
      'Analyze starts with the business process: you see in plain language what your Z program does for the business, with line references. For process owners and product owners, not only for developers.',
      'Your own Claude key (Anthropic) beside Gemini.',
      'A tidier start page.',
    ],
    noticeLead: 'Notice under section 10.1 of the Terms of Service',
    effective: `Effective from: ${day}.`,
    choice: [
      `You have two options. You accept the new version in the app; a dialog appears after you sign in. It still applies to you only from ${day} (section 10.2).`,
      `Or you do nothing. Silence and continued use are not acceptance, and you keep using Clean-Core.io under the previous version ${from} (section 10.3).`,
    ],
    summaryLead: 'What you will notice:',
    summary: [
      'Your own Claude key (Anthropic) beside Gemini, under a separate Additional Agreement. Requests on it are processed in the United States (5.2, 5.3).',
      'Automatic AI steps: on the platform key one step starts by itself. You switch it off in Settings. With your own key it runs only if you switch it on (5.4).',
      'What a model writes is marked as AI-generated (4.1).',
      'No statutory right of withdrawal, because the use is free. You can still end the contract at any time without notice (13, 2.3).',
      'Bulk upload and portfolio only with your own tested model key (1.5).',
    ],
    attachmentLine: `You find all changed provisions, their reasons under section 10.4 and the marked wording in the attachment; it is part of this notice. It comes in German and English, as ${files.join(' and as ')}.`,
    fullText: `The new version in full: ${enUrl} (English) and ${deUrl} (German).`,
  };
}

/** Every sentence of the body in one language, for the text part and the no-dash check. */
function bodyLines(b: Body): string[] {
  return [
    b.intro,
    `${b.getLead}\n${bulletLines(b.get)}`,
    b.noticeLead.toUpperCase(),
    b.effective,
    ...b.choice,
    `${b.summaryLead}\n${bulletLines(b.summary)}`,
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
    `<strong>${escapeHtml(b.getLead)}</strong><br>${bulletsHtml(b.get)}`,
    `<strong>${escapeHtml(b.noticeLead)}</strong><br>${escapeHtml(b.effective)}`,
    ...b.choice.map(escapeHtml),
    `<strong>${escapeHtml(b.summaryLead)}</strong><br>${bulletsHtml(b.summary)}`,
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

const TAG: Record<Block['kind'], string> = { h1: 'h1', h2: 'h2', h3: 'h3', p: 'p', label: 'p' };

function attachmentHtml(blocks: Block[], title: string): string {
  const inner = blocks
    .map((b) => (b.kind === 'label' ? `<p><em>${b.html}</em></p>` : `<${TAG[b.kind]}>${b.html}</${TAG[b.kind]}>`))
    .join('\n');
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.5; color: #1f2937; max-width: 760px; margin: 0 auto; padding: 16px; }
h1 { font-size: 20px; } h2 { font-size: 17px; margin-top: 32px; } h3 { font-size: 15px; margin: 24px 0 4px; }
del { color: #991b1b; text-decoration: line-through; } ins { color: #166534; text-decoration: underline; }
</style>
</head>
<body>
${inner}
</body>
</html>
`;
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
  const htmlFile = attachmentHtml(blocks, subject);
  const textFile = attachmentText(blocks);
  const attachments: NoticeAttachment[] = [
    { filename: `${base}.html`, contentType: 'text/html; charset=utf-8', content: htmlFile, sha256: sha256(htmlFile) },
    { filename: `${base}.txt`, contentType: 'text/plain; charset=utf-8', content: textFile, sha256: sha256(textFile) },
  ];
  const files = attachments.map((a) => a.filename);
  const de = body('de', input, files);
  const en = body('en', input, files);
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
