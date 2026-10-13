import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * The SAP identifier checks are on the screen, not only in the source — QA
 * 6c07513fdad3, with bead0ed34426 (the Analyze route card and decision path)
 * and 666aaffb90ab (the Design cloud services).
 *
 * Rendered, not grepped: each component is bundled with esbuild and rendered
 * with the real React, the pattern of `tests/findings-focus-names.spec.ts`.
 * Every case asserts the three things a reader needs: a mismatch mark, the SAP
 * source it was checked against, and a not-verified mark.
 */

const ROOT = path.resolve(__dirname, '..');
// One directory per worker process: two workers bundling into the same file
// could each require the other's half-written bundle.
const OUT = path.resolve(ROOT, 'tmp', 'sap-reference-render', String(process.pid));

type Component = React.ComponentType<Record<string, unknown>>;
const loaded: Record<string, Component> = {};

const ENTRIES: Record<string, string> = {
  RouteCard: path.resolve(ROOT, 'components', 'analyze', 'RouteCard.tsx'),
  ExtensibilityDecisionMatrix: path.resolve(ROOT, 'components', 'analyze', 'ExtensibilityDecisionMatrix.tsx'),
  CloudServiceIntegrations: path.resolve(ROOT, 'components', 'design', 'CloudServiceIntegrations.tsx'),
  SapIdMark: path.resolve(ROOT, 'components', 'SapIdentifierCheck.tsx'),
};

/** The export a test renders, when it is not the module's default. */
const NAMED: Record<string, string> = { SapIdMark: 'SapIdMark' };

test.beforeAll(async () => {
  test.setTimeout(180 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, entry] of Object.entries(ENTRIES)) {
    const outfile = path.join(OUT, `${name}.cjs`);
    await build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'next', 'next/*'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    loaded[name] = require(outfile)[NAMED[name] ?? 'default'] as Component;
  }
});

const render = (name: string, props: Record<string, unknown>) =>
  renderToStaticMarkup(React.createElement(loaded[name], props));

/** The state of every SAP identifier mark in the markup, by identifier. */
function marks(html: string): Array<[string, string]> {
  return [...html.matchAll(/data-sap-id-check="([a-z]+)" data-sap-id="([^"]+)"/g)].map((m) => [m[2], m[1]]);
}

const KBA_3696098 = 'https://userapps.support.sap.com/sap/support/knowledge/en/3696098';

test.describe('Analyze', () => {
  const card = {
    route: 'On-Stack Developer Extensibility (ABAP Cloud)',
    overridden: false,
    confidence: 80,
    deployment: 'private',
    derived: null,
    notRecorded: [],
    decideHref: '/x',
    targetArtifact: 'F2358 (Process Collections Worklist)',
    rationale: 'Expose it through SAP_COM_9999 and keep the logic on-stack.',
  };

  test('the route card checks the model’s target and rationale', () => {
    const html = render('RouteCard', { ...card, modelWords: true });
    expect(html).toContain('data-sap-id-checks=""');
    expect(marks(html)).toEqual(expect.arrayContaining([['F2358', 'mismatch'], ['SAP_COM_9999', 'unverified']]));
    expect(html).toContain('SAP KBA 3696098');
    expect(html).toContain(`href="${KBA_3696098}"`);
    expect(html).toContain('not verified — check before use');
  });

  test('the router’s own card, which names no SAP identifier, carries no check list', () => {
    expect(render('RouteCard', card)).not.toContain('data-sap-id-checks');
  });

  test('the decision path checks every checkpoint and both tracks', () => {
    const track = (fitDetails: string, pros: string[]) => ({ technicalFeasibility: 'High', fitDetails, pros, cons: [] });
    const html = render('ExtensibilityDecisionMatrix', {
      extensibilityRoute: 'On-Stack Developer Extensibility (ABAP Cloud)',
      decisionTreeCheckpoints: [
        { checkpointName: 'Fit', question: 'Q?', evaluation: 'Use F2358 (Process Collections Worklist).', resultState: 'Neutral', cleanCoreImpact: 'None.' },
        // A checkpoint that is not the selected one is checked too.
        { checkpointName: 'Integration', question: 'Q2?', evaluation: 'E.', resultState: 'Neutral', cleanCoreImpact: 'Through SAP_COM_9999.' },
      ],
      comparativeAnalysis: {
        inAppABAPCloud: track('F0380 (Process Collections Worklist) is the standard app.', []),
        sideBySideBTP: track('Decoupled.', ['Calls API_NOT_IN_ANY_CATALOG.']),
      },
    });
    expect(marks(html)).toEqual(
      expect.arrayContaining([
        ['F2358', 'mismatch'],
        ['SAP_COM_9999', 'unverified'],
        ['F0380', 'verified'],
        ['API_NOT_IN_ANY_CATALOG', 'unverified'],
      ]),
    );
    expect(html).toContain(`href="${KBA_3696098}"`);
    expect(html).toContain('not verified — check before use');
  });
});

