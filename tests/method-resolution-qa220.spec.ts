/**
 * A declared reference type is not the runtime dispatch target.
 *
 * QA full review of v2.20.0 (fc787674705f), 5b0e06b9c4ea.
 *
 * Serverless: a pure function over a hand-built class model.
 */
import { test, expect } from '@playwright/test';
import { resolveMethodTarget, type ClassModel, type MethodTarget } from '../lib/abap/method-resolution';

const impl = (cls: string, name: string): MethodTarget => ({ key: `${cls}=>${name}`, cls, name, short: name });

const model = (withOverride: boolean): ClassModel => ({
  impls: [impl('LCL_BASE', 'RUN'), ...(withOverride ? [impl('LCL_SUB', 'RUN')] : [])],
  superOf: new Map([['LCL_SUB', 'LCL_BASE']]),
  refTypes: new Map([['LO', new Set(['LCL_BASE'])]]),
});

test('5b0e06b9c4ea — lo->run( ) with an override in a subclass is not attributed to the base', () => {
  const r = resolveMethodTarget(model(true), 'lo', '->', 'run', null, { byNameAlone: false });
  expect(r.key).toBeNull();
  expect(r.ambiguous).toBe(true);
});

test('5b0e06b9c4ea — without an override the declared class still resolves', () => {
  const r = resolveMethodTarget(model(false), 'lo', '->', 'run', null, { byNameAlone: false });
  expect(r.key).toBe('LCL_BASE=>RUN');
  expect(r.ambiguous).toBe(false);
});

test('5b0e06b9c4ea — a static call names its class and stays resolved', () => {
  const r = resolveMethodTarget(model(true), 'lcl_base', '=>', 'run', null, { byNameAlone: false });
  expect(r.key).toBe('LCL_BASE=>RUN');
});
