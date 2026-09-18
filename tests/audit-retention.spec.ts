import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  RETENTION_MONTHS,
  cutoffFrom,
  readEventTime,
  selectExpired,
  type DatedEvent,
} from '../scripts/purge-audit-events';

/**
 * The retention period for `audit_events`, and the two ways a purge can be
 * worse than no purge at all.
 *
 * `docs/DATA-RETENTION.md` now promises 24 months rather than "retained", which
 * is what Art. 13(2)(a) asks for — and a stated period is a promise that can be
 * broken in both directions. Deleting a record that is still inside the period
 * destroys the only account of a privileged action. Keeping one that is past it
 * makes the privacy notice untrue.
 *
 * What is tested is the decision, not the deletion: which ids are old enough,
 * given a clock. The I/O around it is a thin shell, and the two properties that
 * shell has to keep — a backup before the first delete, and a log that can name
 * no person — are checked against its source below. Nothing here touches a
 * database, production or otherwise.
 */

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'purge-audit-events.ts');
const source = fs.readFileSync(SCRIPT, 'utf8');

/** The shape every writer in the tree produces: `timestamp: new Date()` through
 *  the Admin SDK, which reads back as a Firestore Timestamp. */
const firestoreTimestamp = (iso: string) => ({
  toDate: () => new Date(iso),
  toMillis: () => Date.parse(iso),
});

const event = (id: string, timestamp: unknown): DatedEvent => ({ id, timestamp });

test.describe('the period is the one that was decided', () => {
  test('the default is 24 months', () => {
    expect(
      RETENTION_MONTHS,
      'the period in the script no longer matches the owner decision of 18.09.2026 ' +
        'or the privacy notice, which both say 24 months',
    ).toBe(24);
  });

  test('the documented period and the script agree', () => {
    const policy = fs.readFileSync(path.join(ROOT, 'docs', 'DATA-RETENTION.md'), 'utf8');
    const row = policy.split('\n').find((line) => line.includes('`audit_events/{id}`')) ?? '';
    expect(row, 'the audit_events row is gone from the collection registry').toContain('audit_events');
    expect(row, `the registry row states no period: ${row}`).toContain(`${RETENTION_MONTHS} months`);
    expect(
      policy,
      'the policy no longer names the script that keeps the promise',
    ).toContain('scripts/purge-audit-events.ts');
    expect(
      policy,
      'the dated obligation to automate the purge before the first records expire is gone',
    ).toContain('2028');
  });

  test('two years back from a day is that day two years earlier', () => {
    expect(cutoffFrom(new Date('2028-09-18T11:00:00.000Z'), 24).toISOString()).toBe(
      '2026-09-18T11:00:00.000Z',
    );
  });

  test('a month shorter than the one we are in does not reach into the next one', () => {
    // 31 March minus one month is 28 February, not 3 March. Naive month
    // arithmetic overshoots and deletes three days more than it promised.
    expect(cutoffFrom(new Date('2027-03-31T00:00:00.000Z'), 1).toISOString()).toBe(
      '2027-02-28T00:00:00.000Z',
    );
    // A leap day a year back is the 28th, and a year further back than that is
    // still the 28th — never the 1st of March.
    expect(cutoffFrom(new Date('2028-02-29T00:00:00.000Z'), 12).toISOString()).toBe(
      '2027-02-28T00:00:00.000Z',
    );
  });
});

test.describe('the selection keeps what it has to keep', () => {
  const cutoff = cutoffFrom(new Date('2028-09-18T12:00:00.000Z'), RETENTION_MONTHS);

  test('a record older than the period goes and a younger one stays', () => {
    const verdict = selectExpired(
      [
        event('older', firestoreTimestamp('2026-09-17T12:00:00.000Z')),
        event('younger', firestoreTimestamp('2026-09-19T12:00:00.000Z')),
      ],
      cutoff,
    );
    expect(verdict.expired).toEqual(['older']);
    expect(verdict.kept).toBe(1);
  });

  test('a record sitting exactly on the boundary is kept', () => {
    // It has been held for the period and not longer. One extra day of
    // retention can be corrected by the next run; a deletion cannot.
    const verdict = selectExpired([event('boundary', cutoff)], cutoff);
    expect(verdict.expired).toEqual([]);
    expect(verdict.kept).toBe(1);
  });

  test('nothing from 2026 expires before 2028', () => {
    // The reason this is a script somebody runs and not a scheduled job: run it
    // today and it deletes nothing, because nothing can be old enough yet.
    const today = cutoffFrom(new Date('2026-09-18T12:00:00.000Z'), RETENTION_MONTHS);
    const verdict = selectExpired(
      [
        event('first-ever', firestoreTimestamp('2026-01-04T08:00:00.000Z')),
        event('yesterday', firestoreTimestamp('2026-09-17T08:00:00.000Z')),
      ],
      today,
    );
    expect(verdict.expired, 'a record from 2026 was selected in 2026').toEqual([]);
    expect(verdict.kept).toBe(2);
  });
});

