import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import MotionPreference from '@/components/MotionPreference';
import { SOCIAL_CARD } from '@/lib/page-metadata';

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900']
});

export const revalidate = 300;

/**
 * The site-wide defaults. A page that declares its own `openGraph` replaces this
 * block wholesale, which is why the picture lives in `lib/page-metadata.ts` and
 * every public page passes through `withTwitterCard`.
 *
 * Title and description say the approved one-sentence USP (roadmap 3.0.6), so a
 * route without metadata of its own still introduces the product correctly.
 */
const SITE_DESCRIPTION =
  'From custom ABAP nobody understands to a reviewed, tested rebuild — on one chain of evidence you can check. Free for the SAP community; independent of SAP SE.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io'),
  title: 'Clean-Core.io — Free SAP Clean Core Accelerator for Custom ABAP',
  description: SITE_DESCRIPTION,
  applicationName: 'Clean-Core.io',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/logo.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/logo.png',
  },
  openGraph: {
    title: 'Clean-Core.io — Free SAP Clean Core Accelerator for Custom ABAP',
    description: SITE_DESCRIPTION,
    url: 'https://clean-core.io',
    type: 'website',
    siteName: 'Clean-Core.io',
    locale: 'en_US',
    images: [SOCIAL_CARD],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Clean-Core.io — Free SAP Clean Core Accelerator for Custom ABAP',
    description: SITE_DESCRIPTION,
    images: [SOCIAL_CARD],
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-cc-page text-cc-ink antialiased min-h-screen flex flex-col">
        <MotionPreference>{children}</MotionPreference>
      </body>
    </html>
  );
}
