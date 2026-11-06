import { createHash } from 'crypto';
import { buildUserMail, MAIL_IMPRINT_HTML } from '@/lib/user-mail';
import { wrapEmailDocument } from '@/lib/email-layout';
import { escapeHtml } from '@/lib/utils';
import { formatLegalDate, type LegalLang } from '@/lib/legal/open-values';
import { LINE_BREAK, type DiffToken, type TermsChange, type TermsChanges } from './changes';

/**
 * The notice of an amendment of the Terms (Terms 10.1), German first, then
 * English. What 10.1 requires, and where it is:
 *
 * - **in text form, to the account's address** — the send script;
 * - **at least six weeks ahead** — the date in the subject and the first
 *   paragraph; the script refuses to send later than six weeks before it;
 * - **the amended text** — every changed clause in full, in both languages;
 * - **a clear indication of the provisions that change** — the list of clause
 *   numbers, and in the English part the word diff against the previous
 *   wording (v2.2.0 exists in English only, so a German word diff against it
 *   would compare two languages);
 * - **the reason** — per clause, with the letters of 10.4.
 *
 * One mail for everybody: no name, no address in the body, so one digest
 * proves what every recipient was sent. The plain layout of every user mail
 * (`lib/user-mail.ts`): paragraphs, exactly one link at the end.
 *
 * A short "what you get" block stands apart from the notice and says "planned"
 * where something is planned (owner wish, 06.11.2026).
 */

export interface TermsAnnouncementInput {
  changes: TermsChanges;
  /** ISO day the amendment is proposed to take effect (TERMS_EFFECTIVE_DATE_ISO). */
  effectiveDateIso: string;
  /** Origin the links are written with, e.g. https://clean-core.io. */
  baseUrl: string;
}

export interface TermsAnnouncementMail {
  subject: string;
  /** The complete document, wrapped. */
  html: string;
  /** The text part, written for itself (the markings survive, which htmlToText would drop). */
  text: string;
  /** Path of the full new text, German and English. */
  paths: Record<LegalLang, string>;
  /** SHA-256 of html + text, recorded with each send as the proof of what was sent. */
  sha256: string;
}

/** Fixed address of a published version, by its label: /terms/<label> and /terms/<label>/de. */
export function versionPath(label: string, lang: LegalLang): string {
  return `/terms/${label}${lang === 'de' ? '/de' : ''}`;
}

export function announcementSubject(effectiveDateIso: string): string {
  return `Änderung der Nutzungsbedingungen zum ${formatLegalDate(effectiveDateIso, 'de')} / Changes to the Terms of Service on ${formatLegalDate(effectiveDateIso, 'en')}`;
}

/* ------------------------------------------------------------------ labels */

const KIND: Record<LegalLang, Record<TermsChange['kind'], string>> = {
  de: { changed: 'geändert', added: 'neu', removed: 'entfällt', heading: 'geändert' },
  en: { changed: 'changed', added: 'new', removed: 'removed', heading: 'changed' },
};

export function clauseLabel(c: Pick<TermsChange, 'id' | 'section' | 'heading'>, lang: LegalLang): string {
  const de = lang === 'de';
  if (c.id === 'preamble') return de ? 'Einleitung' : 'Opening paragraph';
  if (c.id === 'provider' || c.id === 'contact') return c.heading[lang];
  if (c.id.endsWith(':heading')) return de ? `Überschrift von Ziffer ${c.section}` : `Heading of section ${c.section}`;
  if (c.id === c.section) return `${de ? 'Ziffer' : 'Section'} ${c.section} — ${c.heading[lang].replace(/^\d+\.\s+/, '')}`;
  return `${de ? 'Ziffer' : 'Section'} ${c.id}`;
}

