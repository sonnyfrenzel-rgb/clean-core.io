import ArchivedPrivacyPage, { archivedPrivacyMetadata } from '@/components/legal/ArchivedPrivacyPage';

/** Privacy policy, version 1.2, German — its fixed address (`lib/legal/privacy-versions.ts`). */

export const dynamic = 'force-static';
export const metadata = archivedPrivacyMetadata('1.2', 'de');

export default function Page() {
  return <ArchivedPrivacyPage id="1.2" lang="de" />;
}
