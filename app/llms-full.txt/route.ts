import { GET as llmsTxt } from '@/app/llms.txt/route';
import { LANDING_FAQ } from '@/lib/landing-faq';
import { BAIP, BAIP_FIRST, BAIP_FORMERLY, BAIP_NAME, SAP_BTP_ABAP_ENVIRONMENT } from '@/lib/sap-naming';

/**
 * /llms-full.txt — `/llms.txt` plus the long answers (llmstxt.org convention).
 *
 * `/llms.txt` orients; this file is what an answer engine quotes from. It adds
 * two things and invents nothing:
 *
 *   - the start page's FAQ, read from `lib/landing-faq.ts` — the same list the
 *     visible accordion and the `FAQPage` JSON-LD read, so the three cannot
 *     answer one question three ways;
 *   - the terms a reader meets on the site, each defined once, so a generated
 *     answer does not confuse SAP's names with ours (the Clean Core Score is
 *     ours; level A–D, the Cloudification Repository and BAIP are SAP's).
 *
 * Only English entries: the German FAQ entry is for German search and has its
 * English twin in the list.
 */
export const revalidate = 86400; // refresh daily, like /llms.txt

const GLOSSARY: Array<[string, string]> = [
  ['SAP S/4HANA', 'SAP’s current ERP suite. Custom code written for SAP ECC or S/4HANA has to be assessed before an upgrade or a move to the cloud editions.'],
  ['ABAP', 'SAP’s programming language for applications on the SAP application server. “Custom ABAP” means programs a company wrote itself, usually in the Z or Y namespace.'],
  ['Clean core', `SAP’s principle of keeping the S/4HANA standard unmodified: extensions use only released, upgrade-stable interfaces — in-app with ABAP Cloud, or side-by-side on the ${BAIP_FIRST}.`],
  ['Clean core level A–D', 'SAP’s grading of what an extension uses, per object: A for released APIs and extension points, down to D for what SAP does not recommend (modifications, implicit enhancements, writes to SAP tables). Clean-Core.io derives it from SAP’s published files; it is an orientation, and ABAP Test Cockpit stays the authority.'],
  ['SAP Cloudification Repository', 'SAP’s public repository (github.com/SAP/abap-atc-cr-cv-s4hc) of SAP objects with their release state and, where SAP names one, a released successor. Clean-Core.io’s object catalog is a viewer of it.'],
  ['Clean Core Score', 'A 0–100 measure published by Clean-Core.io, higher is better. Not an SAP metric, and not SAP’s Technical Debt Score, where higher is worse.'],
  ['BPMN 2.0', 'Business Process Model and Notation, the OMG standard for process diagrams, with an XML format for exchanging them between tools. Clean-Core.io exports and imports BPMN 2.0 XML files.'],
  ['SAP Signavio', 'SAP’s process modelling and mining suite. Clean-Core.io has no connection to a Signavio workspace; whether its BPMN files import into SAP Signavio has not been verified.'],
  [`${BAIP_NAME} (${BAIP})`, `The platform portfolio SAP presented at Sapphire 2026, ${BAIP_FORMERLY}, together with Business Data Cloud and Business Transformation Management. Services whose SAP name still carries the former name — the ${SAP_BTP_ABAP_ENVIRONMENT}, for one — keep it.`],
  ['RAP and CAP', 'The ABAP RESTful Application Programming Model (in-app, ABAP Cloud) and the SAP Cloud Application Programming Model (side-by-side, Node.js or Java). Clean-Core.io drafts code for either route; a draft is for a person to review.'],
  ['ABAP Test Cockpit (ATC)', 'SAP’s in-system check tool, the authoritative check for clean core violations. Clean-Core.io does not replace it.'],
  ['Signed analysis run', 'An immutable record of one completed analysis, signed by the Clean-Core.io server with HMAC; the audit pack exported from it also carries an Ed25519 signature. A signature proves origin and integrity, not correctness.'],
];

export async function GET() {
  const head = await llmsTxt().text();
  const faq = LANDING_FAQ.filter((f) => !f.lang)
    .map((f) => `### ${f.q}\n\n${f.a}`)
    .join('\n\n');
  const glossary = GLOSSARY.map(([term, text]) => `- **${term}**: ${text}`).join('\n');

  const body = `${head.trimEnd()}

## Questions and answers

${faq}

## Terms used on this site

${glossary}
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
