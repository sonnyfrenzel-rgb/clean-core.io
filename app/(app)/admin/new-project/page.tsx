import type { Metadata } from 'next';
import NewProject from '@/components/workspace/NewProject';
import { getLevelRuleVersion } from '@/lib/abap/catalog-service';
import type { CatalogArtifactFigures } from '@/lib/new-project-content';

/**
 * "New project" — `DESIGN.md` §6.1.1, roadmap 2.7.
 *
 * **Why this is a server component.** §6.1.1 asks for the SAP catalog to be
 * shown *„mit Anzahl und Stand des letzten Abgleichs aus dem Katalog, nie fest
 * im Text"*. Those figures live in `lib/abap/generated/` — 4.3 MB of JSON that
 * `getLevelRuleVersion()` reads — and there are only two honest ways to get them
 * onto a page: ship the catalog to the browser, or read it here. Typing the
 * numbers into the copy is the third way and is the thing the sentence forbids,
 * because a sync date written by a page author is correct exactly once.
 *
 * ISR for the same reason `/admin/workspace` uses it: the artifacts change only
 * when `npm run sync:catalog` runs and a deploy follows, so a cached copy is
 * never older than the deploy that changed it.
 *
 * **Nothing here is live product.** The new interface grows behind an admin-only
 * switch until 3.0 (`docs/ROADMAP.md`, preamble). Like the design-system gallery
 * of 1.5 and the list report of 1.8, this mounts under `app/(app)/admin/` and
 * the gate is checked inside the component itself.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'New project | Clean-Core.io',
  description: 'What Clean-Core.io is, and the choice between an example and your own code.',
  robots: { index: false, follow: false },
};

export default function AdminNewProjectPage() {
  // Read, never restated: file name, entry count and sync date come out of the
  // artifacts themselves. An empty list is a state the component renders as such.
  const artifacts: CatalogArtifactFigures[] = getLevelRuleVersion().artifacts.map((artifact) => ({
    file: artifact.file,
    question: artifact.question,
    entries: artifact.entries,
    fetchedAt: artifact.fetchedAt,
  }));

  return <NewProject catalogArtifacts={artifacts} />;
}
