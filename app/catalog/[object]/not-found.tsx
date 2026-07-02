import Link from 'next/link';

export default function CatalogObjectNotFound() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-24 text-center">
      <h1 className="text-3xl font-black text-gray-900 mb-3">Object not in the catalog</h1>
      <p className="text-slate-600 mb-8">
        This SAP object isn’t classified in the SAP Cloudification Repository, or its name uses a
        namespace we don’t index. Try the A–Z browse or search.
      </p>
      <Link
        href="/catalog"
        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm px-5 py-3 rounded-xl transition-colors"
      >
        Back to catalog
      </Link>
    </main>
  );
}
