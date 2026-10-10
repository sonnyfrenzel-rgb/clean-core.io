import type { Metadata } from 'next';
import { GUIDE_PARTS, GUIDE_FAQ, NOTE_LABELS } from '@/lib/clean-core-guide';
import { CAPABILITIES, HONEST_SCOPE } from '@/lib/clean-core-capabilities';
import { BTP_FIRST } from '@/lib/sap-naming';

/**
 * Paper edition of /clean-core-explained.
 *
 * A separate renderer over the same content data rather than a print stylesheet
 * on the interactive page: the web version leads with a full-bleed hero, dark
 * cards and calls to action, none of which belong in a document somebody prints
 * or forwards. Here the same chapters get a cover, running heads, controlled page
 * breaks and ink-frugal styling.
 *
 * Deliberately outside the (app) route group so it inherits no header, footer,
 * chatbot or pilot banner — the page is the document.
 *
 * scripts/generate-guide-pdf.ts renders this route to public/clean-core-explained.pdf.
 * It is noindex: it would otherwise compete with the canonical page for the same
 * queries, and it is not meant to be landed on.
 */

export const metadata: Metadata = {
  title: 'SAP Clean Core Explained — Clean-Core.io',
  description: 'Printable edition of the Clean Core guide.',
  robots: { index: false, follow: false },
};

/*
 * Colours are the --cc-* tokens of app/globals.css (block D, D.25b), and the
 * sheet follows DESIGN.md §7.1: no background fills, ink on white, boxes as
 * 1 px outlines, nothing split inside a box or a table row. The dark cover and
 * scope panels became outlined ones for the same reason: a printer does not
 * print a colour, and a reader forwarded the PDF should get the same page as
 * the one who printed it. Nothing is below 8.5 pt (about 11 px, the type floor
 * of §1.2) and nothing is heavier than 800.
 */
