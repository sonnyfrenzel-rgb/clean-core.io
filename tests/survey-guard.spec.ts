import { test, expect } from '@playwright/test';
import { createSurveyToken, verifySurveyToken } from '../lib/survey/token';
import { summarise, headline, type SurveyResponse } from '../lib/survey/store';
import {
  SURVEY_CAMPAIGN,
  MAIL_QUESTION,
  PAGE_QUESTIONS,
  SURVEY_QUESTIONS,
  SURVEY_FREETEXT_LEAD,
} from '../lib/survey/definition';
import { renderSurveyInviteEmail, renderSurveyInviteText } from '../lib/survey/invite-email';
import { renderSurveyDigestEmail, renderSurveyDigestText } from '../lib/survey/digest-email';
import { wrapEmailDocument } from '../lib/email-layout';
import { APP_BASE_URL } from '../lib/constants';

/**
 * The survey, and the four ways it could quietly produce a wrong answer.
 *
 *   1. A link anyone can forge, so the results are whatever the internet decides.
 *   2. A question asked in a way that suggests its own answer.
 *   3. Percentages computed over a denominator that shrank until they looked good.
 *   4. A mail that arrives unreadable on the device most of it is read on.
 *
 * Each is cheap to prevent and expensive to discover afterwards, because a survey
 * is read once and acted on, and nobody re-derives it.
 */

const HOUR = 60 * 60 * 1000;

function response(uid: string, answers: Record<string, string | string[]>, extra: Partial<SurveyResponse> = {}): SurveyResponse {
  return {
    campaign: SURVEY_CAMPAIGN,
    uid,
    email: `${uid}@example.com`,
    name: uid,
    answers,
    ...extra,
  };
}

test.describe('a survey link cannot be forged', () => {
  test('a token round-trips to the identity it was made for', () => {
    const exp = Date.now() + HOUR;
    const id = verifySurveyToken(createSurveyToken(SURVEY_CAMPAIGN, 'uid-123', exp));
    expect(id).not.toBeNull();
    expect(id!.campaign).toBe(SURVEY_CAMPAIGN);
    expect(id!.uid).toBe('uid-123');
  });

  test('a tampered payload is rejected', () => {
    const token = createSurveyToken(SURVEY_CAMPAIGN, 'uid-123', Date.now() + HOUR);
    const [b64, sig] = token.split('.');
    // Re-encode the payload with a different uid, keeping the original signature.
    const forgedPayload = Buffer.from(b64, 'base64url')
      .toString('utf8')
      .replace('uid-123', 'uid-999');
    const forged = `${Buffer.from(forgedPayload).toString('base64url')}.${sig}`;
    expect(verifySurveyToken(forged)).toBeNull();
  });

  test('an expired token is rejected', () => {
    const token = createSurveyToken(SURVEY_CAMPAIGN, 'uid-123', Date.now() - 1);
    expect(verifySurveyToken(token)).toBeNull();
  });

  test('garbage is rejected without throwing', () => {
    for (const bad of ['', 'x', 'a.b.c', 'not-base64.deadbeef', '.']) {
      expect(verifySurveyToken(bad)).toBeNull();
    }
  });
});