/** "Einleitung, Impressum, Ziffer 1, 2.1, 2.2, …" — the provisions that change, in one line. */
export function changedProvisionsLine(changes: TermsChange[], lang: LegalLang): string {
  const de = lang === 'de';
  const named: string[] = [];
  const numbers: string[] = [];
  for (const c of changes) {
    if (c.id.endsWith(':heading')) continue;
    if (/^\d/.test(c.id)) numbers.push(c.id);
    else named.push(c.id === 'preamble' ? (de ? 'Einleitung' : 'opening paragraph') : c.id === 'provider' ? (de ? 'Impressum' : 'imprint') : de ? 'Kontakt' : 'contact');
  }
  const head = named.filter((n) => n !== 'Kontakt' && n !== 'contact');
  const tail = named.filter((n) => n === 'Kontakt' || n === 'contact');
  return [...head, `${de ? 'Ziffern' : 'sections'} ${numbers.join(', ')}`, ...tail].join(', ');
}

function reasonLine(c: TermsChange, lang: LegalLang): string {
  if (!c.reason) return lang === 'de' ? 'Grund: [fehlt]' : 'Reason: [missing]';
  const letters = c.reason.letters.map((l) => `(${l})`).join(', ');
  return lang === 'de' ? `Grund (Ziffer 10.4 ${letters}): ${c.reason.de}` : `Reason (section 10.4 ${letters}): ${c.reason.en}`;
}

/* ------------------------------------------------------------------ the cover text */

interface Cover {
  intro: string[];
  bullets: string[];
  choice: string[];
  fullText: string;
  listLead: string;
  infoLead: string;
  info: string[];
}

