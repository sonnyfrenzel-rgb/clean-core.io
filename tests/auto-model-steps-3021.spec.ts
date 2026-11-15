import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  AUTO_MODEL_STEPS_FIELD,
  AUTO_MODEL_STEPS_OFF_CODE,
  autoModelStepsOn,
  automaticStepsAllowed,
  isCoveredTrigger,
} from '../lib/auto-model-steps';
import { AUTO_STEPS_NOTICE_WORDING, autoStepsSwitchBody, autoStepsSwitchOn } from '../lib/auto-steps-notice';
import { startCallsModel } from '../lib/start-run-model';
import { runModelCallNotice } from '../lib/legal/run-notice';
import { describeRunCost } from '../lib/run-cost';
import { modelStagesOf, type ModelStage } from '../lib/model-stages';
// Static on purpose, as in qa-full-v306.spec.ts: a run-time `await import('../lib/gemini')`
// loads the module outside Playwright's tsconfig path mapping on the Linux runner, and its
// `@/lib/firebase` import fails with "Cannot find module" (CI run 42267572937, shard 4).
// The stand-in `fetch` below is read at call time, not at load.
import { callGeminiWithReceipt } from '../lib/gemini';

/**
 * Release 3.0.21, legal review of 06.11.2026, items 2 and 3.
 *
 * Item 2 — one main switch, "Automatic AI steps", covers every automatic call
 * on every key, the platform key included: one stored setting
 * (`users/{uid}.autoModelSteps`), written by the notice and by Settings through
 * the Admin SDK, held by `/api/gemini` before any key is loaded. The per-stage
 * switches and the own key's "Automatic steps" stay beside it.
 *
 * Item 3 (N2) — with the main switch or the analysis stage off, the first run
 * after "Create project" asks no model at all and is signed with the engine's
 * reading; the proxy refuses its narrative (`trigger: 'start'`) too.
 *
 * Server-free: the pure rules, the client's request body against a stand-in
 * `fetch`, and source guards on the routes.
 */

const ROOT = path.resolve(__dirname, '..');
// Line endings normalised: the guards below match multi-line markup, and a Windows
// checkout with core.autocrlf has CRLF where the runner has LF.
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const ALL_ON = modelStagesOf(null);
const off = (...stages: ModelStage[]) => ({ ...ALL_ON, ...Object.fromEntries(stages.map((s) => [s, false])) }) as Record<ModelStage, boolean>;

test.describe('the main switch, as a rule', () => {
  test('stored as one field, on unless switched off', () => {
    expect(AUTO_MODEL_STEPS_FIELD).toBe('autoModelSteps');
    expect(autoModelStepsOn(null)).toBe(true);
    expect(autoModelStepsOn({})).toBe(true);
    expect(autoModelStepsOn({ autoModelSteps: true })).toBe(true);
    expect(autoModelStepsOn({ autoModelSteps: false })).toBe(false);
    // Anything but `false` is on: a half-written document never switches the platform off by accident.
    expect(autoModelStepsOn({ autoModelSteps: 'no' })).toBe(true);
  });

  test('it applies to the platform key too, and an own key needs its own switch as well', () => {
    expect(automaticStepsAllowed({ mainSwitch: true, keySource: 'community', ownKeyAutoSteps: false })).toBe(true);
    expect(automaticStepsAllowed({ mainSwitch: false, keySource: 'community', ownKeyAutoSteps: false })).toBe(false);
    expect(automaticStepsAllowed({ mainSwitch: true, keySource: 'byok', ownKeyAutoSteps: true })).toBe(true);
    expect(automaticStepsAllowed({ mainSwitch: true, keySource: 'byok', ownKeyAutoSteps: false })).toBe(false);
    expect(automaticStepsAllowed({ mainSwitch: false, keySource: 'byok', ownKeyAutoSteps: true })).toBe(false);
    expect(automaticStepsAllowed({ mainSwitch: true, keySource: null, ownKeyAutoSteps: true })).toBe(false);
  });

  test('it covers the two marks: a step started on opening, and the first run\'s narrative', () => {
    expect(isCoveredTrigger('automatic')).toBe(true);
    expect(isCoveredTrigger('start')).toBe(true);
    expect(isCoveredTrigger(undefined)).toBe(false);
    expect(isCoveredTrigger('click')).toBe(false);
  });

  test('the notice\'s switch writes the main switch, not the stages, and reads its position from it', () => {
    // The notice is recorded with the wording it showed (`autoStepsNoticeWording`, tests/legal-names-wording.spec.ts).
    expect(autoStepsSwitchBody(false)).toEqual({ autoModelSteps: false, autoStepsNotice: 'seen', autoStepsNoticeWording: AUTO_STEPS_NOTICE_WORDING });
    expect(autoStepsSwitchBody(true)).toEqual({ autoModelSteps: true, autoStepsNotice: 'seen', autoStepsNoticeWording: AUTO_STEPS_NOTICE_WORDING });
    expect(autoStepsSwitchOn({ autoModelSteps: true })).toBe(true);
    expect(autoStepsSwitchOn({ autoModelSteps: false })).toBe(false);
    const notice = read('components/AutoStepsNotice.tsx');
    expect(notice).toContain('await post(autoStepsSwitchBody(on));');
    expect(notice).toContain('const on = autoStepsSwitchOn(model);');
  });
});

