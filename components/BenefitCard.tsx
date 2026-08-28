import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ReferenceObject, ReferenceDecision, ReferenceBucket } from '@/lib/reference-analysis';

export interface BenefitCardProps {
  linesOfCode: number;
  totalFindings: number;
  /**
   * The buckets, not bare counts. Each carries the sentence explaining what it
   * means for the reader — written in `lib/reference-analysis.ts` and, until the
   * "Verifiable Integrity" section was merged in here, never rendered anywhere.
   */
  resolved: ReferenceBucket;
  decision: ReferenceBucket;
  handedBack: ReferenceBucket;
  handedBackKinds: string[];
  rollCall: ReferenceObject[];
  businessDecisions: ReferenceDecision[];
  classifiedObjects: number;
  constructsTotal: number;
  constructsFullyCovered: number;
}

/**
 * The landing page's benefit block.
 *
 * It used to be a two-column comparison whose *order* was the argument: the
 * business question on the left and larger, the effort question on the right and
 * smaller, because the market answers only the second one. Measured, that design
 * did not survive a phone — 2231px at 360px wide, two and a half full screens,
 * with the two halves stacking below 1024px so the comparison never happened.
 * The closing sentence still said "the question on the right", which was simply
 * false for most visitors.
 *
 * The lesson, and the rule for anyone editing this file: **the argument is
 * carried by a sentence, never by the layout.** Layout is the one thing that
 * cannot be relied on. The header now states the differentiation outright, which
 * makes the two blocks below it ordinary containers that are free to stack.
 *
 * Deleted with the rewrite: a CSS-drawn BPMN row and a three-row RACI table.
 * Both were hand-drawn stand-ins, and they were the two elements that made the
 * whole card read as a mockup — while sitting next to the only genuinely
 * computed figures on the page.
 *
 * What is real here, all computed at request time from an ABAP file that ships
 * in this repository: the line count, the finding count, the three bands, the
 * hand-work kinds, and the object roll-call. The one hand-written element left
 * is the plain-words sentence, and it is labelled as hand-written — the reader
 * can download the file and check it, which is the whole argument of the product
 * applied to its own marketing.
 *
 * On the vocabulary: `upgrade`, `risk`, `audit`, `cost` and `value` are here
 * deliberately, because each is true of the shipped product and checkable — a
 * released successor really is an upgrade-stable contract, the pack really is
 * signed. The terms this market ranks for are not, and stay out: "20–30% faster
 * upgrades", "reduce TCO by 62%", "over 50% of custom code unused". Chasing them
 * means writing them. See `docs/reviews/2026-08-26-BENEFIT-NEXT-STEPS.md`.
 *
 * The two block headings are real questions on purpose. The benefit-intent
 * queries that reach this page are long-form questions sitting at positions
 * 2–10, which come from answer engines extracting the page rather than from
 * keyword density. Extractability is the lever, so the page is written as
 * question and answer and the same pairs are mirrored into the FAQPage node in
 * `app/page.tsx`. If you change the copy here, change those answers too.
 */
