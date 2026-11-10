import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { KeyUserStepList } from '../lib/key-user-steps';

/**
 * Owner decision 22.10.2026 (roadmap 3.0.21): the block "Key-user
 * extensibility — the engine's reading and its limits", with its "Your company
 * may draw its own line" note, appears in Design only where key user is the
 * option in question — the comparison proposes it, the engine recommends it,
 * or the owner chose it. Otherwise it is left out; the key-user option's card
 * in the comparison keeps its own sentences.
 *
 * Server-free: the component rendered on the server.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

async function load(rel: string): Promise<Record<string, unknown>> {
  const out = path.join(ROOT, 'tmp', 'design-key-user-limits', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
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

const KEY_USER: KeyUserStepList = {
  scope: 'part',
  levelByConstruction: null,
  sentence: 'One part of the program reads as a key-user candidate.',
  steps: [],
  codeParts: [],
  effort: { steps: 0, entries: 0, checks: 0, byTool: {} },
  note: 'A step list, not code.',
} as unknown as KeyUserStepList;

const option = (o: string) => ({
  option: o,
  targetRelease: 'S/4HANA 2023',
  fitGap: `Fit of ${o}: covers the approval step.`,
  effort: 'Configured in the system.',
  runningCost: 'Qualitative only.',
  dataContract: 'Purchase orders from the released API.',
});

function designWith(recommended: 'rap' | 'keyuser') {
  return {
    optionComparison: {
      options: ['standard', 'keyuser', 'rap', 'cap'].map(option),
      recommended,
      decisionReason: 'The approval needs a check on a limit the business keeps, and the standard workflow has no such step.',
      requirementOthersMiss: 'The approver must see the limit that applied when the order was released.',
    },
  };
}

test.describe('the key-user limits in Design, only when relevant', () => {
  test('hidden while RAP is proposed and key user is neither recommended nor chosen; the key-user card stays', async () => {
    const mod = await load('components/design/OptionComparison.tsx');
    const OptionComparison = mod.default as (p: Record<string, unknown>) => React.ReactElement;
    const html = renderToStaticMarkup(React.createElement(OptionComparison, { design: designWith('rap'), keyUser: KEY_USER }));
    expect(html).toContain('data-option="keyuser"');
    expect(html).toContain('Fit of keyuser');
    expect(html).not.toContain('data-option-key-user-limits');
    expect(html).not.toContain('Your company may draw its own line.');
  });

  test('shown where the comparison proposes key user', async () => {
    const mod = await load('components/design/OptionComparison.tsx');
    const OptionComparison = mod.default as (p: Record<string, unknown>) => React.ReactElement;
    const html = renderToStaticMarkup(React.createElement(OptionComparison, { design: designWith('keyuser'), keyUser: KEY_USER }));
    expect(html).toContain('data-option-key-user-limits="part"');
    expect(html).toContain('Your company may draw its own line.');
  });

  test('shown where the engine recommends key user or the owner chose it, whatever the model proposed', async () => {
    const mod = await load('components/design/OptionComparison.tsx');
    const OptionComparison = mod.default as (p: Record<string, unknown>) => React.ReactElement;
    const html = renderToStaticMarkup(React.createElement(OptionComparison, { design: designWith('rap'), keyUser: KEY_USER, keyUserChosen: true }));
    expect(html).toContain('data-option-key-user-limits="part"');
    expect(html).toContain('Your company may draw its own line.');
  });

  test('never without the engine’s key-user reading', async () => {
    const mod = await load('components/design/OptionComparison.tsx');
    const shown = mod.keyUserLimitsShown as (a: Record<string, unknown>) => boolean;
    expect(shown({ view: { state: 'absent' }, keyUser: null, chosen: true })).toBe(false);
    expect(shown({ view: { state: 'absent' }, keyUser: KEY_USER, chosen: false })).toBe(false);
    expect(shown({ view: { state: 'absent' }, keyUser: KEY_USER, chosen: true })).toBe(true);
  });

  test('the page hands in the engine’s recommendation and the confirmed target', () => {
    const page = read('app/(app)/project/[projectId]/design/page.tsx');
    expect(page).toContain("const keyUserChosen = keyUserList?.scope === 'whole-program' || (signOffCurrent && project?.targetArchitecture === 'keyuser');");
    expect(page).toContain('keyUserChosen={keyUserChosen}');
    expect(read('components/design/DesignDocument.tsx')).toContain('<OptionComparison design={design} keyUser={keyUser} keyUserChosen={keyUserChosen} />');
  });
});
