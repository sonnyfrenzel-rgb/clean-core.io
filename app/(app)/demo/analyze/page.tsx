import type { Metadata } from 'next';
import DemoAnalyzeRoute from '@/components/demo/DemoAnalyzeRoute';
import { buildDemoWorkspace } from '@/lib/demo-workspace';
import { DEMO_PROJECT_TITLE, DEMO_STRIP_NOTICE } from '@/lib/demo-marks';

/**
 * The demo's Analyze — where the demo opens, like a project (plan
 * `docs/design/analyze-business-first-plan.md` §4.1, AB-2, O10;
 * `DESIGN.md` §6.1.2): Business is the map page, IT and Management the demo's
 * Analyze stage as before (`components/demo/DemoAnalyzeRoute.tsx`).
 *
 * Built on the server from the example file by the engine of this release and
 * identical for every account, as `/demo/workspace` and `/demo/{stage}` are.
 * A static segment, so it wins over `/demo/[stage]`, which leaves `analyze` to
 * this page. No route here can sign, charge, store or call a model.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: `${DEMO_PROJECT_TITLE} | Clean-Core.io`,
  description: DEMO_STRIP_NOTICE,
  robots: { index: false, follow: false },
};

export default function DemoAnalyzePage() {
  return <DemoAnalyzeRoute data={buildDemoWorkspace()} />;
}
