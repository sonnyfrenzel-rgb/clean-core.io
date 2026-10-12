import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditPackSealState, SEAL_CLOCK_SKEW_MS, type AuditPackSealInput } from '../lib/audit-pack-seal';

/**
 * What the Delivery page says about the seal after an audit-pack download,
 * server-free. QA review of 5ec8488a:
 * - 1f314d94f6d1: a failed read was reported as "the run is no longer active".
 * - acb0eb4bfb45: the server's activeRunId was never checked, and any seal for
 *   the run was presented as made by this download, however old.
 * The happy path, rendered against the real route, is tests/delivery-sealed-state.spec.ts.
 */

const RUN = 'run-a';
const STARTED = Date.parse('2026-10-12T10:00:00.000Z');
const AFTER = '2026-10-12T10:00:03.000Z';
const LONG_BEFORE = '2026-10-01T08:00:00.000Z';

const input = (over: Partial<AuditPackSealInput> = {}): AuditPackSealInput => ({
  doc: { activeRunId: RUN, auditMetadata: { auditPackExportedAt: AFTER, auditPackExportedRunId: RUN } },
  readFailed: false,
  displayedRunId: RUN,
  downloadStartedAt: STARTED,
  previousExportedAt: null,
  ...over,
});

test.describe('the audit-pack seal after a download', () => {
  test('a seal for the displayed, still active run written after the download started is this download’s', () => {
    expect(auditPackSealState(input())).toEqual({ kind: 'sealed-now', auditPackExportedAt: AFTER, auditPackExportedRunId: RUN });
  });

  test('1f314d94f6d1: a failed read claims nothing about the run', () => {
    expect(auditPackSealState(input({ doc: null, readFailed: true }))).toEqual({ kind: 'unconfirmed' });
    // Even with a document in hand, a failed read stays unconfirmed.
    expect(auditPackSealState(input({ readFailed: true })).kind).toBe('unconfirmed');
  });

  test('acb0eb4bfb45: the server’s active run must be the displayed run', () => {
    // The seal names the displayed run, but the server has moved on to another run.
    const moved = input({ doc: { activeRunId: 'run-b', auditMetadata: { auditPackExportedAt: AFTER, auditPackExportedRunId: RUN } } });
    expect(auditPackSealState(moved)).toEqual({ kind: 'not-sealed' });
    // No active run on the server at all.
    expect(auditPackSealState(input({ doc: { auditMetadata: { auditPackExportedAt: AFTER, auditPackExportedRunId: RUN } } })).kind).toBe('not-sealed');
    // The page displays no run.
    expect(auditPackSealState(input({ displayedRunId: null })).kind).toBe('not-sealed');
  });

  test('no seal for the displayed run is not sealed', () => {
    expect(auditPackSealState(input({ doc: { activeRunId: RUN } })).kind).toBe('not-sealed');
    expect(auditPackSealState(input({ doc: null })).kind).toBe('not-sealed');
    expect(auditPackSealState(input({ doc: { activeRunId: RUN, auditMetadata: { auditPackExportedAt: AFTER, auditPackExportedRunId: 'run-old' } } })).kind).toBe('not-sealed');
    expect(auditPackSealState(input({ doc: { activeRunId: RUN, auditMetadata: { auditPackExportedAt: 'not a date', auditPackExportedRunId: RUN } } })).kind).toBe('not-sealed');
  });

  test('acb0eb4bfb45: a seal older than the download is an earlier seal, not this download’s', () => {
    const old = input({ doc: { activeRunId: RUN, auditMetadata: { auditPackExportedAt: LONG_BEFORE, auditPackExportedRunId: RUN } } });
    expect(auditPackSealState(old)).toEqual({ kind: 'sealed-earlier', auditPackExportedAt: LONG_BEFORE, auditPackExportedRunId: RUN });
    // The seal the page already showed is never this download's, whatever its time.
    expect(auditPackSealState(input({ previousExportedAt: AFTER })).kind).toBe('sealed-earlier');
  });

  test('server and browser clocks may differ by a little, not by more', () => {
    const at = (ms: number) => input({ doc: { activeRunId: RUN, auditMetadata: { auditPackExportedAt: new Date(ms).toISOString(), auditPackExportedRunId: RUN } } });
    expect(auditPackSealState(at(STARTED - SEAL_CLOCK_SKEW_MS)).kind).toBe('sealed-now');
    expect(auditPackSealState(at(STARTED - SEAL_CLOCK_SKEW_MS - 1)).kind).toBe('sealed-earlier');
  });

  test('the page decides through the helper and says each state its own way', () => {
    const src = readFileSync(join(process.cwd(), 'app/(app)/project/[projectId]/delivery/page.tsx'), 'utf8');
    const reader = src.slice(src.indexOf('async function readSeal'), src.indexOf('export default function DeliveryPage'));
    expect(reader).toContain('auditPackSealState(');
    expect(reader).toMatch(/catch[\s\S]*readFailed: true/);
    const download = src.slice(src.indexOf('const downloadAuditPack'), src.indexOf('if (loading ||'));
    expect(download).toContain('downloadStartedAt');
    expect(download).toContain("seal.kind === 'sealed-now' ? 'Audit pack downloaded and sealed'");
    expect(src).toContain("sealNotice?.kind === 'not-sealed'");
    expect(src).toContain("sealNotice?.kind === 'unconfirmed'");
    expect(src).toContain("sealNotice?.kind === 'sealed-earlier'");
    // The inactive-run explanation is only ever behind the confirmed not-sealed state.
    const missing = src.slice(src.indexOf("sealNotice?.kind === 'not-sealed'"), src.indexOf("sealNotice?.kind === 'unconfirmed'"));
    expect(missing).toContain('and it no longer is');
    expect(src.split('and it no longer is').length).toBe(2);
  });
});
