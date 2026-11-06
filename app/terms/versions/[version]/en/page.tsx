import type { Metadata } from 'next';
import ArchivedTermsPage, { generateMetadata as archivedMetadata, generateStaticParams as archivedParams } from '../page';

/**
 * The English wording of an archived Terms version under an address that names
 * its language as well as its version — the link the contract confirmation
 * carries (Terms 1.3: "a link to the wording of the accepted version, which
 * remains permanently available at that address"; `publishedWordingPath` in
 * `lib/contract-confirmation-email.ts`). The German one is `../de`.
 *
 * The same page as `/terms/versions/<version>`, which stays the canonical
 * address: the bytes on screen are the archived file's.
 */

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return archivedParams();
}

export async function generateMetadata(props: { params: Promise<{ version: string }> }): Promise<Metadata> {
  return archivedMetadata(props);
}

export default ArchivedTermsPage;
