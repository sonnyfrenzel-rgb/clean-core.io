import { MetadataRoute } from 'next';

/**
 * Private areas: the signed-in product, the admin, the API, and invitation
 * links (each bound to one confirmed e-mail address — never a search result).
 */
const PRIVATE = ['/admin', '/project/', '/dashboard', '/settings', '/api/', '/invitation'];

/**
 * Answer engines and AI crawlers, named so the allow-list is a decision and not
 * an accident of the `*` group. A named group replaces the `*` group for that
 * crawler, so it repeats the private paths.
 *
 * Training crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended) and
 * the search/answer fetchers (OAI-SearchBot, ChatGPT-User, Claude-SearchBot,
 * Claude-User, PerplexityBot, Perplexity-User) are both allowed: the public
 * pages are written to be quoted, and `/llms.txt` and `/facts` exist so that
 * what gets quoted is true.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE,
      },
      {
        userAgent: AI_CRAWLERS,
        allow: [
          '/',
          // The orientation files first: what the site is, and its citable numbers.
          '/llms.txt',
          '/llms-full.txt',
          // The facts service (roadmap 0.2, UX-E14-F01:R0): the one page an
          // answer engine should read for a citable number instead of inferring
          // one from marketing prose.
          '/facts',
          '/facts.json',
          '/catalog',
          '/abap-custom-code-analysis',
          '/clean-core-score',
          '/clean-core-explained',
          '/sap-clean-core-object-classification',
          '/method/levels',
          '/sap-cloudification',
          '/knowledge',
          '/how-it-works',
          '/how-to',
          '/first-run',
          '/features/',
          '/reference-analysis',
          '/about',
          '/whitepaper',
          '/trust',
          '/tenant-security',
        ],
        disallow: PRIVATE,
      },
    ],
    sitemap: [`${baseUrl}/sitemap.xml`, `${baseUrl}/catalog-sitemap.xml`],
  };
}
