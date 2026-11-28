import type { Metadata } from 'next';
import DemoRedesign from '@/components/demo/DemoRedesign';
import { buildDemoProject } from '@/lib/demo-project';
import { DEMO_PROJECT_TITLE, DEMO_STRIP_NOTICE } from '@/lib/demo-marks';

/**
 * The demo's Decide page (ADR-143, ADR-145; was Re-design): where the demo's onward links from Analyze lead, as a
 * project's lead to `/project/[id]/redesign`. Built on the server from the example file by the engine of this release and identical for
 * every account, as `/demo/analyze` and `/demo/{stage}` are. A static segment, so it wins over `/demo/[stage]`. No
 * route here can sign, charge, store or call a model.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: `${DEMO_PROJECT_TITLE} | Clean-Core.io`,
  description: DEMO_STRIP_NOTICE,
  robots: { index: false, follow: false },
};

export default function DemoRedesignPage() {
  const demo = buildDemoProject();
  return (
    <DemoRedesign
      title={demo.title}
      rail={demo.rail}
      recommendedRoute={demo.design.recommendedRoute ?? null}
      loc={demo.economics.loc}
      score={demo.analyze.cleanCoreScore}
    />
  );
}
