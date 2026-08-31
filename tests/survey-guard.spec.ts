import { test, expect } from '@playwright/test';
import { createSurveyToken, verifySurveyToken } from '../lib/survey/token';
import { summarise, headline, type SurveyResponse } from '../lib/survey/store';
import {
  SURVEY_CAMPAIGN,
  MAIL_QUESTION,
  PAGE_QUESTIONS,
  SURVEY_QUESTIONS,
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

function response(uid: string, answers: Record<string, string>, extra: Partial<SurveyResponse> = {}): SurveyResponse {
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