test.describe('the questions do not answer themselves', () => {
  test('the mail suggests no answer: one link, nothing preselected', () => {
    // It used to carry the first question as three answer buttons. Since 3.0.9
    // the mail is plain (`lib/user-mail.ts`) and carries one link, to the page,
    // which asks every question — so no option can be styled, or linked, as the
    // expected one.
    const token = createSurveyToken(SURVEY_CAMPAIGN, 'uid-1', Date.now() + HOUR);
    const html = renderSurveyInviteEmail({
      name: 'Test',
      recipient: 't@example.com',
      token,
      closesOn: '9 September 2026',
    });
    const hrefs = [...html.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([`${APP_BASE_URL}/survey/${encodeURIComponent(token)}`]);
    expect(html).not.toMatch(/[?&](?:q|a)=/);
    expect(html).toContain(MAIL_QUESTION.prompt);
  });

  test('the text part works on its own', () => {
    // A client that shows only text must still reach the survey.
    const token = createSurveyToken(SURVEY_CAMPAIGN, 'uid-1', Date.now() + HOUR);
    const text = renderSurveyInviteText({
      name: '',
      recipient: 't@example.com',
      token,
      closesOn: '9 September 2026',
    });
    expect(text).toContain(`${APP_BASE_URL}/survey/${encodeURIComponent(token)}`);
    expect(text).toContain('9 September 2026');
  });

  test('the mail asks one question and the page asks the rest', () => {
    expect(SURVEY_QUESTIONS.filter((q) => q.where === 'mail')).toHaveLength(1);
    expect(PAGE_QUESTIONS.length).toBeGreaterThan(0);
  });
});

test.describe('the page does not answer for the reader', () => {
  /**
   * The first real send produced twelve answers inside the eighty-three seconds
   * the job took to send thirty-seven invitations — four to twelve seconds
   * between the link being fetched and the answer being written, every one of
   * them on the question that was a link in the mail, none on the questions that
   * live on the page.
   *
   * They were mail gateways. The page submitted the emailed answer from an effect
   * on mount, and the defence written into the vote route — "a gateway does not
   * run scripts, so it never gets past the page" — is not true of Defender Safe
   * Links, Proofpoint or Mimecast, which open every link in a headless browser.
   *
   * The fix is that no answer is written without a real press. These two checks
   * are what stops it being undone by someone restoring a convenience nobody
   * remembers was the bug.
   */
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const client = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/survey/[token]/SurveyClient.tsx'),
    'utf8',
  );

  test('no effect can write an answer', () => {
    expect(
      client,
      'SurveyClient has a useEffect again. An effect on this component is how the ' +
        'survey became a census of mail gateways on 2 September — an answer must ' +
        'come from a press, never from mounting.',
    ).not.toContain('useEffect');
  });

  test('every press is checked for being a real one', () => {
    expect(
      client,
      'the isTrusted gate is gone. A script-dispatched event reports isTrusted ' +
        'false, and it is the only thing separating a reader from the headless ' +
        'browser a mail gateway opens the link with.',
    ).toContain('isTrusted');
  });

  test('the emailed answer is offered, not counted', () => {
    // The count and the read-back come from the server's copy, so a preselection
    // can never present itself as something already recorded.
    expect(client).toContain('const [saved, setSaved]');
    expect(client).toMatch(/doneCount\s*=\s*SURVEY_QUESTIONS\.filter\(\(q\) => chosen\(saved\[q\.id\]\)/);
  });
});

test.describe('a second tap wins, however the requests come back', () => {
  /**
   * Every press used to start its own request and then write `saved` and the
   * status from the value it had captured. Tap A, tap B before A has come back,
   * and if A finishes last it writes A into the read-back and reports it saved —
   * while B is what is highlighted and what the server holds. The "Your answers"
   * panel then contradicted the selection, and the two writes could reach the
   * server in the wrong order too (QA review of 33471220d6e9, finding
   * f7110f3d6619).
   *
   * Requests for one question are serialised and only the newest press settles
   * anything, so this is behaviour rather than shape: the slow first answer is
   * held open while the second is tapped, and the panel has to end on the second.
   */
  const QUESTION = SURVEY_QUESTIONS.find((q) => q.where === 'page' && !q.multi)!;
  const FIRST = QUESTION.options[0];
  const SECOND = QUESTION.options[1];

  test('the read-back ends on the option the reader tapped last', async ({ page }) => {
    test.setTimeout(120 * 1000);
    const token = createSurveyToken(SURVEY_CAMPAIGN, `race-${Date.now()}`, Date.now() + HOUR);

    // The delay has to happen inside the page, not in a Playwright route handler:
    // route handlers are dispatched one at a time, so delaying one there would
    // serialise the very concurrency this test is about and pass either way.
    await page.addInitScript(
      (cfg: { slowId: string; delayMs: number }) => {
        const w = window as unknown as { __voteDone: string[] };
        w.__voteDone = [];
        const real = window.fetch.bind(window);
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
          const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          if (href.includes('/api/survey/vote') && init && init.method === 'POST') {
            const body = JSON.parse(String(init.body)) as { optionId?: string };
            // The first answer is the slow one — the case the defect needed.
            const wait = body.optionId === cfg.slowId ? cfg.delayMs : 0;
            return new Promise<Response>((resolve) => {
              setTimeout(() => {
                if (body.optionId) w.__voteDone.push(body.optionId);
                resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
              }, wait);
            });
          }
          return real(input, init);
        };
      },
      { slowId: FIRST.id, delayMs: 4000 },
    );

    await page.goto(`/survey/${encodeURIComponent(token)}`);
    await expect(page.getByRole('heading', { name: QUESTION.prompt })).toBeVisible();

    await page.getByRole('button', { name: FIRST.label, exact: false }).click();
    await page.getByRole('button', { name: SECOND.label, exact: false }).click();

    // Both requests have to have come back before anything is judged: the whole
    // defect is what the *slow first* one does when it lands last.
    await page.waitForFunction(() => (window as unknown as { __voteDone: string[] }).__voteDone.length >= 2, null, {
      timeout: 30000,
    });

    const row = page.locator('dl > div').filter({ hasText: QUESTION.prompt });
    await expect(row.locator('dd')).toHaveText(SECOND.label, { timeout: 15000 });

    // Not merely where the screen ended up: the older answer never reached the
    // server after the newer one either.
    const done = await page.evaluate(() => (window as unknown as { __voteDone: string[] }).__voteDone);
    expect(done, 'both answers were sent').toContain(SECOND.id);
    expect(done[done.length - 1], `the older answer settled last: ${done.join(' → ')}`).toBe(SECOND.id);
  });
});