test.describe('Design', () => {
  test('a cloud service’s name and its released SAP objects carry their check', () => {
    const html = render('CloudServiceIntegrations', {
      cloudServices: [
        { serviceName: 'F2358 (Process Collections Worklist)', purpose: 'The worklist.', npmPackages: ['SAP_COM_9999', 'API_BUSINESS_PARTNER'] },
      ],
    });
    expect(marks(html)).toEqual(
      expect.arrayContaining([
        ['F2358', 'mismatch'],
        ['SAP_COM_9999', 'unverified'],
        ['API_BUSINESS_PARTNER', 'verified'],
      ]),
    );
    expect(html).toContain('SAP KBA 3696098');
    expect(html).toContain(`href="${KBA_3696098}"`);
    expect(html).toContain('not verified — check before use');
  });
});

test.describe('SAP documentation on GitHub (CC BY 4.0)', () => {
  // QA bdf1b45234a6: the inline mark is where the fact stands, so the
  // attribution CC BY asks for — document, commit, licence — stands there too,
  // not only in the grouped list's sources note.
  const SHA = '0123456789abcdef0123456789abcdef01234567';
  const URL = `https://github.com/SAP-docs/sap-btp-fixture/blob/${SHA}/docs/integration.md`;
  const OTHER = `https://github.com/SAP-docs/s4hana-fixture/blob/${'f'.repeat(40)}/docs/other.md`;
  const attribution = (url: string) => `© SAP SE and contributors, CC BY 4.0 — source: ${url}; adapted (extracted ID and title)`;
  const check = {
    id: 'SAP_COM_0009',
    kind: 'communication-scenario',
    status: 'verified',
    modelName: 'Product Integration',
    sapName: 'Product Integration',
    source: { label: 'SAP documentation on GitHub (SAP-docs/sap-btp-fixture), read 2026-10-13', url: URL },
    caveat: null,
    mismatchOn: null,
    modelProtocol: null,
    sapProtocol: null,
    modelRelease: null,
    sapRelease: null,
    sapTitle: null,
    sapDocs: true,
    product: 'SAP S/4HANA Cloud',
    attribution: attribution(URL),
    index: 0,
    length: 12,
  };

  test('an attributed mark shows its document, commit and licence in the text', () => {
    const html = render('SapIdMark', { check });
    expect(html).toContain('data-sap-id-citation=""');
    expect(html).toContain('SAP-docs/sap-btp-fixture/docs/integration.md@01234567');
    expect(html).toContain(`href="${URL}"`);
    expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/"');
    expect(html).toContain('CC BY 4.0</a>');
    // The full attribution is the mark's title as well.
    expect(html).toContain(`title="${attribution(URL)}"`);
  });

  test('a differing title from another SAP-docs document is cited with its own document and commit', () => {
    const html = render('SapIdMark', {
      check: {
        ...check,
        attribution: undefined,
        sapDocs: undefined,
        source: { label: 'SAP Business Accelerator Hub', url: 'https://api.sap.com/' },
        otherTitle: { title: 'Other', product: 'SAP S/4HANA', source: { label: 'SAP documentation on GitHub', url: OTHER }, attribution: attribution(OTHER) },
      },
    });
    expect(html).toContain('SAP-docs/s4hana-fixture/docs/other.md@ffffffff');
    expect(html).toContain('href="https://api.sap.com/"');
    expect(html.match(/data-sap-id-citation/g)).toHaveLength(1);
    // The citation carries the same attribution CC BY asks for: the document's
    // own link, the licence link, and the full attribution as its title.
    expect(html).toContain(`href="${OTHER}"`);
    expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/"');
    expect(html).toContain('CC BY 4.0</a>');
    expect(html).toContain(`title="${attribution(OTHER)}"`);
  });

  test('a mark without an attributed source carries no citation', () => {
    const html = render('SapIdMark', {
      check: { ...check, attribution: undefined, sapDocs: undefined, source: { label: 'SAP KBA 3696098', url: KBA_3696098 } },
    });
    expect(html).not.toContain('data-sap-id-citation');
    expect(html).not.toContain('title=');
    expect(html).toContain(`href="${KBA_3696098}"`);
  });
});
