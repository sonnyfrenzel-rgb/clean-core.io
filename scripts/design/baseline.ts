/**
 * Lower the ceilings of the design source guard — never raise them.
 *
 *   npm run design:baseline -- --group <group>     lower the ceilings of one group to today's counts
 *   npm run design:baseline -- --all               the same for every group
 *   npm run design:baseline -- --report [--group g] print what would be lowered, write nothing
 *   npm run design:baseline -- --hits <file> [--rule R4]  list a file's hits with line numbers
 *
 * A step that removed hits runs `--group <its group>` and commits the changed
 * `tests/design-baseline/<group>.json` together with the code. Entries whose
 * counts reached zero disappear; a file whose every rule reached zero leaves
 * the list. If a count went *up*, the script refuses and names the hit — the fix
 * is in the code, not in the list.
 *
 * Two modes are for the coordinator only (by agreement, not enforced — the diff shows them):
 *
 *   --init                                  write every group file from scratch (D.1; refuses if any exists)
 *   --admit <file> --reason "<why>"         give a file that has no entry today its current counts —
 *                                           only for merging work that predates D.1 (e.g. the landing
 *                                           branch 3.0.6). The reason goes into the commit, the diff shows
 *                                           the new exception; a new file written after D.1 has none.
 *
 * Rules and grouping: tests/helpers/design-rules.ts. No network.
 */
import fs from 'fs';
import path from 'path';
import {
  GROUP_NAMES,
  RULE_IDS,
  groupOf,
  makeEntry,
  scanFile,
  type BaselineEntry,
  type BaselineFile,
  type RuleCounts,
} from '../../tests/helpers/design-rules';
import {
  BASELINE_DIR,
  REPO_ROOT,
  measureAll,
  readBaselineFiles,
  writeBaselineFile,
} from '../../tests/helpers/design-baseline-io';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const counts = measureAll();

function init() {
  if (readBaselineFiles().length > 0) fail(`${path.relative(REPO_ROOT, BASELINE_DIR)} already holds ceilings; --init only runs once.`);
  const groups = new Map<string, BaselineFile>(GROUP_NAMES.map((g) => [g, { group: g, files: {} }]));
  const unowned: string[] = [];
  for (const [rel, c] of counts) {
    const owner = groupOf(rel);
    const entry = makeEntry(owner?.step ?? 'D.0', c);
    if (!entry) continue;
    if (!owner) {
      unowned.push(rel);
      continue;
    }
    groups.get(owner.group)!.files[rel] = entry;
  }
  if (unowned.length) fail(`No group owns these files with hits; map them in design-rules.ts first:\n  ${unowned.join('\n  ')}`);
  for (const g of groups.values()) writeBaselineFile(g);
  console.log(`wrote ${groups.size} group files to ${path.relative(REPO_ROOT, BASELINE_DIR)}`);
}

function lower(groupFilter: string | null, dryRun: boolean) {
  const files = readBaselineFiles();
  if (files.length === 0) fail('no baseline files — nothing to lower');
  if (groupFilter && !files.some((f) => f.data.group === groupFilter)) fail(`unknown group "${groupFilter}" (known: ${files.map((f) => f.data.group).join(', ')})`);
  let rose = false;
  const writes: BaselineFile[] = [];
  for (const { data } of files) {
    if (groupFilter && data.group !== groupFilter) continue;
    const next: Record<string, BaselineEntry> = {};
    const changes: string[] = [];
    for (const [rel, entry] of Object.entries(data.files)) {
      const now: RuleCounts = counts.get(rel) ?? {};
      if (!counts.has(rel)) {
        changes.push(`  ${rel}: file gone — entry removed`);
        continue;
      }
      const lowered: RuleCounts = {};
      for (const r of RULE_IDS) {
        const ceiling = entry[r] ?? 0;
        const n = now[r] ?? 0;
        if (n > ceiling) {
          rose = true;
          const where = scanFile(rel, fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'))
            .filter((h) => h.rule === r)
            .slice(0, 5)
            .map((h) => `L${h.line} ${h.snippet}`)
            .join(' | ');
          console.error(`  ${rel}: ${r} rose ${ceiling} -> ${n} (${where}) — ceiling kept`);
          lowered[r] = ceiling;
        } else {
          lowered[r] = n;
          if (n < ceiling) changes.push(`  ${rel}: ${r} ${ceiling} -> ${n}`);
        }
      }
      const e = makeEntry(entry.step, lowered);
      if (e) next[rel] = e;
      else changes.push(`  ${rel}: all rules at 0 — entry removed`);
    }
    if (changes.length) console.log(`${data.group}:\n${changes.join('\n')}`);
    if (changes.length) writes.push({ group: data.group, files: next });
  }
  // All or nothing: a run that found a rise writes no file at all.
  if (rose) fail('A count rose above its ceiling. Fix the code; ceilings are never raised. Nothing was written.');
  if (!dryRun) for (const w of writes) writeBaselineFile(w);
  else if (writes.length) console.log('(report only — nothing written)');
}

function admit(rel: string) {
  const reason = value('--reason');
  if (!reason) fail('--admit needs --reason "<why this file predates D.1>"');
  const owner = groupOf(rel);
  if (!owner) fail(`${rel}: no group owns this file; map it in tests/helpers/design-rules.ts`);
  const c = counts.get(rel);
  if (!c) fail(`${rel}: not a UI file on disk`);
  const files = readBaselineFiles();
  const target = files.find((f) => f.data.group === owner.group);
  if (!target) fail(`${owner.group}.json missing`);
  if (files.some((f) => rel in f.data.files)) fail(`${rel} already has an entry; use --group to lower it`);
  const entry = makeEntry(owner.step, c);
  if (!entry) fail(`${rel} has no hits; it needs no exception`);
  target.data.files[rel] = entry;
  writeBaselineFile(target.data);
  console.log(`admitted ${rel} into ${owner.group}.json (${reason})`);
}

function hits(rel: string) {
  const full = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(full)) fail(`${rel}: no such file`);
  const rule = value('--rule');
  for (const h of scanFile(rel, fs.readFileSync(full, 'utf8'))) {
    if (!rule || h.rule === rule) console.log(`${rel}:${h.line}  ${h.rule}  ${h.snippet}`);
  }
}

if (flag('--init')) init();
else if (value('--hits')) hits(value('--hits')!);
else if (value('--admit')) admit(value('--admit')!);
else if (flag('--all')) lower(null, false);
else if (value('--group')) lower(value('--group')!, flag('--report'));
else if (flag('--report')) lower(null, true);
else fail('usage: npm run design:baseline -- --group <group> | --all | --report [--group g] | --hits <file> [--rule Rn]');
