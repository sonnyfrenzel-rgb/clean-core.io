#!/usr/bin/env node
/**
 * The audit's scope, decided before any model key is in reach (.github/workflows/security-audit.yml, job `scope`).
 *
 *   SECURITY_AUDIT_BASE=<sha> node scripts/security/scope.mjs
 *
 * The base is the release whose audit last succeeded on `main`; the workflow looks it up. Prints `mode=…`,
 * `base=…` and `files=…` lines for $GITHUB_OUTPUT: `full` without a usable base, `delta` when files in the audit
 * scope changed since it, `unchanged` when nothing did (lib/surface.mjs auditScope). Paths are not printed.
 */
import { auditScope, changedSince, deletedSince, inventory } from './lib/surface.mjs';

const base = process.env.SECURITY_AUDIT_BASE || null;
const changed = base ? changedSince(base) : null;
const scope = auditScope({ list: inventory(), base: changed ? base : null, changed, deleted: changed ? deletedSince(base) : [] });
console.log(`mode=${scope.mode}`);
console.log(`base=${scope.base || ''}`);
console.log(`files=${scope.files.length}`);
console.log(`deleted=${scope.deleted.length}`);
