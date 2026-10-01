import fs from 'fs';
import path from 'path';
import { notDetermined } from '@/lib/workspace-model';
import { kindWord, tokenizeAbapLine, EARLY_END_WORD, type CodeToken } from '@/lib/process-map';
import type { LandingHero } from '@/lib/landing-process';
import type { BusinessRule } from '@/lib/abap/business-rule-set';

/**
 * What the hero's source card can show — landing mockup, section `hero`.
 *
 * One snippet per line anchor the hero offers: every step of the drawn routine,
 * every rule in the found-in-the-code sentence, every construct the engine could
 * not judge and every include that was not uploaded. Each is cut from the shipped
 * example file and captioned from what the engine itself says about that line —
 * the step's kind and name, the rule's id and condition, the coverage report's
 * reason. Nothing here is written for the page.
 *
 * Server only: reads the example file.
 */

export interface HeroLine {
  n: number;
  tokens: CodeToken[];
  mark: '' | 'hl' | 'hl2';
}

export interface HeroSnippet {
  from: number;
  to: number;
  lines: HeroLine[];
  title: string;
  text: string;
}

export interface HeroSnippets {
  snippets: Record<string, HeroSnippet>;
  initial: string;
  notDetermined: { total: number; groups: Array<{ label: string; anchors: number[] }>; includes: number[] };
}

const CONTEXT = 3;

/* ------------------------------------------------------------------ *
 * Which rules the hero names
 * ------------------------------------------------------------------ */

/**
 * A rule as a phrase in the hero's sentence. A tolerance on a percentage
 * (`lv_dev_pct > 5`) reads as what it is for a business reader — "tolerance
 * 5 %"; everything else is the plain-language phrase it was given.
 */
export function heroRulePhrase(rule: Pick<BusinessRule, 'classes' | 'parameters'>, phrase: string): string {
  const p = rule.parameters;
  if (rule.classes.includes('toleranz') && p.length === 1 && /(pct|percent|prozent)/i.test(p[0].subject ?? '')
    && /^(>|GT|>=|GE)$/i.test(p[0].operator) && /^'?\d+(\.\d+)?'?$/.test(p[0].literal)) {
    return `tolerance ${p[0].literal.replace(/'/g, '')} %`;
  }
  return phrase;
}

/** How much a rule says about the outcome of the process, for the hero's sentence. */
export function ruleImpact(rule: Pick<BusinessRule, 'typeBasis' | 'classes' | 'processElements'>): number {
  // 1. It changes the outcome: the flow ends, is rejected or held where it holds.
  const decides = rule.typeBasis.some((b) => b.basis === 'ends-flow' || b.basis === 'else-ends-flow' || b.basis === 'check-leaves');
  // 2. What kind of value it is: a tolerance or money threshold, an organisational
  //    unit (plant, company code, purchasing organisation), a list of exceptions or blocks.
  const kind = rule.classes.includes('toleranz') || rule.classes.includes('organisationseinheit')
    ? 3
    : rule.classes.includes('ausnahmeliste') ? 2 : 0;
  // 3. A reader can find it on the map.
  const drawn = rule.processElements.length > 0 ? 2 : 0;
  return (decides ? 4 : 0) + kind + drawn;
}

/**
 * The rules the hero's "found in the code" sentence names — by business
 * impact, not by how short their text is (landing mockup s0/s1: "tolerance
 * 5 %, plant 1000, vendor block list").
 *
 * Deterministic order:
 *   1. only rules with a place on the map (the sentence's anchors open a step);
 *   2. higher `ruleImpact` first;
 *   3. among equals, one of each kind of value before a second of the same
 *      kind (a tolerance, an organisational unit, a list) — three different
 *      facts read better than two thresholds;
 *   4. then the engine's own order (rule id).
 */