const PRINT_CSS = `
  @page {
    size: A4;
    margin: 18mm 17mm 20mm;
  }

  body {
    background: var(--cc-surface);
    color: var(--cc-ink);
    font-size: 10.5pt;
    line-height: 1.52;
  }

  .doc { max-width: 176mm; margin: 0 auto; padding: 0 0 12mm; }

  /* --- Cover ---------------------------------------------------------- */
  .cover { break-after: page; padding-top: 6mm; }

  .cover-band {
    border: 1px solid var(--cc-line);
    border-top: 3pt solid var(--cc-brand-strong);
    border-radius: 6mm;
    padding: 22mm 14mm 20mm;
    margin-bottom: 12mm;
  }

  .cover-eyebrow {
    font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--cc-brand-strong); margin: 0 0 7mm;
  }

  .cover h1 {
    font-size: 30pt; font-weight: 800; line-height: 1.06;
    letter-spacing: -0.025em; margin: 0 0 7mm; color: var(--cc-ink);
  }

  .cover-sub { font-size: 12pt; line-height: 1.5; color: var(--cc-ink-muted); margin: 0; font-weight: 500; }

  .cover-meta {
    display: flex; flex-wrap: wrap; gap: 3mm 9mm;
    font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--cc-ink-muted);
    border-top: 1px solid var(--cc-line); padding-top: 5mm;
  }

  /* --- Structure ------------------------------------------------------ */
  .part { break-before: page; }
  .part.part-first { break-before: auto; }

  .part-head {
    border-bottom: 1.5pt solid var(--cc-ink); padding-bottom: 3.5mm; margin-bottom: 5mm;
    break-inside: avoid; break-after: avoid;
  }

  .part-eyebrow {
    font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--cc-brand-strong); margin: 0 0 2mm;
  }

  .part-head h2 {
    font-size: 19pt; font-weight: 800; letter-spacing: -0.02em;
    line-height: 1.12; margin: 0 0 3mm; color: var(--cc-ink);
  }

  .part-intro { font-size: 10pt; color: var(--cc-ink-muted); margin: 0; line-height: 1.55; }

  /* Chapters deliberately do NOT set break-inside: avoid. Several of them are
     taller than a printed page, so an unbreakable chapter cannot be honoured —
     the fragmenter pushes it to a fresh page, overflows it anyway, and leaves
     the page before it nearly blank. Keeping the small units atomic (headings
     with their opening line, notes, table rows, definitions) gives tidy pages
     without any of that. */
  .chapter { margin-bottom: 6mm; }

  .chapter h3 {
    font-size: 13pt; font-weight: 800; letter-spacing: -0.015em;
    line-height: 1.25; margin: 0 0 3mm; color: var(--cc-ink);
    break-inside: avoid; break-after: avoid;
  }

  .chapter h3 .num { color: var(--cc-brand-strong); margin-right: 2.5mm; }

  .lede {
    font-size: 11pt; font-weight: 700; line-height: 1.5; color: var(--cc-ink);
    border-left: 1.5pt solid var(--cc-brand); padding-left: 5mm; margin: 0 0 4mm;
    break-inside: avoid; break-after: avoid;
  }

  .chapter p { margin: 0 0 3.5mm; orphans: 3; widows: 3; }

  /* --- Definition lists ----------------------------------------------- */
  dl { margin: 2mm 0 0; break-inside: auto; }

  /* The twelve-term list is the longest run of these, and a narrower term column
     buys the definitions a wider measure — which costs fewer lines than the
     column itself takes. */
  .def {
    break-inside: avoid; display: grid; grid-template-columns: 37mm 1fr;
    gap: 0 5mm; padding: 1.5mm 0; border-bottom: 1px solid var(--cc-line);
  }

  .def:last-child { border-bottom: 0; }
  .def dt { font-weight: 800; color: var(--cc-ink); font-size: 9pt; line-height: 1.4; }
  .def dd { margin: 0; color: var(--cc-ink-muted); font-size: 9pt; line-height: 1.42; }

  /* --- Tables ---------------------------------------------------------- */
  figure { margin: 5mm 0 0; break-inside: avoid; }

  figcaption {
    font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--cc-ink-muted); margin-bottom: 2.5mm;
  }

  table { width: 100%; border-collapse: collapse; font-size: 9pt; }

  thead { display: table-header-group; }

  th {
    text-align: left; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--cc-ink-muted);
    padding: 2.4mm 3mm; border-bottom: 1px solid var(--cc-ink-muted);
  }

  td {
    padding: 2.6mm 3mm; vertical-align: top; line-height: 1.45;
    border-bottom: 1px solid var(--cc-line); color: var(--cc-ink-muted);
  }

  td:first-child { font-weight: 700; color: var(--cc-ink); }
  tr { break-inside: avoid; }

  /* --- Margin notes ----------------------------------------------------- */
  /* Each kind carries its word (the label) and a coloured edge; on a printer
     without colour the word is what tells them apart (§7.1). */
  .note {
    break-inside: avoid; margin: 3.5mm 0 0; padding: 3.5mm 4.5mm;
    border-radius: 3mm; border: 1px solid var(--cc-line); border-left: 3pt solid var(--cc-neutral);
  }

  .note-label {
    font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; margin: 0 0 1.5mm; color: var(--cc-neutral);
  }

  .note-title { font-size: 9.5pt; font-weight: 800; margin: 0 0 1mm; color: var(--cc-ink); }
  .note-text { font-size: 9.5pt; margin: 0; color: var(--cc-ink-muted); line-height: 1.5; }

  .note-remember { border-left-color: var(--cc-brand-strong); }
  .note-remember .note-label { color: var(--cc-brand-strong); }

  .note-tip { border-left-color: var(--cc-information); }
  .note-tip .note-label { color: var(--cc-information); }

  .note-warning { border-left-color: var(--cc-warning-line); }
  .note-warning .note-label { color: var(--cc-warning); }

  .note-jargon { border-left-color: var(--cc-ink-muted); }
  .note-jargon .note-label { color: var(--cc-ink-muted); }

  /* --- Contents --------------------------------------------------------- */
  .toc { break-after: page; }
  .toc h2 { font-size: 15pt; font-weight: 800; margin: 0 0 6mm; color: var(--cc-ink); }

  .toc-row {
    display: grid; grid-template-columns: 17mm 1fr; gap: 0 4mm;
    padding: 2.8mm 0; border-bottom: 1px solid var(--cc-line);
  }

  .toc-row span:first-child {
    font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--cc-ink-muted); padding-top: 0.7mm;
  }

  .toc-row span:last-child { font-weight: 800; font-size: 10.5pt; color: var(--cc-ink); }
  .toc-row em { display: block; font-style: normal; font-weight: 400; font-size: 9pt; color: var(--cc-ink-muted); margin-top: 0.8mm; }

  /* --- Answer box ------------------------------------------------------- */
  .answer {
    border: 1px solid var(--cc-line); border-left: 3pt solid var(--cc-brand-strong);
    border-radius: 4mm; padding: 7mm 8mm; margin-bottom: 9mm; break-inside: avoid;
  }

  .answer .part-eyebrow { margin-bottom: 3mm; }
  .answer p:first-of-type { font-size: 12.5pt; font-weight: 800; line-height: 1.36; color: var(--cc-ink); margin: 0 0 4mm; }
  .answer p:last-child { margin: 0; color: var(--cc-ink-muted); font-size: 10pt; }

  /* --- Capability cards -------------------------------------------------- */
  .cap { break-inside: avoid; margin-bottom: 7mm; padding-bottom: 6mm; border-bottom: 1px solid var(--cc-line); }
  .cap:last-of-type { border-bottom: 0; }

  .cap-head { margin-bottom: 3mm; }

  .cap-stage {
    font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--cc-brand-strong); border: 1px solid var(--cc-brand-strong);
    padding: 1mm 2.5mm; border-radius: 2mm; margin-right: 3mm;
  }

  .cap-head h3 { display: inline; font-size: 12pt; font-weight: 800; color: var(--cc-ink); }
  .cap-output { margin: 0 0 4mm; color: var(--cc-ink); }

  .cap-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }

  .cap-cell {
    border-radius: 2.5mm; padding: 3.2mm 3.5mm; font-size: 8.5pt; line-height: 1.45;
    border: 1px solid var(--cc-line); color: var(--cc-ink-muted); break-inside: avoid;
  }
  .cap-cell p { margin: 0; }

  .cap-cell .k {
    display: block; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; margin-bottom: 1.2mm; color: var(--cc-ink-muted);
  }

  .cap-benefit { border-top: 2pt solid var(--cc-brand-strong); }
  .cap-benefit .k { color: var(--cc-brand-strong); }
  .cap-effort { border-top: 2pt solid var(--cc-ink-muted); }
  .cap-limit { border-top: 2pt solid var(--cc-warning-line); }
  .cap-limit .k { color: var(--cc-warning); }

  /* --- Scope + colophon --------------------------------------------------- */
  .scope { border: 1.5pt solid var(--cc-ink); border-radius: 5mm; padding: 8mm 9mm; break-inside: avoid; }
  .scope h3 { color: var(--cc-ink); font-size: 13pt; font-weight: 800; margin: 0 0 2mm; }
  .scope > p { color: var(--cc-ink-muted); font-size: 9pt; margin: 0 0 5mm; }

  .colophon {
    margin-top: 7mm; padding-top: 4mm; border-top: 1px solid var(--cc-line);
    font-size: 8.5pt; color: var(--cc-ink-muted); line-height: 1.55; break-inside: avoid;
  }

  .colophon strong { color: var(--cc-ink); }
  a { color: var(--cc-brand-strong); text-decoration: underline; text-underline-offset: 2px; }
`;

