/**
 * A fixed answer in place of the Gemini provider — for the test suite only.
 *
 * That `/api/gemini` signs the stage it was called under into the model
 * receipt was only checked in the source. Proving it at the route needs a call that goes through every gate of
 * the route — authentication, rate limit, second factor, account state, the
 * per-stage switch, the model register, the prompt limit — and still returns a
 * receipt, without a provider key in CI and without spending on one.
 *
 * So one thing is replaced and nothing else: the provider call. The three gates
 * are the ones `app/api/test/seed/route.ts` already uses (F-15), all of which
 * must hold (the third has a server-side default for the test server, below),
 * and the first of which alone keeps it out of every deployment:
 *
 *   1. `K_SERVICE` is unset — Cloud Run sets it on every real service;
 *   2. `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` is exactly `'true'` — only the
 *      emulator build sets it;
 *   3. the request carries `x-test-gemini-stub` equal to a non-empty
 *      `PILOT_APPROVAL_SECRET` — per request, so no other test's call changes
 *      and a missing key still answers `model-key-missing` everywhere else.
 *
 * `tests/gemini-test-stub-guard.spec.ts` holds all three, and holds where the
 * route asks: after every gate, in place of the provider call only.
 *
 * Pure: no imports, reads only what it is handed.
 */

/** The header a test sends. */
export const GEMINI_TEST_STUB_HEADER = 'x-test-gemini-stub';

/** What the stub answers. Valid JSON, and obviously not a model's words. */
export const GEMINI_TEST_STUB_TEXT = '{"statements":[],"stub":"gemini-test-stub"}';

/**
 * Roadmap "before 3.0.7 — Tests never spend the production model budget" (2).
 *
 * The test server answers with the stub by default: `playwright.config.ts`
 * starts it with this variable set to exactly `'true'`, and then every call
 * that gets past the gates is stubbed unless the request opts in to the real
 * model. On 06./07.10.2026 about 1,270 of 1,304 Gemini calls came from test
 * runs, most of them from specs that never needed the model's words.
 *
 * The default is a third condition beside the first two gates, never in place
 * of them: without gates 1 and 2 it changes nothing, so no deployment can be
 * switched to the stub by an environment variable alone. The deploy job never
 * sets it (`tests/gemini-test-stub-guard.spec.ts`).
 */
export const GEMINI_TEST_STUB_DEFAULT_ENV = 'GEMINI_TEST_STUB_DEFAULT';

/**
 * The header a spec sends, equal to `PILOT_APPROVAL_SECRET`, to reach the real
 * model on a server that stubs by default. Only the specs listed in
 * `tests/gemini-real-model-guard.spec.ts` may send it.
 */
export const GEMINI_TEST_REAL_MODEL_HEADER = 'x-test-gemini-real-model';

