import { test, expect } from '@playwright/test';
import {
  RETRY_WAIT_MS,
  fillOrder,
  modelErrorKind,
  runGeneration,
  type OrchestratorInput,
  type Verify,
  type VerifyOutcome,
} from '../lib/transformation/orchestrator';
import type { FillRequest, FillRequestUnit, GenerationEvent } from '../lib/transformation/types';
import { FILL_PROMPT_MAX_CHARS, LEASED_PROMPT_MAX_CHARS } from '../lib/transformation/fill-prompt';
import {
  GENERATION_REPAIR_MAX_ROUNDS,
  decideGenerationRepair,
  failureSignature,
} from '../lib/repair-draft';

/**
 * The orchestrator of the fills (design §8.3, §13.2, §16.1; Track C) against a
 * fake model and a fake clock. No network, no model, no server.
 */

const unit = (n: number): FillRequestUnit => {
  const id = `U${String(n).padStart(2, '0')}`;
  return {
    unitId: id,
    function: { name: `step${n}`, file: `srv/steps/${id}.ts`, signature: `export function step${n}(): void`, returns: 'void' },
    abap: { ranges: [{ lineStart: n * 10, lineEnd: n * 10 + 5, routine: `R${n}` }], text: `${n * 10} FORM r${n}.` },
    rules: [{ id: `BR-${String(n).padStart(3, '0')}`, decision: 'keep', text: 'rule' }],
    guards: [],
    facts: { decimals: [] },
    available: { helpers: [], callees: [] },
  };
};
const units = (count: number) => Array.from({ length: count }, (_, i) => unit(i + 1));

const requestOf = (prompt: string): FillRequest => JSON.parse(prompt.slice(prompt.indexOf('REQUEST (JSON):\n') + 'REQUEST (JSON):\n'.length));
const answer = (prompt: string, body = (id: string) => `return '${id}';`) =>
  JSON.stringify({ units: requestOf(prompt).units.map((u) => ({ unitId: u.unitId, body: body(u.unitId), needs: [], refused: null })) });

const passing: Verify = async () => ({ checks: [{ kind: 'lint', total: 0, failed: 0, ms: 1 }], failures: [], notRun: [] });

function base(over: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    units: units(3),
    bundleOptions: { track: 'node', program: 'ZTEST', context: 'Route: side-by-side.' },
    model: async (prompt) => answer(prompt),
    guardBody: () => null,
    verify: passing,
    budget: 48,
    sleep: async () => {},
    now: () => 0,
    ...over,
  };
}

class ModelError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

test.describe('order and the in-flight cap', () => {
  test('leaves first, the orchestrator last; mutual calls keep the given order', () => {
    const order = fillOrder([
      { id: 'U01', kind: 'orchestrator', callees: ['U02', 'U03'] },
      { id: 'U02', kind: 'routine', callees: ['U04'] },
      { id: 'U03', kind: 'routine', callees: ['U03'] },
      { id: 'U04', kind: 'routine', callees: [] },
      { id: 'U05', kind: 'routine', callees: ['U06'] },
      { id: 'U06', kind: 'routine', callees: ['U05'] },
    ]);
    expect(order).toEqual(['U04', 'U02', 'U03', 'U06', 'U05', 'U01']);
  });

  test('never more than 4 calls in flight, and the cap is reached when there is work for it', async () => {
    let now = 0;
    let peak = 0;
    const result = await runGeneration(
      base({
        units: units(28), // 7 bundles of 4
        model: async (prompt) => {
          now++;
          peak = Math.max(peak, now);
          await new Promise((r) => setTimeout(r, 15));
          now--;
          return answer(prompt);
        },
        maxInFlight: 9, // asked for more: the cap holds anyway
      }),
    );
    expect(peak).toBe(4);
    expect(result.maxInFlightSeen).toBe(4);
    expect(result.callsUsed).toBe(7);
    expect(result.status).toBe('complete');
    expect(result.units.every((u) => u.state === 'written' && u.filledBy === 'model')).toBe(true);
  });
});

