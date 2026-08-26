import Link from 'next/link';
import { Database, ListChecks, FileCheck2 } from 'lucide-react';

export interface ProofFigure {
  /** The number itself — the thing that gets quoted. */
  value: string;
  /** What it counts. One short line. */
  label: string;
  /** Why it is checkable, and where. */
  detail: string;
  href: string;
  hrefLabel: string;
  icon: 'catalog' | 'coverage' | 'evidence';
}

const ICONS = {
  catalog: Database,
  coverage: ListChecks,
  evidence: FileCheck2,
} as const;

/**
 * Three figures, each with the page that proves it.
 *
 * The landing page previously carried one benefit claim — "save days of manual
 * mapping" — which is unprovable, unquotable and useless in a business case.
 * These replace it with numbers a reader can check in one click, and that are
 * computed from the shipped artifacts rather than written into the copy: the
 * catalog count comes from the generated repository artifact, the coverage split
 * from the support matrix the engine itself runs on.
 *
 * Deliberately includes what is NOT covered. That is the differentiator: nobody
 * else in this space publishes the classes they hand back.
 */
export default function ProofStrip({ figures }: { figures: ProofFigure[] }) {
  return (
    <section
      aria-label="What Clean-Core.io covers, in numbers"
      className="grid grid-cols-1 md:grid-cols-3 gap-4"
    >
      {figures.map((f) => {
        const Icon = ICONS[f.icon];
        return (
          <Link
            key={f.label}
            href={f.href}
            className="group flex flex-col gap-2 p-6 rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm hover:border-emerald-400 hover:shadow-md transition-all text-left"
          >
            <span className="inline-flex items-center gap-2 text-emerald-600">
              <Icon size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-emerald-600 transition-colors">
                {f.hrefLabel}
              </span>
            </span>
            <span className="text-3xl sm:text-4xl font-black tracking-tight text-gray-950 tabular-nums leading-none">
              {f.value}
            </span>
            <span className="text-sm font-bold text-slate-800 leading-snug">{f.label}</span>
            <span className="text-xs text-slate-500 leading-relaxed">{f.detail}</span>
          </Link>
        );
      })}
    </section>
  );
}
