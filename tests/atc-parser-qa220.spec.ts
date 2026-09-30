import { test, expect } from '@playwright/test';
import { parseAtc } from '../lib/abap/atc-parser';
import { ATC_PRIVACY_NOTICE } from '../lib/abap/atc-privacy';

/**
 * QA full review of v2.20.0, slice A — the ATC import.
 *
 * db8f3f7452a9: a location that is not one number was read as one by stripping
 * every non-digit — `12-14` became line 1214, `line 12, column 4` line 124.
 * 77f379b926d3: the upload notice promised that no user names are stored, while
 * the message and check title — free text a name can stand in — are kept.
 */

const csv = (body: string) => new File([body], 'atc.csv', { type: 'text/csv' });

test('a line number is read as written, a range or compound location is left unset', async () => {
  const body =
    'OBJECT_NAME;MESSAGE;LINE\n' +
    'Z1;a;412\n' +
    'Z2;b;1.234\n' +
    'Z3;c;12-14\n' +
    'Z4;d;line 12, column 4\n';
  const r = await parseAtc(csv(body));
  const line = (name: string) => r.findings.find((f) => f.objectName === name)?.line;
  expect(line('Z1')).toBe(412);
  expect(line('Z2'), 'a thousands separator is still one number').toBe(1234);
  expect(line('Z3'), 'a range is not line 1214').toBeUndefined();
  expect(line('Z4'), 'line and column are not line 124').toBeUndefined();
});

test('the privacy notice does not promise that no name is stored', () => {
  expect(ATC_PRIVACY_NOTICE).not.toMatch(/No user names are persisted/i);
  expect(ATC_PRIVACY_NOTICE).toMatch(/message/i);
});