test('the first fetch of a link is claimed by the shared helper, not by a read and a write', () => {
  /**
   * A mail-security scanner and the recipient open the link at the same moment.
   * Both reads saw no `linkFetchedAt`, both merge-writes went through, and the
   * stored value was the later arrival — while the comment above it says it is
   * the first (QA review of 33471220d6e9, finding 8ccb1b1b765b).
   *
   * This is the wiring half. That exactly one of two simultaneous claims wins
   * is run against the emulator in `tests/survey-link-fetch.spec.ts`
   * (QA review of 90be9aba984e, cca300dfb572).
   */
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/survey/[token]/page.tsx'), 'utf8');
  const claim = src.slice(src.indexOf('linkFetchedAt` answers'), src.indexOf('existingAnswers = (data?.answers'));
  expect(claim.length, 'the stamping block was not found').toBeGreaterThan(200);
  expect(claim).toContain('claimLinkFetch(db, docRef');
  expect(src).toContain("from '@/lib/survey/link-fetch'");
  // The read-then-write pair that could interleave is gone.
  expect(claim).not.toMatch(/await ref\.get\(\)/);
  expect(claim).not.toMatch(/await ref\.set\(/);
  // And the helper is the transaction.
  const helper = fs.readFileSync(path.resolve(__dirname, '..', 'lib/survey/link-fetch.ts'), 'utf8');
  expect(helper).toContain('db.runTransaction');
  expect(helper).toMatch(/tx\.get\(ref\)/);
  expect(helper).toMatch(/previous\?\.linkFetchedAt/);
});

test.describe('the arithmetic reports silence as silence', () => {
  test('no answers means zeroes, not percentages over nothing', () => {
    const s = summarise(SURVEY_CAMPAIGN, 30, []);
    expect(s.participants).toBe(0);
    expect(headline(s)).toContain('30');
    for (const q of s.questions) {
      expect(q.answered).toBe(0);
      for (const o of q.options) {
        expect(o.count).toBe(0);
        expect(o.share, `${q.id}/${o.id} invented a share out of nothing`).toBe(0);
      }
    }
    // And the rendered digest must not print a percent sign for them.
    const text = renderSurveyDigestText(s, 7);
    expect(text).toContain('no answers yet');
    expect(text).not.toMatch(/\d+%/);
  });

  test('the denominator is the people invited, never the people who replied', () => {
    const s = summarise(SURVEY_CAMPAIGN, 30, [
      response('a', { ran: 'yes' }),
      response('b', { ran: 'no' }),
      response('c', { ran: 'no' }),
    ]);
    expect(s.invited).toBe(30);
    expect(s.participants).toBe(3);
    expect(headline(s)).toBe('3 of 30 have answered.');

    const ran = s.questions.find((q) => q.id === 'ran')!;
    expect(ran.answered).toBe(3);
    expect(ran.options.find((o) => o.id === 'no')!.count).toBe(2);
    expect(ran.options.find((o) => o.id === 'no')!.share).toBeCloseTo(66.7, 1);
  });

  test('a fetched link is not a vote', () => {
    const s = summarise(SURVEY_CAMPAIGN, 30, [
      response('a', { ran: 'yes' }),
      response('gateway', {}, { linkFetchedAt: new Date() }),
    ]);
    expect(s.participants, 'a gateway fetch was counted as an answer').toBe(1);
    expect(s.fetchedOnly).toBe(1);
  });

  test('an unanswered question does not borrow the other questions’ replies', () => {
    const s = summarise(SURVEY_CAMPAIGN, 30, [response('a', { ran: 'yes' })]);
    const help = s.questions.find((q) => q.id === 'help')!;
    expect(help.answered).toBe(0);
    expect(help.options.every((o) => o.share === 0)).toBe(true);
  });

  test('a multi-select question counts people, not ticks', () => {
    // Two people. One picks three things, the other picks one. Dividing by votes
    // would report the second person's single pick as 25% when it is 50% of the
    // people who answered — and every share would shrink as people ticked more.
    const s = summarise(SURVEY_CAMPAIGN, 30, [
      response('a', { build_next: ['german', 'atc_import', 'model_choice'] }),
      response('b', { build_next: ['german'] }),
    ]);
    const vote = s.questions.find((q) => q.id === 'build_next')!;

    expect(vote.multi).toBe(true);
    expect(vote.answered, 'counted ticks instead of people').toBe(2);
    expect(vote.options.find((o) => o.id === 'german')!.count).toBe(2);
    expect(vote.options.find((o) => o.id === 'german')!.share).toBe(100);
    expect(vote.options.find((o) => o.id === 'atc_import')!.share).toBe(50);
    expect(vote.options.find((o) => o.id === 'mobile_diff')!.count).toBe(0);

    // Shares above 100 in total are correct here, and the digest has to say so
    // rather than let the reader read them as a split of one whole.
    const total = vote.options.reduce((a, o) => a + o.share, 0);
    expect(total).toBeGreaterThan(100);
    expect(renderSurveyDigestText(s, 3)).toContain('shares are of people');
  });

  test('an empty selection is not an answer', () => {
    const s = summarise(SURVEY_CAMPAIGN, 30, [response('a', { build_next: [] })]);
    expect(s.questions.find((q) => q.id === 'build_next')!.answered).toBe(0);
  });
});

test.describe('the links in the mail go somewhere', () => {
  /**
   * Three test sends went out with every option pointing at
   * http://localhost:3000. The message rendered correctly, Resend accepted it,
   * the workflow reported success, and it was unusable — `APP_BASE_URL` falls
   * back to localhost when `NEXT_PUBLIC_APP_URL` is unset, the deploy sets that
   * variable for the running app, and a workflow step does not inherit it.
   *
   * Nothing in the code was wrong. That is the point: the failure lived in the
   * gap between a module's default and a workflow's environment, which is a gap
   * no unit test looks into. So these two checks look into it.
   */
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const ROOT = path.resolve(__dirname, '..');

  test('there is no survey workflow left to run', () => {
    // The survey is discontinued (Sonny, 16.09.2026: "kann generell ausbleiben,
    // ist eh vorbei ohne Erfolg"), and the two workflows are deleted rather
    // than left switched off. The full review of 52f171091948 had just found
    // that a manual dry run of the send workflow printed the production
    // recipient list into public Actions logs (90d94fa15308), and that the
    // digest could be mailed to any address a dispatcher typed in — neither is
    // reachable from a file that does not exist.
    //
    // The script keeps its own refusal below, because a script can still be run
    // by hand.
    for (const wf of ['.github/workflows/survey-send.yml', '.github/workflows/survey-digest.yml']) {
      expect(fs.existsSync(path.join(ROOT, wf)), `${wf} is gone`).toBe(false);
    }
  });

  test('the script refuses to send rather than mail dead links', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/send-survey.ts'), 'utf8');
    // The workflow can be edited; the refusal is what makes the mistake loud
    // wherever the script is run from.
    expect(src).toContain('APP_BASE_URL.startsWith');
    expect(src).toMatch(/throw new Error\(/);
  });
});

test.describe('the vote offers real, unbuilt work', () => {
  test('every idea on the ballot is documented somewhere in the repo', () => {
    // A survey that offers features nobody has thought about is a survey whose
    // winner cannot be built, and a promise made to thirty-six people that will
    // quietly not be kept. Each option has to be traceable to a written item.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const ROOT = path.resolve(__dirname, '..');
    const corpus = ['docs/BACKLOG.md', 'docs/archiv/ROADMAP-2.0.md', 'docs/CONCEPT-DE-LOCALIZATION.md', 'docs/CLEAN_CORE_ENRICHMENT_CONCEPT.md']
      .filter((f) => fs.existsSync(path.join(ROOT, f)))
      .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
      .join('\n')
      .toLowerCase();

    // One phrase per option that must appear in the written record.
    const evidence: Record<string, string> = {
      german: 'deutsche',
      atc_import: 'atc',
      model_choice: 'claude',
      mobile_diff: 'segmented control',
    };

    const vote = SURVEY_QUESTIONS.find((q) => q.id === 'build_next')!;
    for (const o of vote.options) {
      const phrase = evidence[o.id];
      expect(phrase, `option ${o.id} has no evidence phrase — add one`).toBeTruthy();
      expect(
        corpus.includes(phrase),
        `the ballot offers "${o.label}" but "${phrase}" appears in none of the backlog or concept documents`,
      ).toBe(true);
    }
  });
});

test.describe('the invitation identifies its sender', () => {
  /**
   * The welcome mail has carried a postal address since its first send and this
   * one did not, which is the wrong way round: the welcome mail is transactional
   * and the survey is bulk, and bulk is the category the rule is written for.
   *
   * It is also one of the few things a filter can weigh in favour of a domain
   * this young. A named person at a real address, an unsubscribe link that a
   * provider can POST to, and a text part that says the same as the HTML part
   * are cheap; a mail from a young domain that omits them is asking to be judged
   * on nothing else.
   */
  const token = createSurveyToken(SURVEY_CAMPAIGN, 'uid-1', Date.now() + HOUR);
  const input = {
    name: 'Test',
    recipient: 't@example.com',
    token,
    closesOn: '9 September 2026',
    unsubscribeUrl: 'https://clean-core.io/api/unsubscribe?t=abc',
  };

  test('both parts carry the postal address', () => {
    const html = renderSurveyInviteEmail(input);
    const text = renderSurveyInviteText(input);
    // The HTML escapes the sharp s; the text part does not.
    expect(html, 'the HTML part has no imprint').toContain('96047 Bamberg');
    expect(html).toContain('Hellerstra&szlig;e 9');
    expect(text, 'the text part has no imprint').toContain('96047 Bamberg');
  });

  test('both parts carry the unsubscribe link', () => {
    expect(renderSurveyInviteEmail(input)).toContain(input.unsubscribeUrl);
    expect(
      renderSurveyInviteText(input),
      'the text part drops the unsubscribe link, which is worse for exactly the ' +
        'reader most likely to be reading it',
    ).toContain(input.unsubscribeUrl);
  });

  test('the send sets the headers Gmail and Yahoo require of a bulk sender', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'scripts/send-survey.ts'),
      'utf8',
    );
    expect(src).toContain("'List-Unsubscribe'");
    expect(src).toContain("'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'");
  });
});

