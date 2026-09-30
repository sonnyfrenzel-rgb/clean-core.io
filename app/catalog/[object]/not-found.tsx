import Link from 'next/link';
import { publicButton } from '@/components/landing/public-button';
import { CATALOG_TITLE } from '@/components/catalog/catalog-style';

export default function CatalogObjectNotFound() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-24 text-center">
      <h1 className={`${CATALOG_TITLE} text-3xl mb-3`}>Object not in the catalog</h1>
      <p className="text-cc-ink-muted mb-8">
        This SAP object isn’t classified in the SAP Cloudification Repository, or its name uses a
        namespace we don’t index. Try the A–Z browse or search.
      </p>
      <Link
        href="/catalog"
        className={publicButton('primary', 'sm')}
      >
        Back to catalog
      </Link>
    </main>
  );
}