test.describe('a record that cannot be dated is never deleted', () => {
  const cutoff = cutoffFrom(new Date('2028-09-18T12:00:00.000Z'), RETENTION_MONTHS);

  test('every shape the collection can hold is read as the same instant', () => {
    const iso = '2026-09-18T11:22:33.000Z';
    for (const [name, value] of [
      ['Firestore Timestamp', firestoreTimestamp(iso)],
      ['Date', new Date(iso)],
      ['ISO string', iso],
      ['the JSON form of a Timestamp', { _seconds: Date.parse(iso) / 1000, _nanoseconds: 0 }],
      ['the plain form of a Timestamp', { seconds: Date.parse(iso) / 1000, nanoseconds: 0 }],
    ] as Array<[string, unknown]>) {
      const read = readEventTime(value);
      expect(read, `${name} was not readable as a time`).not.toBeNull();
      expect(read!.toISOString(), `${name} was read as a different instant`).toBe(iso);
    }
  });

  test('missing, unreadable and ambiguous values are reported instead of purged', () => {
    // A bare number is ambiguous: seconds read as milliseconds land in January
    // 1970, which makes an unreadable value look like the oldest record in the
    // collection and puts it first in the queue to be deleted.
    const verdict = selectExpired(
      [
        event('no-field', undefined),
        event('null-field', null),
        event('garbage', 'not a date'),
        event('empty-object', {}),
        event('bare-number', 1758194553),
        event('thrower', {
          toDate: () => {
            throw new Error('corrupt');
          },
        }),
      ],
      cutoff,
    );
    expect(verdict.expired, 'a record nobody can date was selected for deletion').toEqual([]);
    expect(verdict.undated.sort()).toEqual(
      ['bare-number', 'empty-object', 'garbage', 'no-field', 'null-field', 'thrower'].sort(),
    );
    expect(verdict.kept).toBe(0);
  });
});

test.describe('the purge cannot leak an identity and cannot delete without a backup', () => {
  /**
   * Every record in this collection names the administrator who acted and the
   * account acted on. The survey scripts put addresses into the Actions log of a
   * public repository on 15.09.2026; a purge that prints what it is deleting
   * would do the same thing with the security journal.
   *
   * The defence is structural rather than a habit: the selection is handed ids
   * and timestamps, so the values the report is built from contain no address.
   * These two checks are what stops that being undone by someone adding "just
   * the action" to a log line.
   */

  test('the selection is handed ids and timestamps, never records', () => {
    const shape = source.slice(source.indexOf('export interface DatedEvent'), source.indexOf('export interface Selection'));
    expect(shape).toContain('readonly id: string');
    expect(shape).toContain('readonly timestamp: unknown');
    for (const field of ['actorEmail', 'targetEmail', 'actorUid', 'targetUid']) {
      expect(shape, `DatedEvent carries ${field}, which the report then has to be trusted not to print`).not.toContain(field);
    }
  });

  test('no line printed to the log mentions an actor or an address', () => {
    const printed = source.split('\n').filter((line) => /console\.(log|error)\(/.test(line));
    expect(printed.length, 'the script prints nothing at all').toBeGreaterThan(5);
    for (const line of printed) {
      expect(line, `a log line reaches for an identity:\n${line}`).not.toMatch(
        /email|actor|targetUid|\.data\(\)|record\.data/i,
      );
    }
  });

  test('the backup is written before the first delete', () => {
    const backupWrite = source.indexOf('fs.writeFileSync(');
    const firstDelete = source.indexOf('batch.delete(');
    expect(backupWrite, 'the script no longer writes a backup').toBeGreaterThan(-1);
    expect(firstDelete, 'the script no longer deletes anything').toBeGreaterThan(-1);
    expect(
      backupWrite,
      'the delete runs before the backup — the records are gone with no copy of them',
    ).toBeLessThan(firstDelete);
  });

  test('a dry run is the default and --apply is the only thing that deletes', () => {
    expect(source).toContain("process.argv.includes('--apply')");
    expect(source, 'a dry run no longer says so').toContain('DRY RUN');
    // The delete sits behind the early return that a run without --apply takes.
    expect(source.indexOf('DRY RUN')).toBeLessThan(source.indexOf('batch.delete('));
  });

  test('an empty backup file stops the delete', () => {
    const guard = source.slice(source.indexOf('if (!apply)'), source.indexOf('batch.delete('));
    expect(guard, 'nothing reads the backup back before the records are gone').toContain('statSync');
  });
});
