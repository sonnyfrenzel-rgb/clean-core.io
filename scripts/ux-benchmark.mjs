/**
 * Sends one UX brief and the captured screenshots to three models at once, so a
 * review can be measured against others rather than trusted.
 *
 * It earned its place: on 28 August, Grok 4.6 and GPT-5.6-sol both found a
 * calculation defect on the TCO screen — negative savings, a payback of −116
 * months and "reduced by -Infinity%" — that Claude had shipped that same morning
 * and had not caught, because it never opened that screen. Three models looking
 * at the same 22 pictures is cheap; a customer finding it is not.
 *
 * Usage:
 *   CAPTURE_SCREENS=1 npx playwright test tests/capture-screens.spec.ts
 *   node scripts/ux-benchmark.mjs              # all targets
 *   node scripts/ux-benchmark.mjs grok-4.6     # one
 *
 * Output lands in docs/reviews/ as raw, unedited markdown per model.
 *
 * Grok goes direct to the xAI API, never through OpenRouter — a standing
 * instruction. GLM and GPT-5.6-sol go through OpenRouter, which is where they
 * live. Keys come from .env.local (gitignored): XAI_API_KEY, OPENROUTER_API_KEY.
 *
 * Note on model choice: `z-ai/glm-5.3` — the model used for the code reviews —
 * is text-only on OpenRouter and answers 404 to an image payload. The vision
 * members of that family are `glm-5.3-flash` and `glm-5v-turbo`; the first
 * returned 8,000 tokens of nothing when asked, the second works.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

// The screenshots come from `CAPTURE_SCREENS=1 npx playwright test
// tests/capture-screens.spec.ts`, which seeds a populated project and photographs
// every screen at desktop and phone width. Downscaled here rather than sent at
// full size: a 1440x13000 landing page is a lot of image tokens for a question
// about layout.
const CAPTURE_DIR = 'design-capture';
if (!fs.existsSync(CAPTURE_DIR)) {
  console.error(`No ${CAPTURE_DIR}/ — run: CAPTURE_SCREENS=1 npx playwright test tests/capture-screens.spec.ts`);
  process.exit(1);
}
const imgs = {};
for (const file of fs.readdirSync(CAPTURE_DIR).filter((f) => f.endsWith('.jpg')).sort()) {
  const name = file.replace('.jpg', '');
  const buf = await sharp(path.join(CAPTURE_DIR, file))
    .resize({ width: name.endsWith('-phone') ? 420 : 900, withoutEnlargement: true })
    .jpeg({ quality: 58, mozjpeg: true })
    .toBuffer();
  imgs[name] = buf.toString('base64');
}
const names = Object.keys(imgs).sort();
console.log(`${names.length} Screens, ${Math.round(Object.values(imgs).join('').length / 1024)} KB base64`);

const BRIEF = `Du bist Design-Lead. Du bekommst 22 Screenshots von Clean-Core.io — einer
Plattform, die SAP-ABAP-Altcode nach TypeScript/Node.js modernisiert. Enthalten sind die
Landingpage, das Dashboard und die sieben Workflow-Schritte (Upload → Analyze → Design →
Transformation → Testing → Documentation → Delivery), dazu TCO, Knowledge und Settings.
Jeder Screen liegt als Desktop (1440 px) und als Telefon (390 px) vor; der Dateiname steht
vor dem Bild.

Dies ist die ZWEITE Runde. Die erste hat Schwachstellen gesammelt. Diesmal geht es nicht um
Befunde, sondern um GESTALTUNGSVORSCHLÄGE: was macht diese Oberfläche überzeugender?

SCHWERPUNKT LANDINGPAGE. Sie ist der erste Kontakt mit SAP-Architekten und Fachbereichen.
Widme ihr mindestens ein Drittel deiner Antwort — Aufbau, Rhythmus, Beweisführung,
Typografie-Einsatz, wo der Blick zuerst hinfällt, wo er hängen bleibt, wo er abreißt.

HARTE RANDBEDINGUNGEN — das Grundsetup bleibt und darf nicht verwässert werden:
- Emerald-Grün als einzige Akzentfarbe, Slate-Neutrale, weiße Karten mit großem Radius,
  Versalien-Labels in Mono, IBM-Plex-artige Typografie. Keine neue Farbwelt, keine zweite
  Akzentfarbe, kein Framework-Wechsel, kein Illustrationsstil von der Stange.
- Die sieben Workflow-Schritte bleiben, in dieser Reihenfolge.
- Inhaltlich ändert sich nichts: keine neuen Behauptungen, keine erfundenen Zahlen, keine
  gestrichenen Informationen. Umsortieren, gewichten, gruppieren, Zustände unterscheiden — ja.
- Keine Vorschläge, die nur "mehr Weißraum" oder "größere Typo" sagen. Sei konkret genug,
  dass ein Entwickler es ohne Rückfrage bauen kann.

FORMAT
A) LANDINGPAGE — 5 bis 8 konkrete Vorschläge, jeder mit: was du im Screenshot siehst, was du
   änderst, und warum das die Zielgruppe stärker abholt.
B) WORKFLOW — die 3 stärksten Vorschläge über alle sieben Schritte hinweg.
C) EIN MUTIGER VORSCHLAG — eine Idee, die du für richtig hältst, auch wenn sie Diskussion
   auslöst. Begründe, warum sie das Grundsetup NICHT verwässert.
D) WAS DU NICHT ANFASSEN WÜRDEST — mindestens zwei Dinge, die bereits tragen. Das ist Teil
   der Aufgabe, keine Höflichkeit.

Sei spezifisch, beziehe dich auf sichtbare Elemente, und erfinde nichts, was du nicht siehst.`;

function contentBlocks(kind) {
  const blocks = [{ type: 'text', text: BRIEF }];
  for (const n of names) {
    blocks.push({ type: 'text', text: `\n--- ${n} ---` });
    blocks.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${imgs[n]}` },
    });
  }
  return blocks;
}

const TARGETS = [
  {
    label: 'grok-4.6',
    url: 'https://api.x.ai/v1/chat/completions',
    key: env.XAI_API_KEY,
    body: { model: 'grok-4.6', max_tokens: 8000 },
    headers: {},
  },
  {
    // `z-ai/glm-5.3` — the model that did the code review — is text-only on
    // OpenRouter and answers 404 "No endpoints found that support image input".
    // Two stand-ins: the same generation with vision, and the vision specialist
    // used for yesterday's benefit-card consult.
    label: 'glm-5.3-flash',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: env.OPENROUTER_API_KEY,
    body: { model: 'z-ai/glm-5.3-flash', max_tokens: 8000 },
    headers: { 'HTTP-Referer': 'https://clean-core.io', 'X-Title': 'Clean-Core UX benchmark' },
  },
  {
    label: 'glm-5v-turbo',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: env.OPENROUTER_API_KEY,
    body: { model: 'z-ai/glm-5v-turbo', max_tokens: 8000 },
    headers: { 'HTTP-Referer': 'https://clean-core.io', 'X-Title': 'Clean-Core UX benchmark' },
  },
  {
    label: 'gpt-5.6-sol',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: env.OPENROUTER_API_KEY,
    body: { model: 'openai/gpt-5.6-sol', max_tokens: 8000 },
    headers: { 'HTTP-Referer': 'https://clean-core.io', 'X-Title': 'Clean-Core UX benchmark' },
  },
];

const OUT = 'docs/reviews';
fs.mkdirSync(OUT, { recursive: true });

const only = process.argv[2];

for (const t of TARGETS) {
  if (only && t.label !== only) continue;
  if (!t.key) { console.log(`${t.label}: kein Schlüssel, übersprungen`); continue; }
  const started = Date.now();
  process.stdout.write(`${t.label}: sende ${names.length} Bilder … `);
  try {
    const res = await fetch(t.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${t.key}`,
        'Content-Type': 'application/json',
        ...t.headers,
      },
      body: JSON.stringify({
        ...t.body,
        messages: [{ role: 'user', content: contentBlocks() }],
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.log(`HTTP ${res.status}`);
      console.log(text.slice(0, 400));
      fs.writeFileSync(path.join(OUT, `2026-08-28-ux-round2-${t.label}-ERROR.txt`), text);
      continue;
    }
    const json = JSON.parse(text);
    const msg = json.choices?.[0]?.message?.content || '(leer)';
    const usage = json.usage || {};
    const secs = Math.round((Date.now() - started) / 1000);
    const header =
      `# UX-Benchmark — ${t.label}\n\n` +
      `**Modell:** \`${t.body.model}\` · **Datum:** 2026-08-28 · **Bilder:** ${names.length}\n` +
      `**Verbrauch:** ${usage.prompt_tokens ?? '?'} prompt / ${usage.completion_tokens ?? '?'} completion · ${secs}s\n\n` +
      `Dieselbe Aufgabe wie an Claude, dieselben Screenshots. Unbearbeitet.\n\n---\n\n`;
    fs.writeFileSync(path.join(OUT, `2026-08-28-ux-round2-${t.label}.md`), header + msg + '\n');
    console.log(`ok, ${secs}s, ${usage.completion_tokens ?? '?'} completion tokens`);
  } catch (err) {
    console.log('FEHLER', err.message);
  }
}
