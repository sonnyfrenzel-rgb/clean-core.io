import { test, expect } from '@playwright/test';
import { buildKnowledgeBase } from '../lib/chatbot-knowledge';
import { GET as llmsTxt } from '../app/llms.txt/route';

/**
 * Roadmap 0.3 / UX-088: the Clean Core Score says whose it is and which way it points.
 *
 * The name stays (Sonny, 16.09.2026) and gets made known. That only works if the
 * product also draws the line to SAP, because the names in this field are close
 * enough to be mistaken for one another and one of them runs backwards:
 *
 *   Clean Core Score      — ours, 0–100, higher is better
 *   Technical Debt Score  — SAP's, in SAP Cloud ALM, higher is WORSE
 *   Clean Core Share      — SAP's
 *   Clean Core Level A–D  — SAP's, per object; the one figure we do reproduce
 *
 * A reader who meets two of those in one week and is told neither of them apart
 * will read one of the two the wrong way round. So three surfaces have to carry
 * the distinction — the surfaces a person, a crawler and a chatbot each land on:
 *
 *   1. the assistant's knowledge base (lib/chatbot-knowledge.ts)
 *   2. /llms.txt
 *   3. /clean-core-score itself, in the copy AND in the JSON-LD an answer engine
 *      lifts its answer from
 *
 * The checks are executed, not grepped: the knowledge base is built, the route
 * handler is called, and the page is loaded in a browser. A section that exists
 * in the file but never reaches the model, the crawler or the reader is exactly
 * the failure this is for.
 */

/** What every one of the three surfaces has to establish, and why. */
const REQUIREMENTS: { what: string; test: (text: string) => boolean }[] = [
  {
    what: 'names SAP\'s Technical Debt Score',
    test: (t) => /Technical Debt Score/i.test(t),
  },
  {
    what: 'names SAP\'s Clean Core Share',
    test: (t) => /Clean Core Share/i.test(t),
  },
  {
    what: 'names SAP\'s Clean Core Level A–D',
    test: (t) => /Clean Core Level/i.test(t),
  },
  {
    what: 'says our score runs higher-is-better',
    test: (t) => /higher is better/i.test(t),
  },
  {
    what: 'says SAP\'s technical debt score runs the other way',
    test: (t) =>
      /higher (is )?(a )?(score )?(indicating )?(greater|more|worse)|higher is WORSE|more technical debt|greater technical debt|runs the other way|opposite directions/i.test(
        t,
      ),
  },
  {
    what: 'says SAP publishes no Clean Core Score',
    test: (t) =>
      /SAP (does not|publishes no|has no)|no (SAP )?metric (called|of that name|of this name)/i.test(t),
  },
  {
    what: 'does not let SAP appear to stand behind our score',
    test: (t) => /not (affiliated|endorsed)|has not endorsed|does not claim SAP certification/i.test(t),
  },
];

/** The claim nobody may make, however it is spelled. */
const ENDORSEMENT = /\bSAP[- ](approved|certified|endorsed|official)\b/i;

function assertDistinction(surface: string, text: string) {
  expect(text.length, `${surface} came back empty`).toBeGreaterThan(200);
  for (const req of REQUIREMENTS) {
    expect(req.test(text), `${surface} no longer ${req.what}`).toBe(true);
  }
  // An endorsement claim is allowed only where the sentence denies it.
  const claims = text
    .split(/(?<=[.!?])\s+|\n/)
    .filter((s) => ENDORSEMENT.test(s) && !/\b(not|never|no)\b/i.test(s));
  expect(claims, `${surface} implies SAP stands behind the score`).toEqual([]);
}

test.describe('the Clean Core Score is told apart from SAP’s own figures', () => {
  test('the Ask AI knowledge base carries it', () => {
    // Built, not read: a section that is exported and never joined into the
    // prompt teaches the model nothing.
    assertDistinction('the chatbot knowledge base', buildKnowledgeBase());
  });

  test('/llms.txt carries it', async () => {
    const body = await llmsTxt().text();
    assertDistinction('/llms.txt', body);
  });

  test('the running app serves that /llms.txt', async ({ request }) => {
    const res = await request.get('/llms.txt');
    expect(res.status()).toBe(200);
    assertDistinction('/llms.txt as served', await res.text());
  });

  test('/clean-core-score carries it, in the copy and in the JSON-LD', async ({ page }) => {
    await page.goto('/clean-core-score');

    assertDistinction('/clean-core-score', await page.locator('body').innerText());

    // The structured data is the half a generative engine quotes, and it is a
    // separate copy of the claim — so it is checked separately.
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    assertDistinction('the JSON-LD on /clean-core-score', jsonLd ?? '');
  });
});