export function pickHeroRules<R extends Pick<BusinessRule, 'id' | 'typeBasis' | 'classes' | 'processElements'>>(rules: R[], count = 3): R[] {
  const order = new Map(rules.map((r, i) => [r.id, i]));
  const ranked = rules
    .filter((r) => r.processElements.length > 0)
    .sort((a, b) => ruleImpact(b) - ruleImpact(a) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const kindOf = (r: R) => r.classes[0] ?? 'other';
  const picked: R[] = [];
  const kinds = new Set<string>();
  for (const r of ranked) {
    if (picked.length >= count) break;
    if (kinds.has(kindOf(r)) && ranked.some((o) => !picked.includes(o) && o !== r && !kinds.has(kindOf(o)) && ruleImpact(o) === ruleImpact(r))) continue;
    picked.push(r);
    kinds.add(kindOf(r));
  }
  for (const r of ranked) if (picked.length < count && !picked.includes(r)) picked.push(r);
  return picked;
}

export function heroSnippets(hero: LandingHero, fileName: string): HeroSnippets {
  const source = fs
    .readFileSync(path.join(process.cwd(), 'public', 'starter-examples', fileName), 'utf8')
    .replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const cut = (from: number, to: number, hl: number, hl2: number[] = []): HeroLine[] => {
    const out: HeroLine[] = [];
    for (let n = Math.max(1, from); n <= Math.min(lines.length, to); n += 1) {
      out.push({ n, tokens: tokenizeAbapLine(lines[n - 1] ?? ''), mark: n === hl ? 'hl' : hl2.includes(n) ? 'hl2' : '' });
    }
    return out;
  };
  const snippets: Record<string, HeroSnippet> = {};

  // The steps of the drawn excerpt. A step inside the shown routine opens the
  // whole routine with its line lit; a step elsewhere (a phase with its range,
  // an exit with several places) opens its own lines.
  const routine = hero.code;
  const rFrom = routine[0]?.number ?? 1;
  const rTo = routine[routine.length - 1]?.number ?? rFrom;
  const MAX_SPAN = 24;
  for (const node of hero.plane.nodes) {
    if (!node.anchor || node.tag === 'boundaryEvent') continue;
    const key = String(node.anchor.lineStart);
    if (snippets[key]) continue;
    const kind = node.early ? EARLY_END_WORD : kindWord(node.tag);
    const span = [];
    for (let n = node.anchor.lineStart + 1; n <= node.anchor.lineEnd; n += 1) span.push(n);
    const inside = node.anchor.lineStart >= rFrom && node.anchor.lineEnd <= rTo;
    // A phase stands for its routine: its range is in `anchorLabel` (`L60–75`).
    const range = /^L(\d+)–(\d+)$/.exec(node.anchorLabel ?? '');
    const from = inside ? rFrom : range ? Number(range[1]) : node.anchor.lineStart - CONTEXT;
    const to = inside ? rTo : range ? Math.min(Number(range[2]), Number(range[1]) + MAX_SPAN) : node.anchor.lineEnd + CONTEXT;
    snippets[key] = {
      from: Math.max(1, from),
      to,
      lines: cut(from, to, node.anchor.lineStart, span),
      title: `${kind}: ${node.name}`,
      text: node.anchorLabel
        ? `${node.anchorLabel} in the program — the lines this step was read from.`
        : `line ${node.anchor.lineStart} of the program, where the map draws it.`,
    };
  }

  // The rules in the sentence.
  for (const rule of hero.rules.shown) {
    const key = String(rule.line);
    if (snippets[key]) {
      snippets[key] = { ...snippets[key], title: `${rule.plain} · ${rule.id}, hard-coded`, text: `the code writes it as ${rule.label} at line ${rule.line}.` };
      continue;
    }
    snippets[key] = {
      from: Math.max(1, rule.line - CONTEXT),
      to: rule.line + CONTEXT,
      lines: cut(rule.line - CONTEXT, rule.line + CONTEXT, rule.line),
      title: `${rule.plain} · ${rule.id}, hard-coded`,
      text: `the code writes it as ${rule.label} at line ${rule.line}.`,
    };
  }

  // What the engine could not judge, with the coverage report's own reason.
  const nd = notDetermined({ legacyCode: source } as Parameters<typeof notDetermined>[0]);
  const groups = new Map<string, number[]>();
  for (const item of nd.items) {
    const line = Number(item.anchor.replace(/^L/, ''));
    groups.set(item.label, [...(groups.get(item.label) ?? []), line]);
    const key = String(line);
    if (snippets[key]) continue;
    snippets[key] = {
      from: Math.max(1, line - CONTEXT),
      to: line + CONTEXT,
      lines: cut(line - CONTEXT, line + CONTEXT, line),
      title: `Not determined — ${item.label.toLowerCase()}`,
      text: item.why,
    };
  }
  const includes = hero.includesNotRead.map((i) => i.line);
  for (const inc of hero.includesNotRead) {
    const key = String(inc.line);
    if (snippets[key]) continue;
    snippets[key] = {
      from: Math.max(1, inc.line - CONTEXT),
      to: inc.line,
      lines: cut(inc.line - CONTEXT, inc.line, inc.line),
      title: 'Not on the map — include not uploaded',
      text: inc.detail,
    };
  }

  // The rule on the drawn routine opens the card, as in the mockup.
  const onPlane = hero.rules.shown.find((r) => hero.plane.nodes.some((n) => n.anchor?.lineStart === r.line));
  // Otherwise the first decision of the shown routine — as the mockup opens on one.
  const decision = hero.plane.nodes.find((n) => n.tag === 'exclusiveGateway' && n.anchor && n.anchor.lineStart >= rFrom && n.anchor.lineStart <= rTo);
  const initial = String(onPlane?.line ?? decision?.anchor?.lineStart ?? hero.plane.nodes.find((n) => n.anchor)?.anchor?.lineStart ?? rFrom);

  return {
    snippets,
    initial,
    notDetermined: {
      total: nd.count,
      groups: [...groups].map(([label, anchors]) => ({ label, anchors })),
      includes,
    },
  };
}
