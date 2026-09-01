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
  test('every option in the mail is styled identically', () => {
    const html = renderSurveyInviteEmail({
      name: 'Test',
      recipient: 't@example.com',
      token: createSurveyToken(SURVEY_CAMPAIGN, 'uid-1', Date.now() + HOUR),
      closesOn: '9 September 2026',
    });

    // Strip the label out of each answer row and compare what is left. One option
    // rendered as the product's dark primary button would be a way of asking the
    // question while suggesting the answer.
    const rows = [...html.matchAll(/<td align="center" style="([^"]*border-radius: 10px[^"]*)">/g)].map(
      (m) => m[1],
    );
    expect(rows.length, 'answer rows not found').toBe(MAIL_QUESTION.options.length);
    expect(new Set(rows).size, `answer rows differ in style:\n${rows.join('\n')}`).toBe(1);
  });

  test('every option is reachable and carries its own answer id', () => {
    const token = createSurveyToken(SURVEY_CAMPAIGN, 'uid-1', Date.now() + HOUR);
    const html = renderSurveyInviteEmail({
      name: '',
      recipient: 't@example.com',
      token,
      closesOn: '9 September 2026',
    });
    for (const o of MAIL_QUESTION.options) {
      expect(html, `no link for option ${o.id}`).toContain(`a=${o.id}`);
    }
    // The plain-text part has to work on its own — a client that shows only text
    // must still be able to answer.
    const text = renderSurveyInviteText({
      name: '',
      recipient: 't@example.com',
      token,
      closesOn: '9 September 2026',
    });
    for (const o of MAIL_QUESTION.options) {
      expect(text, `text part has no link for ${o.id}`).toContain(`a=${o.id}`);
    }
  });

  test('the mail asks one question and the page asks the rest', () => {
    expect(SURVEY_QUESTIONS.filter((q) => q.where === 'mail')).toHaveLength(1);
    expect(PAGE_QUESTIONS.length).toBeGreaterThan(0);
  });
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

  test('the send workflow passes a real base URL', () => {
    const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/survey-send.yml'), 'utf8');
    expect(
      wf,
      'survey-send.yml runs the send script without NEXT_PUBLIC_APP_URL — every link ' +
        'in the mail would be built against localhost:3000',
    ).toMatch(/NEXT_PUBLIC_APP_URL:\s*https:\/\//);
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
    const corpus = ['docs/BACKLOG.md', 'docs/ROADMAP-2.0.md', 'docs/CONCEPT-DE-LOCALIZATION.md', 'docs/CLEAN_CORE_ENRICHMENT_CONCEPT.md']
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
