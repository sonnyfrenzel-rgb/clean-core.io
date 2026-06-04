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
  title: 'Clean-Core.io',
  description: 'Enterprise Legacy to Node.js Transformation Tool',
  icons: {
    icon: '/icon.svg',
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
