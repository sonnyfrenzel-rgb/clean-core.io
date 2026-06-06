import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import UserOnboarding from '@/components/UserOnboarding';

export const dynamic = 'force-dynamic';

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900']
});

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
        url: 'https://clean-core.io/icon.svg',
        width: 800,
        height: 600,
        alt: 'Clean-Core.io Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Clean-Core.io | Enterprise S/4HANA Modernization Suite',
    description: 'Automatically analyze and transform custom legacy ABAP operations into clean-code, cloud-native Node.js architectures following official SAP Clean Core guidelines.',
    images: ['https://clean-core.io/icon.svg'],
  },
  verification: {
    google: 'google-site-verification-placeholder-value',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-[#f8f9ff] text-[#0b1c30] antialiased min-h-screen flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Clean-Core.io",
              "operatingSystem": "All",
              "applicationCategory": "DeveloperApplication",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "EUR"
              },
              "description": "Enterprise S/4HANA Modernization Suite. Automatically analyze and transform custom legacy ABAP operations into clean-code, cloud-native Node.js architectures following official SAP Clean Core guidelines.",
              "featureList": "ABAP Extensibility Routing, SAP API Hub Mapping, Dual RAP & CAP Engine, ADT Cockpit Simulation, Business Value & TCO Audit, BPMN 2.0 Architectural Blueprinting"
            })
          }}
        />
        <UserOnboarding />
        {children}
      </body>
    </html>
  );
}
