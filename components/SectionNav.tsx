'use client';

import { useEffect, useState } from 'react';

/**
 * A scan bar for a page that is six screens long.
 *
 * The landing page has an argument with a shape — proof, then the toolchain
 * position, then capabilities, then how the data is handled, then access — and
 * until now the only way to find any of it was to scroll and hope. An architect
 * jumps to the showroom; a business reader jumps to the evidence and to what
 * happens to their code. Neither had a way to.
 *
 * Nothing here is new content: every label is the section's own name, shortened
 * to the mono-uppercase form the page already uses for eyebrows. The bar takes
 * the header's own white ground, one hairline, and the emerald underline the
 * product uses for "you are here".
 *
 * On a phone it scrolls horizontally with snap rather than wrapping to two rows,
 * so it stays 44 px tall on the viewport where vertical space is scarcest.
 */
const SECTIONS = [
  { id: 'showroom', label: 'Showroom' },
  { id: 'process', label: 'Process' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'toolchain', label: 'Toolchain' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'data', label: 'Your data' },
  { id: 'access', label: 'Access' },
];

export default function SectionNav() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const targets = SECTIONS
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!targets.length) return;

    // The section whose top has most recently passed under the bar wins, which
    // is what "you are here" means when sections are taller than the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-88px 0px -65% 0px', threshold: 0 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Sections on this page"
      className="sticky top-0 z-30 border-y border-gray-200/80 bg-white/95 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-7xl overflow-x-auto snap-x px-4 sm:px-6 lg:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex min-w-max items-stretch gap-1 sm:gap-2">
          {SECTIONS.map((s) => {
            const isActive = active === s.id;
            return (
              <li key={s.id} className="snap-start">
                <a
                  href={`#${s.id}`}
                  aria-current={isActive ? 'true' : undefined}
                  className={`flex h-11 items-center border-b-2 px-3 text-[11px] font-black uppercase tracking-[0.12em] transition-colors ${
                    isActive
                      ? 'border-green-600 text-gray-950'
                      : 'border-transparent text-gray-500 hover:text-green-700'
                  }`}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
