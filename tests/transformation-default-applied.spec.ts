import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileUrl, nodePackage, runInPackage } from './helpers/transformation-scaffold';

// 18.10.2026, from the trial run of the 1,000-line starter example: P_DAYS (PARAMETERS … DEFAULT 90) left out of a
// request was held as null and computed as nothing. A selection field the request leaves out takes the original's
// DEFAULT — as the selection screen shows it — and the answer names it; an explicit value is kept as given.
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap'), 'utf8');

test('a selection field left out takes the DEFAULT of the original, and the answer names it', () => {
  const { dir, files } = nodePackage(SOURCE);
  try {
    const contract = files.find((f) => f.path === 'srv/lib/input-contract.ts')!.content;
    expect(contract).toMatch(/original: "P_DAYS"[^\n]*deflt: "90"/);
    type V = { ok: boolean; days: unknown; errors: Array<{ field: string | null; message: string }> };
    const run = (days: string) =>
      runInPackage<V>(
        dir,
        [
          `const { validateRequest } = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/input-contract.ts'))});`,
          `const v = validateRequest({ vkorg: ['1000'], ${days} orders: [{ vbeln: '1' }] });`,
          'console.log(JSON.stringify({ ok: v.ok, days: v.normalized?.days ?? null, errors: v.errors }));',
        ].join('\n'),
      );
    const left = run('');
    expect(left.ok).toBe(true);
    expect(left.days).toBe(90);
    expect(left.errors.some((e) => e.field === 'days' && /DEFAULT/.test(e.message))).toBe(true);
    const given = run("days: '7',");
    expect(given.days).toBe(7);
    expect(given.errors.some((e) => e.field === 'days')).toBe(false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
