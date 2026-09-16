import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import DemoWorkspace from '@/components/demo/DemoWorkspace';
import { buildDemoProject } from '@/lib/demo-project';
import { PHASES, type PhaseKey } from '@/lib/workflow-steps';
import { DEMO_PROJECT_TITLE, DEMO_STRIP_NOTICE } from '@/lib/demo-marks';

/**
 * The demo project's seven stages — roadmap step 0.10.
 *
 * One route, one demo, for every account: the page is built on the server from
 * the example file in this repository and is identical for everybody, so there
 * is no per-account copy to create at sign-up and nothing to migrate for the
 * accounts that already exist. Sign-up is untouched.
 *
 * It sits outside `/project/[projectId]` deliberately. Those pages load a
 * Firestore document, enforce the run guard and can reach the routes that sign,
 * charge and export. A demo must not be able to do any of that, and the surest
 * way to guarantee it is to have no code path there at all rather than a flag
 * that some future branch forgets to check.
 *
 * ISR like the reference-analysis page: the engine run is deterministic, so the
 * cached copy is only ever as old as the deploy that changed the engine.
 */
export const revalidate = 300;

export function generateStaticParams() {
  return PHASES.map((p) => ({ stage: p.key }));
}

export const metadata: Metadata = {
  title: `${DEMO_PROJECT_TITLE} | Clean-Core.io`,
  description: DEMO_STRIP_NOTICE,
  robots: { index: false, follow: false },
};

export default async function DemoStagePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  const phase = PHASES.find((p) => p.key === stage);
  if (!phase) notFound();

  return <DemoWorkspace demo={buildDemoProject()} stage={phase.key as PhaseKey} />;
}
