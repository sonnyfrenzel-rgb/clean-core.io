import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { aiStatementCoverageLine } from '../lib/audit-pack-verify';
import { ownAuthorizationIn } from '../lib/documentation-facts';
import type { MapNameArrival } from '../lib/naming-arrival';

/**
 * Release 3.1.0, QA review of the 3.1.0 history: the UI-side defects confirmed in the release candidate, each held
 * here server-free — by its pure helper, by a server render, or (for a hook) by its source.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('the first-run guide no longer promises the retired timed first look', () => {
  const page = read('app/(app)/first-run/page.tsx');
  expect(page).not.toMatch(/about 20 seconds|six steps|Pause or skip/);
  expect(page).toContain('the first insights at once');
});

test('the AI statement of a pack is said to be covered by the signature only when the pack verified', () => {
  expect(aiStatementCoverageLine({ status: 'authentic' })).toContain('covered by the signature');
  for (const status of ['integrity-only', 'failed'] as const) {
    const line = aiStatementCoverageLine({ status });
    expect(line).not.toContain('is covered by the signature');
    expect(line).toContain('not confirmed');
  }
  expect(read('app/(app)/verify-pack/page.tsx')).toContain('{aiStatementCoverageLine(result)}');
});

test('an authorization named in prose is no check of the program\'s own; a refusal code and a role check still are', () => {
  expect(ownAuthorizationIn(["  WRITE 'Authorization is handled by the caller'.", '  WRITE |Not authorised for { lv_x }|.'])).toEqual([]);
  expect(ownAuthorizationIn(["    MESSAGE 'NOT_AUTHORIZED' TYPE 'E'.", '  PERFORM require_role USING p_role.']).map((o) => o.name)).toEqual([
    'NOT_AUTHORIZED',
    'REQUIRE_ROLE',
  ]);
});

test('the process map is keyed by the engine version too, so a version change is loading, not the old map', () => {
  expect(read('hooks/useProcessMap.ts')).toContain('`${projectId}|${sha256Hex(source)}|${fileName}|${engineVersion ?? \'\'}`');
});

test('the home example button names the ran-before mark in its accessible name', () => {
  const src = read('components/StarterExamples.tsx');
  expect(src).toContain('aria-label={startLabel(account, item.example.name)}');
  expect(src).toMatch(/cost\.free \? `Start \$\{name\}` : `Start \$\{name\} \(\$\{cost\.badge\}\)`/);
});

test.describe('the naming status line', () => {
  const OUT = path.resolve(ROOT, 'tmp', 'qa-310-slice1-ui', String(process.pid));
  type Line = (props: { arrival: MapNameArrival }) => React.ReactElement | null;
  let NamingStatusLine: Line;

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    fs.mkdirSync(OUT, { recursive: true });
    await build({
      entryPoints: [path.resolve(ROOT, 'components', 'process-map', 'NamingStatusLine.tsx')],
      outfile: path.join(OUT, 'NamingStatusLine.cjs'),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    NamingStatusLine = require(path.join(OUT, 'NamingStatusLine.cjs')).default as Line;
  });

  const arrival = (over: Partial<MapNameArrival>): MapNameArrival => ({
    phase: 'swapping',
    shown: new Map(),
    swapping: new Set(),
    waiting: new Set(),
    named: 13,
    total: 25,
    status: { text: 'Naming steps in plain language … 13 of 25', sub: null, progress: 0.52, tone: 'busy' },
    motion: true,
    ...over,
  });
  const live = (html: string) => /<p[^>]*aria-live="polite"[^>]*>([^<]*)<\/p>/.exec(html);

  test('the count is not in a live region while names arrive; the settled sentence is', () => {
    const busy = renderToStaticMarkup(React.createElement(NamingStatusLine, { arrival: arrival({}) }));
    expect((busy.match(/aria-live=/g) ?? []).length).toBe(1);
    expect(live(busy)?.[1]).toBe('');
    expect(busy).toContain('13 of 25');

    const ready = renderToStaticMarkup(
      React.createElement(NamingStatusLine, {
        arrival: arrival({ phase: 'ready', named: 25, status: { text: 'Names are ready.', sub: null, progress: null, tone: 'calm' } }),
      }),
    );
    expect(live(ready)?.[1]).toBe('Names are ready.');
  });
});

test('a start run in flight closes Start in IT and Management and reads as running in a remounted Business view', () => {
  const hook = read('hooks/useStartRun.ts');
  // One module set, and every change of it is told to the views that listen.
  expect(hook).toContain('export function useStartRunInFlight(projectId: string): boolean');
  expect(hook).not.toMatch(/started\.(add|delete)\(projectId\);\s*\n\s*setPhase/);
  expect(hook.match(/setStarted\(projectId, (true|false)\)/g)).toHaveLength(3);
  expect(hook).toContain("autoPending || heldElsewhere\n        ? 'running'".replace(/\n/g, hook.includes('\r\n') ? '\r\n' : '\n'));
  const analyze = read('app/(app)/project/[projectId]/analyze/page.tsx');
  expect(analyze).toMatch(/const startBlockedReason: string \| null = startInFlight\s+\? 'The analysis is running\./);
  expect(analyze).toContain('}, [projectId, searchParams, startInFlight]);');
});