test.describe('the send does not outrun the provider', () => {
  /**
   * Resend allows two requests a second. The loop awaited one fetch and started
   * the next, which from a CI runner is four to eight a second, and a 429 was
   * logged and skipped: that person is never asked, the workflow still reports
   * success, and the survey closes before the next scheduled run could catch it.
   */
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'scripts/send-survey.ts'), 'utf8');

  test('there is a pause between messages', () => {
    expect(src, 'no pacing between sends').toMatch(/await sleep\(PAUSE_MS\)/);
  });

  test('a rate-limited message is retried, not dropped', () => {
    expect(src).toContain('429');
    expect(src, 'no retry loop around the send').toMatch(/attempt <= ATTEMPTS/);
  });

  test('a failed recipient turns the run red', () => {
    expect(
      src,
      'the script exits 0 with people unsent, so nobody finds out',
    ).toMatch(/if \(failed\) process\.exitCode = 1/);
  });
});

test.describe('the only button on the page is not mistaken for a submit', () => {
  /**
   * Every question on the landing page records on the tap. The free-text box
   * cannot, so it has a button — and the first reader took that button for the
   * thing that submits the survey, saw it greyed out because they had typed
   * nothing, and concluded their answers had gone nowhere.
   *
   * Two properties keep that from coming back: the button must not wear the
   * product's dark primary style, which is the shape of a form submit, and its
   * disabled state must never be silent.
   */
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/survey/[token]/SurveyClient.tsx'),
    'utf8',
  );

  test('the note button is a secondary style', () => {
    const button = src.slice(src.indexOf('onClick={saveComment}'));
    const className = button.slice(button.indexOf('className='), button.indexOf('>'));
    expect(
      className,
      'the note button wears the dark primary style, which reads as "submit the form"',
    ).not.toContain('bg-gray-950');
  });

  test('every state of the button says what it is doing', () => {
    for (const phrase of ['Not sent yet', 'nothing to send', 'Sent ', 'did not send']) {
      expect(src, `no copy for the "${phrase}" state`).toContain(phrase);
    }
  });

  test('the lead says the answers above are already saved', () => {
    expect(SURVEY_FREETEXT_LEAD).toContain('already saved');
  });
});

