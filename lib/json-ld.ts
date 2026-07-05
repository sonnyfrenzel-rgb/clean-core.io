/**
 * Serialize data as JSON that is safe to embed inside a <script type="application/ld+json">
 * tag. JSON.stringify does NOT escape `<`, so a value containing `</script>` (or `<!--`)
 * could break out of the script element and inject markup. Escaping `<` to its <
 * unicode form neutralizes that without changing how the JSON parses.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
