import { test, expect } from '@playwright/test';
import { receiptFor } from './helpers/test-receipt';

/**
 * The fixture receipt carries the fixture's own verdicts. Without `verdicts`,
 * `receiptFor` used to write `Passed` for every case, so a fixture with a failed
 * case was tested against an all-green receipt (QA full review of fc787674705f,
 * 7e83cba6af12).
 */
test('a fixture with a failed case does not get an all-green receipt', () => {
  const receipt = receiptFor({
    testCases: [
      { id: 't1', status: 'Failed' },
      { id: 't2', status: 'Passed' },
      { id: 't3', status: 'Skipped' },
      { id: 't4' },
    ],
  });
  expect(receipt.verdicts).toEqual([
    { id: 't1', status: 'Failed' },
    { id: 't2', status: 'Passed' },
    { id: 't3', status: 'Skipped' },
    { id: 't4', status: 'Passed' },
  ]);
});

test('explicit verdicts still win over the fixture', () => {
  const receipt = receiptFor({ testCases: [{ id: 't1', status: 'Passed' }] }, [{ id: 't1', status: 'Error' }]);
  expect(receipt.verdicts).toEqual([{ id: 't1', status: 'Error' }]);
});
