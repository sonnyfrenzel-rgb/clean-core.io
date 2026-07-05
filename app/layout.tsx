import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900']
});

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Clean-Core.io — Free SAP Clean Core Modernization Assistant',
  description: 'Free community assistant for SAP Clean Core modernization: analyze custom ABAP, identify clean-core risks, draft RAP/CAP target designs, and export audit-friendly evidence packs for architect review. Complementary to SAP tooling.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/logo.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/logo.png',
  },
  openGraph: {
    title: 'Clean-Core.io — Free SAP Clean Core Modernization Assistant',
    description: 'A free, community-built assistant that analyzes custom SAP ABAP and drafts clean-core-aligned RAP/CAP designs. Evidence-based and complementary to your SAP tooling — review and verify before you deploy.',
    url: 'https://clean-core.io',
    type: 'website',
    siteName: 'Clean-Core.io',
    images: [
      {
        url: 'https://clean-core.io/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Clean-Core.io — Free SAP Clean Core Modernization',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Clean-Core.io — Free SAP Clean Core Modernization Assistant',
    description: 'A free, community-built assistant that analyzes custom SAP ABAP and drafts clean-core-aligned RAP/CAP designs. Evidence-based and complementary to your SAP tooling — review and verify before you deploy.',
    images: ['https://clean-core.io/og-image.png'],
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-[#f8f9ff] text-[#0b1c30] antialiased min-h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}
