import { NextRequest } from 'next/server';

/**
 * Two requests whose body is over a route's bound, for calling a route handler in-process:
 *
 * - `declared length`: a Content-Length over the bound; the body behind it is never read (`maxPulls` 0).
 * - `streamed`: no Content-Length, a body that would go on for 4 MB; the reader stops at the bound.
 *
 * `pulled()` counts the 1 KiB chunks the handler took from the body, so a test can tell a bounded read from one that
 * buffered the whole stream before refusing it.
 */
export function oversizedRequests(
  url: string,
  maxBytes: number,
  opts: { method?: string; headers?: Record<string, string> } = {},
): Array<{ kind: string; request: () => NextRequest; pulled: () => number; maxPulls: number }> {
  const chunk = new Uint8Array(1024).fill(97); // 'a'
  const counting = () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 4096) controller.close();
        else controller.enqueue(chunk);
      },
    }, { highWaterMark: 0 }); // pulled only when read, so the count is what the handler took
    return { body, pulled: () => pulled };
  };
  const make = (extra: Record<string, string>) => {
    const stream = counting();
    return {
      pulled: stream.pulled,
      request: () =>
        new NextRequest(url, {
          method: opts.method ?? 'POST',
          headers: { 'content-type': 'application/json', ...opts.headers, ...extra },
          body: stream.body,
          duplex: 'half',
        } as ConstructorParameters<typeof NextRequest>[1]),
    };
  };
  const declared = make({ 'content-length': String(maxBytes * 4) });
  const streamed = make({});
  return [
    { kind: 'declared length', request: declared.request, pulled: declared.pulled, maxPulls: 0 },
    { kind: 'streamed without a length', request: streamed.request, pulled: streamed.pulled, maxPulls: Math.ceil(maxBytes / 1024) + 2 },
  ];
}