test.describe('the server holds it', () => {
  test('/api/gemini refuses a marked call while the main switch is off — before any key is loaded, on every key', () => {
    const route = read('app/api/gemini/route.ts');
    expect(route).toContain("const startNarrative = trigger === 'start';");
    const guard = "if ((automatic || startNarrative || stage === 'glossary') && !autoModelStepsOn(profile.exists ? (profile.data() as { autoModelSteps?: unknown }) : null)) {";
    expect(route).toContain(guard);
    expect(route).toContain('return NextResponse.json({ error: autoModelStepsOffMessage(), code: AUTO_MODEL_STEPS_OFF_CODE }, { status: 403 });');
    // Before the key is loaded, and not tied to an own key.
    expect(route.indexOf(guard)).toBeLessThan(route.indexOf('ownKey = await loadOwnModelKey('));
    expect(route.slice(route.indexOf(guard), route.indexOf(guard) + guard.length)).not.toContain('ownKey');
    // The per-key rule and the stage switch stay.
    expect(route).toContain('if (automatic && ownKey && !ownKey.autoSteps) {');
    expect(route).toContain('if (!modelStageEnabled(');
    expect(AUTO_MODEL_STEPS_OFF_CODE).toBe('auto-model-steps-off');
  });

  test('/api/model-stages writes it through the Admin SDK and answers it; autoSteps is false whenever it is off', () => {
    const route = read('app/api/model-stages/route.ts');
    expect(route).toContain("if (mainSwitch !== undefined && typeof mainSwitch !== 'boolean') {");
    expect(route).toContain("if (typeof mainSwitch === 'boolean') only[AUTO_MODEL_STEPS_FIELD] = mainSwitch;");
    expect(route).toContain("if (typeof mainSwitch === 'boolean') fields[AUTO_MODEL_STEPS_FIELD] = mainSwitch;");
    expect(route).toContain('const autoSteps = automaticStepsAllowed({ mainSwitch: autoModelSteps, keySource, ownKeyAutoSteps: ownKey !== null && ownKey.autoSteps });');
    expect(read('hooks/useModelAvailability.ts')).toContain('setAutoModelSteps(data.autoModelSteps !== false);');
  });

  test('no rules change: the field is not a client field', () => {
    const rules = read('firestore.rules');
    expect(rules).not.toContain('autoModelSteps');
    const keys = rules.slice(rules.indexOf('function userClientUpdateKeys()'), rules.indexOf('function isCreationTime('));
    expect(keys).not.toMatch(/modelStages|autoSteps|autoModelSteps/);
  });

  test('Settings shows the same switch at the top of "Where the AI model is used"', () => {
    const card = read('components/ModelStagesCard.tsx');
    expect(card).toContain("body: JSON.stringify({ autoModelSteps: !model.autoModelSteps }),");
    expect(card).toContain('label={consentText(CONSENT_TEXTS.autoStepsNotice.switchLabel, \'en\')}');
    expect(card.indexOf('data-auto-model-steps-switch')).toBeLessThan(card.indexOf('{stages.map((stage) => {'));
  });
});

