#!/usr/bin/env node
/**
 * The UX agent reviews a design before it is built: `DESIGN.md` and the target mockups, with screenshots of today's
 * product for contrast. A maintainer tool, run locally on demand — not part of the release review.
 *
 *   node scripts/ux/design-review.mjs [--mockups=docs/roadmap/clean-core-mockups-v2_8.html] [--design-only] [--dry]
 *
 * Same model, brief and guardrails as the release review (docs/UX-REVIEW-AGENT.md): no tools, pinned model,
 * `data_collection: deny`, redacted text, a cost cap. The result is written to .ux-review/design/ (git-ignored)
 * and printed; nothing leaves the machine except the request to OpenRouter.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { callReviewer } from '../qa/lib/openrouter.mjs';
import { redactSecrets } from '../qa/lib/redact.mjs';
import { loadDotEnv } from '../qa/lib/store.mjs';
import { PRICE_PER_MTOK, TOKENS_PER_IMAGE, UX_MODEL } from './lib/config.mjs';
import { loadBrief } from './lib/prompt.mjs';

const DRY = process.argv.includes('--dry');
const option = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=');
const MOCKUPS = option('mockups', 'docs/roadmap/clean-core-mockups-v2_8.html');
const CAP_USD = 1;
const MAX_OUTPUT_TOKENS = 24_000;
const OUT = '.ux-review/design';

const str = { type: 'string' };
const DESIGN_REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summary', 'findings', 'strengths', 'open_questions'],
  properties: {
    verdict: { type: 'string', enum: ['tragfähig', 'tragfähig mit Änderungen', 'nicht tragfähig'] },
    summary: str,
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'target', 'section', 'title', 'observation', 'recommendation', 'rationale'],
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          target: { type: 'string', enum: ['DESIGN.md', 'Mockups', 'beide'] },
          section: str,
          title: str,
          observation: str,
          recommendation: str,
          rationale: str,
        },
      },
    },
    strengths: { type: 'array', items: str },
    open_questions: { type: 'array', items: str },
  },
};

/** With mockups the review checks spec and picture against each other; without, it reviews the spec before any picture is drawn. */
const task = (withMockups) =>
  [
    '# Auftrag: Design-Review vor dem Bau',
    '',
    'Du prüfst diesmal keinen Release, sondern die Gestaltungsgrundlage für Clean-Core.io 3.0, bevor sie gebaut wird:',
    withMockups
      ? 'die verbindliche DESIGN.md und die Zielbild-Mockups (je Screen ein Bild, benannt s0, s1, …). Zum Vergleich bekommst du Screenshots des heutigen Produkts.'
      : 'die verbindliche DESIGN.md, bevor die Mockups danach gezeichnet werden. Zum Vergleich bekommst du Screenshots des heutigen Produkts. Dein Feedback bestimmt, wie die Mockups aussehen.',
    '',
    'Prüfe mit dem einen Ziel einer möglichst perfekten Nutzererfahrung:',
    '1. Trägt DESIGN.md: klar, widerspruchsfrei, umsetzbar, vollständig für Komponenten, Zustände, Leere/Laden/Fehler, Telefon und Barrierefreiheit (WCAG 2.2 AA)? Stimmen die angegebenen Kontraste?',
    withMockups
      ? '2. Halten die Mockups DESIGN.md ein — Tokens, vier Button-Stile, Schrift ≥ 11 px, Status als Text mit Punkt, die feste Herkunftsliste, Business-Sicht beim Öffnen, keine KI-Spuren, kein Dark Mode?'
      : '2. Was müssen die Mockups nach dieser DESIGN.md unbedingt zeigen, damit die Regeln sichtbar geprüft werden können — und wo lässt DESIGN.md dem Zeichnen zu viel Spielraum?',
    `3. Der erste Blick (DESIGN.md §5${withMockups ? ', Screens s0/s1' : ''}): versteht ein Prozessverantwortlicher in zehn Sekunden, um welchen Prozess es geht und was er als Nächstes tut? Wirkt der Moment — und bleibt er ehrlich?`,
    '4. Die drei Sichten: beantwortet jede ihre Frage (Business: brauche ich das noch? Management: was riskiere und entscheide ich? IT: was genau, wohin, stimmt das?) auf den ersten Blick?',
    '5. Hilfestellung: reicht, was DESIGN.md §6 vorsieht, für Erstnutzer ohne Schulung? Was fehlt?',
    '6. SAP-Fiori-Muster ohne Fiori-Theme: fühlt es sich für SAP-Nutzer vertraut an, ohne wie eine Kopie auszusehen? Und wie weit ist das heutige Produkt (Screenshots) davon entfernt — was ist beim Umbau am schwersten?',
    '',
    `Befunde nur mit Beleg: ein Abschnitt aus DESIGN.md${withMockups ? ' oder ein Screen-Name' : ' oder ein Screenshot des heutigen Produkts'}. Design-Fragen, die der Besitzer entscheiden muss, gehören in open_questions. Schreibe alle Texte auf Deutsch.`,
  ].join('\n');

