import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900']
});

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Clean-Core.io — Free SAP Clean Core Accelerator',
  description: 'Free community tool that reads custom SAP ABAP and turns it into an evidence-backed Clean Core decision: the process reconstructed from the code with line anchors, Level A–D per SAP object, and a signed run for every completed analysis. Complementary to SAP tooling.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/logo.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/logo.png',
  },
  openGraph: {
    title: 'Clean-Core.io — Free SAP Clean Core Accelerator',
    description: 'Free community web app that reads custom SAP ABAP and turns it into an evidence-backed Clean Core decision. Every statement is tied to a line of the code; complementary to your SAP tooling.',
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
    title: 'Clean-Core.io — Free SAP Clean Core Accelerator',
    description: 'Free community web app that reads custom SAP ABAP and turns it into an evidence-backed Clean Core decision. Every statement is tied to a line of the code; complementary to your SAP tooling.',
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
