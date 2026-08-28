import React from 'react';

/**
 * The landing page's section header. There is exactly one.
 *
 * Every section used to write its own: three eyebrow variants, four heading
 * scales, one section with an emoji, one with an `h3` where an `h2` belonged, and
 * one — the seven steps — with no header at all, so the step that explains the
 * whole workflow read as a widget floating between two arguments. None of that
 * was a decision; it was five people's defaults accumulating in one file.
 *
 * The classes live here and nowhere else, so a new section cannot drift by
 * accident: it either uses this component and matches, or it fails
 * `tests/landing-style-guard.spec.ts`, which reads the rendered page and compares
 * every section heading's computed style against the first one.
 *
 * Three knobs, because the page genuinely has three cases and no more:
 * `align` for the one section that reads left, `tone` for the dark footer, and
 * `titleId` where something needs to label itself for assistive technology.
 */
export default function SectionHeader({
  eyebrow,
  title,
  titleId,
  align = 'center',
  tone = 'light',
  children,
}: {
  /** The mono uppercase pill above the heading. Omit where a section has none. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  titleId?: string;
  align?: 'center' | 'left';
  tone?: 'light' | 'dark';
  /** The lead paragraph. */
  children?: React.ReactNode;
}) {
  const centered = align === 'center';

  return (
    <div className={`mb-16 ${centered ? 'text-center' : 'text-center md:text-left'}`}>
      {eyebrow && (
        <span
          data-section-eyebrow
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-4 border ${
            tone === 'dark'
              ? 'text-emerald-300 bg-emerald-950/60 border-emerald-800/60'
              : 'text-emerald-700 bg-emerald-50 border-emerald-100'
          }`}
        >
          {eyebrow}
        </span>
      )}

      {/* `data-section-heading` is what the guard measures, so a card's own
          heading — the benefit card's, for one — is not compared against a
          section's and does not have to pretend to be one. */}
      <h2
        id={titleId}
        data-section-heading
        className={`text-3xl sm:text-4xl md:text-6xl font-black mb-6 tracking-tighter text-balance ${
          tone === 'dark' ? 'text-white' : 'text-gray-950'
        }`}
      >
        {title}
      </h2>

      {children && (
        <p
          className={`text-base sm:text-lg md:text-xl font-light max-w-3xl ${
            centered ? 'mx-auto' : ''
          } ${tone === 'dark' ? 'text-gray-400' : 'text-gray-700'}`}
        >
          {children}
        </p>
      )}
    </div>
  );
}
