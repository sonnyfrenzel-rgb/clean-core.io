import { GoogleGenAI } from '@google/genai';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import { testAnthropicKey } from '@/lib/anthropic-messages';
import type { ModelKeyProvider } from '@/lib/model-providers';

/**
 * The one test of an own model key — run before a key is stored and when a
 * stored key is tested again (roadmap 3.0.21: an own key counts as configured
 * only after a successful test).
 *
 * It reads the model the key will be used with — for Gemini `models.get` of
 * the product model, for Anthropic `GET /v1/models` — so no code is sent and no
 * token is spent (the privacy policy says so, legal review E02). A key the
 * provider refuses throws; nothing the provider said is passed on.
 *
 * `stubbed` is the test server's stand-in (`lib/gemini-test-stub.ts`, the same
 * three gates as the model call — never in a deployment): the provider is not
 * asked, and a key containing `OWN_KEY_TEST_STUB_REFUSED` is refused, so a spec
 * can prove both outcomes at the route.
 */
export const OWN_KEY_TEST_STUB_REFUSED = 'stub-refused';

/** The code a save or test carries when the key did not pass. */
export const OWN_KEY_TEST_FAILED_CODE = 'own-key-test-failed';

/** What a person reads when the key did not pass. */
export const OWN_KEY_TEST_FAILED_MESSAGE =
  'The key did not pass the test, so it does not count as configured: the provider refused it or could not be reached. Nothing was saved; check the key and try again.';

export async function testOwnModelKey(provider: ModelKeyProvider, apiKey: string, opts: { stubbed?: boolean } = {}): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new Error('empty key');
  if (opts.stubbed) {
    if (key.includes(OWN_KEY_TEST_STUB_REFUSED)) throw new Error('stub: key refused');
    return;
  }
  if (provider === 'anthropic') {
    await testAnthropicKey(key);
    return;
  }
  const ai = new GoogleGenAI({ apiKey: key });
  const model = await ai.models.get({ model: PRODUCT_GEMINI_MODEL });
  if (!model?.name) throw new Error('Invalid response from AI provider.');
}
