import { currentNotice } from '@/lib/terms-announcement/notice-file';

/**
 * The attachment of the notice of the current amendment of the Terms (Terms
 * 10.1), byte for byte what the mail carries: `aenderungen-nutzungsbedingungen-
 * <label>.txt`, German and English, the changed provisions, their reasons under
 * 10.4 and the marked wording. The in-app dialog offers it for download, so the
 * dialog carries what the notice carries (`components/TermsReacceptGate.tsx`).
 *
 * Prerendered: built once during `next build` from the same builder as the
 * mail (`lib/terms-announcement/notice-file.ts`).
 */
export const dynamic = 'force-static';

export function GET() {
  const notice = currentNotice();
  if (!notice) return new Response('No amendment is announced.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const { attachment } = notice;
  return new Response(attachment.content, {
    headers: {
      'Content-Type': attachment.contentType,
      'Content-Disposition': `attachment; filename="${attachment.filename}"`,
      'X-Robots-Tag': 'noindex',
    },
  });
}
