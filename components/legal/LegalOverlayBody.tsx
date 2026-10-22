import Link from 'next/link';
import LegalDocument from '@/components/legal/LegalDocument';
import { legalDocument, legalDocumentBlocks, type LegalDocumentId } from '@/lib/legal/documents';

/**
 * The full legal text inside a sign-up dialog — the same words as the page,
 * not a summary of them. The summaries these dialogs used to show had drifted
 * from the documents they summarised; a text that is accepted in a dialog has
 * to be the text that is published.
 *
 * Loaded with `next/dynamic` where it is used, so the texts are fetched when a
 * dialog opens and are not part of the landing page's first load.
 */
export default function LegalOverlayBody({ id }: { id: Extract<LegalDocumentId, 'privacy' | 'terms'> }) {
  const doc = legalDocument(id, 'en');
  return (
    <div className="space-y-4" data-legal-overlay={id}>
      <p className="m-0 cc-text-cell text-cc-ink-muted">
        The full text, as published at{' '}
        <Link href={doc.route} target="_blank" rel="noopener noreferrer" className="font-semibold text-cc-brand-strong underline underline-offset-2">
          clean-core.io{doc.route}
        </Link>
        {id === 'privacy' ? (
          <>
            {' '}(German version, which prevails:{' '}
            <Link href="/datenschutz/de" target="_blank" rel="noopener noreferrer" hrefLang="de" className="font-semibold text-cc-brand-strong underline underline-offset-2">
              clean-core.io/datenschutz/de
            </Link>
            ).
          </>
        ) : (
          '.'
        )}
      </p>
      <LegalDocument blocks={legalDocumentBlocks(id, 'en')} compact omitSectionIds={['source-code', 'hosting', 'your-rights', 'cookies', 'project-access', 'server-logs', 'free-community-edition', 'third-party-ai', 'your-content', 'termination', 'previous-versions', 'contact', 'provider']} />
    </div>
  );
}
