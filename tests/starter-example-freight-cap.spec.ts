import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeDrivers, routeExtensibility } from '../lib/abap/extensibility-router';
import { SIDE_BY_SIDE_ROUTE } from '../lib/sap-naming';
import { scanForPersonalDataHints } from '../lib/personal-data-hints';
import { prepareEngineLed } from '../lib/transformation/engine-led';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { exampleTiers } from '../lib/example-catalog';
import { APP_VERSION } from '../lib/version';
import { countSourceLines } from '../lib/source-lines';
import { nodePackage, runEngineCases, runHarness, typecheck } from './helpers/transformation-scaffold';

/**
 * The freight charge check — the starter example that shows the side-by-side
 * route (roadmap 3.0.15, owner 16.10.2026: "eine neue saubere CAP-Beispiel-App
 * bauen, die auch funktioniert").
 *
 * Until it shipped, only the 1,000-line order audit routed side-by-side, and it
 * trips the personal-data hint with a fixed e-mail sender — a hint the owner
 * judged to put readers off an example. This one routes side-by-side for the
 * reason the router names since 3.0.12 and no other: one RFC call to another
 * system (the carrier's rating system behind an RFC destination). It carries no
 * shape the personal-data hint knows, and the engine builds a Node/CAP package
 * for it. Server-free.
 */

const FILE = 'Z_SD_FREIGHT_RATE_CHECK.abap';
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'starter-examples', FILE), 'utf8');

test.describe('the freight charge check starter example', () => {
  for (const deployment of ['public', 'private'] as const) {
    test(`routes side-by-side on ${deployment} for its outbound RFC call alone`, () => {
      const evidence = buildAbapEvidence(SOURCE, FILE, deployment, undefined, APP_VERSION);
      const route = routeExtensibility(evidence, deployment, APP_VERSION);
      expect(route.recommendedRoute).toBe(SIDE_BY_SIDE_ROUTE);
      const drivers = routeDrivers(evidence, deployment, APP_VERSION);
      expect(drivers.map((d) => d.kind)).toEqual(['rfc-call']);
      expect(drivers[0].count).toBe(1);
      // The driver is the carrier call, on its own line.
      const line = SOURCE.split(/\r?\n/)[drivers[0].firstLine - 1];
      expect(line).toContain("CALL FUNCTION 'Z_CARRIER_RATE_QUOTE'");
    });
  }

  test('carries no shape the personal-data hint knows', () => {
    expect(scanForPersonalDataHints(SOURCE)).toEqual([]);
  });

  test('the engine builds a Node/CAP package for it that type-checks and passes its own checks', () => {
    test.setTimeout(600_000);
    const prep = prepareEngineLed({ source: SOURCE, track: 'node', program: 'Z_SD_FREIGHT_RATE_CHECK', decisions: [], contextText: '' });
    if (!prep.ok) throw new Error(prep.reason);
    expect(prep.plan.units.length).toBeGreaterThan(5);
    expect(prep.scaffold.files.some((f) => f.path === 'package.json')).toBe(true);

    const { dir, files } = nodePackage(SOURCE);
    try {
      const pkg = JSON.parse(files.find((f) => f.path === 'package.json')!.content) as { dependencies?: Record<string, string> };
      expect(Object.keys(pkg.dependencies ?? {})).toContain('@sap/cds');
      const tsc = typecheck(dir);
      expect(tsc.ok, tsc.output).toBe(true);
      // The package's own acceptance harness and engine cases, before any model fill:
      // nothing fails; what needs a model's body reads Not run.
      expect(runHarness(dir).summary.fail).toBe(0);
      const cases = runEngineCases(dir);
      expect(cases.summary.failed, JSON.stringify(cases.cases.filter((c) => c.status === 'Failed'))).toBe(0);
      expect(cases.summary.passed).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('is a registered starter example, with its true line count', () => {
    const entry = STARTER_EXAMPLES.find((e) => e.file === FILE);
    expect(entry, 'not in lib/starter-examples.ts').toBeTruthy();
    expect(entry!.name).toBe('Z_SD_FREIGHT_RATE_CHECK');
    expect(SOURCE.toLowerCase()).toContain(`report ${entry!.name.toLowerCase()}`);
    expect(entry!.lines).toBe(countSourceLines(SOURCE));
    const tiers = exampleTiers();
    const shown = [tiers.startHere, ...tiers.next.map((n) => n.example), ...tiers.more];
    expect(shown.some((e) => e.file === FILE)).toBe(true);
  });
});
