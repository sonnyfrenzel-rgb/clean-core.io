/**
 * The reason a load answer of the executor is not a successful load, or null
 * when it is one. A failure is a failure whatever its text — an empty message
 * included (QA 7752de789154) — and a success must name every module it was
 * asked to import (`expected`). No imports: `run.mjs` and the spec read it alike.
 */
export function loadFailure(answer, expected) {
  if (!answer || typeof answer !== 'object') return 'the executor sent no answer to the load request';
  if (answer.failure !== undefined) return String(answer.failure) || 'a module failed to load without saying why';
  if (answer.transportError !== undefined) return String(answer.transportError) || 'the executor could not answer the load request';
  if (!Array.isArray(answer.imported)) return 'the executor did not report which modules it imported';
  const imported = answer.imported.map(String);
  const missing = expected.filter((name) => !imported.includes(name));
  if (missing.length > 0) return `the executor did not report importing ${missing.map((m) => `'${m}'`).join(', ')}`;
  return null;
}