test.describe('retries and partial results', () => {
  test('a 429 waits 4 s and a transient error 2 s, and the same call is asked once more', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await runGeneration(
      base({
        units: units(8), // two bundles
        model: async (prompt) => {
          calls++;
          // Bundle 1: a 429, then the answer. Bundle 2: a 503, then the answer.
          if (calls === 1) throw new ModelError('Too many requests.', 429);
          if (calls === 3) throw new ModelError('503 UNAVAILABLE', 503);
          return answer(prompt);
        },
        sleep: async (ms) => {
          waits.push(ms);
        },
        maxInFlight: 1,
      }),
    );
    expect(waits).toEqual([RETRY_WAIT_MS.rateLimited, RETRY_WAIT_MS.transient]);
    expect(result.status).toBe('complete');
    expect(result.callsUsed).toBe(4);
  });

  test('a second failure of the same call is not retried again: its units are asked once more, alone', async () => {
    const waits: number[] = [];
    const sizes: number[] = [];
    let calls = 0;
    const result = await runGeneration(
      base({
        units: units(2),
        model: async (prompt) => {
          calls++;
          sizes.push(requestOf(prompt).units.length);
          if (calls <= 2) throw new ModelError('503 UNAVAILABLE', 503);
          return answer(prompt);
        },
        sleep: async (ms) => {
          waits.push(ms);
        },
        maxInFlight: 1,
      }),
    );
    expect(waits).toEqual([RETRY_WAIT_MS.transient]);
    expect(sizes).toEqual([2, 2, 1, 1]);
    expect(result.status).toBe('complete');
  });

  test('an unusable answer is asked once more, alone; unusable twice keeps the stub with the reason', async () => {
    const seen: string[][] = [];
    const result = await runGeneration(
      base({
        units: units(3),
        model: async (prompt) => {
          const ids = requestOf(prompt).units.map((u) => u.unitId);
          seen.push(ids);
          if (ids.length === 3) {
            // U02 missing from the answer, U03 answered with an empty body.
            return JSON.stringify({ units: [{ unitId: 'U01', body: 'return 1;' }, { unitId: 'U03', body: '' }] });
          }
          if (ids[0] === 'U02') return JSON.stringify({ units: [{ unitId: 'U02', body: 'return 2;' }] });
          return 'not json at all';
        },
      }),
    );
    expect(seen).toEqual([['U01', 'U02', 'U03'], ['U02'], ['U03']]);
    const byId = Object.fromEntries(result.units.map((u) => [u.unitId, u]));
    expect(byId.U01.state).toBe('written');
    expect(byId.U02.state).toBe('written');
    expect(byId.U03.state).toBe('not-written');
    expect(byId.U03.filledBy).toBe('not-filled');
    expect(byId.U03.reason).toMatch(/^not written — the answer was unusable twice/);
    expect(result.status).toBe('partial');
  });

  test('a unit the model declines stays a stub with the model\'s reason, and is not asked again', async () => {
    let calls = 0;
    const result = await runGeneration(
      base({
        model: async (prompt) => {
          calls++;
          const req = requestOf(prompt);
          return JSON.stringify({
            units: req.units.map((u) =>
              u.unitId === 'U02' ? { unitId: 'U02', body: '', refused: { reason: 'The slice calls a BAPI the design drops.' } } : { unitId: u.unitId, body: 'return 0;' },
            ),
          });
        },
      }),
    );
    expect(calls).toBe(1);
    const u2 = result.units.find((u) => u.unitId === 'U02')!;
    expect(u2).toMatchObject({ state: 'not-written', body: null, filledBy: 'not-filled', reason: 'the model declined: The slice calls a BAPI the design drops.' });
    expect(result.status).toBe('partial');
  });

  test('a refused lease stops the generation: no further call, the rest stays stubs, what was written stays', async () => {
    let calls = 0;
    const result = await runGeneration(
      base({
        units: units(12), // three bundles
        maxInFlight: 1,
        model: async (prompt) => {
          calls++;
          if (calls === 2) throw new ModelError('This generation has used all 48 model calls of its lease.', 429, 'lease-exhausted');
          return answer(prompt);
        },
      }),
    );
    expect(calls).toBe(2);
    expect(result.stop).toBe('lease');
    expect(result.units.filter((u) => u.state === 'written').map((u) => u.unitId)).toEqual(['U01', 'U02', 'U03', 'U04']);
    const missing = result.units.filter((u) => u.state === 'not-written');
    expect(missing).toHaveLength(8);
    expect(missing.every((u) => /lease/.test(u.reason ?? ''))).toBe(true);
    expect(result.status).toBe('partial');
  });

  test('the budget is a hard ceiling on calls, retries included', async () => {
    let calls = 0;
    const result = await runGeneration(
      base({
        units: units(12),
        maxInFlight: 1,
        budget: 2,
        model: async (prompt) => {
          calls++;
          return answer(prompt);
        },
      }),
    );
    expect(calls).toBe(2);
    expect(result.callsUsed).toBe(2);
    const missing = result.units.filter((u) => u.state === 'not-written');
    expect(missing).toHaveLength(4);
    expect(missing[0].reason).toMatch(/model calls are used up/);
    expect(result.stop).toBe('budget');
  });

  test('error kinds: lease codes stop, 429 and transient errors retry, an abort is an abort', () => {
    expect(modelErrorKind(new ModelError('x', 403, 'lease-expired'))).toBe('lease');
    expect(modelErrorKind(new ModelError('x', 429, 'lease-exhausted'))).toBe('lease');
    expect(modelErrorKind(new ModelError('x', 429, 'lease-busy'))).toBe('retry-rate');
    expect(modelErrorKind(new ModelError('Rate limit exceeded', 429))).toBe('retry-rate');
    expect(modelErrorKind(new ModelError('x', 503))).toBe('retry-transient');
    expect(modelErrorKind(new ModelError('switched off', 403, 'stage-disabled'))).toBe('fatal');
    expect(modelErrorKind(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe('aborted');
  });
});

test.describe('cancellation really aborts', () => {
  test('the calls in flight see their signal abort, no call starts after, nothing is reported as written', async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    let started = 0;
    const events: GenerationEvent[] = [];
    const run = runGeneration(
      base({
        units: units(24), // six bundles, four in flight
        signal: controller.signal,
        onEvent: (e) => events.push(e),
        model: (prompt, signal) => {
          started++;
          signals.push(signal);
          return new Promise<string>((resolve, reject) => {
            const t = setTimeout(() => resolve(answer(prompt)), 5_000);
            signal.addEventListener('abort', () => {
              clearTimeout(t);
              reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
            });
          });
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(started).toBe(4);
    controller.abort();
    const result = await run;
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(started).toBe(4);
    expect(result.status).toBe('cancelled');
    expect(result.stop).toBe('cancelled');
    expect(result.units.every((u) => u.state === 'not-written')).toBe(true);
    expect(events[events.length - 1]).toMatchObject({ t: 'failed' });
  });
});

test.describe('repair rounds and their stop rules (§13.2)', () => {
  const failingOnce = (unitId: string): Verify => {
    let round = 0;
    return async () => {
      round++;
      return round === 1
        ? { checks: [{ kind: 'cases', total: 5, failed: 1, ms: 1 }], failures: [{ unitId, check: 'cases', failure: 'TC_ENG_03 (BR-002) failed' }], notRun: [] }
        : { checks: [{ kind: 'cases', total: 5, failed: 0, ms: 1 }], failures: [], notRun: [] };
    };
  };

  test('only the failing function goes back, with its failure and previous body, and is marked repaired', async () => {
    const prompts: string[] = [];
    const result = await runGeneration(
      base({
        verify: failingOnce('U02'),
        model: async (prompt) => {
          prompts.push(prompt);
          return answer(prompt, (id) => (requestOf(prompt).repair ? `return 'fixed ${id}';` : `return '${id}';`));
        },
      }),
    );
    expect(prompts).toHaveLength(2);
    const repair = requestOf(prompts[1]);
    expect(repair.units.map((u) => u.unitId)).toEqual(['U02']);
    expect(repair.repair).toEqual([{ unitId: 'U02', round: 1, failure: 'cases: TC_ENG_03 (BR-002) failed', previousBody: "return 'U02';" }]);
    const u2 = result.units.find((u) => u.unitId === 'U02')!;
    expect(u2).toMatchObject({ state: 'written', filledBy: 'model-repair-1', body: "return 'fixed U02';", failures: [] });
    expect(result).toMatchObject({ status: 'complete', stop: 'passed', rounds: 1 });
  });

  test('a round that fixes nothing stops the loop (the same failures twice); the failing body is kept', async () => {
    const verify: Verify = async () => ({ checks: [], failures: [{ unitId: 'U01', check: 'lint', failure: 'binary decimals at L4' }], notRun: [] });
    let calls = 0;
    const result = await runGeneration(base({ verify, model: async (p) => (calls++, answer(p)) }));
    expect(result.stop).toBe('no-progress');
    expect(result.rounds).toBe(1);
    expect(calls).toBe(2);
    const u1 = result.units.find((u) => u.unitId === 'U01')!;
    expect(u1.state).toBe('written');
    expect(u1.failures).toEqual(['lint: binary decimals at L4']);
    expect(result.status).toBe('partial');
  });

  test('at most two rounds', async () => {
    let n = 0;
    const verify: Verify = async () => ({ checks: [], failures: [{ unitId: 'U03', check: 'probes', failure: `probe failed, attempt ${++n}` }], notRun: [] });
    const result = await runGeneration(base({ verify }));
    expect(result.stop).toBe('round-limit');
    expect(result.rounds).toBe(GENERATION_REPAIR_MAX_ROUNDS);
    expect(result.units.find((u) => u.unitId === 'U03')!.filledBy).toBe('model-repair-2');
  });

  test('a failure in engine-written code is a scaffold finding and never goes to the model', async () => {
    const verify: Verify = async () => ({ checks: [], failures: [{ unitId: null, check: 'probes', failure: 'probe csv-escaping failed' }], notRun: [] });
    let calls = 0;
    const result = await runGeneration(base({ verify, model: async (p) => (calls++, answer(p)) }));
    expect(calls).toBe(1);
    expect(result.scaffoldFindings).toEqual(['probes: probe csv-escaping failed']);
    expect(result.stop).toBe('passed');
    expect(result.status).toBe('partial');
  });

  test('a body the guards refuse is never spliced: it goes to repair with the reason, and the stub stays if the repair is refused too', async () => {
    const bodies: Array<ReadonlyMap<string, string>> = [];
    const verify: Verify = async (b) => {
      bodies.push(b);
      return { checks: [], failures: [], notRun: [] };
    };
    const result = await runGeneration(
      base({
        units: units(2),
        verify,
        guardBody: (id, body) => (id === 'U02' && body.includes('parseFloat') ? 'uses parseFloat( on a decimal value' : null),
        model: async (p) => answer(p, () => 'return parseFloat(x);'),
      }),
    );
    // U01 has no guard rule and is written; U02 was refused twice (fill, round 1) and keeps its stub.
    expect(bodies.every((b) => !b.has('U02'))).toBe(true);
    const u2 = result.units.find((u) => u.unitId === 'U02')!;
    expect(u2).toMatchObject({ state: 'not-written', body: null });
    expect(u2.reason).toContain('uses parseFloat( on a decimal value');
    expect(['no-progress', 'round-limit']).toContain(result.stop);
  });

  test('checks that could not run are reported, not counted as passed', async () => {
    const verify: Verify = async () => {
      throw new Error('runner unreachable');
    };
    const result = await runGeneration(base({ verify }));
    expect(result.checksNotRun.map((n) => n.kind)).toEqual(['lint', 'cases', 'probes']);
    expect(result.checksNotRun[0].reason).toContain('runner unreachable');
  });

  test('the decision itself: passed, no progress, lease, budget, round limit — in that order', () => {
    const failing = [{ unitId: 'U01', failures: ['lint: x'] }];
    const sig = failureSignature(failing);
    const d = (o: Partial<Parameters<typeof decideGenerationRepair>[0]>) =>
      decideGenerationRepair({ roundsDone: 0, failing, previousSignature: null, callsLeft: 10, leaseEnded: false, ...o });
    expect(d({ failing: [] })).toMatchObject({ kind: 'stop', reason: 'passed' });
    expect(d({ previousSignature: sig, roundsDone: 1 })).toMatchObject({ kind: 'stop', reason: 'no-progress' });
    expect(d({ leaseEnded: true })).toMatchObject({ kind: 'stop', reason: 'lease' });
    expect(d({ callsLeft: 0 })).toMatchObject({ kind: 'stop', reason: 'budget' });
    expect(d({ roundsDone: 2, previousSignature: 'other' })).toMatchObject({ kind: 'stop', reason: 'round-limit' });
    const go = d({});
    expect(go).toMatchObject({ kind: 'repair', round: 1, units: [{ unitId: 'U01', failure: 'lint: x' }] });
    const long = d({ failing: [{ unitId: 'U01', failures: ['y'.repeat(5000)] }] });
    expect(long.kind === 'repair' && long.units[0].failure.length).toBe(2000);
    // Order of failures does not make a different signature.
    expect(failureSignature([{ unitId: 'U01', failures: ['b', 'a'] }])).toBe(failureSignature([{ unitId: 'U01', failures: ['a', 'b'] }]));
  });
});

test.describe('events', () => {
  test('in order: writing before written, the guard check, the checks, repair start and done', async () => {
    const events: GenerationEvent[] = [];
    let round = 0;
    const verify: Verify = async (): Promise<VerifyOutcome> => {
      round++;
      return {
        checks: [{ kind: 'lint', total: 2, failed: round === 1 ? 1 : 0, ms: 3 }],
        failures: round === 1 ? [{ unitId: 'U01', check: 'lint', failure: 'x' }] : [],
        notRun: [],
      };
    };
    await runGeneration(base({ units: units(1), verify, onEvent: (e) => events.push(e) }));
    expect(events.map((e) => (e.t === 'fill' ? `fill:${e.state}` : e.t === 'check' ? `check:${e.kind}` : e.t === 'repair' ? `repair:${e.state}` : e.t))).toEqual([
      'fill:writing',
      'fill:written',
      'check:guards',
      'check:lint',
      'repair:start',
      'fill:writing',
      'fill:written',
      'repair:done',
      'check:lint',
    ]);
  });
});

test.describe('a prompt the route would refuse is never sent (QA finding 804d0920fff4)', () => {
  test('a unit whose prompt stays above the leased cap after every cut is not written, with the reason, and costs no call', async () => {
    // Rules are never cut, so this unit's prompt stays above 28,000 characters.
    const huge: FillRequestUnit = { ...unit(2), rules: [{ id: 'BR-002', decision: 'keep', text: 'r'.repeat(LEASED_PROMPT_MAX_CHARS + 1_000) }] };
    const sent: string[] = [];
    const result = await runGeneration(
      base({
        units: [unit(1), huge, unit(3)],
        model: async (prompt) => {
          sent.push(prompt);
          return answer(prompt);
        },
      }),
    );
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((p) => p.length <= LEASED_PROMPT_MAX_CHARS)).toBe(true);
    expect(sent.some((p) => p.includes('"U02"'))).toBe(false);
    const u02 = result.units.find((u) => u.unitId === 'U02')!;
    expect(u02.state).toBe('not-written');
    expect(u02.reason).toMatch(/^not written — its prompt has [\d,]+ characters, more than the 28,000 a fill call may carry$/);
    expect(result.units.filter((u) => u.state === 'written').map((u) => u.unitId).sort()).toEqual(['U01', 'U03']);
    expect(result.status).toBe('partial');
  });

  test('the cap is the one the route enforces, and a smaller one is honoured', async () => {
    expect(LEASED_PROMPT_MAX_CHARS).toBe(FILL_PROMPT_MAX_CHARS * 2);
    let calls = 0;
    const result = await runGeneration(
      base({
        maxPromptChars: 100,
        model: async (p) => {
          calls++;
          return answer(p);
        },
      }),
    );
    expect(calls).toBe(0);
    expect(result.callsUsed).toBe(0);
    expect(result.units.every((u) => u.state === 'not-written' && /more than the 100 a fill call may carry/.test(u.reason ?? ''))).toBe(true);
  });
});