export function geminiTestStubActive(
  env: Readonly<Record<string, string | undefined>>,
  headerValue: string | null | undefined,
  realModelHeaderValue?: string | null,
): boolean {
  if (env.K_SERVICE) return false;
  if (env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') return false;
  const secret = env.PILOT_APPROVAL_SECRET;
  if (!secret) return false;
  // Gate 3, as before: the stub asked for by name, per request.
  if (headerValue && headerValue === secret) return true;
  // The default: a server started to stub stays on the stub unless the request
  // proves it may leave it — the same secret, under the real-model header.
  if (env[GEMINI_TEST_STUB_DEFAULT_ENV] === 'true') return realModelHeaderValue !== secret;
  return false;
}

/**
 * Roadmap 3.0.13 (a): which finish reason the stub reports.
 *
 * Read only once the stub is active, so it inherits all three gates above.
 * Absent, the stub answers as a finished model does (`STOP`). A test that
 * names another reason gets the answer a provider gives when it stops early —
 * the first half of the text, and that reason — so the route's completeness
 * check is proved at the route, not only in the pure module.
 */
export const GEMINI_TEST_STUB_FINISH_HEADER = 'x-test-gemini-stub-finish';

export function geminiTestStubAnswer(
  finishHeader: string | null | undefined,
  /**
   * 3.0.12 — the prompt of a fill call (`responseShape: 'transformation-fill'`),
   * passed only for that shape. The stub then answers in the fill shape: one
   * body per unit the request names, so an engine-led generation runs end to
   * end on the test server without a model.
   */
  fillPromptText?: string,
): {
  text: string;
  finishReason: string;
} {
  const finishReason = typeof finishHeader === 'string' && /^[A-Z_]{1,40}$/.test(finishHeader) ? finishHeader : 'STOP';
  const text = fillPromptText !== undefined ? geminiTestStubFillText(fillPromptText) : GEMINI_TEST_STUB_TEXT;
  return finishReason === 'STOP'
    ? { text, finishReason }
    : { text: text.slice(0, Math.floor(text.length / 2)), finishReason };
}

/** The body the stub writes for every unit: a statement any fill check accepts, and obviously not a model's. */
export const GEMINI_TEST_STUB_FILL_BODY = {
  node: "return undefined as never; // gemini-test-stub",
  rap: '" gemini-test-stub\nRETURN.',
} as const;

/**
 * The fill answer for a fill prompt: the request is the JSON after the
 * `REQUEST (JSON):` line (`lib/transformation/fill-prompt.ts`). A prompt the
 * stub cannot read gets an answer with no units — which the orchestrator
 * treats as unusable, as it would a model's.
 */
export function geminiTestStubFillText(prompt: string): string {
  const marker = 'REQUEST (JSON):\n';
  const at = prompt.indexOf(marker);
  type StubUnit = { unitId: string; decline: boolean; calls: StubCall[]; predicates: string[]; authority: string[] };
  let units: StubUnit[] = [];
  let track: 'node' | 'rap' = 'node';
  if (at >= 0) {
    try {
      const request = JSON.parse(prompt.slice(at + marker.length)) as {
        track?: unknown;
        units?: Array<{
          unitId?: unknown;
          abap?: { text?: unknown };
          guards?: Array<{ id?: unknown; helper?: unknown; placement?: unknown; regionId?: unknown; values?: unknown }>;
          authority?: Array<{ fn?: unknown; call?: unknown; wired?: unknown }>;
        }>;
      };
      if (request.track === 'rap') track = 'rap';
      units = Array.isArray(request.units)
        ? request.units
            .filter((u) => u && typeof u.unitId === 'string')
            .map((u) => {
              const guards = Array.isArray(u.guards) ? u.guards : [];
              return {
                unitId: u.unitId as string,
                decline: typeof u.abap?.text === 'string' && u.abap.text.includes(GEMINI_TEST_STUB_DECLINE),
                calls: guards
                  .filter((g) => g.placement === 'body' && typeof g.helper === 'string')
                  .map((g) => ({ helper: g.helper as string, values: Array.isArray(g.values) ? g.values.filter((v): v is string => typeof v === 'string' && /^[A-Za-z_$][\w$]*$/.test(v)) : [] })),
                predicates: guards.filter((g) => typeof g.regionId === 'string' && typeof g.id === 'string').map((g) => g.id as string),
                // The original's AUTHORITY-CHECKs (scaffold version 15): called, and the answer used, as the fill checks require;
                // one the frame runs whole (`wired`) is not the body's.
                authority: (Array.isArray(u.authority) ? u.authority : []).flatMap((a) =>
                  a.wired ? [] : typeof a.fn === 'string' && /^authority_L\d+$/.test(a.fn) ? [`${a.fn}()`] : typeof a.call === 'string' && /^authority_check\(/.test(a.call) ? [a.call.replace(/<[^<>]*>/g, 'undefined as never')] : [],
                ),
              };
            })
        : [];
    } catch {
      units = [];
    }
  }
  return JSON.stringify({
    units: units.map((u) =>
      u.decline
        ? { unitId: u.unitId, body: '', needs: [], refused: { reason: 'gemini-test-stub: the slice asks the stub to decline this function.' } }
        : {
            unitId: u.unitId,
            body: stubBody(track, u.calls, u.authority),
            guards: u.predicates.map((id) => ({ id, body: GEMINI_TEST_STUB_PREDICATE[track] })),
            needs: [],
            refused: null,
          },
    ),
    stub: 'gemini-test-stub',
  });
}

/**
 * A comment in a seeded ABAP routine that makes the stub decline that unit — so
 * a rendered spec can prove the partial path (owner, 12.10.2026, Q4: a unit the
 * model cannot write stays a stub with a finding). Only the stub reads it.
 */
export const GEMINI_TEST_STUB_DECLINE = 'gemini-test-stub:decline';

/** The predicate the stub writes for every guard: the condition never holds. Obviously not a model's. */
export const GEMINI_TEST_STUB_PREDICATE = {
  node: 'return false; // gemini-test-stub',
  rap: '" gemini-test-stub\nresult = abap_false.',
} as const;

/** A guard the body must call: its helper and the keys of the values it reads (the request's `values`). */
interface StubCall {
  helper: string;
  values: string[];
}

/**
 * The stub's body: the fixed statement, and — where the unit must call a
 * guard at the original's line (design §9.2 rule 7) — that call in a branch
 * that never runs, so the fill checks accept it as they would a model's body.
 * On Node the call has the signature the scaffold declares (scaffold version 8:
 * `(sel, st, record, values)`, each value the check reads and no other), so a
 * dry run's type gate checks the call as it checks a model's; the values are
 * the stub's (`undefined as never`) — the branch never runs.
 */
function stubBody(track: 'node' | 'rap', calls: readonly StubCall[], authority: readonly string[] = []): string {
  if (track === 'node' && (calls.length > 0 || authority.length > 0)) {
    const call = (c: StubCall) => `  ${c.helper}(sel, st, null, { ${c.values.map((v) => `${v}: undefined as never`).join(', ')} });`;
    const check = (a: string) => `  if (${a} !== 0) return undefined as never;`;
    return `if (Date.now() < 0) {\n${[...authority.map(check), ...calls.map(call)].join('\n')}\n}\n${GEMINI_TEST_STUB_FILL_BODY.node}`;
  }
  if (calls.length === 0) return GEMINI_TEST_STUB_FILL_BODY[track];
  return `IF 1 = 0.\n${calls.map((c) => `  ${c.helper}( ).`).join('\n')}\nENDIF.\n${GEMINI_TEST_STUB_FILL_BODY.rap}`;
}
