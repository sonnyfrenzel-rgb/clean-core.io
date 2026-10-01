import { test, expect } from '@playwright/test';
import {
  generateArchitectureDecisionRecord,
  generateExecutiveSummary,
  generateModelCard,
  generateProvenanceManifest,
  generateUserAttestations,
} from '../lib/audit-pack';
import type { Project } from '../lib/types';

/**
 * QA full review of v2.20.0 — what the signed files of an audit pack say.
 *
 * - 9d5640681de1: owner-typed values reached Markdown cells with only the pipe
 *   escaped, so `<img src=…>` or `![](…)` rendered in a reviewer's viewer.
 * - 138766767b3d: the provenance file called every narrative model-generated,
 *   including one no model took part in and one without a receipt.
 * - f10bfbf0e3ed: 07-user-attested.md said only its name was bound, while
 *   the current manifest binds its bytes as well.
 * - 1bec79cecd6a: the provenance file named the pack signature HMAC only.
 * - d7bce6ef1e12: a run without a recorded catalog revision was given
 *   `2024.FPS02` in three signed files.
 */

type Participation = 'none' | 'narrative' | 'narrative-attested' | undefined;

function project(opts: { participation?: Participation; catalogOnCard?: string; catalogOnRun?: string } = {}): Project {
  return {
    id: 'p-1',
    activeRunId: 'r-1',
    ...(opts.catalogOnRun ? { sapApiCatalogVersion: opts.catalogOnRun } : {}),
    auditMetadata: {
      modelCard: {
        provider: opts.participation === 'narrative-attested' ? 'google-gemini' : null,
        model: opts.participation === 'narrative-attested' ? 'gemini-test' : null,
        modelParticipation: opts.participation,
        engineVersion: 'v-test',
        byokUsed: false,
        ...(opts.catalogOnCard ? { catalogVersion: opts.catalogOnCard } : {}),
      },
    },
    worklist: [],
  } as unknown as Project;
}

test('owner-typed values reach the attestation as text, not as HTML or a link', () => {
  const out = generateUserAttestations(
    {
      name: '<img src=https://attacker.example/pixel.png>',
      approvedBy: '![x](https://attacker.example/p.png)',
      architectJustifiedOverride: 'a\\|b [link](https://attacker.example)',
    },
    { projectId: 'p-1', runId: 'r-1' },
  );
  expect(out).not.toMatch(/(^|[^\\])<img/);
  expect(out).toContain('\\<img src=https://attacker.example/pixel.png\\>');
  expect(out).not.toMatch(/(^|[^\\])!\[x\]/);
  expect(out).toContain('!\\[x\\](https://attacker.example/p.png)');
  // A backslash in the value cannot cancel the escape of the pipe after it.
  expect(out).toContain('a\\\\\\|b \\[link\\](https://attacker.example)');
});

test('the attestation says its bytes are bound, not only its name', () => {
  const out = generateUserAttestations({}, { projectId: 'p-1', runId: 'r-1' });
  expect(out).not.toContain('The manifest binds its name, so a');
  expect(out).toContain('SHA-256 of these bytes');
  expect(out).toContain('nobody vouches for what it says');
});

test('the provenance file names both signature algorithms', () => {
  const out = generateProvenanceManifest(project({ participation: 'none' }));
  expect(out).not.toContain('The HMAC signature in');
  expect(out).toContain('Ed25519');
});

test('the narrative row follows what the run says about the narrative', () => {
  const none = generateProvenanceManifest(project({ participation: 'none' }));
  expect(none).not.toContain('model-generated — not in this pack');
  expect(none).toContain('AI narrative | none — no narrative was submitted for this run');

  const unattested = generateProvenanceManifest(project({ participation: 'narrative' }));
  expect(unattested).not.toMatch(/AI narrative[^\n]*\| model-generated/);
  expect(unattested).toContain('origin not established');
  expect(unattested).toContain('its SHA-256 is signed with the run');

  const attested = generateProvenanceManifest(project({ participation: 'narrative-attested' }));
  expect(attested).toContain('AI narrative (gemini-test) | model-generated — a receipt for the model call was verified');
});

test('a run without a recorded catalog revision says so, and a recorded one is shown', () => {
  const bare = project({ participation: 'none' });
  for (const out of [generateExecutiveSummary(bare), generateModelCard(bare), generateArchitectureDecisionRecord(bare)]) {
    expect(out).not.toContain('2024.FPS02');
    expect(out).toContain('Not recorded');
  }
  expect(generateModelCard(project({ catalogOnRun: 'REV-FROM-RUN', catalogOnCard: 'REV-FROM-CARD' }))).toContain('| SAP API Catalog | REV-FROM-RUN |');
  expect(generateModelCard(project({ catalogOnCard: 'REV-FROM-CARD' }))).toContain('| SAP API Catalog | REV-FROM-CARD |');
});

test('a run that recorded no model participation does not credit a model in the usage context (QA review of a88149856dcc)', () => {
  const legacy = generateModelCard(project({}));
  expect(legacy).toContain('| Narrative origin | Not recorded |');
  expect(legacy).not.toContain('The model was used for written text');
  expect(legacy).toContain('was not\nrecorded for this run');
  // An attested run still says what the model did.
  expect(generateModelCard(project({ participation: 'narrative-attested' }))).toContain('The model was used for written text');
});
