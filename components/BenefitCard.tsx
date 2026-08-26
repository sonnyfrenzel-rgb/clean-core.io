import Link from 'next/link';
import { ArrowRight, Cpu, Users, Handshake } from 'lucide-react';

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
 * The landing page's benefit block.
 *
 * It leads with the situation rather than the feature, because the situation is
 * the reason anyone is here: for most legacy programs the documentation was
 * never written or has been lost, the process was never described, and the
 * person who built it left years ago. The source is the only artifact that still
 * says what the thing does. A run reads it back in both directions — down into
 * released SAP APIs for the developer, up into process, roles and procedure for
 * the business.
 *
 * Two rules this component exists to keep:
 *
 *   - No time claim. How long the work takes depends on the decisions, and those
 *     stay with the reader. "Saves days" was unprovable and is gone.
 *   - No hand-typed figure. Everything is passed in from a run computed at
 *     request time against a file that ships in this repository, so the page
 *     cannot drift away from what the engine does.
 *
 * What it reconstructs is a DRAFT the business corrects — correcting a draft is
 * a different job from writing on a blank page, and that is the honest claim.
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
    {
      n: resolved,
      title: 'the tool settles',
      body: 'Points at a released SAP successor, looked up in SAP’s own published data. You review the mapping instead of hunting for it.',
      bar: 'bg-emerald-500',
      dot: 'bg-emerald-500',
      text: 'text-emerald-700',
    },
    {
      n: decision,
      title: 'your decision',
      body: 'Transformable, but somebody has to weigh business intent against the target design. The tool lays out the evidence and stops.',
      bar: 'bg-amber-400',
      dot: 'bg-amber-400',
      text: 'text-amber-700',
    },
    {
      n: handedBack,
      title: 'stays hand work',
      body: `Out of reach for any generator (${handedBackKinds.join(', ')}). Flagged and isolated rather than guessed at, so nothing false lands in your draft.`,
      bar: 'bg-rose-500',
      dot: 'bg-rose-500',
      text: 'text-rose-700',
    },
  ];

  const audiences = [
    {
      icon: Cpu,
      who: 'Reading down — for the developer',
      items: [
        'Which object maps to which released SAP API',
        'A first RAP or CAP draft to review',
        'Matching test scaffolding',
      ],
    },
    {
      icon: Users,
      who: 'Reading up — for the business',
      items: [
        'What the program actually does, in plain words',
        'The process behind it, drawn as a BPMN diagram',
        'Who owns which step — a RACI in business roles, not IT ones',
        'A standard operating procedure for it',
      ],
    },
    {
      icon: Handshake,
      who: 'Where they meet',
      items: [
        'Where you have to act — and where you explicitly do not',
        'What the legacy code is still worth to the business',
        'A signed record of how the decision was reached',
      ],
    },
  ];

  return (
    <section
      aria-labelledby="benefit-heading"
      className="rounded-[2.5rem] border border-slate-200 bg-white/90 backdrop-blur-sm shadow-xl overflow-hidden"
    >
      {/* The situation, then the reframe */}
      <div className="p-6 sm:p-10 border-b border-slate-100">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
          The usual starting point
        </p>
        <h2
          id="benefit-heading"
          className="mt-2 text-2xl sm:text-4xl font-black tracking-tight text-gray-950 leading-[1.1]"
        >
          Nobody remembers what this program does.
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-600 font-medium max-w-2xl leading-relaxed">
          The documentation was never written or is long gone. The process behind it was never
          described. The colleague who built it left years ago. So the code sits there, and nobody
          dares touch it.
        </p>
        <p className="mt-3 text-sm sm:text-base text-slate-800 font-bold max-w-2xl leading-relaxed">
          The source is the one document that never lied. A run reads it back in both directions —
          and hands you a draft to correct, which is a very different job from writing on a blank
          page.
        </p>
      </div>

      {/* Where you stand */}
      <div className="p-6 sm:p-10 border-b border-slate-100">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
          And how much of it settles itself
        </h3>
        <p className="mt-2 text-sm text-slate-600 font-medium">
          On the reference program we publish — {linesOfCode.toLocaleString('en-US')} lines of legacy
          ABAP, {totalFindings} findings. Download it and get the same result.
        </p>

        <div className="mt-6 flex h-4 w-full overflow-hidden rounded-full border border-slate-200">
          {bands.map((b) => (
            <div
              key={b.title}
              className={b.bar}
              style={{ width: `${pct(b.n)}%` }}
              title={`${b.n} ${b.title}`}
            />
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {bands.map((b) => (
            <div key={b.title} className="space-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${b.dot} shrink-0`} />
                <span className="text-3xl font-black tabular-nums text-gray-950 leading-none">{b.n}</span>
                <span className={`text-sm font-black ${b.text}`}>{b.title}</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed pl-[1.15rem]">{b.body}</p>
            </div>
          ))}
        </div>

        <Link
          href="/reference-analysis"
          className="mt-6 inline-flex items-center gap-2 text-sm font-black text-emerald-700 hover:gap-3 transition-all"
        >
          See the full run and download the file <ArrowRight size={15} />
        </Link>
      </div>

      {/* What each side walks away with */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 bg-slate-50/50">
        {audiences.map((a) => {
          const Icon = a.icon;
          return (
            <div key={a.who} className="p-6 sm:p-7 space-y-3">
              <div className="flex items-center gap-2 text-emerald-600">
                <Icon size={16} />
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                  {a.who}
                </span>
              </div>
              <ul className="space-y-2">
                {a.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-sm text-slate-700 leading-snug">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-slate-400 shrink-0" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* The honest line, and the figures behind the claim */}
      <div className="px-6 sm:px-10 py-6 border-t border-slate-100 space-y-4">
        <p className="text-base sm:text-lg font-bold text-gray-900 leading-snug">
          It does not replace the architect. It shows them where to look — and the business why.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
          <Link href="/catalog" className="hover:text-emerald-700">
            <strong className="text-slate-700 tabular-nums">
              {classifiedObjects.toLocaleString('en-US')}
            </strong>{' '}
            SAP objects classified from SAP’s own data
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
