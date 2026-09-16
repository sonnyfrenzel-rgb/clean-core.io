import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The landing page calls the downloadable abapGit package "complete and
 * directly importable" and tells the reader to activate it in ADT. Two things
 * in it could not be activated or found: a view entity carrying the DDIC
 * SQL-view annotation, and the ABAP Unit include stored under the local test
 * class's name instead of the global class that owns it
 * (QA review of 33471220d6e9 — 0c3362018102, 72556d36c205).
 *
 * The package is defined in source, so this reads the source. Whether ADT
 * activates it is settled by importing it into a real system; what is checked
 * here is that the two known reasons it could not be are gone.
 */
const source = fs.readFileSync(path.join(process.cwd(), 'components/SamplePackageDownload.tsx'), 'utf8');

/** The keys of the FILES map — the paths that end up in the ZIP. */
const packagePaths = [...source.matchAll(/'(src\/[^']+|\.abapgit\.xml|README\.md)':/g)].map((m) => m[1]);

test('the package ships the files the page lists', () => {
  expect(packagePaths.length).toBeGreaterThan(3);
});

test('a view entity carries no DDIC SQL-view annotation', () => {
  // `@AbapCatalog.sqlViewName`, `preserveKey` and `compiler.compareFilter`
  // belong to a DDIC-based CDS view. A view entity creates no SQL view, and
  // activation fails on the annotation rather than ignoring it.
  const ddls = source.slice(source.indexOf(".ddls.asddls'"), source.indexOf('.clas.abap'));
  expect(ddls).toContain('define view entity');
  expect(ddls, 'no @AbapCatalog annotation on a view entity').not.toMatch(/@AbapCatalog\./);
});

test('the unit-test include belongs to the global class it tests', () => {
  // abapGit binds `<class>.clas.testclasses.abap` to the global class of the
  // same basename; under any other name the tests do not arrive with the class.
  const testInclude = packagePaths.find((p) => p.endsWith('.clas.testclasses.abap'));
  expect(testInclude, 'the package has a test include').toBeTruthy();
  const basename = testInclude!.replace('src/', '').replace('.clas.testclasses.abap', '');
  expect(packagePaths, `${basename}.clas.abap is the class that owns the include`).toContain(`src/${basename}.clas.abap`);
  expect(packagePaths).toContain(`src/${basename}.clas.xml`);
  expect(source, 'the global class is declared under that name').toContain(`CLASS ${basename} DEFINITION`);
});

test('the file list on the page names the files the ZIP contains', () => {
  // The strip under "Download a Real abapGit Package" is a promise about the
  // archive; it named the include under its old name for as long as it existed.
  const strip = source.slice(source.indexOf('File list preview'));
  for (const name of [...strip.matchAll(/name: '([^']+\.(?:abap|asddls|xml))'/g)].map((m) => m[1])) {
    expect(packagePaths.some((p) => p.endsWith(name)), `${name} is in the package`).toBe(true);
  }
});
