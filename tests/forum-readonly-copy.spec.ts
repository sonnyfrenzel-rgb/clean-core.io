import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// QA e81c64678cca: the announcements board is read-only (`data-forum-readonly`),
// so no post on it may invite the reader to post, share or ask "below". Questions
// go to the administrator's address, which the board names.
test('the read-only board does not invite posts, comments or questions on the board', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'dashboard', 'page.tsx'), 'utf8');
  const start = page.indexOf('const [forumPosts] = useState');
  expect(start, 'the board posts moved — re-read this test').toBeGreaterThan(-1);
  const posts = page.slice(start, page.indexOf('];', start));
  expect(posts).not.toMatch(/\bbelow!?\b/i);
  expect(posts).not.toMatch(/\b(share|post|comment)\b[^.]*\b(learnings|here|below)\b/i);
  expect(posts).not.toMatch(/\bask\b[^.]*\bquestions\b(?![^.]*admin@clean-core\.io)/i);
});
