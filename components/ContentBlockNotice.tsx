'use client';

import React from 'react';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { contentBlockSentence, contentBlocksOfProfile } from '@/lib/content-hold';

/**
 * Tells the account that one of its projects is blocked after a report of
 * illegal content (legal texts Fassung 1.1; Terms section 7). The project
 * itself is out of reach — it is no longer in the list, cannot be opened and
 * cannot be deleted from the dashboard while it is retained — so this strip is
 * the only place the account learns about it in the product. It names the
 * project by its id only: the name can itself be what was reported.
 */
export default function ContentBlockNotice({ profile }: { profile: unknown }) {
  const entries = contentBlocksOfProfile(profile);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-content-block-notice="">
      {entries.map((e) => (
        <CcMessageStrip key={e.holdId} state={e.status === 'blocked' ? 'warning' : 'information'} headline={e.status === 'blocked' ? 'Project blocked.' : 'Blocked project deleted.'}>
          {contentBlockSentence(e)}
        </CcMessageStrip>
      ))}
    </div>
  );
}
