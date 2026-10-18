import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { ABAP_MAX_LINE, wrapAbapLine, wrapAbapSource } from '../lib/transformation/abap-line-length';
import { ABAPLINT_RULES } from '../lib/transformation/abaplint-config';

// The QM trial import (18.10.2026): an engine-written condition of 333 characters failed the abapGit pull and
// ADT refused to save it — SAP allows at most 255 characters per ABAP source line.
const QM_G0478 =
  "    rv_holds = xsdbool( lv_ok IS INITIAL OR ( ls_r-stage <> 'I' AND ls_r-stage <> 'R' ) OR ( ls_r-state <> 'ACTIVE' AND ls_r-state <> 'VOID' ) OR ( ls_r-known <> 'X' AND ls_r-known IS NOT INITIAL ) OR abs( ls_r-value ) > gc_max OR ls_r-uncertainty < 0 OR ls_r-uncertainty > gc_max OR ls_r-sample IS INITIAL OR ls_r-char IS INITIAL ).";

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

test('a long statement breaks into lines of at most 255 characters with the same tokens', () => {
  expect(QM_G0478.length).toBeGreaterThan(ABAP_MAX_LINE);
  const out = wrapAbapLine(QM_G0478);
  expect(out.length).toBeGreaterThan(1);
  for (const l of out) expect(l.length).toBeLessThanOrEqual(ABAP_MAX_LINE);
  expect(tokens(out.join('\n'))).toEqual(tokens(QM_G0478));
  expect(out[1].startsWith('      ')).toBe(true);
});

test('a literal is never split, and a blank inside it is no break point', () => {
  const lit = `'${'A B '.repeat(30)}'`;
  const line = `    lv_x = ${lit} && ${lit} && ${lit}.`;
  const out = wrapAbapLine(line);
  for (const l of out) expect(l.length).toBeLessThanOrEqual(ABAP_MAX_LINE);
  for (const l of out) expect((l.match(/'/g) ?? []).length % 2).toBe(0);
  expect(out.join(' ').replace(/\s+/g, ' ')).toContain(lit);
});

test('a comment line that is too long continues as a comment', () => {
  const line = `    " ${'word '.repeat(70)}`.trimEnd();
  const out = wrapAbapLine(line);
  for (const l of out) {
    expect(l.length).toBeLessThanOrEqual(ABAP_MAX_LINE);
    expect(l.trimStart().startsWith('"')).toBe(true);
  }
});

test('a source with short lines comes back unchanged, line endings included', () => {
  const src = 'CLASS a DEFINITION.\r\nENDCLASS.\r\n';
  expect(wrapAbapSource(src)).toBe(src);
});

test('the RAP scaffold and the splice of model bodies wrap, and abaplint checks the length', () => {
  const rap = fs.readFileSync(path.join(__dirname, '..', 'lib', 'transformation', 'scaffold-rap.ts'), 'utf8');
  const markers = fs.readFileSync(path.join(__dirname, '..', 'lib', 'transformation', 'markers.ts'), 'utf8');
  expect(rap).toContain('files.splice(0, files.length, ...wrapAbapFiles(files));');
  expect(markers).toContain("scaffold.track === 'rap' ? wrapAbapLine(l) : [l]");
  expect(ABAPLINT_RULES).toMatchObject({ line_length: { length: 255 } });
});

// The PM trial import (18.10.2026): a custom entity element named `resource` failed activation —
// "RESOURCE is a reserved word (choose another field name)".
test('a CDS element is never named resource', async () => {
  const { isDdicReserved, ddicFieldName } = await import('../lib/transformation/ddic-reserved');
  expect(isDdicReserved('resource')).toBe(true);
  expect(isDdicReserved('RESOURCE')).toBe(true);
  expect(ddicFieldName('resource')).toBe('resource_value');
});

// The FI holdout run (18.10.2026): the golden master carries a CONCATENATE result as one literal of 300 characters.
test('a literal longer than a line is split into chunks joined with &&, none ending on a blank or splitting a quote pair', () => {
  const body = `${'A1:'.repeat(60)}It''s ${'x y '.repeat(40)}end`;
  const line = `        ( id = 'A001' body = '${body}' )`;
  const out = wrapAbapLine(line);
  for (const l of out) expect(l.length).toBeLessThanOrEqual(ABAP_MAX_LINE);
  const joined = out.join(' ');
  const chunks = [...joined.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]).filter((c) => c !== 'A001');
  expect(chunks.join('')).toBe(body);
  for (const c of chunks.slice(0, -1)) expect(c.endsWith(' ')).toBe(false);
  expect(joined).toContain(' && ');
});
