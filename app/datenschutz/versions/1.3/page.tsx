import ArchivedPrivacyPage, { archivedPrivacyMetadata } from '@/components/legal/ArchivedPrivacyPage';

/** Privacy policy, version 1.3, English — its fixed address (`lib/legal/privacy-versions.ts`). */

export const dynamic = 'force-static';
export const metadata = archivedPrivacyMetadata('1.3', 'en');

export default function Page() {
  return <ArchivedPrivacyPage id="1.3" lang="en" />;
}
