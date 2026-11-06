import { currentNotice } from '@/lib/terms-announcement/notice-file';

/**
 * What the in-app dialog shows of the notice of the current amendment: the
 * changed provisions with their reasons under Terms 10.4, in German and
 * English, the effective day and where the attachment is. The same list the
 * attachment opens with, from the same builder.
 *
 * Prerendered during `next build`; no request reads the filesystem.
 */
export const dynamic = 'force-static';

export function GET() {
  const notice = currentNotice();
  if (!notice) return Response.json({ error: 'No amendment is announced.' }, { status: 404 });
  return Response.json(notice.summary, { headers: { 'X-Robots-Tag': 'noindex' } });
}
