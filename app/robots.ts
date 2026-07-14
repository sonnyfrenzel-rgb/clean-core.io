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
          '/knowledge',
          '/how-it-works',
          '/about',
          '/whitepaper',
          '/tenant-security',
        ],
        disallow: ['/admin/', '/project/', '/dashboard/', '/settings/', '/api/'],
      },
    ],
    sitemap: [`${baseUrl}/sitemap.xml`, `${baseUrl}/catalog-sitemap.xml`],
  };
}
