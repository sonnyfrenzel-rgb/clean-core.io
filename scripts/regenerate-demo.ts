/**
 * scripts/regenerate-demo.ts — roadmap 3.0.7, `DESIGN.md` §6.1.2.
 *
 * Regenerates the demo's release record after a change to the engine, the A–D
 * rule or the synced SAP catalog:
 *
 *   npm run demo:regenerate          # measure and write lib/demo-release.json
 *   npm run demo:regenerate -- --check   # measure and compare, exit 1 on drift
 *
 * The demo itself is computed on every request (`lib/demo-workspace.ts`); what
 * this writes is the statement of which engine and which rule version it was
 * last looked at under, with its headline figures. Review the diff: it is what
 * the demo now says. `tests/demo-release-guard.spec.ts` runs the same
 * comparison in CI. See `lib/demo-release.ts`.
 */
import fs from 'fs';
import path from 'path';
import {
  DEMO_RELEASE_FILE,
  demoReleaseDrift,
  measureDemoRelease,
  recordOf,
  stationsWithoutTarget,
  type DemoReleaseRecord,
} from '@/lib/demo-release';

const file = path.resolve(process.cwd(), DEMO_RELEASE_FILE);
const measured = measureDemoRelease();
const orphaned = stationsWithoutTarget(measured.figures);

if (process.argv.includes('--check')) {
  let recorded: DemoReleaseRecord | null = null;
  try {
    recorded = JSON.parse(fs.readFileSync(file, 'utf8')) as DemoReleaseRecord;
  } catch {
    recorded = null;
  }
  const drift = recorded ? demoReleaseDrift(recorded, measured) : [`${DEMO_RELEASE_FILE} is missing or unreadable`];
  if (drift.length || orphaned.length) {
    for (const line of [...drift, ...orphaned.map((o) => `tour: ${o}`)]) console.error(`- ${line}`);
    console.error('\nRun `npm run demo:regenerate`, review the diff, and commit it with the engine change.');
    process.exit(1);
  }
  console.log('The demo is current for this engine and rule version.');
  process.exit(0);
}

fs.writeFileSync(file, `${JSON.stringify(recordOf(measured), null, 2)}\n`, 'utf8');
console.log(`Wrote ${DEMO_RELEASE_FILE}`);
console.log(JSON.stringify(measured.figures, null, 2));
if (orphaned.length) {
  console.error('\nThe tour has stations whose place is empty in this demo:');
  for (const o of orphaned) console.error(`- ${o}`);
  process.exit(1);
}
