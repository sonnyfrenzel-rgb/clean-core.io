/**
 * Route distribution over the 300 benchmark cases (roadmap 3.0.12, F14/F15;
 * PP F11, SD R12): which route the router recommends, per deployment, and
 * which constructs drove it.
 *
 * Invocation (from the repo root):
 *   npx tsx tests/prozess-benchmark/route-distribution.ts [--engine <version>] [--out <file.json>] [--compare <before.json>]
 *
 * `--engine` picks the route rule the way a run's engine version does
 * (`lib/abap/extensibility-router.ts`, `GUI_FILE_NO_ROUTE_DRIVER_FROM` and
 * `ON_STACK_CONSTRUCTS_FROM`): run it once with an engine before 3.0.12 and
 * once with 3.0.12 to see what the 3.0.12 rules change — from then on only an
 * RFC call to another system chooses side-by-side. `--compare` lists every
 * case whose route differs from a saved run, with its drivers before and
 * after, and says whether a frontend file feature was its only driver there.
 *
 * Measured on 13.10.2026 (300 cases, `--engine 3.0.11` vs `3.0.12`):
 * side-by-side 42 -> 14 in Private Edition and 147 -> 14 in Public Edition;
 * all 161 changes go from side-by-side to on-stack, none the other way.
 *
 * Not a spec and not part of CI: a measurement, not a ratchet.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildAbapEvidence } from '../../lib/abap/evidence-model';
import { routeDrivers, routeExtensibility } from '../../lib/abap/extensibility-router';

const ROOT = join(__dirname, 'cases');
const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : null;
};
const ENGINE = arg('--engine') ?? '3.0.12';
const OUT = arg('--out');
const COMPARE = arg('--compare');

interface Row {
  id: string;
  deployment: 'public' | 'private';
  route: string;
  drivers: string[];
  guiFindings: number;
  rationale: string;
}

const rows: Row[] = [];
const ids = readdirSync(ROOT).filter((n) => /^BM-\d{3}$/.test(n)).sort();
for (const id of ids) {
  const dir = join(ROOT, id);
  const files = readdirSync(dir).filter((n) => n.endsWith('.abap')).sort();
  if (!files.length) continue;
  const code = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  for (const deployment of ['private', 'public'] as const) {
    const evidence = buildAbapEvidence(code, files[0], deployment, undefined, ENGINE.startsWith("v") ? ENGINE : `v${ENGINE}`);
    const route = routeExtensibility(evidence, deployment, ENGINE);
    rows.push({
      id,
      deployment,
      route: route.recommendedRoute,
      drivers: routeDrivers(evidence, deployment, ENGINE).map((d) => d.kind),
      guiFindings: evidence.findings.filter((f) => f.kind === 'gui-download').length,
      rationale: route.rationale,
    });
  }
}

const tally = (deployment: 'public' | 'private') => {
  const of = rows.filter((r) => r.deployment === deployment);
  const by: Record<string, number> = {};
  for (const r of of) by[r.route] = (by[r.route] ?? 0) + 1;
  return { cases: of.length, routes: by, withGuiFile: of.filter((r) => r.guiFindings > 0).length };
};

const summary = { engine: ENGINE, cases: ids.length, private: tally('private'), public: tally('public') };
console.log(JSON.stringify(summary, null, 2));

if (COMPARE && existsSync(COMPARE)) {
  const before = JSON.parse(readFileSync(COMPARE, 'utf8')) as { rows: Row[] };
  const key = (r: Row) => `${r.id}:${r.deployment}`;
  const old = new Map(before.rows.map((r) => [key(r), r]));
  const current = new Set(rows.map(key));
  // A case added since the saved run, or removed from it, is reported as such — never dereferenced as a changed route.
  const added = rows.filter((r) => !old.has(key(r))).map(key);
  const removed = before.rows.filter((r) => !current.has(key(r))).map(key);
  const changed = rows.filter((r) => old.has(key(r)) && old.get(key(r))!.route !== r.route);
  const report = changed.map((r) => {
    const o = old.get(key(r))!;
    return {
      case: key(r),
      before: o.route,
      after: r.route,
      driversBefore: o.drivers,
      driversAfter: r.drivers,
      guiFileWasSoleDriver: o.drivers.length === 1 && o.drivers[0] === 'gui-download',
    };
  });
  console.log(JSON.stringify({ changed: report.length, added, removed, notSoleGuiDriver: report.filter((r) => !r.guiFileWasSoleDriver), changes: report }, null, 2));
}

if (OUT) writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 2));
