import path from 'path';
import { test } from '@playwright/test';

/**
 * The owner's reference programs (SD, PM holdout, CO, PP, FI, the order cockpit) are not in the public repository,
 * so a spec that measures one skips where it is missing — every CI run, and every other machine. A release run on
 * the machine that holds them sets `CC_REQUIRE_REFERENCES=1`: then a missing reference fails the spec instead of
 * skipping it, and "every reference program ran" cannot pass by skipping (QA 11887703ef15, e04ec7985240,
 * 3eb47be7756d, 8030cdc83b81).
 */
export const REFERENCES_REQUIRED_ENV = 'CC_REQUIRE_REFERENCES';

/**
 * Where the owner's reference programs are read from — only when `CC_OWNER_SOURCES` names the folder. Without it
 * the path names a folder that does not exist, so every spec that measures a reference program skips (or fails
 * under `CC_REQUIRE_REFERENCES=1`). The owner's machine keeps them in a synced personal folder; a spec run by an
 * agent, or on any other machine, never reads it by default.
 */
export const OWNER_SOURCES_ENV = 'CC_OWNER_SOURCES';
export const OWNER_SOURCES: string = process.env[OWNER_SOURCES_ENV]?.trim() || path.join(__dirname, '..', '..', '.owner-sources-not-set');

export function skipWithoutReference(missing: boolean, reason: string): void {
  if (missing && process.env[REFERENCES_REQUIRED_ENV] === '1') {
    throw new Error(`${reason} — and ${REFERENCES_REQUIRED_ENV}=1 says this run must have it.`);
  }
  test.skip(missing, reason);
}