const NOTE_CLASS: Record<string, string> = {
  remember: 'note note-remember',
  tip: 'note note-tip',
  warning: 'note note-warning',
  advanced: 'note',
  jargon: 'note note-jargon',
};

export default function CleanCoreExplainedPrintPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="doc">
        {/* Cover */}
        <header className="cover">
          <div className="cover-band">
            <p className="cover-eyebrow">Clean-Core.io · The complete explainer</p>
            <h1>
              SAP Clean Core,
              <br />
              explained without the jargon
            </h1>
            <p className="cover-sub">
              What it means, why it suddenly matters, and what to actually do about your custom
              ABAP. Starts from nothing — no SAP background needed — and goes as far as grading
              every object in your estate.
            </p>
          </div>
          <div className="cover-meta">
            <span>{GUIDE_PARTS.length + 2} parts</span>
            <span>About 20 minutes</span>
            <span>Every term defined before use</span>
            <span>clean-core.io/clean-core-explained</span>
          </div>
        </header>

        {/* Contents */}
        <nav className="toc">
          <h2>Contents</h2>
          {GUIDE_PARTS.map((part) => (
            <div className="toc-row" key={part.id}>
              <span>{part.eyebrow}</span>
              <span>
                {part.title}
                <em>{part.intro}</em>
              </span>
            </div>
          ))}
          <div className="toc-row">
            <span>Part 6</span>
            <span>
              How Clean-Core.io helps, concretely
              <em>From the process to a signed handover, each step with its benefit, its effort, and where it stops.</em>
            </span>
          </div>
          <div className="toc-row">
            <span>Part 7</span>
            <span>
              Questions people actually ask
              <em>Six answers, straight.</em>
            </span>
          </div>
        </nav>

        {/* The short answer */}
        <section className="answer">
          <p className="part-eyebrow">The short answer</p>
          <p>
            Clean Core means running SAP standard software without modifying it, and adding your own
            behaviour only through interfaces SAP has formally released and promised to keep stable.
          </p>
          <p>
            The purpose is not tidiness. It is that upgrades stay routine instead of becoming
            projects, and that a move to the cloud remains possible at all — because SAP&apos;s public
            cloud edition and ABAP Cloud do not run the older techniques, and the private cloud edition
            keeps them only at the price of harder upgrades. Everything below explains how to tell
            which of your code is affected, and what to do with each kind.
          </p>
        </section>

        {/* Parts 1–5 */}
        {GUIDE_PARTS.map((part, partIndex) => (
          // Part 1 follows the short-answer box on the same page; forcing a break
          // there would leave the contents spread half empty for no gain.
          <section className={partIndex === 0 ? 'part part-first' : 'part'} key={part.id}>
            <div className="part-head">
              <p className="part-eyebrow">{part.eyebrow}</p>
              <h2>{part.title}</h2>
              <p className="part-intro">{part.intro}</p>
            </div>

            {part.chapters.map((ch) => (
              <article className="chapter" key={ch.id}>
                <h3>
                  <span className="num">{ch.number}</span>
                  {ch.title}
                </h3>
                <p className="lede">{ch.lede}</p>
                {ch.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}

                {ch.terms && (
                  <dl>
                    {ch.terms.map((t) => (
                      <div className="def" key={t.term}>
                        <dt>{t.term}</dt>
                        <dd>{t.definition}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {ch.table && (
                  <figure>
                    <figcaption>{ch.table.caption}</figcaption>
                    {/* `doc-table`: the long-form document table of /clean-core-explained
                        (app/globals.css), labelled cells included, so a narrow
                        screen restacks it the same way. */}
                    <table className="doc-table">
                      <thead>
                        <tr>
                          {ch.table.head.map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ch.table.rows.map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) => (
                              <td key={j} data-label={ch.table!.head[j]}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </figure>
                )}

                {ch.notes?.map((note, i) => (
                  <aside className={NOTE_CLASS[note.kind]} key={i}>
                    <p className="note-label">{NOTE_LABELS[note.kind]}</p>
                    <p className="note-title">{note.title}</p>
                    <p className="note-text">{note.text}</p>
                  </aside>
                ))}
              </article>
            ))}
          </section>
        ))}

        {/* Part 6 — capabilities */}
        <section className="part">
          <div className="part-head">
            <p className="part-eyebrow">Part 6</p>
            <h2>How Clean-Core.io helps, concretely</h2>
            <p className="part-intro">
              Clean-Core.io works on one ABAP program at a time: it reads the process from the code as
              BPMN, grades every SAP object Level A–D and leads to one decision — keep, rebuild, move
              to SAP standard or retire. Each step of the work is listed below with what it produces,
              what it saves you, what it costs — and where it stops. The last column is the one worth
              reading.
            </p>
          </div>

          {CAPABILITIES.map((c) => (
            <article className="cap" key={c.stage}>
              <div className="cap-head">
                <span className="cap-stage">{c.stage}</span>
                <h3>{c.title}</h3>
              </div>
              <p className="cap-output">{c.output}</p>
              <div className="cap-grid">
                <div className="cap-cell cap-benefit">
                  <p>
                    <span className="k">Benefit</span>
                    {c.benefit}
                  </p>
                </div>
                <div className="cap-cell cap-effort">
                  <p>
                    <span className="k">Effort</span>
                    {c.effort}
                  </p>
                </div>
                <div className="cap-cell cap-limit">
                  <p>
                    <span className="k">Where it stops</span>
                    {c.limit}
                  </p>
                </div>
              </div>
            </article>
          ))}

          <div className="scope">
            <h3>Honest scope</h3>
            <p>
              The governing principle of this project is <em>proven, not claimed</em>.
              A capability list without limits is a claim, so here are the limits.
            </p>
            <dl>
              {HONEST_SCOPE.map((s) => (
                <div className="def" key={s.claim}>
                  <dt>{s.claim}</dt>
                  <dd>{s.reality}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Part 7 — FAQ */}
        <section className="part">
          <div className="part-head">
            <p className="part-eyebrow">Part 7</p>
            <h2>Questions people actually ask</h2>
            <p className="part-intro">Six answers, straight.</p>
          </div>
          {GUIDE_FAQ.map((f) => (
            <article className="chapter" key={f.question}>
              <h3>{f.question}</h3>
              <p>{f.answer}</p>
            </article>
          ))}

          <div className="colophon">
            <p>
              <strong>Clean-Core.io — SAP Clean Core, explained without the jargon.</strong> The
              current version of this document is always at{' '}
              <a href="https://clean-core.io/clean-core-explained">
                clean-core.io/clean-core-explained
              </a>
              . Free to read, print and pass on.
            </p>
            <p>
              Longer write-ups on the A–D model and on measuring an extensibility programme are on
              the SAP Community, linked from the web version. Corrections are welcome at
              info@clean-core.io — this document is better for them.
            </p>
            <p>
              SAP, S/4HANA, ABAP and {BTP_FIRST} are trademarks of SAP SE. Clean-Core.io is an
              independent community project and is not affiliated with or endorsed by SAP SE.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
