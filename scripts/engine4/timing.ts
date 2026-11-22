/**
 * Speed of engine 4.0's layers against the shipping reader.
 *
 *   npx tsx scripts/engine4/timing.ts
 *
 * The 1,000-line starter example concatenated with itself to 1k, 10k, 25k and
 * 50k lines; median of five runs after one warm-up. New: L0+L1 (`lex` +
 * `statements`) and L2 (`blocks`) on its own. Old: `readStatements` and
 * `readBlocks` (lib/abap, read only). Nothing here is wired into the product.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { readStatementsShipping as readStatements } from '../../lib/abap/statement-reader';
import { readBlocks } from '../../lib/abap/block-structure';
import { lex } from '../../lib/engine4/lexer';
import { statements } from '../../lib/engine4/statements';
import { blocks } from '../../lib/engine4/blocks';

const BASE = readFileSync(join(__dirname, '..', '..', 'public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'), 'utf8').replace(/\r\n/g, '\n');

function median(f: () => void): number {
  f();
  const runs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    f();
    runs.push(performance.now() - t0);
  }
  return runs.sort((a, b) => a - b)[2];
}

export function sourceOf(lines: number): string {
  const base = BASE.split('\n');
  const out: string[] = [];
  while (out.length < lines) out.push(...base);
  return out.slice(0, lines).join('\n');
}

if (require.main === module) {
  console.log('lines | new L0+L1 | new L2 | old statements | old blocks');
  for (const n of [1000, 10000, 25000, 50000]) {
    const src = sourceOf(n);
    const list = statements(lex(src).tokens);
    const oldList = readStatements(src);
    const l01 = median(() => statements(lex(src).tokens));
    const l2 = median(() => blocks(list));
    const os = median(() => readStatements(src));
    const ob = median(() => readBlocks(oldList));
    console.log(`${n} | ${l01.toFixed(0)} ms | ${l2.toFixed(1)} ms | ${os.toFixed(0)} ms | ${ob.toFixed(1)} ms`);
  }
}
