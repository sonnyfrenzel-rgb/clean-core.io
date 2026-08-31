import type { Metadata } from 'next';

/**
 * Puts the page's own title and description on its Twitter card.
 *
 * Twenty-two pages defined `openGraph` and exactly one defined `twitter`, so
 * every other page inherited the root layout's domain-level card. Sharing the
 * Clean Core guide on X showed the homepage's headline and the homepage's
 * summary — the one place where a specific page had a specific audience, and it
 * introduced itself as the site in general.
 *
 * Open Graph and the Twitter card are two syntaxes for one claim about a page.
 * Maintaining them separately is how they drift apart, so they are not
 * maintained separately: this reads what the page already declared.
 *
 * `tests/social-card-guard.spec.ts` checks the rendered `<meta>` tags, not this
 * function — a page can always hand-write a `twitter` block and go its own way.
 */
export function withTwitterCard(meta: Metadata): Metadata {
  const og = meta.openGraph;
  if (!og || meta.twitter) return meta;

  const title = typeof og.title === 'string' ? og.title : undefined;
  const description = typeof og.description === 'string' ? og.description : undefined;
  if (!title && !description) return meta;

  return {
    ...meta,
    twitter: {
      card: 'summary_large_image',
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
    },
  };
}
