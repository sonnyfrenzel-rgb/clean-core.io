/**
 * The policy an exported document is previewed under.
 *
 * The preview opens as a `blob:` URL, and a blob document belongs to the origin
 * that created it — `noopener` takes away the handle back to the opener, not the
 * origin. Whatever the sanitizer missed would run next to this application's
 * storage and session. So the document carries its own policy, and the policy
 * allows exactly what an exported page is: inline styling and inline images.
 * No script runs, nothing is fetched, no form is sent, whatever the content.
 */
export const EXPORT_PREVIEW_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'";

const META = `<meta http-equiv="Content-Security-Policy" content="${EXPORT_PREVIEW_POLICY}">`;

/** The same document with the preview policy as the first element of its head. */
export function withPreviewPolicy(html: string): string {
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}${META}${html.slice(at)}`;
  }
  return `${META}${html}`;
}
