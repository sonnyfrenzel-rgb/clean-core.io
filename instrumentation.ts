/**
 * Runs once when the Next.js server starts.
 *
 * Node runtime only: raises the 300 s header and body limits of the built-in
 * `fetch` to Cloud Run's request limit, so a model call ends at the route's own
 * deadline rather than at the transport's (`lib/model-fetch-dispatcher.ts`,
 * hotfix 3.0.22, HF-c). The edge runtime (middleware) has no undici and is
 * left alone.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { installModelFetchDispatcher } = await import('./lib/model-fetch-dispatcher');
  installModelFetchDispatcher();
}
