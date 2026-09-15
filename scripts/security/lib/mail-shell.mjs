/**
 * The Clean-Core.io mail shell, for the security audit mail.
 *
 * A mirror of lib/email-layout.ts. The deliver job runs without `npm ci` on
 * purpose — no third-party code next to the private key — so it cannot import
 * the TypeScript original. tests/security-audit-guard.spec.ts compares the two
 * RESPONSIVE_STYLES blocks character for character, so the look cannot drift.
 */

export const RESPONSIVE_STYLES = `
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

export function wrapEmailDocument(innerHtml, title = 'Clean-Core.io') {
  return `<!doctype html>
<html lang="de">
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
