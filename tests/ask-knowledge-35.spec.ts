/**
 * The assistant's knowledge base describes the product as it is in 3.5
 * (roadmap 3.5.4, item 4).
 *
 * Every project opens in Analyze with three views; the seven tools stand in the
 * tool bar's order; Re-design takes the program decision once Economics has
 * priced the options; the own model key, the "All automatic AI steps" switch
 * and the tenant connection live in Settings; sharing is read access by
 * invitation. What the product no longer has — a "Live Tenant" tab, a sidebar —
 * is never presented as there. Every in-app path the knowledge base names is a
 * route that exists.
 *
 * Server-free: the knowledge base is built and read; routes are checked on disk.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildKnowledgeBase, PRODUCT_LAYOUT } from '../lib/chatbot-knowledge';
import { PHASES } from '../lib/workflow-steps';
import { VIEW_LABELS, WORKSPACE_VIEWS } from '../lib/workspace-model';
import { DECISION_OPTION_LABELS } from '../lib/decision-options';
import { ANTHROPIC_OWN_KEY_OFFERED, ANTHROPIC_OWN_KEY_STATUS } from '../lib/model-providers';
import { ASSISTANT_CHIPS, guardProductAnswer } from '../lib/assistant-answer';
import { glossaryAnswerFor } from '../lib/glossary-lookup';

const ROOT = path.resolve(__dirname, '..');
const KB = buildKnowledgeBase();

test('the seven tools stand in the tool bar\'s order', () => {
  const at = PHASES.map((p) => PRODUCT_LAYOUT.indexOf(`${p.n}. **${p.label}** (/project/{id}/${p.key})`));
  for (const [i, index] of at.entries()) expect(index, PHASES[i].label).toBeGreaterThan(-1);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  expect(PHASES.map((p) => p.label)).toEqual(['Analyze', 'Economics', 'Design', 'Transformation', 'Documentation', 'Testing', 'Delivery']);
});

test('every project opens in Analyze, with the three views in their order', () => {
  expect(KB).toContain('Every project opens in Analyze');
  const at = WORKSPACE_VIEWS.map((v) => PRODUCT_LAYOUT.indexOf(`**${VIEW_LABELS[v]}**`));
  expect(at.every((i) => i > -1)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
});

test('Re-design takes the program decision after Economics, with the four options', () => {
  expect(KB).toContain('/project/{id}/redesign');
  expect(KB).toContain('after Economics has priced the options and before Design');
  for (const label of Object.values(DECISION_OPTION_LABELS)) expect(KB).toContain(label);
});

test('sharing is read access by invitation: one confirmed address, source included, expiry and revocation', () => {
  expect(KB).toContain('bound to one confirmed e-mail address');
  expect(KB).toMatch(/read access only — source code included/);
  expect(KB).toMatch(/expires/);
  expect(KB).toMatch(/revoke/);
});

test('the own model key and the tenant connection are in Settings; the Claude key says what is true today', () => {
  expect(KB).toContain('Your own model key (BYOK)');
  expect(KB).toContain('Your SAP test system');
  expect(KB).toContain('All automatic AI steps');
  if (ANTHROPIC_OWN_KEY_OFFERED) {
    expect(KB).toContain('An own Anthropic Claude key can be stored');
  } else {
    expect(KB).toContain(ANTHROPIC_OWN_KEY_STATUS);
    expect(KB).not.toContain('An own Anthropic Claude key can be stored');
  }
});

test('what the product does not have is never presented as there', () => {
  for (const line of KB.split('\n')) {
    if (/live[- ]tenant|sidebar|knowledge hub/i.test(line)) {
      expect(line, `presented as existing: ${line}`).toMatch(/\b(?:no|not|never)\b/i);
    }
  }
  // The seven are tools of one workspace since 3.5, not stages.
  expect(KB).not.toMatch(/\b(?:seven|7)[- ]stages?\b|\bstage tab\b/i);
  // The knowledge base passes its own check: nothing of it would be removed from an answer.
  expect(guardProductAnswer(PRODUCT_LAYOUT, KB).dropped).toBe(0);
});

test('every in-app path the knowledge base names is a route that exists', () => {
  const routeExists = (segments: string[]): boolean => {
    for (const base of ['app', 'app/(app)']) {
      let dir = path.join(ROOT, base);
      let ok = true;
      for (const seg of segments) {
        const next = seg === '{id}' ? '[projectId]' : seg;
        const candidate = path.join(dir, next);
        if (fs.existsSync(candidate)) {
          dir = candidate;
        } else {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    return false;
  };
  const paths = new Set<string>();
  for (const m of KB.matchAll(/(?<![\w.:/{}])\/((?:project\/\{id\}(?:\/[a-z-]+)*)|[a-z][a-z0-9-]*)/g)) paths.add(m[1]);
  expect(paths.size).toBeGreaterThan(10);
  // Not routes of this app: an OData path, a token endpoint in an example.
  const NOT_APP = new Set(['sap', 'oauth']);
  for (const p of paths) {
    if (NOT_APP.has(p.split('/')[0])) continue;
    expect(routeExists(p.split('/')), `/${p} is named in the knowledge base but is no route`).toBe(true);
  }
});

test('the greeting chips ask about the product as it is, and one glossary term', () => {
  expect(ASSISTANT_CHIPS.join(' ')).not.toMatch(/live tenant|platform|BYOK/i);
  const glossary = ASSISTANT_CHIPS.filter((chip) => glossaryAnswerFor(chip));
  expect(glossary).toEqual(['What is Clean Core?']);
  // Each product chip has its answer in the knowledge base.
  const topics: Record<string, RegExp> = {
    'seven tools': /The seven tools, in the tool bar's order/,
    'keep, rebuild or retire': /program decision/,
    'share': /Invite to view/,
    'model key': /Your own model key/,
    'SAP test system': /Your SAP test system/,
  };
  for (const chip of ASSISTANT_CHIPS.filter((c) => !glossary.includes(c))) {
    const topic = Object.keys(topics).find((t) => chip.includes(t));
    expect(topic, `no knowledge-base topic for the chip "${chip}"`).toBeTruthy();
    expect(KB).toMatch(topics[topic!]);
  }
});
