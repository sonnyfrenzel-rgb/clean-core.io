/**
 * Shared responsive shell for every outgoing email.
 *
 * All templates were built from one design system with identical inline styles —
 * a 600px wrapper, a card with `border-radius: 24px` and `padding: 40px`, a
 * two-column header table, and a `padding: 16px 32px` call to action. On a 375px
 * phone that card padding alone eats 80 of 375 pixels, and the header's right-hand
 * cell is pushed off the edge.
 *
 * Rather than editing eight message bodies, this wraps them in a proper document —
 * doctype, charset, viewport — and carries one media query that targets those exact
 * inline styles. Nothing inside a template has to change, which matters because
 * several of them are transactional mail in the approval path.
 *
 * The inline styles remain the source of truth for the desktop rendering: a client
 * that strips `<style>` (older Outlook, some corporate gateways) still gets exactly
 * what it got before. The media query is enhancement, never a dependency.
 */

const RESPONSIVE_STYLES = `
  /* Small screens: the design system's fixed paddings and two-column header
     are the only things that do not survive a phone, so only those are undone. */
  @media only screen and (max-width: 600px) {
    /* Outer 600px wrapper */
    div[style*="max-width: 600px"] { padding: 20px 12px !important; }

    /* The white card */
    div[style*="border-radius: 24px"] { padding: 24px 20px !important; border-radius: 18px !important; }

    /* Header table: logo left, badge right — stacked instead of squeezed */
    td[align="left"], td[align="right"] {
      display: block !important;
      width: 100% !important;
      text-align: left !important;
    }
    td[align="right"] { padding-top: 12px !important; }

    /* Headline */
    h1 { font-size: 22px !important; line-height: 1.2 !important; }

    /* Primary call to action — full width and comfortably tappable */
    a[style*="padding: 16px 32px"] {
      display: block !important;
      width: 100% !important;
      box-sizing: border-box !important;
      padding: 16px 12px !important;
      text-align: center !important;
    }

    /* Secondary/ghost buttons */
    a[style*="padding: 8px 16px"], a[style*="padding: 9px 18px"], a[style*="padding: 11px 18px"] {
      display: block !important;
      width: 100% !important;
      box-sizing: border-box !important;
      text-align: center !important;
      padding: 13px 12px !important;
    }

    /* Inner panels */
    div[style*="border-radius: 16px"] { padding: 16px !important; border-radius: 14px !important; }

    /* Body copy: 15px is fine on a desktop, cramped on a phone */
    p[style*="font-size: 15px"] { font-size: 16px !important; }

    /* Legal footer */
    div[style*="font-size: 11px"] { font-size: 12px !important; padding: 0 8px !important; }
  }

  /* Never let a long address or URL force a sideways scroll. */
  body, table, td, p, a, div { -webkit-text-size-adjust: 100%; }
  a { word-break: break-word; }
`;

/**
 * Wraps a message body in the responsive document shell.
 *
 * @param innerHtml the existing template markup, unchanged
 * @param title     shown by clients that surface a document title; not the subject
 */
export function wrapEmailDocument(innerHtml: string, title = 'Clean-Core.io'): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<style>${RESPONSIVE_STYLES}</style>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc;">
${innerHtml}
</body>
</html>`;
}
