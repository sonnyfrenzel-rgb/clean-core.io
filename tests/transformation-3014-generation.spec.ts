import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { bodyGuards, isReleasedSapClass, isReleasedSapInterface } from '../lib/transformation/markers';
import { deriveReleasedInterfaces, RELEASED_INTERFACES_FILE } from '../lib/abap/cloudification-repo';
import { poDemo } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.14, "Transformation, next step", items (1)–(4) — the generation pipeline (owner decision 15.10.2026:
 * "es muss zuerst die Transformation sehr gut funktionieren für RAP und CAP"). Server-free: pure functions, the
 * scaffold and the orchestrator against a fake model; no model call, no network.
 */

function prep(source: string, track: 'rap' | 'node'): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: 'Z_TEST', decisions: [], contextText: '' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

/* ------------------------------------------------------------------ 4 */

test.describe('4 — a released interface may be read like a released class', () => {
  const p = prep(poDemo(), 'rap');
  const unit = p.plan.units.find((u) => u.routine === 'LOG_APPROVAL')!;
  const ctx = guardContextOf(p, unit.id);

  test('if_abap_behv=> passes the body guard; an unreleased or invented interface is still refused', () => {
    // Before 3.0.14 the guard read the class list only: both were "calls outside the logic class".
    expect(isReleasedSapInterface('IF_ABAP_BEHV')).toBe(true);
    expect(isReleasedSapInterface('if_oo_adt_classrun')).toBe(true);
    expect(isReleasedSapClass('if_abap_behv')).toBe(false);
    for (const body of ['DATA(lv_on) = if_abap_behv=>mk-on.', 'DATA(lv_cause) = if_abap_behv=>cause-unspecific.']) {
      expect(bodyGuards(body, ctx).map((r) => r.code), body).not.toContain('foreign-call');
    }
    const invented = bodyGuards('DATA(lv_x) = zif_invented_helper=>co_x.', ctx).find((r) => r.code === 'foreign-call');
    expect(invented?.message).toContain('zif_invented_helper=>');
    expect(isReleasedSapInterface('if_mm_internal_po')).toBe(false);
  });

  test('the released-interface list is the synced one: names only, derived from the committed catalog, and small', () => {
    const generated = path.join(__dirname, '..', 'lib', 'abap', 'generated');
    const file = path.join(generated, RELEASED_INTERFACES_FILE);
    const latest = JSON.parse(fs.readFileSync(path.join(generated, 'cloudification-repo.latest.json'), 'utf8'));
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    // A sync that changes the catalog changes this list (scripts/sync-cloudification-repo.ts).
    expect(list).toEqual(deriveReleasedInterfaces(latest));
    expect(Object.keys(list).sort()).toEqual(['interfaces', 'meta']);
    expect(list.interfaces.length).toBe(list.meta.count);
    expect(list.interfaces.length).toBeGreaterThan(1000);
    // Names only: no state, no successor, no catalog field travels with the engine chunk.
    for (const n of list.interfaces) expect(n).toMatch(/^[a-z0-9_/]+$/);
    // Measured 15.10.2026: 94.5 kB raw, 20.1 kB gzip — the engine chunk is fetched on Generate only.
    expect(fs.statSync(file).size).toBeLessThan(128 * 1024);
    expect(zlib.gzipSync(fs.readFileSync(file)).length).toBeLessThan(24 * 1024);
  });
});
