import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { bundleSource, unsafeBundlePath, type GeneratedFile } from '../lib/generated-package';

/**
 * The delivery bundle is unpacked on somebody else's machine.
 *
 * The entry names of a generated package are model output, and an entry name is
 * only a suggestion to whatever unpacks the archive. A name that resolves
 * outside the target directory is a file written where the reader never agreed
 * to one — on their machine, not ours, which is why the archive is the wrong
 * place to be relaxed about it.
 *
 * The rule is refusal, not repair: a package whose names climb out of their own
 * archive is a package whose generation went wrong, and rewriting the name would
 * hand over a bundle whose file names no longer match the code inside it.
 */
const ROOT = path.resolve(__dirname, '..');
const deliveryPage = () =>
  fs.readFileSync(path.join(ROOT, 'app/(app)/project/[projectId]/delivery/page.tsx'), 'utf8');

const GOOD: GeneratedFile[] = [
  { path: 'srv/service.cds', content: 'service Orders {}' },
  { path: 'db/schema.cds', content: 'entity Order { key ID : UUID; }' },
  { path: 'package.json', content: '{ "name": "generated" }' },
  { path: 'erp-triggers/zcl_core_event_publisher.clas.abap', content: 'CLASS zcl DEFINITION.' },
];

test('an ordinary package still bundles, name for name', async () => {
  const source = bundleSource(JSON.stringify(GOOD));
  expect(source.kind, 'a well-formed package was refused').toBe('package');

  const zip = new JSZip();
  if (source.kind === 'package') for (const f of source.files) zip.file(f.path, f.content);
  const read = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
  expect(Object.keys(read.files).filter((n) => !read.files[n].dir).sort()).toEqual(
    GOOD.map((f) => f.path).sort(),
  );
});

test('a path that leaves the archive is refused, and nothing is bundled', () => {
  // One entry is enough: the package is refused whole, so the reader never gets
  // an archive that quietly lost a file.
  const source = bundleSource(
    JSON.stringify([...GOOD, { path: '../../../.ssh/authorized_keys', content: 'ssh-rsa AAA' }]),
  );
  expect(source.kind, 'a climbing entry was accepted into the bundle').toBe('rejected');
  if (source.kind !== 'rejected') return;
  expect(source.rejected.map((r) => r.path)).toEqual(['../../../.ssh/authorized_keys']);
  expect(source.rejected[0].reason, 'the refusal does not say what is wrong').toMatch(/\.\./);
});

test('every shape an unpacker disagrees about is refused', () => {
  for (const bad of [
    '../x',
    'srv/../../x',
    'a/b/../../../../etc/passwd',
    '/etc/passwd',
    'C:/Windows/System32/x.dll',
    'c:x',
    'srv\\..\\..\\x.ts',
    'srv\\app.ts',
    'app.ts\u0000.png',
    '',
    '   ',
  ]) {
    expect(unsafeBundlePath(bad), `"${bad}" was let through`).not.toBeNull();
    expect(
      bundleSource(JSON.stringify([{ path: bad, content: 'x' }])).kind,
      `a package containing "${bad}" was not refused`,
    ).toBe('rejected');
  }

  // And the names a generated package legitimately carries stay legal — a guard
  // that refuses everything protects nothing.
  for (const ok of [
    'srv/service.cds',
    'src/zcl_demo_rap_behavior.clas.abap',
    'a.b.c/d-e_f/g.ts',
    'docs/2 Architecture.md',
    '.github/workflows/ci.yml',
    'srv/handlers/order.ts',
  ]) {
    expect(unsafeBundlePath(ok), `"${ok}" is a name a real package carries`).toBeNull();
  }
});

test('a flat legacy source is still a flat legacy source, not a refusal', () => {
  expect(bundleSource('export const app = 1;').kind).toBe('flat');
  expect(bundleSource(undefined).kind).toBe('flat');
  expect(bundleSource('[]').kind, 'an empty array is no package').toBe('flat');
});

/**
 * The call site, because the guard is only worth what the page does with it.
 * The page used to `JSON.parse(project.generatedCode)` itself and write every
 * `file.path` straight into the archive; the parse now lives behind
 * `bundleSource`, which is the only thing that decides what may become a file.
 */
test('the delivery page bundles through the guard and parses nothing itself', () => {
  const source = deliveryPage();
  expect(source, 'the page no longer routes the package through bundleSource').toContain('bundleSource(project.generatedCode)');
  expect(source, 'the page parses the generated package itself again').not.toContain('JSON.parse(project.generatedCode)');
  expect(source, 'the refusal is not on screen').toContain('data-bundle-rejected');
});
