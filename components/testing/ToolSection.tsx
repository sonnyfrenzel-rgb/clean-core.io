import React from 'react';

/**
 * One section of an object page (proposal A `.sec`): a card with an `h2`, an
 * optional count or chip beside it, actions on the right, a muted lead under
 * the title and the body. The `id` is what the anchor bar links to.
 */
export default function ToolSection({
  id,
  title,
  titleExtra,
  aside,
  actions,
  lead,
  children,
  ...rest
}: {
  id?: string;
  title: React.ReactNode;
  /** A provenance chip beside the title. */
  titleExtra?: React.ReactNode;
  /** A muted count on the right of the header. */
  aside?: React.ReactNode;
  actions?: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title' | 'id' | 'children'>) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="min-w-0 scroll-mt-32 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc"
      {...rest}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 id={headingId} className="m-0 flex flex-wrap items-center gap-2 cc-text-h2 text-cc-ink">
          {title}
          {titleExtra}
        </h2>
        {aside ? <span className="cc-text-meta text-cc-ink-muted">{aside}</span> : null}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {lead ? <p className="m-0 mt-1 px-4 cc-text-cell text-cc-ink-muted sm:px-5">{lead}</p> : null}
      {children ? <div className="px-4 pt-4 pb-5 sm:px-5">{children}</div> : <div className="pb-4" />}
    </section>
  );
}
