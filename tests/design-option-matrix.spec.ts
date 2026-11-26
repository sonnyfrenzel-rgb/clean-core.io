import { test, expect } from '@playwright/test';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OPTION_COMPARISON_SCHEMA, OPTION_COMPARISON_PROMPT_RULE, RATING_WORDS, readOptionComparison } from '../lib/design-option-comparison';

/**
 * Owner 26.11.2026 (mock-up "Design IT: option comparison", accepted the same day): Design's option comparison reads
 * as the answer first, then a matrix — a level and one short line per option and aspect — and each option's full text
 * in a details panel. A comparison stored before carries no levels: its cells show the full text's first sentence,
 * shortened, and no level is invented. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');

async function load(rel: string): Promise<Record<string, unknown>> {
  const out = path.join(ROOT, 'tmp', 'design-option-matrix', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out);
}

const rated = (o: string, level: string) => ({
  option: o,
  targetRelease: 'Not recorded on the project. RAP needs S/4HANA 2022 or later.',
  fitGap: `${o} covers the approval limits per purchasing group, read at release. The escalation stays as coded.`,
  effort: 'One business object with behaviour and one app.',
  runningCost: 'Same stack, no extra runtime.',
  dataContract: 'Purchase orders from I_PurchaseOrderAPI01.',
  ratings: {
    fitGap: { level, short: 'All 5 parts, on released APIs' },
    effort: { level: 'partial', short: '1 BO, 1 behavior, 1 app' },
    runningCost: { level: 'good', short: 'Same stack, no extra runtime' },
    dataContract: { level: 'good', short: 'I_PurchaseOrderAPI01' },
    targetRelease: { level: 'open', short: '2022 or later assumed' },
  },
});

const design = (ratings = true) => ({
  optionComparison: {
    options: ['standard', 'keyuser', 'rap', 'cap'].map((o) => {
      const r = rated(o, o === 'rap' || o === 'cap' ? 'good' : 'partial');
      if (ratings) return r;
      const { ratings: _drop, ...rest } = r;
      void _drop;
      return rest;
    }),
    recommended: 'rap',
    decisionReason: 'Approval limits per purchasing group need their own logic, and the data stays in S/4HANA.',
    requirementOthersMiss: 'Escalation by amount and purchasing group, with the approver’s limit read at release.',
  },
});

test.describe('the option comparison as a matrix', () => {
  test('the model is asked for a level and a short line per aspect', () => {
    expect(OPTION_COMPARISON_SCHEMA).toContain('ratings:');
    expect(OPTION_COMPARISON_SCHEMA).toContain("level: 'good' | 'partial' | 'poor' | 'open'");
    expect(OPTION_COMPARISON_SCHEMA).toContain('at most 8 words');
    expect(OPTION_COMPARISON_PROMPT_RULE).toContain('a short line of at most 8 words');
  });

  test('levels and short lines are read; an older comparison gets no invented level', () => {
    const now = readOptionComparison(design());
    expect(now.state).toBe('ready');
    if (now.state !== 'ready') return;
    const rap = now.options.find((o) => o.option === 'rap')!;
    expect(rap.cells.fitGap).toEqual({ level: 'good', short: 'All 5 parts, on released APIs' });
    expect(RATING_WORDS.fitGap[rap.cells.fitGap.level!]).toBe('Fully');

    const before = readOptionComparison(design(false));
    if (before.state !== 'ready') throw new Error('not ready');
    const old = before.options.find((o) => o.option === 'rap')!;
    expect(old.cells.fitGap.level).toBeNull();
    // The first sentence, shortened at a word, never the whole paragraph.
    expect(old.cells.fitGap.short.length).toBeLessThanOrEqual(61);
    expect(old.cells.fitGap.short.startsWith('rap covers the approval limits')).toBe(true);
  });

  test('an amount never stands in a cell, not even through the fallback sentence', () => {
    const fallback = design(false);
    (fallback.optionComparison.options[2] as { fitGap: string }).fitGap = 'Costs about EUR 40,000 to build. Covers all five parts.';
    const viewF = readOptionComparison(fallback);
    if (viewF.state !== 'ready') throw new Error('not ready');
    expect(viewF.options.find((o) => o.option === 'rap')!.cells.fitGap.short).not.toMatch(/EUR|40,000/);
    const d = design();
    (d.optionComparison.options[2] as ReturnType<typeof rated>).ratings.runningCost.short = 'About EUR 12,000 a year';
    const view = readOptionComparison(d);
    if (view.state !== 'ready') throw new Error('not ready');
    expect(view.options.find((o) => o.option === 'rap')!.cells.runningCost.short).not.toMatch(/EUR|12,000/);
  });

  test('rendered: the answer, then one cell per option and aspect, a details button per option, no panel until asked', async () => {
    const mod = await load('components/design/OptionComparison.tsx');
    const OptionComparison = mod.default as (p: Record<string, unknown>) => React.ReactElement;
    const html = renderToStaticMarkup(React.createElement(OptionComparison, { design: design() }));
    expect(html).toContain('Which way fits: SAP standard, key user, RAP or CAP?');
    expect(html).toContain('data-option-reason=""');
    expect(html).toContain('What the others miss');
    expect(html.match(/data-option-aspect="/g)?.length).toBe(4 * 5);
    // Five aspects for each option, not only twenty in all (QA 61ee8aadc337).
    for (const o of ['standard', 'keyuser', 'rap', 'cap']) expect(html.match(new RegExp(`data-option-aspect="[a-zA-Z]+" data-option-of="${o}"`, 'g'))?.length, o).toBe(5);
    expect(html.match(/data-option-details="/g)?.length).toBe(4);
    expect(html).toContain('data-option-of="rap"');
    expect(html).toContain('data-cc-value-state="success"');
    expect(html).toContain('Fully');
    expect(html).not.toContain('data-option-detail="');
    // The long sentences wait in the panel; the matrix carries the short lines.
    expect(html).not.toContain('The escalation stays as coded.');
  });
});
