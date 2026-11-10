import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { NO_ACCESS_SENTENCE } from '@/lib/project-gate';
import { nav } from '@/lib/messages/navigation';

/**
 * What a signed-in account reads on a project it may not open (roadmap 3.0.21
 * (1)): one sentence and the way to its own list — not the 404, which told the
 * reader their link had a typo. The same words for a project that does not
 * exist and for one that is not shared with this account (`lib/project-gate.ts`).
 */
export default function ProjectNoAccess() {
  return (
    <div data-project-gate="no-access" className="max-w-xl py-16">
      <CcMessageStrip
        state="warning"
        actions={
          <CcLinkButton href="/dashboard" variant="ghost">
            {nav('nav.goToMyWorkspace')}
          </CcLinkButton>
        }
      >
        {NO_ACCESS_SENTENCE}
      </CcMessageStrip>
    </div>
  );
}