function cover(lang: LegalLang, i: TermsAnnouncementInput): Cover {
  const day = formatLegalDate(i.effectiveDateIso, lang);
  const from = i.changes.from.label;
  const to = i.changes.to.label;
  const host = i.baseUrl.replace(/^https?:\/\//, '');
  const deUrl = `${host}${versionPath(to, 'de')}`;
  const enUrl = `${host}${versionPath(to, 'en')}`;
  if (lang === 'de') {
    return {
      intro: [
        `wir möchten die Nutzungsbedingungen von Clean-Core.io ändern. Die neue Fassung ${to} soll für Ihr Konto am ${day} wirksam werden. Dies ist die Mitteilung dazu nach Ziffer 10.1 der Nutzungsbedingungen, mindestens sechs Wochen vorher.`,
      ],
      bullets: [
        'Vertrag auf Deutsch oder Englisch: Die Sprachfassung, die Sie annehmen, gilt, auch wenn Sie später die Sprache der Oberfläche wechseln (1.4).',
        'Vertragsschluss, Nachweis und Bestätigung: Wie der Vertrag zustande kommt; welche Fassung Sie wann angenommen haben, wird mit dem SHA-256-Hashwert des Wortlauts festgehalten und per E-Mail bestätigt (1.2, 1.3, 10.5).',
        'Eigener Claude-Schlüssel: Neben Google Gemini können Sie einen eigenen Anthropic-Schlüssel hinterlegen, über eine gesonderte Zusatzvereinbarung; Anfragen darauf werden in den USA verarbeitet. Für einen eigenen Gemini-Schlüssel braucht das Google-Cloud-Projekt ein aktives Cloud-Billing-Konto (5.2, 5.3).',
        'Batch-Upload und Portfolio nur mit eigenem, erfolgreich geprüftem Modellschlüssel (1.5).',
        'Was die Plattform liefert: was die Engine ohne Modell berechnet, und was ein Modell als Entwurf schreibt und als KI-generiert gekennzeichnet ist. Importierte ATC-Ergebnisse stehen neben der Analyse und fließen nie in den signierten Lauf (2.2, 4.1, 4.2).',
        'Was Sie hochladen und anbinden: Ihre Zusicherung deckt ganze Repositories mit Fremdcode, ATC-Importe und die Anbindung eines S/4HANA-Systems; der Modellanbieter erhält Ihren Code unmaskiert (7, 8).',
        'Automatische Modellschritte: welche Schritte von selbst starten, wie Sie sie abschalten, und dass sie mit eigenem Schlüssel nur laufen, wenn Sie sie einschalten (5.4).',
        'Kein gesetzliches Widerrufsrecht, weil die Nutzung kostenlos ist; Sie können weiterhin jederzeit ohne Frist kündigen (13, 2.3).',
        'Meldeweg für rechtswidrige Inhalte (7); Gerichtsstand Bamberg nur noch für Kaufleute und öffentlich-rechtliche Stellen (11).',
        'Nehmen Sie eine Änderung vor dem angekündigten Tag an, wird sie erst an diesem Tag wirksam (10.2).',
      ],
      choice: [
        `Sie entscheiden. Sie können die neue Fassung in der App annehmen: Nach Ihrer Anmeldung erscheint ein Dialog. Nehmen Sie vor dem ${day} an, wird die Änderung für Sie trotzdem erst am ${day} wirksam; bis dahin gilt die bisherige Fassung ${from} (Ziffer 10.2 der neuen Fassung).`,
        `Sie können diese Mitteilung auch ignorieren. Schweigen und Weiternutzung gelten nicht als Annahme (Ziffer 10.2). Nehmen Sie nicht an, können Sie Clean-Core.io auf Grundlage der bisherigen Fassung ${from} weiter nutzen (Ziffer 10.3); dort steht auch, unter welchen Voraussetzungen der Betreiber den Vertrag dann kündigen kann.`,
      ],
      fullText: `Der vollständige Text der neuen Fassung: ${deUrl} (deutsch) und ${enUrl} (englisch).`,
      listLead:
        `Unten folgen alle geänderten Bestimmungen mit vollem neuen Wortlaut und dem Grund der Änderung (Ziffer 10.4). Betroffen sind: ${changedProvisionsLine(i.changes.changes, 'de')}. ` +
        `Die bisherige Fassung ${from} gibt es nur auf Englisch. Ihren Wortlaut und die Markierung jeder Änderung Wort für Wort finden Sie im englischen Teil dieser Mail. Neu ist außerdem, dass es die Nutzungsbedingungen insgesamt auf Deutsch gibt.`,
      infoLead: 'Zur Information, nicht Teil der Mitteilung — was Sie bekommen:',
      info: [
        `Geplant ab dem ${day}: ein eigener Claude-Schlüssel (Anthropic) für Konten, die die neue Fassung angenommen haben und die Zusatzvereinbarung abschließen. Voraussetzung ist ein Geschäftskonto bei Anthropic mit Rechnungsadresse im EWR, in der Schweiz oder im Vereinigten Königreich.`,
        'Geplant für die kommenden Wochen: ein neues, einfacheres Analyze, das mit der fachlichen Sicht beginnt.',
      ],
    };
  }
  return {
    intro: [
      `we would like to change the Clean-Core.io Terms of Service. The new version ${to} is proposed to take effect for your account on ${day}. This is the notice of it under section 10.1 of the Terms, at least six weeks ahead.`,
    ],
    bullets: [
      'Contract in German or English: the language version you accept governs, even if you later switch the interface language (1.4).',
      'Conclusion, record and confirmation: how the contract is concluded; which version you accepted and when is recorded with the SHA-256 digest of its wording and confirmed by e-mail (1.2, 1.3, 10.5).',
      'Your own Claude key: besides Google Gemini you can store your own Anthropic key, under a separate Additional Agreement; requests on it are processed in the United States. For your own Gemini key, the Google Cloud project needs an active Cloud Billing account (5.2, 5.3).',
      'Bulk upload and portfolio only with your own model key whose last check succeeded (1.5).',
      'What the platform delivers: what the engine computes without a model, and what a model writes as a draft, marked as AI-generated. Imported ATC results stand beside the analysis and never flow into the signed run (2.2, 4.1, 4.2).',
      'What you upload and connect: your warranty covers whole repositories with third-party code, ATC imports and connecting an S/4HANA system; the model provider receives your code unmasked (7, 8).',
      'Automatic model steps: which steps start by themselves, how you switch them off, and that with your own key they run only if you switch them on (5.4).',
      'No statutory right of withdrawal, because the use is free; you can still end the contract at any time without notice (13, 2.3).',
      'A way to report illegal content (7); Bamberg as place of jurisdiction only for merchants and public-law bodies (11).',
      'If you accept an amendment before its announced day, it takes effect only on that day (10.2).',
    ],
    choice: [
      `It is your decision. You can accept the new version in the app: a dialog appears after you sign in. If you accept before ${day}, the change still takes effect for you only on ${day}; until then the previous version ${from} applies (section 10.2 of the new version).`,
      `You can also ignore this notice. Silence and continued use are not acceptance (section 10.2). If you do not accept, you can keep using Clean-Core.io on the basis of the previous version ${from} (section 10.3); that section also says when the operator may then terminate the contract.`,
    ],
    fullText: `The full text of the new version: ${enUrl} (English) and ${deUrl} (German).`,
    listLead:
      `Below are all changed provisions, each with its previous wording (removed words struck through and marked [- -]), its new wording (added words underlined and marked {+ +}) and the reason for the change (section 10.4). They are: ${changedProvisionsLine(i.changes.changes, 'en')}.`,
    infoLead: 'For information, not part of the notice — what you get:',
    info: [
      `Planned from ${day}: your own Claude key (Anthropic), for accounts that have accepted the new version and conclude the Additional Agreement. It requires a business account with Anthropic with a billing address in the EEA, Switzerland or the United Kingdom.`,
      'Planned for the coming weeks: a new, simpler Analyze that starts with the business view.',
    ],
  };
}

/* ------------------------------------------------------------------ rendering */

function htmlLines(text: string): string {
  return text.split('\n').map(escapeHtml).join('<br>');
}

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

const htmlDiffPara = (t: DiffToken[], side: 'old' | 'new') => diffPara(t, side, 'html');
const textDiffPara = (t: DiffToken[], side: 'old' | 'new') => diffPara(t, side, 'text');

interface Rendered {
  html: string[];
  text: string[];
}

function germanChange(c: TermsChange): Rendered {
  const title = `${clauseLabel(c, 'de')} (${KIND.de[c.kind]})`;
  const html = [`<strong>${escapeHtml(title)}</strong><br>${escapeHtml(reasonLine(c, 'de'))}`];
  const text = [`${title}\n${reasonLine(c, 'de')}`];
  if (c.kind === 'removed') {
    html.push('Diese Bestimmung entfällt. Ihren bisherigen Wortlaut finden Sie im englischen Teil.');
    text.push('Diese Bestimmung entfällt. Ihren bisherigen Wortlaut finden Sie im englischen Teil.');
    return { html, text };
  }
  html.push('<em>Neuer Wortlaut:</em>');
  text.push('Neuer Wortlaut:');
  for (const p of c.newParas.de) {
    html.push(htmlLines(p));
    text.push(p);
  }
  return { html, text };
}

function englishChange(c: TermsChange): Rendered {
  const title = `${clauseLabel(c, 'en')} (${KIND.en[c.kind]})`;
  const html = [`<strong>${escapeHtml(title)}</strong><br>${escapeHtml(reasonLine(c, 'en'))}`];
  const text = [`${title}\n${reasonLine(c, 'en')}`];
  if (c.oldParas.length) {
    html.push('<em>Previous wording:</em>');
    text.push('Previous wording:');
    for (const p of c.diff.old) {
      html.push(htmlDiffPara(p, 'old'));
      text.push(textDiffPara(p, 'old'));
    }
  } else {
    html.push('<em>Previous wording:</em> none — this provision is new.');
    text.push('Previous wording: none — this provision is new.');
  }
  if (c.kind === 'removed') {
    html.push('<em>New wording:</em> none — this provision is removed.');
    text.push('New wording: none — this provision is removed.');
    return { html, text };
  }
  html.push('<em>New wording:</em>');
  text.push('New wording:');
  for (const p of c.diff.new) {
    html.push(htmlDiffPara(p, 'new'));
    text.push(textDiffPara(p, 'new'));
  }
  return { html, text };
}

const RULE = '———';

function bulletsHtml(items: string[]): string {
  return items.map((b) => `– ${escapeHtml(b)}`).join('<br>');
}

function bulletsText(items: string[]): string {
  return items.map((b) => `- ${b}`).join('\n');
}

export function buildTermsAnnouncementMail(input: TermsAnnouncementInput): TermsAnnouncementMail {
  const de = cover('de', input);
  const en = cover('en', input);
  const subject = announcementSubject(input.effectiveDateIso);
  const deChanges = input.changes.changes.map(germanChange);
  const enChanges = input.changes.changes.map(englishChange);
  const paths = { de: versionPath(input.changes.to.label, 'de'), en: versionPath(input.changes.to.label, 'en') };
  const linkUrl = `${input.baseUrl}${paths.de}`;

  const htmlParas: string[] = [
    '<em>English version below.</em>',
    ...de.intro.map(escapeHtml),
    `<strong>Was sich ändert, kurz:</strong><br>${bulletsHtml(de.bullets)}`,
    ...de.choice.map(escapeHtml),
    escapeHtml(de.fullText),
    `<strong>${escapeHtml(de.infoLead)}</strong><br>${bulletsHtml(de.info)}`,
    RULE,
    `<strong>Die geänderten Bestimmungen (deutsche Fassung)</strong><br>${escapeHtml(de.listLead)}`,
    ...deChanges.flatMap((r) => r.html),
    RULE,
    '<strong>English version</strong>',
    `Hello,<br>${escapeHtml(en.intro[0])}`,
    `<strong>What changes, in short:</strong><br>${bulletsHtml(en.bullets)}`,
    ...en.choice.map(escapeHtml),
    escapeHtml(en.fullText),
    `<strong>${escapeHtml(en.infoLead)}</strong><br>${bulletsHtml(en.info)}`,
    RULE,
    `<strong>The changed provisions (English version, changes marked)</strong><br>${escapeHtml(en.listLead)}`,
    ...enChanges.flatMap((r) => r.html),
    RULE,
  ];

  const body = buildUserMail({
    greeting: 'Guten Tag,',
    paragraphs: htmlParas,
    link: { lead: 'Vollständiger Text der neuen Fassung / Full text of the new version:', url: linkUrl },
    signature: 'Felix',
    footer: [
      'Sie erhalten diese Mitteilung, weil Sie ein Konto auf Clean-Core.io haben. Sie ist die Mitteilung einer Vertragsänderung nach Ziffer 10.1 der Nutzungsbedingungen, keine Werbung, und geht deshalb auch an Konten ohne Community-Mails.',
      'You receive this notice because you have an account on Clean-Core.io. It is the notice of an amendment of the contract under section 10.1 of the Terms, not marketing, and therefore also goes to accounts without community mail.',
    ],
  });
  const html = wrapEmailDocument(body, subject);

  const text = [
    'Guten Tag,',
    '(English version below.)',
    ...de.intro,
    `Was sich ändert, kurz:\n${bulletsText(de.bullets)}`,
    ...de.choice,
    de.fullText,
    `${de.infoLead}\n${bulletsText(de.info)}`,
    RULE,
    `DIE GEÄNDERTEN BESTIMMUNGEN (DEUTSCHE FASSUNG)\n${de.listLead}`,
    ...deChanges.flatMap((r) => r.text),
    RULE,
    'ENGLISH VERSION',
    `Hello,\n${en.intro[0]}`,
    `What changes, in short:\n${bulletsText(en.bullets)}`,
    ...en.choice,
    en.fullText,
    `${en.infoLead}\n${bulletsText(en.info)}`,
    RULE,
    `THE CHANGED PROVISIONS (ENGLISH VERSION, CHANGES MARKED)\n${en.listLead}`,
    ...enChanges.flatMap((r) => r.text),
    RULE,
    `Vollständiger Text der neuen Fassung / Full text of the new version:\n${linkUrl}`,
    'Felix',
    'Sie erhalten diese Mitteilung, weil Sie ein Konto auf Clean-Core.io haben (Ziffer 10.1 der Nutzungsbedingungen). / You receive this notice because you have an account on Clean-Core.io (section 10.1 of the Terms).',
    `Impressum / Imprint: ${MAIL_IMPRINT_HTML.replace('&szlig;', 'ß')}`,
  ].join('\n\n') + '\n';

  const sha256 = createHash('sha256').update(html, 'utf8').update('\u0000').update(text, 'utf8').digest('hex');
  return { subject, html, text, paths, sha256 };
}
