'use client';

import { useEffect, useState } from 'react';
import DemoAnalyzeBusiness from '@/components/demo/DemoAnalyzeBusiness';
import DemoWorkspace from '@/components/demo/DemoWorkspace';
import { stageViewOf, useLocationSearch } from '@/lib/location-search';
import type { DemoWorkspaceData } from '@/lib/demo-workspace';

/**
 * `/demo/analyze` — one route, three views, as a project's Analyze (plan
 * `docs/design/analyze-business-first-plan.md` §4.1, AB-2, O10; ADR-109).
 *
 * **Business** (the default, and where the demo opens): the map is the page,
 * in the same composition as a project's (`DemoAnalyzeBusiness`). **IT** keeps
 * the demo's Analyze stage (`DemoWorkspace`). **Management** is the management
 * answer a project's Analyze shows in that view (`DemoAnalyzeManagement`,
 * owner go 26.11.2026, Q8) — until then it was the IT page a second time.
 *
 * The view is read from the address in the browser (`useLocationSearch`), as
 * the stage header's view switch writes it, so a switch changes the page in
 * place; until the browser has answered nothing is chosen, so the statically
 * built page does not depend on a query and a reader who asked for IT never
 * gets Business's gate first.
 */
export default function DemoAnalyzeRoute({ data }: { data: DemoWorkspaceData }) {
  const search = useLocationSearch();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const view = stageViewOf(search);
  if (view === 'business') return <DemoAnalyzeBusiness data={data} />;
  return (
    <DemoWorkspace
      demo={data.demo}
      stage="analyze"
      design={null}
      source={null}
      management={view === 'management' ? { source: data.source, itFindings: data.itFindings } : null}
    />
  );
}
