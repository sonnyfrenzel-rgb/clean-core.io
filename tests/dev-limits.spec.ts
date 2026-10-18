import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { devLimitsLifted } from '../lib/dev-limits';

// The owner's dev-only switch (18.10.2026): the hourly limits are lifted on the dev service and nowhere else.
const DEV = { CC_DEV_LIMITS_OFF: 'true', K_SERVICE: 'clean-core-dev', NEXT_PUBLIC_FIRESTORE_DB_ID: 'ai-studio-030e1ee1-7e1d-4208-beda-28735bc1a360' };

test('the switch holds on the dev service', () => {
  expect(devLimitsLifted(DEV)).toBe(true);
});

test('the production service ignores the switch, by its name and by its database', () => {
  expect(devLimitsLifted({ ...DEV, K_SERVICE: 'clean-core' })).toBe(false);
  expect(devLimitsLifted({ ...DEV, NEXT_PUBLIC_FIRESTORE_DB_ID: 'clean-core-eu' })).toBe(false);
});

test('without the variable, outside Cloud Run, or with any other value, nothing is lifted', () => {
  expect(devLimitsLifted({ ...DEV, CC_DEV_LIMITS_OFF: undefined })).toBe(false);
  expect(devLimitsLifted({ ...DEV, CC_DEV_LIMITS_OFF: '1' })).toBe(false);
  expect(devLimitsLifted({ ...DEV, K_SERVICE: undefined })).toBe(false);
  expect(devLimitsLifted({})).toBe(false);
});

test('the pipeline sets the switch for dev only', () => {
  const yml = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'deploy.yml'), 'utf8');
  // The environment switch of the deploy job: the case that names each service.
  const at = yml.indexOf('echo "service=clean-core" >> "$GITHUB_OUTPUT"');
  const main = yml.slice(at, yml.indexOf('            release)', at));
  const devAt = yml.indexOf('echo "service=clean-core-dev" >> "$GITHUB_OUTPUT"');
  const dev = yml.slice(devAt, yml.indexOf(';;', devAt));
  expect(main).toContain('echo "dev_limits_off=" >> "$GITHUB_OUTPUT"');
  expect(dev).toContain('echo "dev_limits_off=true" >> "$GITHUB_OUTPUT"');
  expect(yml).toContain('CC_DEV_LIMITS_OFF=${{ steps.env-ctx.outputs.dev_limits_off }}');
  // Each key exactly once (QA review of 757d83cb0752: a doubled entry in the env map can fail the deploy).
  expect(yml.split('CC_DEV_LIMITS_OFF=').length - 1).toBe(1);
  expect(main.split('dev_limits_off=').length - 1).toBe(1);
  expect(dev.split('dev_limits_off=').length - 1).toBe(1);
});