test.describe('every automatic call path is covered', () => {
  test('the calls marked automatic are the plain wording and the paused names — and nothing else', () => {
    const senders: string[] = [];
    for (const dir of ['app', 'components', 'hooks', 'lib']) {
      const walk = (d: string) => {
        for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
          const rel = path.posix.join(d, e.name);
          if (e.isDirectory()) walk(rel);
          else if (/\.(ts|tsx)$/.test(e.name) && /\{ automatic: true \}/.test(read(rel))) senders.push(rel);
        }
      };
      walk(dir);
    }
    // The two clients pass the mark on (`{ automatic: true }` into `callGeminiWithReceipt`); the two hooks decide it.
    expect(senders.sort()).toEqual(['hooks/usePlainWording.ts', 'lib/plain-wording-client.ts', 'lib/process-naming-client.ts']);
    const naming = read('hooks/useAutoProcessNaming.ts');
    expect(naming).toMatch(/if \(!projectId \|\| !source \|\| !digest \|\| mode !== 'auto'\) return;[\s\S]{0,120}ask\(projectId, source, true\);/);
  });

  test('both hooks wait for a click when the combined answer says no — which is false whenever the main switch is off', () => {
    for (const rel of ['hooks/usePlainWording.ts', 'hooks/useAutoProcessNaming.ts']) {
      expect(read(rel), rel).toContain('askModeOf(');
    }
    for (const rel of ['components/workspace/FirstLook.tsx', 'components/workspace/WorkspaceProcess.tsx', 'components/workspace/RuleDecisionFlow.tsx', 'components/design/RuleQuestions.tsx']) {
      expect(read(rel), rel).toContain('autoAllowed: availability.autoSteps,');
    }
  });
});

