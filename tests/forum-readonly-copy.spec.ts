import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// QA e81c64678cca held the read-only announcements board to "no post invites a
// reply". The owner dropped the board on 02.10.2026 as outdated (ADR-061), so
// what is held now is that it stays gone: no board, no static posts, nothing
// that could invite a post — on the old page or on the list every account
// lands on.
test('the announcements board is gone, and nothing in its place invites posts', () => {
  const root = path.join(__dirname, '..');
  for (const rel of ['app/(app)/dashboard/page.tsx', 'components/workspace/WorkspaceListReport.tsx']) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    expect(src, `${rel} still carries the board's posts`).not.toContain('forumPosts');
    expect(src, `${rel} still carries the read-only board`).not.toContain('data-forum-readonly');
    expect(src, `${rel} still announces`).not.toMatch(/Clean-Core\.io announcements|Open announcements/);
  }
});
