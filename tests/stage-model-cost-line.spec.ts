import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { ALLOWED_MODELS, EVALUATION_ONLY_MODELS, servedGeminiModel, stageModelsForKey } from '../lib/gemini-register';
import { STAGE_MODELS_ENV, planModelCall } from '../lib/model-combination';
import { MODEL_STAGES, stageModelsFromAnswer } from '../lib/model-stages';
import { NAMING_GEMINI_MODEL, PRODUCT_GEMINI_MODEL } from '../lib/constants';
import { OWN_CLAUDE_MODEL } from '../lib/model-providers';
import { docProposalsCostLine } from '../lib/messages/documentation';

/**
 * The Documentation page's cost line names the model the stage runs on
 * (docs/design/model-combination.md §3.3, closed 14.11.2026): on the platform
 * key the deployment's stage list (`GEMINI_STAGE_MODELS`), on an own key the
 * model the client asks for. `GET /api/model-stages` reports it as
 * `stageModels` from the proxy's own register (`lib/gemini-register.ts`).
 *
 * Server-free: the functions are pure, the route and the page are read in their source.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

const HYDROGEN_ON_DOCUMENTATION = { [STAGE_MODELS_ENV]: 'statements=gemini-4-hydrogen,documentation=gemini-4-hydrogen' };

test.describe('the model a stage runs on, named before the click', () => {
  test('platform key with documentation on Hydrogen: the cost line names gemini-4-hydrogen', () => {
    const models = stageModelsForKey({ keySource: 'community', provider: 'gemini', env: HYDROGEN_ON_DOCUMENTATION });
    expect(models.documentation).toBe('gemini-4-hydrogen');
    // What the browser keeps of the answer, and the line the page builds from it.
    const kept = stageModelsFromAnswer(JSON.parse(JSON.stringify(models)));
    const line = docProposalsCostLine(kept.documentation, false);
    expect(line).toContain('(gemini-4-hydrogen)');
    expect(line).not.toContain(PRODUCT_GEMINI_MODEL);
    // A stage not in the list stays on the product model.
    expect(models.testing).toBe(PRODUCT_GEMINI_MODEL);
    expect(models.naming).toBe(NAMING_GEMINI_MODEL);
  });

  test('it agrees with the proxy\'s plan for every stage on the platform key', () => {
    for (const stage of MODEL_STAGES) {
      const asked = stage === 'naming' ? NAMING_GEMINI_MODEL : PRODUCT_GEMINI_MODEL;
      const plan = planModelCall({ stage, promptLength: 1000, model: asked, platformKey: true, env: HYDROGEN_ON_DOCUMENTATION, register: ALLOWED_MODELS, stages: new Set(MODEL_STAGES) });
      expect(servedGeminiModel(stage, { platformKey: true, env: HYDROGEN_ON_DOCUMENTATION }), stage).toBe(plan.model);
    }
  });

  test('an own key: the model the client asks for; Anthropic: the one Claude model; no key: nothing', () => {
    expect(stageModelsForKey({ keySource: 'byok', provider: 'gemini', env: HYDROGEN_ON_DOCUMENTATION }).documentation).toBe(PRODUCT_GEMINI_MODEL);
    expect(docProposalsCostLine(PRODUCT_GEMINI_MODEL, true)).toContain(`(${PRODUCT_GEMINI_MODEL}, with your own Gemini key)`);
    expect(stageModelsForKey({ keySource: 'byok', provider: 'anthropic', env: HYDROGEN_ON_DOCUMENTATION }).documentation).toBe(OWN_CLAUDE_MODEL);
    expect(stageModelsForKey({ keySource: null, provider: null, env: HYDROGEN_ON_DOCUMENTATION })).toEqual({});
  });

  test('GEMINI_MODEL moves the product model, only within the register; an unregistered stage model is ignored', () => {
    expect(servedGeminiModel('testing', { platformKey: true, env: { GEMINI_MODEL: 'gemini-3.6-flash' } })).toBe('gemini-3.6-flash');
    expect(servedGeminiModel('testing', { platformKey: true, env: { GEMINI_MODEL: 'gemini-9-made-up' } })).toBe(PRODUCT_GEMINI_MODEL);
    expect(servedGeminiModel('documentation', { platformKey: true, env: { [STAGE_MODELS_ENV]: 'documentation=gemini-9-made-up' } })).toBe(PRODUCT_GEMINI_MODEL);
    // The evaluation list is unchanged by the move: a client naming the model is still refused by the proxy.
    expect([...EVALUATION_ONLY_MODELS]).toEqual(['gemini-4-hydrogen']);
  });

  test('platform key before the route has answered: the line names no model, not the product default', () => {
    // What the hook holds while it loads, and for a key the route reports no stage model for.
    const pending = stageModelsFromAnswer(undefined);
    const line = docProposalsCostLine(pending.documentation, false);
    expect(line).toMatch(/^One model call per proposal\. /);
    expect(line).not.toContain(PRODUCT_GEMINI_MODEL);
    expect(line).not.toContain('undefined');
    // An own key whose model is not reported yet still says whose key it is.
    expect(docProposalsCostLine(undefined, true)).toMatch(/^One model call per proposal \(with your own Gemini key\)\. /);
  });

  test('the browser keeps only known stages and plain model ids', () => {
    expect(stageModelsFromAnswer({ documentation: 'gemini-4-hydrogen', nope: 'x', testing: '<b>', design: 3 })).toEqual({ documentation: 'gemini-4-hydrogen' });
    expect(stageModelsFromAnswer(null)).toEqual({});
  });

  test('the route reports it and the page prints it', () => {
    const route = read('app/api/model-stages/route.ts');
    expect(route).toContain('stageModelsForKey({ keySource: answer.keyAvailable ? answer.keySource : null, provider: answer.provider, env: process.env })');
    expect(route).toContain('return NextResponse.json({ ...answer, stageModels });');
    const page = read('app/(app)/project/[projectId]/documentation/page.tsx');
    expect(page).toContain('docProposalsCostLine(modelAvailability.stageModels.documentation,');
    expect(page).not.toMatch(/docProposalsCostLine\([^)]*PRODUCT_GEMINI_MODEL/);
    expect(read('hooks/useModelAvailability.ts')).toContain('setStageModels(stageModelsFromAnswer(data.stageModels));');
  });
});
