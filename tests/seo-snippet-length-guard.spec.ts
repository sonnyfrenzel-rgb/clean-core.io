/**
 * Every indexable page fits a search result (roadmap 3.0.8, item 6).
 *
 * Google shows about 60 characters of a title and about 155 of a description
 * and cuts the rest — on most pages here the brand, or the sentence that says
 * what the page does not do. The GSC report of 09./10.10.2026 found eighteen
 * pages over one limit or both, among them the three that the searches for
 * "cloudify SAP" and "cloudification repository viewer" reach.
 *
 * Indexable means listed in a sitemap: every URL of `app/sitemap.ts` and every
 * object page of `/catalog-sitemap.xml`. Each is checked through the metadata
 * Next.js would render — the page's own `metadata` or `generateMetadata`, else
 * the nearest layout's, else the root's — without a server. A sitemap URL whose
 * page file cannot be found fails too, so a new route cannot slip past.
 *
 * The limits live in `lib/page-metadata.ts` (`TITLE_MAX`, `DESCRIPTION_MAX`);
 * template pages fit them with `firstThatFits`.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import sitemap from '../app/sitemap';
import { GET as catalogSitemap } from '../app/catalog-sitemap.xml/route';
import { generateMetadata as objectMetadata } from '../app/catalog/[object]/page';
import { DESCRIPTION_MAX, TITLE_MAX, firstThatFits } from '../lib/page-metadata';

const ROOT = path.resolve(__dirname, '..');

// A page module may import a stylesheet (the landing, the whitepaper). Node
// cannot read CSS; for reading metadata it is nothing.
const Module = require('module') as { _extensions: Record<string, (m: { exports: unknown }) => void> };
Module._extensions['.css'] = (m) => { m.exports = {}; };

type MetaModule = { metadata?: Metadata; generateMetadata?: (props: never) => Promise<Metadata> | Metadata };

function titleOf(m: Metadata): string | undefined {
  const t = m.title;
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object' && 'absolute' in t) return t.absolute;
  return undefined;
}

/** The page file for a URL path, and the dynamic parameters it was matched with. */
function routeFile(urlPath: string): { file: string; params: Record<string, string> } | null {
  const segments = urlPath.split('/').filter(Boolean);
  const walk = (dir: string, i: number, params: Record<string, string>): { file: string; params: Record<string, string> } | null => {
    if (i === segments.length) {
      const file = path.join(dir, 'page.tsx');
      if (fs.existsSync(file)) return { file, params };
      return null;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    // Exact segment first, then route groups, then a dynamic segment.
    const exact = entries.find((e) => e.name === segments[i]);
    if (exact) {
      const hit = walk(path.join(dir, exact.name), i + 1, params);
      if (hit) return hit;
    }
    for (const g of entries.filter((e) => /^\(.+\)$/.test(e.name))) {
      const hit = walk(path.join(dir, g.name), i, params);
      if (hit) return hit;
    }
    for (const d of entries.filter((e) => /^\[[^.\]]+\]$/.test(e.name))) {
      const hit = walk(path.join(dir, d.name), i + 1, { ...params, [d.name.slice(1, -1)]: segments[i] });
      if (hit) return hit;
    }
    return null;
  };
  return walk(path.join(ROOT, 'app'), 0, {});
}

/** What Next.js renders as title and description: the page's own, else the nearest layout's. */
async function effectiveMeta(file: string, params: Record<string, string>): Promise<{ title?: string; description?: string }> {
  const chain = [file];
  for (let dir = path.dirname(file); dir.startsWith(path.join(ROOT, 'app')); dir = path.dirname(dir)) {
    const layout = path.join(dir, 'layout.tsx');
    if (fs.existsSync(layout)) chain.push(layout);
  }
  let title: string | undefined;
  let description: string | undefined;
  for (const f of chain) {
    const mod = (await import(f)) as MetaModule;
    const meta = mod.metadata ?? (mod.generateMetadata ? await mod.generateMetadata({ params: Promise.resolve(params) } as never) : undefined);
    if (!meta) continue;
    title ??= titleOf(meta);
    description ??= meta.description ?? undefined;
    if (title && description) break;
  }
  return { title, description };
}

test.describe('every indexable page fits a search result', () => {
  test.setTimeout(240_000);

  test('the fitting helper keeps the fullest wording that fits, and cuts only the last resort', () => {
    expect(firstThatFits(10, 'far too long a title', 'short one')).toBe('short one');
    expect(firstThatFits(20, 'fits as it stands')).toBe('fits as it stands');
    const cut = firstThatFits(20, 'a wording that never fits the limit at all');
    expect(cut.length).toBeLessThanOrEqual(20);
    expect(cut.endsWith('…')).toBe(true);
  });

  test('every sitemap page: title ≤ 60, description ≤ 155', async () => {
    const urls = sitemap().map((e) => new URL(e.url).pathname);
    expect(urls.length).toBeGreaterThan(20);
    const problems: string[] = [];
    for (const url of urls) {
      const route = routeFile(url);
      if (!route) {
        problems.push(`${url}: no page file found`);
        continue;
      }
      const { title, description } = await effectiveMeta(route.file, route.params);
      if (!title) problems.push(`${url}: no title`);
      else if (title.length > TITLE_MAX) problems.push(`${url}: title ${title.length} > ${TITLE_MAX} — ${title}`);
      if (!description) problems.push(`${url}: no description`);
      else if (description.length > DESCRIPTION_MAX) problems.push(`${url}: description ${description.length} > ${DESCRIPTION_MAX} — ${description}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('every catalog object page in the catalog sitemap: title ≤ 60, description ≤ 155', async () => {
    const xml = await catalogSitemap().text();
    const slugs = [...xml.matchAll(/<loc>[^<]+\/catalog\/([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(slugs.length).toBeGreaterThanOrEqual(400);
    const problems: string[] = [];
    for (const object of slugs) {
      const meta = await objectMetadata({ params: Promise.resolve({ object }) } as never);
      const title = titleOf(meta) ?? '';
      const description = meta.description ?? '';
      if (!title || title.length > TITLE_MAX) problems.push(`/catalog/${object}: title ${title.length} — ${title}`);
      if (!description || description.length > DESCRIPTION_MAX) problems.push(`/catalog/${object}: description ${description.length} — ${description}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