test.describe('N2 — the first run', () => {
  const realFetch = globalThis.fetch;
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('asks the model only with the answer known, a key, the analysis stage and the main switch on', () => {
    const model = (o: { known?: boolean; autoModelSteps?: boolean; stages?: Record<ModelStage, boolean>; keyAvailable?: boolean }) => {
      const known = o.known ?? true;
      const stages = o.stages ?? ALL_ON;
      const keyAvailable = o.keyAvailable ?? true;
      return { known, autoModelSteps: o.autoModelSteps ?? true, enabled: (s: ModelStage) => (!known ? true : keyAvailable && stages[s]) };
    };
    expect(startCallsModel(model({}))).toBe(true);
    expect(startCallsModel(model({ autoModelSteps: false })), 'main switch off').toBe(false);
    expect(startCallsModel(model({ stages: off('analyze') })), 'analysis stage off').toBe(false);
    expect(startCallsModel(model({ keyAvailable: false })), 'no key').toBe(false);
    // Never optimistic: an answer that is not in (or failed) is no model.
    expect(startCallsModel(model({ known: false })), 'answer unknown').toBe(false);
  });

  test('without the narrative the one signed run carries the engine\'s reading alone', () => {
    const hook = read('hooks/useStartRun.ts');
    expect(hook).toContain('const callsModel = startCallsModel(model);');
    // The narrative is asked only inside `if (callsModel)`; the signing follows either way.
    const body = hook.slice(hook.indexOf('let narrative: StartNarrative | null = null;'), hook.indexOf('setNarrativeMissing(missing);'));
    expect(body.indexOf('if (callsModel) {')).toBeGreaterThan(-1);
    expect(body.indexOf('writeStartNarrative(')).toBeGreaterThan(body.indexOf('if (callsModel) {'));
    expect(body).toContain('await signEngineRun({ projectId, fileName, deployment, targetProfile, narrative });');
    // The route signs without a narrative and records no model took part.
    const route = read('app/api/runs/create/route.ts');
    expect(route).toContain("finalAnalysisText.trim().length === 0 ? 'none'");
    // And the run route itself never calls a model.
    expect(route).not.toMatch(/GoogleGenAI|callClaudeMessages|generateContent\(/);
  });

  test('its narrative goes up as trigger: start, a target change as a plain click', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')));
      return new Response(JSON.stringify({ text: '{}', receipt: null }), { status: 200 });
    }) as typeof fetch;
    await callGeminiWithReceipt('p', undefined, true, 'analyze', undefined, { startRun: true });
    await callGeminiWithReceipt('p', undefined, true, 'analyze');
    await callGeminiWithReceipt('p', undefined, true, 'statements', undefined, { automatic: true });
    expect(bodies[0].trigger).toBe('start');
    expect(bodies[1]).not.toHaveProperty('trigger');
    expect(bodies[2].trigger).toBe('automatic');
    expect(read('hooks/useStartRun.ts')).toContain('signal: controller.signal, firstRun: true }),');
    expect(read('lib/start-narrative.ts')).toContain("firstRun ? { startRun: true } : undefined");
    expect(read('components/workspace/TargetChange.tsx')).not.toContain('firstRun');
  });

  test('the notice stands directly at "Create project": the consent text startRun.modelCall with the key\'s provider, or noModelCall', () => {
    expect(runModelCallNotice({ callsModel: true, provider: 'anthropic', lang: 'en' })).toBe('Calls the AI model (Anthropic). Your code is sent to Anthropic for this.');
    expect(runModelCallNotice({ callsModel: false, provider: 'gemini', lang: 'en' })).toBe('Calls no AI model. Your code does not leave the platform.');
    // The run dialogs say the same through the cost line, and nothing there speaks of costs.
    const cost = describeRunCost({ profile: { tier: 'pilot', transformationsUsed: 1, transformationsLimit: 5 }, metered: true, callsModel: true, provider: 'gemini' });
    expect(cost.modelCall).toBe('Calls the AI model (Google). Your code is sent to Google for this.');
    expect(cost.quota).toBe('Free. This run uses one of your 5 analyses; 3 left after it.');
    expect(describeRunCost({ profile: { tier: 'enterprise' }, metered: true, callsModel: false }).quota).not.toMatch(/cost/i);
    for (const rel of ['components/workspace/WorkspaceProcess.tsx', 'components/workspace/NewProject.tsx', 'components/workspace/TargetChange.tsx', 'components/workspace/WorkspaceListReport.tsx']) {
      expect(read(rel), rel).toMatch(/provider: (availability|model|modelAvailability)\.known \? (availability|model|modelAvailability)\.provider : undefined/);
    }
    expect(read('app/(app)/first-run/page.tsx')).not.toContain('What it costs');
    const page = read('components/workspace/OwnCodeImport.tsx');
    expect(page).toContain("const startCallsModel = model.enabled('analyze') && model.autoModelSteps;");
    // Inside the footer, right after the button, and named by it.
    const footer = page.slice(page.indexOf('data-own-code-start=""'));
    expect(footer.indexOf('id="own-code-start-notice"')).toBeGreaterThan(-1);
    expect(footer.indexOf('id="own-code-start-notice"')).toBeLessThan(footer.indexOf('</div>\n      </div>\n    </div>'));
    expect(page).toContain("aria-describedby={ready && !hintsPending ? 'own-code-start-notice' : undefined}");
    expect(page).toContain("const startNotice = runModelCallNotice({ callsModel: startCallsModel, provider: model.provider, lang: 'en' });");
  });
});

test.describe('Terms 5.4 — with the main switch off the assistant calls no model either', () => {
  test('the panel is shown disabled with one sentence, and the proxy refuses the glossary stage', () => {
    const bot = read('components/GlossaryChatbot.tsx');
    expect(bot).toContain('const assistantOff = !inDemo && keyInfo.known && !keyInfo.autoModelSteps;');
    expect(bot).toContain('if (assistantOff) return;');
    expect(bot).toContain('disabled={loading || assistantOff || !inputValue.trim()}');
    expect(bot).toContain('{assistantOffNote()}');
    expect(read('app/api/gemini/route.ts')).toContain("if ((automatic || startNarrative || stage === 'glossary') && !autoModelStepsOn(");
  });

  test('Settings shows the one main switch under its consent label', () => {
    const card = read('components/ModelStagesCard.tsx');
    expect(card).toContain("label={consentText(CONSENT_TEXTS.autoStepsNotice.switchLabel, 'en')}");
  });
});
