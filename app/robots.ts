import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/project/', '/dashboard/', '/settings/', '/api/'],
      },
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'PerplexityBot', 'Google-Extended', 'ClaudeBot', 'Applebot-Extended'],
        allow: [
          '/',
          '/catalog',
          '/abap-custom-code-analysis',
          '/clean-core-score',
          '/sap-clean-core-object-classification',
          '/sap-cloudification',
          '/knowledge',
          '/how-it-works',
          '/about',
          '/whitepaper',
          '/tenant-security',
          // The facts service (roadmap 0.2, UX-E14-F01:R0): the one page an
          // answer engine should read for a citable number instead of inferring
          // one from marketing prose.
          '/facts',
          '/facts.json',
        ],
        disallow: ['/admin/', '/project/', '/dashboard/', '/settings/', '/api/'],
      },
    ],
    sitemap: [`${baseUrl}/sitemap.xml`, `${baseUrl}/catalog-sitemap.xml`],
  };
}
