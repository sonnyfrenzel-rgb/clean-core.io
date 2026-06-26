import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import UserOnboarding from '@/components/UserOnboarding';

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900']
});

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Clean-Core.io | Enterprise S/4HANA Modernization Suite',
  description: 'Automatically analyze and transform custom legacy ABAP operations into clean-code, cloud-native Node.js architectures following official SAP Clean Core guidelines.',
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    title: 'Clean-Core.io | Enterprise S/4HANA Modernization Suite',
    description: 'Automatically analyze and transform custom legacy ABAP operations into clean-code, cloud-native Node.js architectures following official SAP Clean Core guidelines.',
    url: 'https://clean-core.io',
    type: 'website',
    siteName: 'Clean-Core.io',
    images: [
      {
        url: 'https://clean-core.io/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Clean-Core.io — SAP S/4HANA Modernization Suite',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Clean-Core.io | Enterprise S/4HANA Modernization Suite',
    description: 'Automatically analyze and transform custom legacy ABAP operations into clean-code, cloud-native Node.js architectures following official SAP Clean Core guidelines.',
    images: ['https://clean-core.io/og-image.png'],
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-[#f8f9ff] text-[#0b1c30] antialiased min-h-screen flex flex-col">
        <UserOnboarding />
        {children}
      </body>
    </html>
  );
}
