import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

export interface BenefitCardProps {
  linesOfCode: number;
  totalFindings: number;
  resolved: number;
  decision: number;
  handedBack: number;
  handedBackKinds: string[];
  classifiedObjects: number;
  constructsTotal: number;
  constructsFullyCovered: number;
}

/**
 * The landing page's benefit block, built around the two questions every legacy
 * decision waits on.
 *
 * The market answers only one of them. smartShift inventories custom code and
 * reports what to retain, retire or redesign. CoreAssess.AI produces a backlog
 * mapped to approach, effort and complexity. Both speak to IT, and both sell on
 * coverage or on a percentage ("up to 70% faster") that a reader cannot check.
 * SAP Signavio Process Insights is the only one facing the business, and it
 * mines transaction data — it can show that a process is slow; it cannot say
 * what a Z-program does inside it.
 *
 * So the question nobody answers is the first one a process owner asks. It gets
 * the larger half of this card, and the order of the two columns is itself the
 * argument. Deliberately absent: any time or percentage claim. We compete on a
 * figure that can be recomputed, not on a bigger one.
 */
export default function BenefitCard({
  linesOfCode,
  totalFindings,
  resolved,
  decision,
  handedBack,
  handedBackKinds,
  classifiedObjects,
  constructsTotal,
  constructsFullyCovered,
}: BenefitCardProps) {
  const total = Math.max(1, resolved + decision + handedBack);
  const pct = (n: number) => (n / total) * 100;

  const bands = [
    { n: resolved, label: 'settled', bar: 'bg-emerald-500', text: 'text-emerald-700' },
    { n: decision, label: 'your call', bar: 'bg-amber-400', text: 'text-amber-700' },
    { n: handedBack, label: 'hand work', bar: 'bg-rose-500', text: 'text-rose-700' },
  ];

  // A four-step flow, drawn the way BPMN draws one: start, task, gateway, end.
  const flow = [
    { shape: 'circle', label: 'Order' },
    { shape: 'task', label: 'Check limit' },
    { shape: 'gateway', label: 'Over?' },
    { shape: 'task', label: 'Block' },
    { shape: 'circle-end', label: 'Done' },
  ];

  const raci = [
    { step: 'Check credit limit', r: 'R', who: 'Credit Analyst' },
    { step: 'Approve exception', r: 'A', who: 'Finance Lead' },
    { step: 'Notify customer', r: 'C', who: 'Sales Ops' },
  ];

  return (
    <section
      aria-labelledby="benefit-heading"
      className="rounded-[2rem] border border-slate-200 bg-white shadow-xl overflow-hidden"
    >
      {/* The situation, in three lines rather than three paragraphs. */}
      <div className="px-6 sm:px-10 md:px-12 pt-8 sm:pt-10 pb-6">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
          The usual starting point
        </p>
        <h2
          id="benefit-heading"
          className="mt-2 text-2xl sm:text-4xl font-black tracking-tight text-gray-950 leading-[1.1]"
        >
          Nobody remembers what this program does.
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-600 font-medium max-w-3xl leading-relaxed">
          No documentation, no process description, and the colleague who built it left years ago.
          Every decision about it then waits on two questions — and only one of them usually gets
          answered.
        </p>
        <p className="mt-4 text-sm sm:text-base font-bold text-gray-900 max-w-3xl leading-relaxed">
          You get an answer to both here. As a draft you correct, with the limits named up front —
          and free.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-px bg-slate-200">
        {/* The question nobody answers — the larger half. */}
        <div className="lg:col-span-3 bg-white p-6 sm:p-10 md:p-12">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">
              The business asks
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-700">
              <Check size={11} /> Answered here
            </span>
          </div>
          <h3 className="mt-2 text-xl sm:text-3xl font-black tracking-tight text-gray-950 leading-tight">
            &ldquo;What does this thing actually do?&rdquo;
          </h3>

          <div className="mt-6 space-y-5">
            {/* In plain words */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                In plain words
              </p>
              <p className="mt-1.5 text-sm text-slate-700 leading-relaxed italic">
                &ldquo;Checks open orders against the customer&rsquo;s credit limit and blocks
                delivery when it is exceeded.&rdquo;
              </p>
            </div>

            {/* The process, drawn */}
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                The process behind it &middot; BPMN 2.0
              </p>
              <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
                {flow.map((s, i) => (
                  <div key={s.label} className="flex items-center gap-1 shrink-0">
                    {s.shape === 'circle' && (
                      <span className="w-5 h-5 rounded-full border-2 border-slate-400" aria-hidden />
                    )}
                    {s.shape === 'circle-end' && (
                      <span className="w-5 h-5 rounded-full border-[3px] border-emerald-600" aria-hidden />
                    )}
                    {s.shape === 'task' && (
                      <span className="px-2 py-1 rounded-md border-2 border-slate-300 text-[10px] font-bold text-slate-600 whitespace-nowrap">
                        {s.label}
                      </span>
                    )}
                    {s.shape === 'gateway' && (
                      <span
                        className="w-5 h-5 border-2 border-amber-500 rotate-45 shrink-0"
                        aria-hidden
                      />
                    )}
                    {i < flow.length - 1 && <span className="w-3 h-px bg-slate-300" aria-hidden />}
                  </div>
                ))}
              </div>
            </div>

            {/* Who owns what */}
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Who owns which step &middot; RACI, in business roles
              </p>
              <table className="mt-3 w-full text-left">
                <tbody className="divide-y divide-slate-100">
                  {raci.map((row) => (
                    <tr key={row.step}>
                      <td className="py-1.5 pr-3 text-xs text-slate-700">{row.step}</td>
                      <td className="py-1.5 pr-3">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-300">
                          {row.r}
                        </span>
                      </td>
                      <td className="py-1.5 text-xs font-semibold text-slate-500">{row.who}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Plus the standard operating procedure, and what the legacy code is still worth to the
              business. A draft to correct — which is a different job from writing on a blank page.
            </p>
          </div>
        </div>

        {/* The question everybody answers — compact. */}
        <div className="lg:col-span-2 bg-slate-50/60 p-6 sm:p-10 md:p-12">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              IT asks
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-700">
              <Check size={11} /> Answered here
            </span>
          </div>
          <h3 className="mt-2 text-lg sm:text-xl font-black tracking-tight text-gray-800 leading-tight">
            &ldquo;How much work is this?&rdquo;
          </h3>

          <p className="mt-5 text-xs text-slate-500 leading-relaxed">
            On the {linesOfCode.toLocaleString('en-US')}-line reference program we publish —{' '}
            {totalFindings} findings:
          </p>

          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full border border-slate-200">
            {bands.map((b) => (
              <div key={b.label} className={b.bar} style={{ width: `${pct(b.n)}%` }} title={`${b.n} ${b.label}`} />
            ))}
          </div>

          <dl className="mt-4 space-y-2.5">
            {bands.map((b) => (
              <div key={b.label} className="flex items-baseline gap-2">
                <dt className="text-2xl font-black tabular-nums text-gray-950 leading-none w-9">{b.n}</dt>
                <dd className={`text-xs font-black ${b.text}`}>{b.label}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
            Settled = a released SAP successor from SAP&rsquo;s own data. Hand work ={' '}
            {handedBackKinds.join(', ')} — flagged, never guessed at.
          </p>

          <ul className="mt-5 space-y-1.5 border-t border-slate-200 pt-4">
            {['Object → released API mapping', 'A first RAP or CAP draft', 'Matching test scaffolding'].map(
              (t) => (
                <li key={t} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-slate-400 shrink-0" />
                  <span>{t}</span>
                </li>
              ),
            )}
          </ul>

          <Link
            href="/reference-analysis"
            className="mt-5 inline-flex items-center gap-1.5 text-xs font-black text-emerald-700 hover:gap-2.5 transition-all"
          >
            The full run, and the file <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* The point of the ordering. */}
      <div className="px-6 sm:px-10 md:px-12 py-7 border-t border-slate-200 space-y-4">
        <p className="text-base sm:text-lg font-bold text-gray-900 leading-snug max-w-3xl">
          Assessment tools answer the question on the right. Answering the left one as well is the
          difference — and it is the question that decides whether the code is worth keeping at all.
        </p>
        <p className="text-sm text-slate-600 font-medium max-w-3xl leading-relaxed">
          Both answers are drafts for you to correct, and the limits are published before you upload
          anything — {constructsFullyCovered} of {constructsTotal} construct classes fully covered,
          the rest named. It does not replace the architect. It shows them where to look — and the
          business why.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500 pt-1">
          <Link href="/catalog" className="hover:text-emerald-700">
            <strong className="text-slate-700 tabular-nums">
              {classifiedObjects.toLocaleString('en-US')}
            </strong>{' '}
            SAP objects classified from SAP&rsquo;s own data
          </Link>
          <Link href="/how-it-works" className="hover:text-emerald-700">
            <strong className="text-slate-700 tabular-nums">
              {constructsFullyCovered} of {constructsTotal}
            </strong>{' '}
            ABAP construct classes fully covered — the rest named up front
          </Link>
          <span>
            <strong className="text-slate-700">Free</strong> for the SAP community. No sales call, no
            trial, no card.
          </span>
        </div>
      </div>
    </section>
  );
}
