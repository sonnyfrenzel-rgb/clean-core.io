import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A package in `serverExternalPackages` is not bundled: the server `require`s it
 * from node_modules at run time. The Cloud Run build installs production
 * dependencies only, so such a package must be a dependency, never a
 * devDependency — CI installs both and would not notice. v3.0.12 shipped
 * `@abaplint/core` as a devDependency, and every Transformation store failed
 * with "Cannot find module '@abaplint/core'" (500) in production.
 */
const ROOT = path.join(__dirname, '..');

test('every package the server loads from node_modules at run time is a production dependency', () => {
  const config = fs.readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf8');
  const block = /serverExternalPackages:\s*\[([^\]]*)\]/.exec(config);
  expect(block, 'next.config.mjs names serverExternalPackages').not.toBeNull();
  const external = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  expect(external.length).toBeGreaterThan(0);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  // A direct dependency, or one a production dependency pulls in (undici) — never a devDependency.
  for (const name of external) expect(pkg.devDependencies?.[name], `${name} is not a devDependency`).toBeUndefined();
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  for (const name of external) {
    const entry = lock.packages?.[`node_modules/${name}`];
    expect(entry, `${name} is in the lockfile`).toBeTruthy();
    expect(entry.dev, `${name} is not marked dev in the lockfile`).toBeUndefined();
    expect(entry.devOptional, `${name} is not marked devOptional in the lockfile`).toBeUndefined();
  }
});
