import { getReferenceSource, REFERENCE_FILE } from '@/lib/reference-analysis';

/**
 * Serves the reference ABAP file the published run was produced from.
 *
 * Served from the repository copy rather than a duplicate in public/, so the file
 * a reader downloads is byte-for-byte the one the run and the test suite use.
 * A second copy would eventually drift and quietly falsify the page.
 */
export const revalidate = 86400;

export function GET() {
  return new Response(getReferenceSource(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${REFERENCE_FILE}"`,
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