test.describe('the mails survive a phone', () => {
  const token = createSurveyToken(SURVEY_CAMPAIGN, 'uid-1', Date.now() + HOUR);

  const cases: { name: string; html: string }[] = [
    {
      name: 'invitation',
      html: wrapEmailDocument(
        renderSurveyInviteEmail({
          name: 'Test',
          recipient: 'someone.with.a.long.address@a-very-long-corporate-domain.example.com',
          token,
          closesOn: '9 September 2026',
        }),
        'invite',
      ),
    },
    {
      name: 'daily digest',
      html: wrapEmailDocument(
        renderSurveyDigestEmail(
          summarise(SURVEY_CAMPAIGN, 30, [
            response('a', { ran: 'yes', help: 'walkthrough', welcome_mail: 'spam' }),
            response('b', { ran: 'no', help: 'german' }, { comment: 'Kein passender Code zur Hand.' }),
          ]),
          4,
        ),
        'digest',
      ),
    },
  ];

  for (const c of cases) {
    test(`${c.name} does not scroll sideways at 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.setContent(c.html, { waitUntil: 'domcontentloaded' });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(
        overflow,
        `${c.name} is ${overflow}px wider than a 320px screen — the width most of it is read on`,
      ).toBeLessThanOrEqual(1);
    });
  }

  test('the digest bars add up to the width of the chart', async ({ page }) => {
    const summary = summarise(SURVEY_CAMPAIGN, 30, [
      response('a', { ran: 'yes' }),
      response('b', { ran: 'no' }),
      response('c', { ran: 'no' }),
    ]);
    await page.setViewportSize({ width: 600, height: 900 });
    await page.setContent(wrapEmailDocument(renderSurveyDigestEmail(summary, 3), 'digest'));

    // Every bar is a two-cell table whose widths are percentages of the same row.
    // If one of them ever renders wider than its container the chart is lying.
    const widths = await page.evaluate(() =>
      Array.from(document.querySelectorAll('table[style*="table-layout: fixed"]')).map((t) => {
        const row = t.querySelector('tr');
        const cells = Array.from(row?.children ?? []);
        const total = (t as HTMLElement).getBoundingClientRect().width;
        const sum = cells.reduce((a, c) => a + (c as HTMLElement).getBoundingClientRect().width, 0);
        return { total: Math.round(total), sum: Math.round(sum) };
      }),
    );

    expect(widths.length, 'no bars rendered').toBeGreaterThan(0);
    for (const w of widths) {
      expect(Math.abs(w.sum - w.total), `a bar is ${w.sum}px inside a ${w.total}px chart`).toBeLessThanOrEqual(2);
    }
  });
});
