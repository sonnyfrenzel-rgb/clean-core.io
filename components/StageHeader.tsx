import React from 'react';

/**
 * The header at the top of a workflow stage. There is exactly one.
 *
 * The seven stages had seven different ones. Measured:
 *
 *   analyze         text-4xl            font-extrabold  gray-900   centred
 *   design          text-2xl sm:text-3xl font-bold      gray-900   left
 *   transformation  text-4xl            font-black      gray-900   left
 *   testing         text-3xl md:text-4xl font-black     #0b1c30    left
 *   documentation   text-3xl md:text-4xl font-black     #0b1c30    left, UPPERCASE
 *   delivery        text-3xl md:text-5xl font-black     gray-900   centred, UPPERCASE
 *   tco             text-3xl md:text-4xl font-black     #0b1c30    left, UPPERCASE
 *
 * Three weights, four scales, two inks, two cases, and two stages with no
 * responsive step at all — so the title jumped size, weight and colour as the
 * reader moved from one step to the next. Nobody chose that; each page was
 * written on a different day.
 *
 * The scale here is the app's, not the landing page's: a working screen wants a
 * title it can read past, not a marketing headline. The ink is `gray-950`, which
 * is what `SectionHeader` uses, so the two halves of the product agree.
 *
 * Guarded by `tests/workflow-style-guard.spec.ts`, which loads every stage and
 * compares the computed style of each `[data-stage-title]` against the first.
 */
export default function StageHeader({
  title,
  eyebrow,
  icon,
  actions,
  align = 'left',
  children,
}: {
  title: React.ReactNode;
  /** Badges or labels that sit above the title, where a stage has them. */
  eyebrow?: React.ReactNode;
  /** The one stage that opens with a mark — delivery's rocket. */
  icon?: React.ReactNode;
  /** Buttons that belong to the stage as a whole, right-aligned on desktop. */
  actions?: React.ReactNode;
  align?: 'left' | 'center';
  /** The lead sentence. */
  children?: React.ReactNode;
}) {
  const centred = align === 'center';

  return (
    <div
      className={`mb-8 md:mb-10 mt-6 md:mt-8 ${
        centred
          ? 'text-center'
          : 'flex flex-col gap-5 md:flex-row md:items-start md:justify-between'
      }`}
    >
      <div className={centred ? '' : 'min-w-0'}>
        {icon && (
          <div
            className={`inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-green-50 mb-5 md:mb-6 border-4 border-white shadow-xl ${
              centred ? '' : 'mb-4'
            }`}
          >
            {icon}
          </div>
        )}

        {eyebrow && <div className="mb-2 flex flex-wrap items-center gap-2">{eyebrow}</div>}

        <h1
          data-stage-title
          className="text-3xl md:text-4xl font-black tracking-tight text-gray-950 text-balance"
        >
          {title}
        </h1>

        {children && (
          <p
            className={`mt-2.5 text-sm md:text-base text-gray-600 font-medium leading-relaxed ${
              centred ? 'max-w-2xl mx-auto' : 'max-w-3xl'
            }`}
          >
            {children}
          </p>
        )}
      </div>

      {actions && (
        <div className={`flex flex-wrap gap-3 ${centred ? 'justify-center mt-6' : 'shrink-0'}`}>
          {actions}
        </div>
      )}
    </div>
  );
}
