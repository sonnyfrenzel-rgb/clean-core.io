import { PHASES } from '@/lib/workflow-steps';
import { NAVIGATION_MESSAGES } from '@/lib/messages/navigation';

/**
 * What the project's one error boundary says, by where it stands — roadmap
 * 3.0.21 (7), `app/(app)/project/[projectId]/error.tsx`.
 *
 * On a tool: the tool's own name, and the way back every tool has — "Back to
 * project workspace" (ADR-018: a tool has no previous stage). On the workspace
 * itself the way back would lead to the page that just failed, so it is My
 * workspace.
 */
export interface StageErrorCopy {
  /** Whether the page is one of the seven tools, rather than the workspace. */
  onTool: boolean;
  /** "Design", "Economics" — or "The project workspace". */
  subject: string;
  title: string;
  body: string;
  backLabel: string;
}

export function stageErrorCopy(pathname: string): StageErrorCopy {
  const segment = /^\/project\/[^/]+\/([a-z]+)/.exec(pathname)?.[1] ?? null;
  const phase = PHASES.find((p) => p.key === segment);
  if (phase) {
    return {
      onTool: true,
      subject: phase.label,
      title: 'This tool could not be displayed',
      body: `${phase.label} stopped while drawing the page. Drawing a page deletes nothing, but if a generation or a save was running when it stopped, whether it finished is not known here — try again, or go back to the project workspace and open the tool anew to see what is stored.`,
      backLabel: NAVIGATION_MESSAGES['nav.backToProjectWorkspace'],
    };
  }
  return {
    onTool: false,
    subject: 'The project workspace',
    title: 'This project could not be displayed',
    body: 'The project workspace stopped while drawing the page. Drawing a page deletes nothing; try again, or go to My workspace and open the project anew.',
    backLabel: NAVIGATION_MESSAGES['nav.goToMyWorkspace'],
  };
}
