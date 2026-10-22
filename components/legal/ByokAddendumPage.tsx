import LegalPage from '@/components/legal/LegalPage';
import { BYOK_ADDENDUM_ID, legalDocumentBlocks } from '@/lib/legal/documents';
import { archivedAddendum } from '@/lib/legal/byok-addendum-versions';
import type { LegalLang } from '@/lib/legal/open-values';

/**
 * The Additional Agreement on Own Model Keys, in one language, with the
 * identifier, the effective date and the digest of its wording — clause 12
 * promises all three on this page.
 */
export default function ByokAddendumPage({ lang }: { lang: LegalLang }) {
  const archived = archivedAddendum(BYOK_ADDENDUM_ID);
  const file = archived?.files.find((f) => f.lang === lang);
  const de = lang === 'de';
  return (
    <LegalPage
      lang={lang}
      title={de ? 'Zusatzvereinbarung zu eigenen Modellschlüsseln' : 'Additional Agreement on Own Model Keys'}
      blocks={legalDocumentBlocks('byok-addendum', lang)}
      switchHref={de ? '/terms/byok-addendum' : '/terms/byok-addendum/de'}
      switchDataAttr="data-addendum-language-switch"
      dataAttrs={{ 'data-byok-addendum': BYOK_ADDENDUM_ID }}
      beforeText={
        archived && file ? (
          <dl className="mb-10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-cc-ink-muted font-semibold">{de ? 'Kennung' : 'Identifier'}</dt>
              <dd className="text-cc-ink font-cc-mono">{archived.id}</dd>
            </div>
            <div>
              <dt className="text-cc-ink-muted font-semibold">{de ? 'Wirksam ab' : 'Effective from'}</dt>
              <dd className="text-cc-ink">{archived.effectiveOn[lang]}</dd>
            </div>
            <div className="sm:col-span-3">
              <dt className="text-cc-ink-muted font-semibold">{de ? 'SHA-256 dieses Wortlauts' : 'SHA-256 of this wording'}</dt>
              <dd className="text-cc-ink font-cc-mono text-xs break-all" data-addendum-sha256>
                {file.sha256}
              </dd>
            </div>
          </dl>
        ) : null
      }
    />
  );
}
