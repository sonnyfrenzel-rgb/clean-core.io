import type { Metadata } from 'next';

/**
 * The picture every public page shows when it is shared, unless the page names
 * its own. 1200×630, rendered from text by `scripts/render-social-card.mjs`.
 *
 * Next.js replaces a parent's `openGraph` block wholesale when a page declares
 * its own, so the root layout's image never reached a page that set a title:
 * the home page, the catalog, every knowledge page shipped without `og:image`,
 * and a link shared on LinkedIn showed no picture at all.
 */
export const SOCIAL_CARD = {
  url: 'https://clean-core.io/social-card.png',
  width: 1200,
  height: 630,
  alt: 'Clean-Core.io — from custom ABAP nobody understands to a reviewed, tested rebuild, on one chain of evidence you can check.',
  type: 'image/png',
} as const;

/**
 * Puts the page's own title and description on its Twitter card, and the site's
 * card picture on both cards when the page names none.
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
  const declared = meta.openGraph;
  if (!declared || meta.twitter) return meta;

  // A page that names its own picture keeps it; every other page gets the site
  // card, on Open Graph and on the Twitter card alike.
  const og = declared.images ? declared : { ...declared, images: [SOCIAL_CARD] };

  const title = typeof og.title === 'string' ? og.title : undefined;
  const description = typeof og.description === 'string' ? og.description : undefined;
  if (!title && !description) return { ...meta, openGraph: og };

  return {
    ...meta,
    openGraph: og,
    twitter: {
      card: 'summary_large_image',
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      images: og.images,
    },
  };
}
