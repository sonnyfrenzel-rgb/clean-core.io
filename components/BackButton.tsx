'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function BackButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-white px-5 py-2.5 rounded-full border border-gray-200 hover:border-green-200 hover:bg-green-50/50 hover:shadow-sm shadow-slate-100"
    >
      <ArrowLeft size={14} /> Back
    </button>
  );
}
