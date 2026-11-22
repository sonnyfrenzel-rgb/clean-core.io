import ArchivedPrivacyPage, { archivedPrivacyMetadata } from '@/components/legal/ArchivedPrivacyPage';

/** Privacy policy, version 1.4, German — its fixed address (`lib/legal/privacy-versions.ts`). */

export const dynamic = 'force-static';
export const metadata = archivedPrivacyMetadata('1.4', 'de');

export default function Page() {
  return <ArchivedPrivacyPage id="1.4" lang="de" />;
}
