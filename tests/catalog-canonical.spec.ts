import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { objectToSlug, slugToObject } from '../lib/abap/catalog-index';

/**
 * One address per catalog object (external review, 02.10.2026).
 *
 * /catalog/vbak and /catalog/VBAK both answered 200, each with its own spelling
 * as canonical — two pages for one object as far as a search engine can tell.
 * The lower-case slug is the one the sitemap and every link use, so it is the
 * canonical, and any other spelling is sent there with a permanent redirect.
 */

const page = fs.readFileSync(path.resolve(__dirname, '..', 'app/catalog/[object]/page.tsx'), 'utf8');

test('the slug of an object is one spelling, whatever the address said', () => {
  for (const spelling of ['vbak', 'VBAK', 'Vbak']) {
    expect(objectToSlug(slugToObject(spelling))).toBe('vbak');
  }
});

test('the canonical, Open Graph and structured-data addresses are built from the slug, never from the address', () => {
  expect(page).not.toMatch(/\/catalog\/\$\{object\}/);
  expect(page).toMatch(/canonical: `\$\{BASE\}\/catalog\/\$\{objectToSlug\(name\)\}`/);
});

test('any other spelling is redirected permanently to the slug before the page renders', () => {
  const redirect = page.indexOf('permanentRedirect(`/catalog/${objectToSlug(name)}`)');
  expect(redirect).toBeGreaterThan(-1);
  expect(page).toMatch(/if \(object !== objectToSlug\(name\)\) permanentRedirect/);
  // Before the not-found check, so a misspelt known object is not answered with a 404 first.
  expect(redirect).toBeLessThan(page.indexOf('if (!entry && !noPath) notFound();'));
});