async function renderScreens(file) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1480, height: 1000 } });
    await page.goto(pathToFileURL(resolve(file)).href, { waitUntil: 'networkidle' });
    const ids = await page.$$eval('section.screen', (els) => els.map((e) => e.id));
    const shots = [];
    for (const id of ids) {
      await page.evaluate((target) => document.querySelectorAll('section.screen').forEach((s) => s.classList.toggle('on', s.id === target)), id);
      const frame = await page.$(`#${id} .frame`);
      const buffer = await (frame || page).screenshot({ type: 'jpeg', quality: 72 });
      shots.push({ name: id, buffer });
    }
    return shots;
  } finally {
    await browser.close();
  }
}

function referenceShots() {
  const inbox = '.ux-review/inbox';
  const capture = existsSync(inbox) ? readdirSync(inbox).filter((d) => d.startsWith('ux-capture-')).sort().pop() : null;
  if (!capture) return [];
  const wanted = ['02-dashboard-desktop-s1.jpg', '03-analyze-desktop-s1.jpg', '06-testing-desktop-s1.jpg', '08-delivery-desktop-s1.jpg'];
  return wanted.filter((f) => existsSync(join(inbox, capture, f))).map((f) => ({ name: `heute-${f.replace('.jpg', '')}`, buffer: readFileSync(join(inbox, capture, f)) }));
}

async function main() {
  const env = { ...loadDotEnv(), ...process.env };
  const clean = (text) => redactSecrets(text).text;
  const design = clean(readFileSync('DESIGN.md', 'utf8'));
  const withMockups = !process.argv.includes('--design-only') && existsSync(MOCKUPS);
  const mockups = withMockups ? await renderScreens(MOCKUPS) : [];
  const today = referenceShots();
  const images = [...mockups, ...today];
  const text = `${task(withMockups)}\n\n# DESIGN.md\n\n${design}`;
  const estimate = ((clean(loadBrief()).length + text.length) / 3 / 1e6) * PRICE_PER_MTOK.input + ((images.length * TOKENS_PER_IMAGE) / 1e6) * PRICE_PER_MTOK.input + (MAX_OUTPUT_TOKENS / 1e6) * PRICE_PER_MTOK.output;
  console.log(`Design review: ${mockups.length} mockup screens, ${today.length} screenshots of today, estimate $${estimate.toFixed(2)} (cap $${CAP_USD}).`);
  if (DRY) return;
  if (estimate > CAP_USD) throw new Error(`the estimate exceeds the $${CAP_USD} cap.`);

  const user = [{ type: 'text', text }];
  for (const img of images) {
    user.push({ type: 'text', text: `Bild: ${img.name}` });
    user.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img.buffer.toString('base64')}` } });
  }
  const r = await callReviewer({
    apiKey: env.OPENROUTER_API_KEY,
    system: clean(loadBrief()),
    user,
    schema: DESIGN_REVIEW_SCHEMA,
    effort: 'high',
    model: UX_MODEL,
    maxTokens: MAX_OUTPUT_TOKENS,
    name: 'ux_design_review',
    title: 'Clean-Core.io UX Design Review',
    timeoutMs: 20 * 60_000,
  });

  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `design-review-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ model: UX_MODEL, mockups: MOCKUPS, images: images.map((i) => i.name), usage: r.usage, review: r.review }, null, 2));
  const v = r.review;
  console.log(`\nUrteil: ${v.verdict} · Kosten $${r.usage?.cost ?? 'unbekannt'}\n\n${v.summary}\n`);
  for (const f of v.findings) console.log(`[${f.severity}] ${f.target} · ${f.section} — ${f.title}\n  Beobachtung: ${f.observation}\n  Empfehlung: ${f.recommendation}\n  Warum: ${f.rationale}\n`);
  console.log(`Stärken:\n${v.strengths.map((s) => `  + ${s}`).join('\n')}\n\nOffene Fragen:\n${v.open_questions.map((q) => `  ? ${q}`).join('\n')}\n\n${file}`);
}

main().catch((err) => {
  console.error(`Design review failed: ${String(err?.message || err).split('\n')[0]}`);
  process.exit(1);
});
