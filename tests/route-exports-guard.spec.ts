import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * A `route.ts` exports handlers and segment configuration, and nothing else.
 *
 * Next.js checks this in `next build` and nowhere earlier: `tsc --noEmit` is
 * green, the dev server serves the route, and only the production build fails
 * with "does not satisfy the constraint '{ [x: string]: never; }'". On
 * 24.09.2026 `app/api/projects/[projectId]/contract/route.ts` exported a field
 * name as a constant (roadmap 8.3), and the first place it surfaced was a
 * local production build — the CI would have failed on the push. This spec
 * reads every route file and names the stray export before anything is built.
 */

const ALLOWED = new Set([
  'GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS',
  'runtime', 'dynamic', 'dynamicParams', 'revalidate', 'fetchCache', 'preferredRegion', 'maxDuration',
  'generateStaticParams',
]);

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, out);
    else if (entry.name === 'route.ts' || entry.name === 'route.tsx') out.push(full);
  }
  return out;
}

test('every route.ts exports only handlers and segment configuration', () => {
  const root = path.join(process.cwd(), 'app');
  const files = routeFiles(root);
  expect(files.length, 'no route files found — the walk is broken, not the routes').toBeGreaterThan(20);

  const stray: string[] = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const names = [
      ...src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm),
    ].map((m) => m[1]);
    for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) names.push(name);
      }
    }
    for (const name of names) {
      if (!ALLOWED.has(name)) stray.push(`${path.relative(process.cwd(), file)}: ${name}`);
    }
  }
  expect(stray, 'next build refuses these exports from a route file').toEqual([]);
});
