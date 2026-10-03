import { test, expect, type Page } from '@playwright/test';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import firebaseConfig from '../firebase-config.json';

/**
 * A page that goes away closes its Firestore channels on the emulator.
 *
 * The browser SDK talks to Firestore over WebChannel sessions (`Listen` and
 * `Write`). It closes a session — WebChannel's `TYPE=terminate` — only when the
 * Firestore instance is terminated; a page that is navigated away from or closed
 * simply stops talking. The production backend expires such a session. The
 * emulator does not: it keeps it, with the listeners it held, and keeps queueing
 * into it every later change to what they watched (1.5 MB in the six sessions
 * one run of documentation-on-open.spec.ts left behind, 04.10.2026). Every
 * `page.goto` in the suite used to leave one behind for the rest of the run; a
 * local emulator that had served a few suite runs held 705 sessions, 37 of them
 * still polled by a browser. Suspected, not proven, as the load behind the
 * `4 DEADLINE_EXCEEDED` of CI run 37152757092 (03.10.2026).
 *
 * `lib/firebase.ts` therefore terminates the instance on `pagehide` in emulator
 * builds. This spec asks the emulator itself: the session a page held before it
 * navigated on must be gone afterwards. A session the emulator still knows
 * answers a backchannel read with 200; one it has closed answers 400.
 */

const EMULATOR = 'http://127.0.0.1:8080/google.firestore.v1.Firestore';
const DATABASE = encodeURIComponent(`projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}`);

type Channel = { kind: 'Listen' | 'Write'; sid: string };

function recordChannels(page: Page): Channel[] {
  const seen: Channel[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.port !== '8080') return;
    const sid = url.searchParams.get('SID');
    const kind = url.pathname.includes('/Listen/') ? 'Listen' : url.pathname.includes('/Write/') ? 'Write' : null;
    if (!sid || !kind || url.searchParams.get('TYPE') === 'terminate') return;
    if (!seen.some((c) => c.sid === sid)) seen.push({ kind, sid });
  });
  return seen;
}

/** 200 while the emulator still holds the session, 400 once it is closed. Headers only; the body is a long poll. */
async function sessionStatus({ kind, sid }: Channel): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `${EMULATOR}/${kind}/channel?database=${DATABASE}&VER=8&RID=rpc&SID=${encodeURIComponent(sid)}&AID=0&CI=0&TYPE=xmlhttp&t=1`,
      { signal: controller.signal },
    );
    controller.abort();
    return res.status;
  } catch {
    return -1;
  } finally {
    clearTimeout(timer);
  }
}

/** Polls until every session answers 400 or the time is up — stops as soon as they are all closed. */
async function openSessions(channels: Channel[], withinMs: number): Promise<Channel[]> {
  const deadline = Date.now() + withinMs;
  let open = channels;
  while (open.length > 0 && Date.now() < deadline) {
    const statuses = await Promise.all(open.map(sessionStatus));
    open = open.filter((_, i) => statuses[i] !== 400);
    if (open.length > 0) await new Promise((r) => setTimeout(r, 250));
  }
  return open;
}

test.describe('Firestore channels on the emulator', () => {
  let seeded: SeededProject;

  test.beforeAll(async () => {
    seeded = await seedStageProject({ prefix: 'channel-close', acceptTerms: true });
  });

  test('the sessions a page held are closed when it navigates away', async ({ page }) => {
    const channels = recordChannels(page);
    await signInThroughForm(page, seeded);
    // The dashboard listens to the account's projects and profile: a live Listen session.
    await expect.poll(() => channels.filter((c) => c.kind === 'Listen').length, { timeout: 30000 }).toBeGreaterThan(0);
    const before = [...channels];
    for (const channel of before) expect(await sessionStatus(channel), `${channel.kind} ${channel.sid} is live before`).toBe(200);

    await page.goto(`/project/${seeded.projectId}?view=business`, { waitUntil: 'domcontentloaded' });

    const left = await openSessions(before, 15000);
    expect(left, 'sessions the emulator still holds after the page went away').toEqual([]);
  });
});
