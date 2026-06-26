import Link from 'next/link';
import { ArrowLeft, SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f8f9ff] flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-gray-100 max-w-lg w-full">
        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <SearchX className="w-10 h-10 text-gray-400" />
        </div>
        <h1 className="text-6xl font-black text-gray-950 mb-2 tracking-tighter">404</h1>
        <h2 className="text-xl font-bold text-gray-700 mb-4">Page Not Found</h2>
        <p className="text-gray-500 mb-8 font-medium">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 bg-[#0b1c30] text-white px-6 py-3.5 rounded-2xl font-bold hover:bg-green-700 transition-colors"
          >
            <ArrowLeft size={18} /> Back to Home
          </Link>
          <Link
            href="/how-it-works"
            className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-6 py-3.5 rounded-2xl font-bold hover:bg-gray-200 transition-colors"
          >
            How It Works
          </Link>
        </div>
      </div>
    </div>
  );
}
