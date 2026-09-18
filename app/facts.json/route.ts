import { getFacts } from '@/lib/facts';

/**
 * The machine-readable half of `/facts` (see `app/facts/page.tsx`).
 *
 * Roadmap 0.2 (`UX-E14-F01:R0`) asks for the facts service as both a page and
 * JSON, referenced from `app/llms.txt`, so an answer engine or a script can read
 * the same numbers a human reads on the page without scraping HTML. Same data,
 * same cache window as the page (`revalidate = 300`) — there is exactly one
 * function underneath both, `getFacts()`.
 */
export const revalidate = 300;

export function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clean-core.io';
  const facts = getFacts();

  return Response.json(
    { ...facts, source: `${baseUrl}/facts` },
    {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=300',
      },
    },
  );
}
