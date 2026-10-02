import Link from 'next/link';
import {
  Archive,
  ArrowRight,
  BarChart3,
  BookOpen,
  Briefcase,
  Check,
  Code2,
  Download,
  EyeOff,
  FileCheck,
  Hammer,
  Key,
  Link2,
  Lock,
  MapPin,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import PublicHeader from '@/components/PublicHeader';
import SectionHeader from '@/components/SectionHeader';
import SapTrademarkNotice from '@/components/SapTrademarkNotice';
import { SITE_FOOTER_COLUMNS } from '@/components/SiteFooter';
import BpmnPlaneSvg from '@/components/landing/BpmnPlaneSvg';
import CleanCoreSchema from '@/components/landing/CleanCoreSchema';
import { publicButton } from '@/components/landing/public-button';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { getFacts, formatObjectCount } from '@/lib/facts';
import { getReferenceAnalysis } from '@/lib/reference-analysis';
import { SUPPORT_MATRIX } from '@/lib/abap/support-matrix';
import { getObjectDimensions } from '@/lib/abap/catalog-service';
import { getAllCatalogObjectNames, objectToSlug } from '@/lib/abap/catalog-index';
import { SCORE_BANDS, SCORE_NATURE, SCORE_BANDS_SOURCE, bandRange, scoreWithBand } from '@/lib/clean-core-score';
import { CLEAN_CORE_LEVEL } from '@/lib/clean-core-level';
import { PROVENANCE, type ProvenanceValue } from '@/lib/provenance';
import {
  PUBLIC_CLOUD_FIT_BUCKETS,
  PUBLIC_CLOUD_FIT_BUCKET_LABELS,
  PUBLIC_CLOUD_FIT_BUCKET_MEANINGS,
  TARGET_PLATFORM_LABELS,
} from '@/lib/abap/public-cloud-fit';
import { STARTER_EXAMPLES } from '@/lib/starter-examples';
import { TRUST_CLAIMS, SECURITY_MODEL_URL, type TrustClaim } from '@/lib/trust-claims';
import { DEMO_OBJECT_NAME, DEMO_PROJECT_TITLE, DEMO_SOURCE_FILE, DEMO_WORKSPACE_ROUTE } from '@/lib/demo-marks';
import { TOUR_STATIONS } from '@/lib/demo-tour';
import { landingHero, landingProcess } from '@/lib/landing-process';
import { landingStages, STAGE_WORKER_LABEL } from '@/lib/landing-stages';
import { LANDING_FAQ } from '@/lib/landing-faq';
import {
  DOES_NOT_DO,
  FROM_LANDING,
  PROCESS_MORE,
  SIGNING,
  SUMMARY_CARDS,
  TOOLS_LEAD,
  USP_LONG,
  USP_SHORT,
  WHITEPAPER_SECTIONS,
  WORKSPACE_FACTS,
  sectionNumber,
  type WhitepaperSectionId,
} from '@/lib/whitepaper';
import '@/components/landing/landing.css';
import './whitepaper.css';

/**
 * The whitepaper — one document, two editions (roadmap 3.0, owner request
 * 01.10.2026).
 *
 *   - `web`   → `/whitepaper`: the public header, the landing footer, links
 *               that stay on the site.
 *   - `print` → `/whitepaper-print`: a cover page, one section per page, every
 *               answer open, links written out as `clean-core.io/…`.
 *               `scripts/generate-whitepaper-pdf.ts` renders it to
 *               `public/Clean-Core_S4HANA_Modernization_Whitepaper.pdf`, so the
 *               PDF a person is sent is this page and cannot say anything else.
 *
 * The look is the landing page's, not a copy of it: the page sits in the
 * landing's `.lp3` scope and uses `components/landing/landing.css` and
 * `SectionHeader`, so a change to the landing's look changes the whitepaper
 * with it. `./whitepaper.css` adds only what a document needs (the contents,
 * the cover, page breaks).
 *
 * Reading order is business first (memory rule "business readers first"): the
 * decision and the process lead, the technical detail follows. Every figure is
 * read at render time — the catalog census from `lib/facts.ts`, the reference
 * run from `lib/reference-analysis.ts`, levels from the catalog, bands from
 * `lib/clean-core-score.ts`, version and date from `lib/version.ts`.
 */

export type WhitepaperEdition = 'web' | 'print';

const SITE = 'https://clean-core.io';

const TRUST_ICON: Record<TrustClaim['icon'], React.ReactNode> = {
  residency: <MapPin size={18} aria-hidden="true" />,
  access: <Lock size={18} aria-hidden="true" />,
  proxy: <Server size={18} aria-hidden="true" />,
  seal: <FileCheck size={18} aria-hidden="true" />,
  tracking: <EyeOff size={18} aria-hidden="true" />,
  erasure: <Trash2 size={18} aria-hidden="true" />,
  training: <Key size={18} aria-hidden="true" />,
  security: <BookOpen size={18} aria-hidden="true" />,
  free: <Users size={18} aria-hidden="true" />,
};

const BUCKET_ICON: Record<string, React.ReactNode> = {
  retire: <Archive size={18} aria-hidden="true" />,
  'no-catalogued-path': <Lock size={18} aria-hidden="true" />,
  rebuild: <Hammer size={18} aria-hidden="true" />,
  keep: <Check size={18} aria-hidden="true" />,
};

const VIEW_ICON: Record<string, React.ReactNode> = {
  business: <Briefcase className="i" aria-hidden="true" />,
  it: <Code2 className="i" aria-hidden="true" />,
  management: <BarChart3 className="i" aria-hidden="true" />,
};

const SIGNING_ICON = [<FileCheck key="s" size={18} aria-hidden="true" />, <ShieldCheck key="v" size={18} aria-hidden="true" />, <Lock key="n" size={18} aria-hidden="true" />];

const PROVENANCE_GROUPS: Array<{ form: string; meaning: string; values: ProvenanceValue[] }> = [
  { form: 'Filled', meaning: 'settled', values: ['proven', 'confirmed', 'stale'] },
  { form: 'Outline', meaning: 'derived or imported', values: ['reconstructed', 'imported', 'not-determined'] },
  { form: 'Dashed', meaning: 'provisional', values: ['proposed', 'simulation', 'demonstrated-mock'] },
];

/** One section of the document: the landing's band, its numbered header from `WHITEPAPER_SECTIONS`, and the body. */
function Section({ id, lead, alt = false, children }: { id: WhitepaperSectionId; lead?: React.ReactNode; alt?: boolean; children: React.ReactNode }) {
  const { eyebrow, title } = WHITEPAPER_SECTIONS.find((s) => s.id === id)!;
  return (
    <section className={`sec wp-sec${alt ? ' alt' : ''}`} id={id} aria-labelledby={`${id}-title`} data-wp-section={id}>
      <div className="wrap">
        <SectionHeader eyebrow={`${sectionNumber(id)} · ${eyebrow}`} title={title} titleId={`${id}-title`}>
          {lead}
        </SectionHeader>
        {children}
      </div>
    </section>
  );
}

/** A link target: on paper written out in full, so it still works in a forwarded PDF. */
const absolute = (path: string, print: boolean) => (print && path.startsWith('/') ? `${SITE}${path}` : path);

/** A link inside running text; on paper it carries its address. */
function TextLink({ href, print, children }: { href: string; print: boolean; children: React.ReactNode }) {
  if (href.startsWith('http')) {
    return (
      <a href={href} className="textlink" rel="noopener noreferrer" target="_blank">
        {children}
      </a>
    );
  }
  if (print) {
    return (
      <a href={absolute(href, true)} className="textlink">
        {children} <span className="wp-url">(clean-core.io{href === '/' ? '' : href})</span>
      </a>
    );
  }
  return (
    <Link href={href} className="textlink">
      {children}
    </Link>
  );
}

export const PDF_HREF = '/Clean-Core_S4HANA_Modernization_Whitepaper.pdf';

export default function WhitepaperDocument({ edition }: { edition: WhitepaperEdition }) {
  const print = edition === 'print';
  const to = (path: string) => absolute(path, print);

  const facts = getFacts();
  const catalogObjects = formatObjectCount(facts);
  const reference = getReferenceAnalysis();
  const withPage = new Set(getAllCatalogObjectNames());
  const catalogHref = (name: string) => (withPage.has(name) ? `/catalog/${objectToSlug(name)}` : '/sap-clean-core-object-classification');
  const lines = (n: number) => n.toLocaleString('en-US');

  const hero = landingHero(DEMO_SOURCE_FILE, DEMO_OBJECT_NAME);
  const plantRule = hero.rules.shown.find((r) => r.label.includes("'1000'")) ?? hero.rules.shown[0];
  const demoProcess = landingProcess(DEMO_SOURCE_FILE, DEMO_OBJECT_NAME);
  const overview = demoProcess.planes[0];

  const constructs = Object.values(SUPPORT_MATRIX);
  const fullyCovered = constructs.filter((c) => c.level === 'fully').length;
  const partialCover = constructs.filter((c) => c.level === 'partial').length;
  const notCovered = constructs.filter((c) => c.level === 'not-supported').length;

  const ladder = (['A', 'B', 'C', 'D'] as const).map((level) => {
    const example = FROM_LANDING.levelExamples.find((e) => getObjectDimensions(e.name).graded.grade === level);
    return { level, label: CLEAN_CORE_LEVEL[level].label, example };
  });

  const stages = landingStages();
  const chain = FROM_LANDING.chain.map((c) => ({ ...c, d: c.d.replace('{line}', String(plantRule.line)) }));
  const startLead = FROM_LANDING.startLead.replace('{examples}', String(STARTER_EXAMPLES.length));

  const demoHref = `/?auth=signin&next=${DEMO_WORKSPACE_ROUTE}`;

  return (
    <div className={`lp3 wp3 min-h-screen bg-cc-page text-cc-ink${print ? ' print' : ''}`} data-whitepaper={edition}>
      {!print && (
        <div className="wp-noprint">
          <PublicHeader />
        </div>
      )}

      <main id="main" tabIndex={-1}>
        {/* ─── Cover ─── */}
        <section className="hero wp-cover" aria-labelledby="wp-title">
          <div className="mesh" aria-hidden="true" />
          <div className="gridbg" aria-hidden="true" />
          <div className="wrap">
            <div className="hero-copy">
              <p className="kicker">
                <Users className="i" aria-hidden="true" />
                Whitepaper · free for the SAP community
              </p>
              <h1 id="wp-title">
                <span className="h1k">SAP Clean Core Whitepaper</span>
                <span className="h1m">{USP_SHORT}</span>
              </h1>
              <p className="hero-lead wp-usp" data-wp-usp="">
                {USP_LONG}
              </p>
              <p className="hlimits" data-wp-limits="">
                {FROM_LANDING.limits}
              </p>
              <p className="wp-meta">
                <span>Edition {APP_VERSION}</span>
                <span>{APP_RELEASE_DATE}</span>
                <span>Felix Frenzel · Clean-Core.io</span>
                <span>Public</span>
              </p>
              {print ? (
                <p className="wp-cover-link">
                  Read online at <a href={`${SITE}/whitepaper`}>clean-core.io/whitepaper</a> · the demo project is in every free account
                </p>
              ) : (
                <div className="cta-row">
                  <Link href={demoHref} className={publicButton('primary')} data-testid="wp-demo">
                    See the whole chain in the demo <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                  <a href={PDF_HREF} download className={publicButton('secondary')} data-testid="wp-pdf">
                    <Download size={18} aria-hidden="true" /> Download the PDF
                  </a>
                </div>
              )}
            </div>

            <nav className="pcard wp-toc" aria-labelledby="wp-toc-title">
              <h2 id="wp-toc-title" className="wp-toc-k">
                Contents
              </h2>
              <ol>
                {WHITEPAPER_SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>
                      <span className="n">{sectionNumber(s.id)}</span>
                      <span>{s.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </section>

        {/* ─── 01 In one page ─── */}
        <Section id="summary" lead={FROM_LANDING.whatLead} alt>
          <div className="wp-grid3" data-wp-summary="">
            {SUMMARY_CARDS.map((c) => (
              <div key={c.k} className="pcard">
                <p className="k">{c.k}</p>
                <h3 className="wp-h3">{c.t}</h3>
                <p className="wp-p">{c.d}</p>
              </div>
            ))}
          </div>

          <ul className="diff wp-diff">
            {FROM_LANDING.contrast.map((d, i) => (
              <li key={d.title} className="dcard">
                <span className="ic">{i === 0 ? <BookOpen className="i" aria-hidden="true" /> : <RefreshCw className="i" aria-hidden="true" />}</span>
                <h3>{d.title}</h3>
                <p>{d.text}</p>
              </li>
            ))}
            <li className="dcard us">
              <span className="ic">
                <Link2 className="i" aria-hidden="true" />
              </span>
              <h3>Clean-Core.io</h3>
              <p>{FROM_LANDING.contrastUs}</p>
              <p className="more">{FROM_LANDING.contrastUsMore}</p>
            </li>
          </ul>

          <div className="chain" data-wp-chain="">
            <h3>One chain of evidence</h3>
            <p className="sub2">{FROM_LANDING.chainSub}</p>
            <ol className="chain5">
              {chain.map((c, i) => (
                <li key={c.key} data-chain-step={c.key}>
                  <span className="no" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h4>{c.t}</h4>
                  <p>{c.d}</p>
                  <p className="mark">
                    <CcProvenanceChip value={c.pv} />
                    <span className="tag">{c.mark}</span>
                  </p>
                </li>
              ))}
            </ol>
            <p className="honest">{FROM_LANDING.chainHonest}</p>
          </div>
        </Section>

        {/* ─── 02 Process ─── */}
        <Section id="process" lead={FROM_LANDING.processLead}>
          <figure className="pcard wp-figure" aria-labelledby="wp-process-cap">
            <h3>The process of {DEMO_OBJECT_NAME}, reconstructed from the code</h3>
            <figcaption className="sub2" id="wp-process-cap">
              Demo project · fictitious code. The top level of the program as the BPMN 2.0 export writes it — collapsed
              sub-processes open into the next level. {demoProcess.anchored} of {demoProcess.flowNodes} elements of the whole
              program carry a line anchor.
            </figcaption>
            <div className="flow-canvas wp-canvas">
              <BpmnPlaneSvg
                plane={overview}
                idPrefix="wp-process"
                fit
                maxHeight={print ? 640 : undefined}
                title={`The top level of ${DEMO_OBJECT_NAME} as BPMN, reconstructed from the code. Every element carries its line anchor, or says it has none.`}
              />
            </div>
          </figure>

          <div className="feat4">
            {FROM_LANDING.processFeatures.map((f) => (
              <div key={f.t} className="feat">
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
          <div className="wp-feats" data-wp-process-more="">
            {PROCESS_MORE.map((f) => (
              <div key={f.t} className="feat">
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ─── 03 Views ─── */}
        <Section id="views" lead={FROM_LANDING.viewsLead} alt>
          <div className="three">
            <div>
              <div className="stagecard static">
                <div className="st-top">
                  <span className="st-label">Example · {DEMO_PROJECT_TITLE} · fictitious code</span>
                </div>
                <div className="rm3" aria-label="The same rule in three views">
                  {FROM_LANDING.views.map((v) => {
                    const ex = FROM_LANDING.viewExample[v.key as keyof typeof FROM_LANDING.viewExample];
                    return (
                      <div key={v.key}>
                        <h3>{v.name}</h3>
                        <p className="q">{ex.q}</p>
                        <div className="d">
                          <span className="k">Rule {plantRule.id}</span>
                          <span className="anc hot">L{plantRule.line}</span>
                        </div>
                        <p className="s">{ex.a}</p>
                        <div className="d">
                          {v.key === 'business' && <span className="tag">hard-coded in program</span>}
                          {v.key === 'it' && <code>{DEMO_OBJECT_NAME}</code>}
                          {v.key === 'management' && <CcProvenanceChip value="simulation" note="costs" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="vnote">{FROM_LANDING.viewsNote}</p>
            </div>
            <ul className="vlist">
              {FROM_LANDING.views.map((v) => (
                <li key={v.key}>
                  <h3>
                    {VIEW_ICON[v.key]}
                    {v.name}
                  </h3>
                  <p className="q">{v.q}</p>
                  <p className="a">{v.a}</p>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* ─── 04 Clean core ─── */}
        <Section id="clean-core" lead={FROM_LANDING.cleanCoreLead}>
          <div className="cc2">
            <div className="pcard">
              <h3>What clean core means</h3>
              <p className="t">{FROM_LANDING.cleanCoreMeans}</p>
              <CleanCoreSchema />
            </div>
            <div className="pcard">
              <h3>The four levels</h3>
              <p className="sub2">The clean core level of every SAP object the code touches, derived from the states SAP publishes, with a real SAP object on each level.</p>
              <ul className="wp-ladder" data-wp-ladder="">
                {ladder.map((l) => (
                  <li key={l.level}>
                    <CcCleanCoreLevel value={l.level} />
                    <div>
                      <p className="wp-ladder-t">{l.label}</p>
                      {l.example ? (
                        <p className="wp-ladder-d">
                          {print ? <code>{l.example.name}</code> : <Link href={catalogHref(l.example.name)}><code>{l.example.name}</code></Link>}{' '}
                          <CcProvenanceChip value="imported" note="SAP release data" /> {l.example.note}
                        </p>
                      ) : (
                        <p className="wp-ladder-d">No example object on this level in the catalog today.</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="honest">
                Levels follow SAP&apos;s clean core level concept. The level shown for an object is our reading of SAP&apos;s
                published data — an orientation, never part of a signed audit pack. Confirm with ABAP Test Cockpit.
              </p>
              <p className="linkrow">
                <TextLink print={print} href="/method/levels">How levels are assigned</TextLink>
                <TextLink print={print} href="/sap-clean-core-object-classification">Object classification A–D</TextLink>
              </p>
            </div>
          </div>

          <div className="hon wp-gap">
            <div className="pcard">
              <h3>
                Target profile: {TARGET_PLATFORM_LABELS.public} or {TARGET_PLATFORM_LABELS.private}
              </h3>
              <p className="sub2">
                Each project names the S/4HANA edition it moves to. Every SAP object then lands in one of four buckets — the
                first rule that applies wins, and every assignment shows its evidence.
              </p>
              {PUBLIC_CLOUD_FIT_BUCKETS.map((b, i) => (
                <div key={b} className={`bucket${i === 0 ? ' first' : ''}`}>
                  <span className="bi">{BUCKET_ICON[b]}</span>
                  <div>
                    <h4>{PUBLIC_CLOUD_FIT_BUCKET_LABELS[b]}</h4>
                    <p>{FROM_LANDING.bucketRules[b]}</p>
                    <p className="m">{PUBLIC_CLOUD_FIT_BUCKET_MEANINGS[b]}</p>
                  </div>
                </div>
              ))}
              <p className="honest">
                The same level B object is Keep in {TARGET_PLATFORM_LABELS.private} and Rebuild or{' '}
                {PUBLIC_CLOUD_FIT_BUCKET_LABELS['no-catalogued-path']} in {TARGET_PLATFORM_LABELS.public}. Change the target
                platform and the page says what moved.
              </p>
            </div>
            <div className="pcard" data-wp-score="">
              <h3>The Clean Core Score</h3>
              <p className="sub2">
                One figure from 5 to 100 for how far the analysed code is decoupled from the SAP standard core — higher is
                better. {SCORE_NATURE}: SAP publishes no metric of that name, and it is not SAP&apos;s Technical Debt Score,
                which runs the other way.
              </p>
              <ul className="wp-bands">
                {[...SCORE_BANDS].reverse().map((b) => (
                  <li key={b.key}>
                    <span className="r">{bandRange(b)}</span>
                    <div>
                      <b>{b.label}</b>
                      <p>{b.meaning}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="src">{SCORE_BANDS_SOURCE}.</p>
              <p className="linkrow">
                <TextLink print={print} href="/clean-core-score">What the Clean Core Score measures</TextLink>
              </p>
            </div>
          </div>

          <div className="pcard flowcard">
            <h3>Where the evidence comes from</h3>
            <ol className="wp-stations">
              {[
                FROM_LANDING.evidenceStations[0],
                FROM_LANDING.evidenceStations[1],
                {
                  key: 'sap',
                  t: 'SAP’s published data',
                  d: `The Cloudification Repository and SAP’s object classification, ${catalogObjects}, synced ${facts.catalogSyncDate}.`,
                  pv: 'imported' as ProvenanceValue,
                },
                FROM_LANDING.evidenceStations[2],
                FROM_LANDING.evidenceStations[3],
              ].map((s, i) => (
                <li key={s.key}>
                  <span className="no" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <p className="top">
                      <b>{s.t}</b>
                      <CcProvenanceChip value={s.pv} />
                    </p>
                    <p>{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        {/* ─── 05 Tools ─── */}
        <Section id="tools" lead={TOOLS_LEAD} alt>
          <ol className="wp-tools7" data-wp-tools="">
            {stages.map((s) => (
              <li key={s.key} className="pcard">
                <p className="top">
                  <span className="no" aria-hidden="true">
                    {s.n}
                  </span>
                  <b>{s.title}</b>
                </p>
                <p className="wp-p">{s.lines[0]}</p>
                <p className="wp-p m">{s.lines[1]}</p>
                <p className="mark">
                  {s.provenance.map((pv) => (
                    <CcProvenanceChip key={pv} value={pv} />
                  ))}
                  <span className="tag">{STAGE_WORKER_LABEL[s.worker]}</span>
                </p>
              </li>
            ))}
          </ol>
          <p className="honest">
            Delivery lets you export the generated package — the files in standard abapGit layout and the generated tests — to
            compile, activate and test in your own system. Economics shows costs only as a simulation on figures you enter.
          </p>
          <div className="wp-grid3 wp-gap">
            {WORKSPACE_FACTS.map((f) => (
              <div key={f.t} className="pcard">
                <h3 className="wp-h3">{f.t}</h3>
                <p className="wp-p">{f.d}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ─── 06 Honest ─── */}
        <Section
          id="honest"
          lead="Every statement carries its source as a word, an icon and a shape. Nothing simulated passes as proven: missing stays missing, simulated stays simulated, reconstructed stays reconstructed."
        >
          <div className="hon">
            <div className="pcard">
              <h3>Where a statement comes from</h3>
              <p className="sub2">One fixed list. The shape says how firm a statement is.</p>
              {PROVENANCE_GROUPS.map((g) => (
                <div key={g.form} className="pvgroup">
                  <p className="gk">
                    <span className="k">{g.form}</span>
                    <span>{g.meaning}</span>
                  </p>
                  {g.values.map((v) => (
                    <div key={v} className="pvrow">
                      <span>
                        <CcProvenanceChip value={v} />
                      </span>
                      <span>{PROVENANCE[v].meaning}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="pcard">
              <h3>Signed, and what a signature means</h3>
              <p className="sub2">What the code does not show is listed as not determined, with its reason and line — never guessed.</p>
              {SIGNING.map((s, i) => (
                <div key={s.t} className={`tline${i === 0 ? ' first' : ''}`}>
                  <span className="ti">{SIGNING_ICON[i]}</span>
                  <div>
                    <p>
                      <b>{s.t}.</b> {s.d}
                    </p>
                  </div>
                </div>
              ))}
              <p className="linkrow">
                <TextLink print={print} href="/verify-pack">Verify an audit pack</TextLink>
                <TextLink print={print} href="/features/audit-evidence">Audit evidence</TextLink>
              </p>
            </div>
          </div>
        </Section>

        {/* ─── 07 Verify ─── */}
        <Section
          id="verify"
          lead={`Run the published ${lines(reference.linesOfCode)}-line example and you get the same result: the engine is deterministic, the source file ships with the product, and every completed analysis is sealed as a signed run you can verify.`}
          alt
        >
          <div className="refgrid">
            <div className="pcard" data-wp-reference="">
              <h3>The reference run</h3>
              <p className="sub2">
                <code>{reference.fileName}</code>, analysed by the same engine the product uses, computed from the file when the
                page is built.
              </p>
              <div className="bignum">
                <div>
                  <b>{lines(reference.linesOfCode)}</b>lines of code
                </div>
                <div>
                  <b>{reference.totalFindings}</b>findings
                </div>
                <div>
                  <b>{reference.cleanCoreScore}</b>Clean Core Score
                </div>
              </div>
              <p className="src">Score {scoreWithBand(reference.cleanCoreScore)}.</p>
              <ul className="bucket3">
                {[reference.resolved, reference.decision, reference.handedBack].map((b) => (
                  <li key={b.label}>
                    <span className="c">{b.count}</span>
                    <div>
                      <b>{b.label}</b>
                      <p>{b.meaning}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="honest">
                Of the {constructs.length} ABAP construct classes the engine tracks, {fullyCovered} are fully covered,{' '}
                {partialCover} require sign-off and {notCovered} are not supported — published per class, before you upload
                anything. One synthetic reference program is not a codebase, and your ratio will differ.
              </p>
              <p className="linkrow">
                <TextLink print={print} href="/reference-analysis">Open the reference run</TextLink>
              </p>
            </div>
            <div className="pcard">
              <h3>SAP objects this run touched</h3>
              <p className="sub2">
                With the successor from SAP&apos;s own release data. Where the engine uses a curated field-level mapping instead,
                the finding says so.
              </p>
              <ul className="roll">
                {reference.rollCall
                  .filter((o) => o.fromSapData && o.successor)
                  .slice(0, 8)
                  .map((o) => (
                    <li key={o.name}>
                      <span className="nm">{o.name}</span>
                      <ArrowRight className="i" aria-hidden="true" />
                      <code>{o.successor}</code>
                    </li>
                  ))}
              </ul>
              {reference.businessDecisions[0] && (
                <p className="honest">
                  One finding lands on the business: {reference.businessDecisions[0].title} (L
                  {reference.businessDecisions[0].lineStart}). The engine&apos;s recommendation, quoted unedited: &ldquo;
                  {reference.businessDecisions[0].recommendation}&rdquo;
                </p>
              )}
            </div>
          </div>
          <ol className="verify3">
            {FROM_LANDING.verifySteps.map((s) => (
              <li key={s.t}>
                <b>{s.t}</b>
                {s.d}
              </li>
            ))}
            <li>
              <b>3 · Check the seal</b>Verify the signed audit pack — <TextLink print={print} href="/verify-pack">verify a pack</TextLink>.
            </li>
          </ol>
        </Section>

        {/* ─── 08 Toolchain ─── */}
        <Section
          id="toolchain"
          lead="No. ABAP Test Cockpit stays the authoritative check, ADT stays where code is built and tested, and SAP's agents fix code inside your system; Clean-Core.io prepares the evidence and the decision around them."
        >
          <div className="tools" role="table" aria-label="SAP tools and how Clean-Core.io relates to them">
            <div className="tools-row head" role="row">
              <span role="columnheader">SAP tool</span>
              <span role="columnheader">What it is for</span>
              <span role="columnheader">How Clean-Core.io relates</span>
            </div>
            {FROM_LANDING.toolchain.map((row) => (
              <div key={row.tool} className="tools-row" role="row">
                <span role="rowheader">{row.tool}</span>
                <span role="cell">
                  <span className="h">What it is for</span>
                  {row.purpose}
                </span>
                <span role="cell">
                  <span className="h">How Clean-Core.io relates</span>
                  {row.relation.replace('{objects}', catalogObjects)}
                </span>
              </div>
            ))}
          </div>
          <div className="pcard wp-gap wp-not">
            <h3>What it deliberately does not do</h3>
            <ul className="wp-xlist">
              {DOES_NOT_DO.map((d) => (
                <li key={d}>
                  <X className="i" aria-hidden="true" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* ─── 09 Trust ─── */}
        <Section
          id="trust"
          lead="Your code is stored in the EU, reaches the Google Gemini API only through our server, and is never sold or commercially used. Each line below links to the document that says so."
          alt
        >
          <div className="trust">
            <div className="pcard">
              <h3>What we do so you can trust us</h3>
              {TRUST_CLAIMS.filter((c) => c.id !== 'free').map((c, i) => (
                <div key={c.id} className={`tline${i === 0 ? ' first' : ''}`}>
                  <span className="ti">{TRUST_ICON[c.icon]}</span>
                  <div>
                    <p>{c.text}</p>
                    <p className="src">
                      {c.sources.map((s, k) => (
                        <span key={s.href + s.label}>
                          {k > 0 && ' · '}
                          <a href={to(s.href)} {...(s.href.startsWith('http') ? { rel: 'noopener noreferrer', target: '_blank' } : {})}>
                            {s.label}
                          </a>
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="pcard freecard">
              <h3>A free community project</h3>
              {TRUST_CLAIMS.filter((c) => c.id === 'free').map((c) => (
                <p key={c.id} className="big">
                  {c.text}
                </p>
              ))}
              <p className="honest">
                Clean-Core.io is independent and not affiliated with or endorsed by SAP SE. Generated output is a draft that you
                review before any productive use. The code of this product is public:{' '}
                <a href="https://github.com/sonnyfrenzel-rgb/clean-core.io" rel="noopener noreferrer" target="_blank" className="textlink">
                  github.com/sonnyfrenzel-rgb/clean-core.io
                </a>
                .
              </p>
            </div>
          </div>
        </Section>

        {/* ─── 10 Start ─── */}
        <Section id="start" lead={startLead}>
          <ol className="steps3">
            {FROM_LANDING.startSteps.map((s, i) => (
              <li key={s.t}>
                <span className="no" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="cc2">
            <div className="pcard">
              <h3>The demo project and its tour</h3>
              <p className="sub2">
                Every account has the same demo project: the engine&apos;s reading of the example {DEMO_OBJECT_NAME} on every
                stage — fictitious code, a guided tour, and nothing you do there is saved or counted. A demo run is never signed.
              </p>
              <ol className="stations">
                {TOUR_STATIONS.map((s) => (
                  <li key={s.place}>{s.title}</li>
                ))}
              </ol>
            </div>
            <div className="pcard">
              <h3>Read on</h3>
              <p className="linkrow wp-links">
                <TextLink print={print} href="/how-it-works">How it works, and its limits</TextLink>
                <TextLink print={print} href="/clean-core-explained">Clean core, explained without the jargon</TextLink>
                <TextLink print={print} href="/sap-clean-core-object-classification">Object classification A–D</TextLink>
                <TextLink print={print} href="/catalog">The SAP object catalog</TextLink>
                <TextLink print={print} href="/facts">Facts and figures</TextLink>
                <TextLink print={print} href={SECURITY_MODEL_URL}>The security model on GitHub</TextLink>
              </p>
              {!print && (
                <div className="cta-row wp-cta">
                  <Link href={demoHref} className={publicButton('primary')}>
                    Explore the demo <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                  <a href={PDF_HREF} download className={publicButton('secondary')}>
                    <Download size={18} aria-hidden="true" /> Download the PDF
                  </a>
                </div>
              )}
              <div className="wp-author">
                <span className="mark" aria-hidden="true">
                  FF
                </span>
                <div>
                  <b>Felix Frenzel</b>
                  <p>Founder &amp; community builder, Clean-Core.io · Bamberg, Germany</p>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ─── 11 FAQ ─── */}
        <Section id="faq" alt>
          <div className="acc">
            {LANDING_FAQ.map((f, i) => (
              <details key={f.q} open={print || i === 0} lang={f.lang} className="acc-item">
                <summary>
                  <h3>{f.q}</h3>
                </summary>
                <div className="acc-a">
                  <p>{f.a}</p>
                  {f.more && (
                    <p>
                      <TextLink print={print} href={f.more.href}>{f.more.label}</TextLink>
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </Section>
      </main>

      {/* ─── Footer: the landing's ─── */}
      <footer className="foot wp-foot">
        <div className="wrap">
          <div className="foot-top">
            <p>{FROM_LANDING.closing}</p>
            {!print && (
              <div className="cta-row">
                <Link href={demoHref} className={publicButton('primary')}>
                  Explore the demo <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <a href={PDF_HREF} download className={publicButton('ghost')}>
                  Download the PDF
                </a>
              </div>
            )}
          </div>
          {!print && (
            <nav className="foot-grid4" aria-label="Footer">
              <div>
                <Link href="/" className="brand" aria-label="Clean-Core.io home">
                  <span className="mark">
                    <RefreshCw className="i" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="nm">
                      Clean-Core<em>.io</em>
                    </span>
                    <span className="sub">Free Community Edition · complementary to SAP tooling</span>
                  </span>
                </Link>
                <p className="blurb">
                  A free community project for the SAP community: from a custom ABAP program nobody can explain to a decision with
                  evidence.
                </p>
              </div>
              {SITE_FOOTER_COLUMNS.map((col) => (
                <div key={col.heading}>
                  <p className="fk">{col.heading}</p>
                  <ul>
                    {col.links.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href}>{l.label}</Link>
                      </li>
                    ))}
                    {col.heading === 'Legal' && (
                      <li>
                        <a href={SECURITY_MODEL_URL} rel="noopener noreferrer" target="_blank">
                          SECURITY.md on GitHub
                        </a>
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </nav>
          )}
          <p className="disc">
            Generated output is a draft that you review, test and approve before any productive use (
            <a href={to('/terms')}>Terms of Service</a>). The platform is provided free of charge and without warranty.
          </p>
          <div className="disc">
            <SapTrademarkNotice />
          </div>
          <p className="copy">
            © 2026 Clean-Core.io · Whitepaper, edition {APP_VERSION} · {APP_RELEASE_DATE}
            {print && <> · clean-core.io/whitepaper</>}
          </p>
        </div>
      </footer>
    </div>
  );
}