export default function BenefitCard({
  linesOfCode,
  totalFindings,
  resolved,
  decision,
  handedBack,
  handedBackKinds,
  rollCall,
  businessDecisions,
  classifiedObjects,
  constructsTotal,
  constructsFullyCovered,
}: BenefitCardProps) {
  const total = Math.max(1, resolved.count + decision.count + handedBack.count);
  const pct = (n: number) => (n / total) * 100;

  const bands = [
    { b: resolved, short: 'settled', bar: 'bg-emerald-400', text: 'text-emerald-300', dot: 'bg-emerald-400' },
    { b: decision, short: 'your call', bar: 'bg-amber-400', text: 'text-amber-300', dot: 'bg-amber-400' },
    { b: handedBack, short: 'hand work', bar: 'bg-rose-400', text: 'text-rose-300', dot: 'bg-rose-400' },
  ];

  // Six is what fits without becoming a table; the reference page carries them all.
  const shown = rollCall.filter((o) => o.fromSapData).slice(0, 6);
  const withoutPath = rollCall.filter((o) => !o.fromSapData).length;

  return (
    <section
      aria-labelledby="benefit-heading"
      className="rounded-[2rem] border border-slate-200 bg-white shadow-xl overflow-hidden"
    >
      {/* The header carries the whole argument, so that nothing below it has to. */}
      <div className="px-6 sm:px-10 md:px-12 pt-8 sm:pt-10 pb-7">
        <h2
          id="benefit-heading"
          className="text-2xl sm:text-4xl font-black tracking-tight text-gray-950 leading-[1.1]"
        >
          Nobody can say what this program does.
        </h2>
        <p className="mt-4 text-sm sm:text-base text-slate-600 font-medium max-w-2xl leading-relaxed">
          Somewhere in your S/4HANA transformation a Z-object is blocking a keep, adapt or retire
          decision, because nobody can answer &ldquo;do we still need this?&rdquo; &mdash; so the row
          sits in the spreadsheet until the upgrade date makes it an emergency.
        </p>
        <p className="mt-4 text-sm sm:text-base font-bold text-gray-900 max-w-2xl leading-relaxed">
          Every custom code tool will size the work. None of them tells the business what the work
          is. This one answers both &mdash; a free SAP custom code assessment, with the limits
          published before you upload anything.
        </p>
      </div>

      {/*
        Two blocks, one question each. The business block is the larger one, as it
        was in the original design — the market answers the other question and
        this is the half that has to carry the difference. The asymmetry is now
        only visual: nothing in the copy depends on it, so stacking costs nothing.
      */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-200 border-y border-slate-200">
        <div className="order-last md:order-none bg-white p-6 sm:p-8 md:p-10">
          <h3 className="text-lg sm:text-xl font-black tracking-tight text-gray-950 leading-tight">
            &ldquo;Do we still need this program?&rdquo;
          </h3>
          <p className="mt-4 text-sm text-slate-700 leading-relaxed italic border-l-2 border-emerald-500 pl-4">
            &ldquo;Checks open orders against the customer&rsquo;s credit limit and blocks delivery
            when it is exceeded.&rdquo;
          </p>
          <p className="mt-3 text-xs text-slate-500 leading-relaxed">
            Written by hand from the reference program we publish; your own upload is where the
            generator writes it.{' '}
            <Link href="/reference-analysis/source" className="font-bold text-emerald-700 hover:underline">
              Download it and check the sentence
            </Link>
            .
          </p>

          {businessDecisions.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                And what lands on the business, not on IT
              </p>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {businessDecisions.length === 1
                  ? 'One finding in this run is nobody else’s call:'
                  : `${businessDecisions.length} findings in this run are nobody else’s call:`}
              </p>
              {businessDecisions.slice(0, 2).map((d) => (
                <div key={`${d.title}-${d.lineStart}`} className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-xs font-black text-gray-900">
                    {d.title} <span className="font-mono font-normal text-slate-400">&middot; line {d.lineStart}</span>
                  </p>
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{d.recommendation}</p>
                </div>
              ))}
              <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                Produced by the run, quoted unedited &mdash; not written for this page.
              </p>
            </div>
          )}

          <p className="mt-6 text-sm text-slate-600 leading-relaxed">
            With it come the process as BPMN&nbsp;2.0, the operating procedure, who owns each step,
            and what the code is still worth. No technical terms: the generator is forbidden them.
          </p>
        </div>

        {/*
          The proof, in the machine's voice.

          Dark on purpose, and it is the only dark thing on this card: the reader
          has to be able to tell a computed fact from a sentence somebody wrote.
          Everything in here is produced by the run — the counts, the bar, the
          object pairs — and the prose around it stays light.

          On a phone this comes first (`order-first`), because the person scanning
          for "how much work" should not have to scroll past the business half to
          reach the numbers.
        */}
        <div className="order-first md:order-none bg-slate-900 text-slate-100 p-6 sm:p-8 md:p-10">
          <h3 className="text-lg sm:text-xl font-black tracking-tight text-white leading-tight">
            &ldquo;What will it cost us to move it?&rdquo;
          </h3>
          <p className="mt-3 text-xs text-slate-400 leading-relaxed">
            On the {linesOfCode.toLocaleString('en-US')}-line reference program we publish &mdash;{' '}
            {totalFindings} findings, split three ways:
          </p>

          {/*
            The split, as one object rather than two.

            This was a 2 px bar above a stacked list of three numbers: the
            proportion in one place, the counts in another, and the reader had to
            hold both. Now each segment is as wide as its share and carries its own
            number, so 21 / 17 / 4 is read rather than computed. No new value and
            no new colour — the same three fills the bar already used, with the
            card's own slate-900 as the type on top of them.

            `flex-grow` rather than percentage widths, with a floor: at 4 of 42 the
            last segment is under a tenth of the row, which on a phone is narrower
            than the number it holds. The floor costs a little accuracy at the
            smallest width and keeps the figure legible, which is the better trade
            for a number whose whole job is to be read.
          */}
          <div className="mt-5 flex h-[4.5rem] sm:h-20 w-full overflow-hidden rounded-2xl" role="img"
               aria-label={bands.map((x) => `${x.b.count} ${x.short}`).join(', ')}>
            {bands.map((x) => (
              <div
                key={x.short}
                className={`${x.bar} flex flex-col items-center justify-center gap-0.5 px-1 min-w-[3.75rem] sm:min-w-[5rem]`}
                style={{ flexGrow: x.b.count }}
                title={`${x.b.count} ${x.short}`}
              >
                <span className="text-2xl sm:text-4xl font-black tabular-nums text-slate-900 leading-none tracking-tight">
                  {x.b.count}
                </span>
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-900/70 text-center leading-tight">
                  {x.short}
                </span>
              </div>
            ))}
          </div>

          {/* What each number means, word for word as before.
              The name is not repeated here — it is in the segment directly above,
              and printing it twice made the card five words longer for nothing.
              The dot carries the tie for a sighted reader; the label is still in
              the markup for everyone else. */}
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
            {bands.map((x) => (
              <div key={x.short} role="group" aria-label={x.short}>
                <dt className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${x.dot}`} aria-hidden />
                  <span className={`h-px flex-1 ${x.dot} opacity-25`} aria-hidden />
                </dt>
                <dd className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">{x.b.meaning}</dd>
              </div>
            ))}
          </dl>

          {shown.length > 0 && (
            <div className="mt-6 border-t border-white/10 pt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                SAP&rsquo;s own naming, from its published release data
              </p>
              <ul className="mt-2.5 space-y-1">
                {shown.map((o) => (
                  <li key={o.name} className="flex flex-wrap items-baseline gap-1.5 text-[11px] font-mono">
                    <span className="text-slate-300">{o.name}</span>
                    <span className="text-slate-600" aria-hidden>&rarr;</span>
                    <span className="text-emerald-400">{o.successor}</span>
                  </li>
                ))}
                {withoutPath > 0 && (
                  <li className="text-[11px] text-slate-500 pt-1 font-sans">
                    &hellip; and {withoutPath} with no released path, named rather than guessed at.
                  </li>
                )}
                {/* Without this line the list reads as a mapping error to anyone
                    who knows S/4: the engine hands a developer
                    `VBAK -> API_SALES_ORDER_SRV`, and the name here is
                    `I_SALESDOCUMENT`. Both are defensible, but only one of them
                    is SAP's, and SAP's is the claim this column makes. Saying so
                    costs a sentence and demonstrates the care being sold. */}
                <li className="text-[11px] text-slate-500 pt-2 font-sans leading-relaxed border-t border-white/5 mt-2">
                  These are the successors SAP&rsquo;s release data names. The run may
                  hand a developer a narrower target where a curated field-level
                  mapping is the more practical one &mdash; each finding carries which
                  of the two it came from.
                </li>
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href="/reference-analysis"
              className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-400 hover:gap-2.5 transition-all"
            >
              The full run, and the file <ArrowRight size={13} />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1.5 text-xs font-black text-slate-400 hover:text-slate-200 transition-colors"
            >
              The full methodology <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      <div className="px-6 sm:px-10 md:px-12 py-7 space-y-3">
        <p className="text-base sm:text-lg font-bold text-gray-900 leading-snug max-w-3xl">
          Every tool in this market hands IT a longer list. This one closes the rows nobody could
          decide.
        </p>
        {/* Facts, not prose: this is the part a reader scans rather than reads. */}
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
          <li>Both answers are drafts you correct</li>
          <li aria-hidden className="text-slate-300">&middot;</li>
          <li>
            <Link href="/how-it-works" className="hover:text-emerald-700">
              <strong className="text-slate-700 tabular-nums">
                {constructsFullyCovered} of {constructsTotal}
              </strong>{' '}
              construct classes fully covered, the rest named
            </Link>
          </li>
          <li aria-hidden className="text-slate-300">&middot;</li>
          <li>Every run signed into an audit trail</li>
          <li aria-hidden className="text-slate-300">&middot;</li>
          <li>
            <Link href="/catalog" className="hover:text-emerald-700">
              <strong className="text-slate-700 tabular-nums">
                {classifiedObjects.toLocaleString('en-US')}
              </strong>{' '}
              SAP objects classified from SAP&rsquo;s own data
            </Link>
          </li>
          <li aria-hidden className="text-slate-300">&middot;</li>
          <li>
            <strong className="text-slate-700">Free</strong> &mdash; no sales call, no card
          </li>
        </ul>
      </div>
    </section>
  );
}
