/**
 * Neutrality of the two other splitters on parse once (3.5.0; docs/design/engine4.md, "Retiring the other
 * splitters"): `declaration-parser.tokenize` and `plain-language`'s statements, read off the parse-once tokens
 * (`periodStatements`) wherever their fallback names no reason, must equal their 3.x scans byte for byte — on a
 * corpus and the same deterministic mutations as `parse-once-neutrality.ts` (CRLF, tabs, deleted, duplicated and
 * split lines, truncation, an inserted `'`, `|`, `"`, `{`, `.`), plus a bare-CR, a BOM and an indented-asterisk
 * variant for the splitters' own fallback rules.
 *
 *   npx tsx scripts/engine/splitter-neutrality.ts [--corpus <MANIFEST.json> --group <g>] [--samples]
 *
 * Exit 1 when one source served by the parsed view differs from its scan.
 */
import { parseSource } from '../../lib/engine4/parsed-source';
import { tokenizeFallback, tokenizeShipping, tokenize } from '../../lib/abap/declaration-parser';
import { plainStatements, plainStatementsFallback, splitStatements } from '../../lib/abap/plain-language';
import { corpusFromArgs, type CorpusFile } from '../engine4/shadow';
import { mutations } from './parse-once-neutrality';

export interface SplitterReport {
  files: number;
  sources: number;
  tokenize: { parsed: number; fallback: Record<string, number>; mismatches: number };
  plain: { parsed: number; fallback: Record<string, number>; mismatches: number };
  samples: string[];
}

function variants(source: string): Array<{ mutation: string; source: string }> {
  return [
    ...mutations(source),
    { mutation: 'bare-cr', source: source.replace(/\r?\n/g, '\r') },
    { mutation: 'bom', source: `﻿${source}` },
    { mutation: 'indented-asterisk', source: source.replace(/^(\s*)\*/m, '  *') },
  ];
}

export function runSplitterNeutrality(corpus: CorpusFile[]): SplitterReport {
  const r: SplitterReport = {
    files: 0, sources: 0, tokenize: { parsed: 0, fallback: {}, mismatches: 0 }, plain: { parsed: 0, fallback: {}, mismatches: 0 }, samples: [],
  };
  for (const file of corpus) {
    r.files += 1;
    for (const m of variants(file.source)) {
      r.sources += 1;
      // tokenize reads the source as it is, in both modes of the 3.3.0 gate (`multiLineTemplates`, ER-01): a
      // template across lines is a `parseOnceFallback` reason, so the parsed view must equal both scans.
      const t = tokenizeFallback(parseSource(m.source));
      if (t) r.tokenize.fallback[t] = (r.tokenize.fallback[t] ?? 0) + 1;
      else {
        r.tokenize.parsed += 1;
        for (const multiLineTemplates of [false, true]) {
          const a = JSON.stringify(tokenizeShipping(m.source, { multiLineTemplates }));
          const b = JSON.stringify(tokenize(m.source, { multiLineTemplates }));
          if (a !== b) {
            r.tokenize.mismatches += 1;
            if (r.samples.length < 30) r.samples.push(`tokenize ${file.name} ${m.mutation} multiLineTemplates=${multiLineTemplates}\n  shipping ${a.slice(0, 400)}\n  parsed   ${b.slice(0, 400)}`);
          }
        }
      }
      // plain-language reads the source with its line ends normalised and the BOM removed.
      const normalized = m.source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
      const p = plainStatementsFallback(parseSource(normalized));
      if (p) r.plain.fallback[p] = (r.plain.fallback[p] ?? 0) + 1;
      else {
        r.plain.parsed += 1;
        const shipping = splitStatements(normalized.split('\n'));
        const parsed = plainStatements(normalized);
        const a = JSON.stringify(shipping);
        const b = JSON.stringify(parsed);
        if (a !== b) {
          r.plain.mismatches += 1;
          const i = shipping.findIndex((x, k) => JSON.stringify(x) !== JSON.stringify(parsed[k]));
          if (r.samples.length < 30) r.samples.push(`plain ${file.name} ${m.mutation} at ${i}\n  shipping ${JSON.stringify(shipping[i] ?? null)}\n  parsed   ${JSON.stringify(parsed[i] ?? null)}`);
        }
      }
    }
  }
  return r;
}

if (require.main === module) {
  const r = runSplitterNeutrality(corpusFromArgs());
  console.log(`files ${r.files}, sources ${r.sources}`);
  console.log(`tokenize: parsed view ${r.tokenize.parsed}, mismatches ${r.tokenize.mismatches}; fallback ${JSON.stringify(r.tokenize.fallback)}`);
  console.log(`plain:    parsed view ${r.plain.parsed}, mismatches ${r.plain.mismatches}; fallback ${JSON.stringify(r.plain.fallback)}`);
  for (const s of r.samples.slice(0, process.argv.includes('--samples') ? 30 : 6)) console.log(s);
  if (r.tokenize.mismatches || r.plain.mismatches) process.exit(1);
}
