/**
 * Neutrality of the parse-once reader (roadmap 3.5.0 item 2, ADR-133): for
 * every source where `readStatements` serves the parsed view (no
 * `parseOnceFallback` reason), the parsed statements must equal the shipping
 * scanner's byte for byte. Run over a corpus and deterministic mutations of
 * it, so the fallback rules are tested where real uploads break:
 *
 *   - the file as it is, with CRLF line ends, with tabs for indentation;
 *   - each of 8 evenly spaced lines deleted, duplicated, or cut in half;
 *   - the file cut off at 8 evenly spaced characters;
 *   - a `'`, a `|`, a `"`, a `{` or a `.` inserted at 8 evenly spaced positions.
 *
 *   npx tsx scripts/engine/parse-once-neutrality.ts [--corpus <MANIFEST.json>] [--samples]
 *
 * Exit 1 when one source served by the parsed view differs from the scanner.
 * `tests/parse-once-wiring.spec.ts` runs it on the in-repository corpus.
 */
import { parseSource } from '../../lib/engine4/parsed-source';
import { parseOnceFallback, readStatementsShipping } from '../../lib/abap/statement-reader';
import { corpusFromArgs, type CorpusFile } from '../engine4/shadow';

export interface NeutralityReport {
  files: number;
  sources: number;
  parsed: number;
  fallback: Record<string, number>;
  mismatches: number;
  samples: Array<{ name: string; mutation: string; at: number; shipping: string; parsed: string }>;
}

const STEPS = 8;

export function mutations(source: string): Array<{ mutation: string; source: string }> {
  const out: Array<{ mutation: string; source: string }> = [{ mutation: 'none', source }];
  out.push({ mutation: 'crlf', source: source.replace(/\r?\n/g, '\r\n') });
  out.push({ mutation: 'tabs', source: source.replace(/^( {2})+/gm, (m) => '\t'.repeat(m.length / 2)) });
  const lines = source.split('\n');
  for (let k = 1; k <= STEPS; k++) {
    const at = Math.floor((k * lines.length) / (STEPS + 1));
    const del = lines.slice(); del.splice(at, 1);
    out.push({ mutation: `delete-line@${at + 1}`, source: del.join('\n') });
    const dup = lines.slice(); dup.splice(at, 0, lines[at] ?? '');
    out.push({ mutation: `duplicate-line@${at + 1}`, source: dup.join('\n') });
    const half = lines.slice(); const l = half[at] ?? ''; half.splice(at, 1, l.slice(0, l.length >> 1), l.slice(l.length >> 1));
    out.push({ mutation: `split-line@${at + 1}`, source: half.join('\n') });
    const cut = Math.floor((k * source.length) / (STEPS + 1));
    out.push({ mutation: `truncate@${cut}`, source: source.slice(0, cut) });
    for (const ch of ["'", '|', '"', '{', '.']) {
      out.push({ mutation: `insert(${ch})@${cut}`, source: source.slice(0, cut) + ch + source.slice(cut) });
    }
  }
  return out;
}

export function runNeutrality(corpus: CorpusFile[]): NeutralityReport {
  const r: NeutralityReport = { files: 0, sources: 0, parsed: 0, fallback: {}, mismatches: 0, samples: [] };
  for (const file of corpus) {
    r.files += 1;
    for (const m of mutations(file.source)) {
      r.sources += 1;
      const parsed = parseSource(m.source);
      const reason = parseOnceFallback(parsed);
      if (reason) { r.fallback[reason] = (r.fallback[reason] ?? 0) + 1; continue; }
      r.parsed += 1;
      const shipping = readStatementsShipping(m.source);
      const a = JSON.stringify(shipping);
      const b = JSON.stringify(parsed.compat);
      if (a === b) continue;
      r.mismatches += 1;
      if (r.samples.length < 50) {
        const i = shipping.findIndex((s, k) => JSON.stringify(s) !== JSON.stringify(parsed.compat[k]));
        const at = i < 0 ? shipping.length : i;
        r.samples.push({ name: file.name, mutation: m.mutation, at, shipping: JSON.stringify(shipping[at] ?? null), parsed: JSON.stringify(parsed.compat[at] ?? null) });
      }
    }
  }
  return r;
}

if (require.main === module) {
  const r = runNeutrality(corpusFromArgs());
  console.log(`files ${r.files}, sources ${r.sources}: parsed view ${r.parsed}, fallback ${r.sources - r.parsed}, mismatches ${r.mismatches}`);
  console.log(`fallback reasons: ${JSON.stringify(r.fallback)}`);
  if (process.argv.includes('--samples')) for (const s of r.samples) console.log(JSON.stringify(s));
  else for (const s of r.samples.slice(0, 5)) console.log(JSON.stringify(s).slice(0, 600));
  if (r.mismatches) process.exit(1);
}
