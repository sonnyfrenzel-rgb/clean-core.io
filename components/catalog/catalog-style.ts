/**
 * The classes the public catalog and method pages share — block D, D.25a.
 *
 * One place, for the same reason `components/SectionHeader.tsx` is one place:
 * the catalog index, the object pages, the A–Z and module hubs and
 * `/method/levels` each wrote their own eyebrow, title and card, and they had
 * drifted into four title sizes in 900 and a green eyebrow on one page only.
 * These are the landing page's shapes in the `--cc-*` tokens: the eyebrow is
 * SectionHeader's pill, the title its 800 weight and tracking at `h1` size.
 *
 * A plain module, not a component file: the pages are server components and
 * read strings from here.
 */

/** The pill above a page title — SectionHeader's eyebrow, light tone. */
export const CATALOG_EYEBROW =
  'inline-flex items-center rounded-full border border-cc-brand-strong/25 bg-cc-brand-surface px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-cc-brand-strong';

/** The page title (`h1`): SectionHeader's weight and tracking, one step larger. */
export const CATALOG_TITLE = 'font-extrabold tracking-[-0.03em] leading-[1.1] text-balance text-cc-ink';

/** A section title (`h2`) inside a page. */
export const CATALOG_H2 = 'text-2xl font-extrabold tracking-[-0.02em] text-cc-ink';

/** The micro-label heading over a list or a card (`cc-text-label`, §1.2). */
export const CATALOG_LABEL = 'cc-text-label text-cc-ink-muted';

/** A card on the page ground. Public pages keep their large radius (E-5, §1.4). */
export const CATALOG_CARD = 'rounded-2xl border border-cc-line bg-cc-surface';

/** A text link in running copy or a link list — the landing page's link. */
export const CATALOG_LINK = 'font-semibold text-cc-ink underline underline-offset-4 decoration-cc-field-border hover:decoration-cc-ink';

/** The breadcrumb row. */
export const CATALOG_CRUMBS = 'text-sm text-cc-ink-muted mb-6';
export const CATALOG_CRUMB_LINK = 'underline-offset-4 hover:text-cc-ink hover:underline';

/**
 * A tile that is a link inside a card-shaped list item. The surface belongs to
 * the `li` (the card), the link only draws the edge and fills it — a card that
 * opens something, not one of the four buttons of §1.5.
 */
export const CATALOG_TILE_ITEM = 'rounded-cc-row bg-cc-surface';
export const CATALOG_TILE_LINK =
  'block truncate rounded-cc-row border border-cc-line px-3 py-2 font-cc-mono text-sm font-semibold text-cc-ink hover:border-cc-field-border hover:underline underline-offset-4';
