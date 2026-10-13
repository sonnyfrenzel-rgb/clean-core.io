import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import CcTable from '@/components/cc/Table';
import { DSAG_REVIEWED_COMMIT } from '@/lib/dsag-citations';
import { SAP_REFERENCE_REVIEWED } from '@/lib/sap-reference-citations';
import type { SapReferenceKey } from '@/lib/sap-references';

export const metadata: Metadata = withTwitterCard({
  title: 'Third-Party Notices & Licenses | Clean-Core.io',
  description:
    'Licenses and attributions for the software and data behind Clean-Core.io: SAP Cloudification Repository, SAP Architecture Center, DSAG guide, Clean ABAP.',
  alternates: {
    canonical: 'https://clean-core.io/licenses',
  },
  openGraph: {
    title: 'Third-Party Notices & Licenses | Clean-Core.io',
    description:
      'Attributions for the open-source software and data Clean-Core.io is built on.',
    url: 'https://clean-core.io/licenses',
    type: 'website',
  },
});

/** Direct production dependencies grouped by their SPDX license (verified against installed packages). */
const COMPONENTS: { license: string; packages: string[] }[] = [
  {
    license: 'MIT',
    packages: [
      'next', 'react', 'react-dom', 'react-markdown', 'react-syntax-highlighter',
      'recharts', 'mermaid', 'motion', '@xyflow/react', '@hookform/resolvers',
      'marked', 'date-fns', 'clsx', 'tailwind-merge', 'exceljs', 'file-saver',
      'jsdom', 'jwks-rsa', 'pino', 'pino-pretty', 'postcss', 'autoprefixer',
      'esbuild', 'tsx', '@next/bundle-analyzer',
    ],
  },
  {
    license: 'Apache-2.0',
    packages: ['firebase', 'firebase-admin', '@google/genai', 'class-variance-authority'],
  },
  { license: 'ISC', packages: ['lucide-react'] },
  { license: 'MPL-2.0 OR Apache-2.0', packages: ['dompurify'] },
  { license: 'MIT OR GPL-3.0-or-later', packages: ['jszip'] },
];

/** Aggregate license breakdown across the full production dependency tree (CycloneDX SBOM). */
const TREE_SUMMARY: { license: string; count: number }[] = [
  { license: 'MIT', count: 540 },
  { license: 'Apache-2.0', count: 89 },
  { license: 'ISC', count: 69 },
  { license: 'BSD-3-Clause', count: 25 },
  { license: 'BlueOak-1.0.0', count: 5 },
  { license: 'BSD-2-Clause', count: 4 },
  { license: 'Other / dual-licensed / undeclared (MIT-0, 0BSD, CC0-1.0, Unlicense, …)', count: 14 },
];

/** The four SAP reference sources synced weekly (roadmap 3.0.12, owner decision 13.10.2026); commits from lib/sap-reference-citations.ts. */
const SAP_REFERENCES: { key: SapReferenceKey; title: string; owner: string; licence: string; used: string; changes: string }[] = [
  {
    key: 'abap-cheat-sheets',
    title: 'ABAP cheat sheets',
    owner: 'SAP SE or an SAP affiliate company and abap-cheat-sheets contributors',
    licence: 'Apache License, Version 2.0',
    used: 'Reference for ABAP Cloud usage: RAP, application jobs, application logs, mail, XCO and released APIs.',
    changes: 'Structure followed, no code copied; metadata and hashes synced weekly.',
  },
  {
    key: 'abap-platform-refscen-flight',
    title: 'ABAP RAP flight reference scenario',
    owner: 'SAP SE or an SAP affiliate company and abap-platform-refscen-flight contributors',
    licence: 'Apache License, Version 2.0',
    used: 'Reference RAP application (CDS, behavior definitions, access control, authorization, draft) and template for the RAP scaffold.',
    changes: 'Structure followed, no code copied; metadata and hashes synced weekly.',
  },
  {
    key: 'styleguides',
    title: 'Clean ABAP',
    owner: 'SAP SE or an SAP affiliate company and styleguides contributors',
    licence: 'Creative Commons Attribution 3.0 Unported (CC BY 3.0)',
    used: 'Rules for generated ABAP.',
    changes: 'Rules cited and partly enabled through abaplint, paraphrased; no text of the guide is copied; section hashes synced weekly.',
  },
  {
    key: 'abap-file-formats',
    title: 'ABAP file formats',
    owner: 'SAP SE or an SAP affiliate company and ABAP file formats contributors',
    licence: 'MIT License',
    used: 'JSON schemas of the ABAP object types our scaffolds produce, to validate generated object files.',
    changes: 'Schemas copied unchanged, with the upstream licence notice; metadata and hashes synced weekly.',
  },
];

/* Block D, D.25b: the --cc-* tokens, no 900 weights, nothing below 11 px. */
const H2 = 'mb-3 text-sm font-bold uppercase tracking-[0.08em] text-cc-ink';
const LINK = 'font-semibold text-cc-ink underline underline-offset-4 decoration-cc-field-border hover:decoration-cc-ink';
const CODE = 'rounded bg-cc-surface-muted px-1 py-0.5 font-cc-mono text-xs text-cc-ink';

export default function LicensesPage() {
  return (
    <div className="font-sans text-cc-ink">
      <main className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <h1 className="text-3xl md:text-5xl font-extrabold text-cc-ink tracking-[-0.03em] mb-4">
          Third-Party Notices <span className="text-cc-ink-muted font-medium text-2xl md:text-3xl">&amp; Licenses</span>
        </h1>
        <p className="text-cc-ink-muted leading-relaxed mb-12">
          Clean-Core.io is built on and incorporates third-party open-source software and data.
          We are grateful to their authors. This page provides the required attributions and license references.
        </p>

        <div className="space-y-10 text-cc-ink leading-relaxed">
          {/* SAP Cloudification Repository */}
          <section>
            <h2 className={H2}>
              Data — SAP Cloudification Repository
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                Clean-Core.io incorporates data from the <strong>SAP Cloudification Repository</strong>{' '}
                (<a href="https://github.com/SAP/abap-atc-cr-cv-s4hc" className={LINK} target="_blank" rel="noopener noreferrer">github.com/SAP/abap-atc-cr-cv-s4hc</a>),
                © 2020–{new Date().getFullYear()} SAP SE or an SAP affiliate company and the{' '}
                <code className={CODE}>abap-atc-cr-cv-s4hc</code> contributors.
              </p>
              <p>
                Licensed under the <strong>Apache License, Version 2.0</strong>. A copy of the license is available at{' '}
                <a href="https://www.apache.org/licenses/LICENSE-2.0" className={LINK} target="_blank" rel="noopener noreferrer">apache.org/licenses/LICENSE-2.0</a>.
              </p>
              <p>
                <strong>Modifications:</strong> the data has been normalized to Clean-Core.io&rsquo;s
                internal catalog schema and merged with Clean-Core.io&rsquo;s own curated mappings, which take precedence.
              </p>
              <p>
                <strong>No NOTICE file:</strong> the upstream repository does not ship an
                Apache <code className={CODE}>NOTICE</code> text file, so Apache-2.0 §4(d) does not apply.
              </p>
            </div>
          </section>

          <hr className="border-cc-line" />

          {/* SAP Architecture Center */}
          <section>
            <h2 className={H2}>
              Data — SAP Architecture Center
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                Clean-Core.io includes metadata of the reference architectures in the <strong>SAP Architecture Center</strong>{' '}
                (<a href="https://github.com/SAP/architecture-center" className={LINK} target="_blank" rel="noopener noreferrer">github.com/SAP/architecture-center</a>)
                — their IDs, titles, last-update dates and archive state — and quotes one passage of the reference
                architecture RA0001, © 2024 SAP SE or an SAP affiliate company and the architecture-center contributors.
              </p>
              <p>
                Licensed under the <strong>Apache License, Version 2.0</strong>. A copy of the license is available at{' '}
                <a href="https://www.apache.org/licenses/LICENSE-2.0" className={LINK} target="_blank" rel="noopener noreferrer">apache.org/licenses/LICENSE-2.0</a>.
              </p>
              <p>
                <strong>Modifications:</strong> the metadata is read into Clean-Core.io&rsquo;s own format; which
                reference architecture fits which target is Clean-Core.io&rsquo;s own mapping, not SAP&rsquo;s. No
                diagram is included — the reference architectures are linked, not embedded.
              </p>
              <p>
                <strong>No NOTICE file:</strong> the upstream repository does not ship an
                Apache <code className={CODE}>NOTICE</code> text file (checked 10.10.2026), so Apache-2.0 §4(d) does not apply.
              </p>
            </div>
          </section>

          <hr className="border-cc-line" />

          {/* SAP documentation on GitHub (SAP-docs) */}
          <section>
            <h2 className={H2}>
              Data — SAP documentation on GitHub
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                Clean-Core.io includes the IDs and titles of SAP communication scenarios extracted from a few documents of
                SAP&rsquo;s documentation sources on GitHub (<a href="https://github.com/SAP-docs" className={LINK} target="_blank" rel="noopener noreferrer">github.com/SAP-docs</a>),
                © SAP SE or an SAP affiliate company and contributors. Each fact is shown with the document and the commit it was read from.
              </p>
              <p>
                Licensed under the <strong>Creative Commons Attribution 4.0 International</strong> licence (CC BY 4.0), as each
                repository&rsquo;s <code className={CODE}>REUSE.toml</code> states; the licence is checked again on every weekly sync. A copy of the licence is available at{' '}
                <a href="https://creativecommons.org/licenses/by/4.0/" className={LINK} target="_blank" rel="noopener noreferrer">creativecommons.org/licenses/by/4.0</a>.
              </p>
              <p>
                <strong>Modifications:</strong> only the scenario ID, the title the text pairs with it and the product the
                document is about are extracted; nothing else of the text is kept. Where an exported document uses such a fact,
                it carries an attribution section naming the source document.
              </p>
            </div>
          </section>

          <hr className="border-cc-line" />

          {/* DSAG ABAP-Leitfaden */}
          <section>
            <h2 className={H2}>
              Guidance — DSAG ABAP-Leitfaden
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                Some rules of Clean-Core.io&rsquo;s ABAP analysis and generated code are adapted from the{' '}
                <strong>&ldquo;DSAG ABAP-Leitfaden&rdquo;</strong> by DSAG e.V. and{' '}
                <a href="https://1dsag.github.io/ABAP-Leitfaden/authors/" className={LINK} target="_blank" rel="noopener noreferrer">contributors</a>,
                published at{' '}
                <a href="https://1dsag.github.io/ABAP-Leitfaden/" className={LINK} target="_blank" rel="noopener noreferrer">1dsag.github.io/ABAP-Leitfaden</a>{' '}
                from the repository{' '}
                <a href={`https://github.com/1DSAG/ABAP-Leitfaden/tree/${DSAG_REVIEWED_COMMIT}`} className={LINK} target="_blank" rel="noopener noreferrer">github.com/1DSAG/ABAP-Leitfaden</a>{' '}
                (reviewed at commit <code className={CODE}>{DSAG_REVIEWED_COMMIT.slice(0, 8)}</code>).
              </p>
              <p>
                Licensed under the <strong>Creative Commons Attribution 4.0 International License</strong> (CC BY 4.0), available at{' '}
                <a href="https://creativecommons.org/licenses/by/4.0/" className={LINK} target="_blank" rel="noopener noreferrer">creativecommons.org/licenses/by/4.0</a>.
              </p>
              <p>
                <strong>Changes:</strong> translated from German, excerpted, paraphrased and corrected where outdated or
                inconsistent; metadata and section hashes synced weekly. No image of the guide is reused.
              </p>
              <p>
                <strong>No endorsement:</strong> use of the guide does not imply that DSAG e.V. or its authors endorse
                Clean-Core.io or the way it uses the guide.
              </p>
            </div>
          </section>

          <hr className="border-cc-line" />

          {/* SAP reference sources on GitHub */}
          <section>
            <h2 className={H2}>
              Guidance and schemas — SAP reference sources on GitHub
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                Clean-Core.io uses four SAP repositories on GitHub as references for its ABAP analysis and generated code.
                Each is synced weekly; what is taken from each is listed per item, with the file or section it rests on.
              </p>
              <ul className="space-y-4">
                {SAP_REFERENCES.map((s) => {
                  const r = SAP_REFERENCE_REVIEWED[s.key];
                  return (
                    <li key={s.key} className="rounded-2xl border border-cc-line bg-cc-surface p-4 space-y-2">
                      <p>
                        <strong>{s.title}</strong> —{' '}
                        <a href={`https://github.com/${r.repo}/tree/${r.commit}`} className={LINK} target="_blank" rel="noopener noreferrer">github.com/{r.repo}</a>{' '}
                        (reviewed at commit <code className={CODE}>{r.commit.slice(0, 8)}</code>), &copy; {s.owner}.
                      </p>
                      <p>
                        Licensed under the <strong>{s.licence}</strong>, available at{' '}
                        <a href={r.licenceUrl} className={LINK} target="_blank" rel="noopener noreferrer">{r.licenceUrl.replace(/^https:\/\/(www\.)?/, '')}</a>.
                      </p>
                      <p>{s.used}</p>
                      <p>
                        <strong>Changes:</strong> {s.changes}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <p>
                <strong>No NOTICE file:</strong> neither Apache-2.0 repository ships an Apache{' '}
                <code className={CODE}>NOTICE</code> text file, so Apache-2.0 §4(d) does not apply.
              </p>
              <p>
                <strong>No endorsement:</strong> use of these sources does not imply that SAP SE or the contributors endorse
                Clean-Core.io or the way it uses them.
              </p>
            </div>
          </section>

          <hr className="border-cc-line" />

          {/* Direct components */}
          <section>
            <h2 className={H2}>
              Software Components
            </h2>
            <p className="text-sm mb-5">
              Clean-Core.io&rsquo;s primary open-source components, grouped by license. Each component remains under its own
              license; the full license texts are available in the respective projects.
            </p>
            <div className="space-y-4">
              {COMPONENTS.map((group) => (
                <div key={group.license} className="rounded-2xl border border-cc-line bg-cc-surface p-4">
                  <div className="cc-text-label text-cc-ink-muted mb-2">{group.license}</div>
                  <div className="flex flex-wrap gap-2">
                    {group.packages.map((pkg) => (
                      <code key={pkg} className="rounded border border-cc-line bg-cc-surface-muted px-2 py-0.5 font-cc-mono text-xs font-semibold text-cc-ink">{pkg}</code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Full tree summary */}
          <section>
            <h2 className={H2}>
              Full Dependency Tree
            </h2>
            <p className="text-sm mb-4">
              A CycloneDX SBOM is generated by our security workflow and reviewed per build. Across the production
              dependency tree, the license inventory breaks down approximately as follows. This is a generated
              inventory (which may include dual-licensed or undeclared entries), not a legal certification:
            </p>
            <div className="rounded-2xl border border-cc-line bg-cc-surface p-3">
              <CcTable
                caption="License inventory of the production dependency tree"
                columns={[
                  { key: 'license', label: 'License' },
                  { key: 'count', label: 'Components', numeric: true },
                ]}
                rows={TREE_SUMMARY.map((row) => ({
                  key: row.license,
                  cells: { license: row.license, count: <span className="font-cc-mono font-bold">{row.count}</span> },
                }))}
              />
            </div>
          </section>

          <hr className="border-cc-line" />

          {/* AI models */}
          <section>
            <h2 className={H2}>
              AI Models
            </h2>
            <p className="text-sm">
              AI processing uses the <strong>Google Gemini API</strong>. When you use your own key (BYOK), your use is
              governed by your agreement with Google and Google&rsquo;s applicable terms.
            </p>
          </section>

          {/* Trademarks */}
          <div className="p-5 bg-cc-surface-muted border border-cc-line rounded-2xl">
            <p className="text-xs font-medium text-cc-ink-muted leading-relaxed">
              <strong className="text-cc-ink">Trademark Notice:</strong> SAP, S/4HANA, ABAP and other SAP product
              names are trademarks of SAP SE, used for identification and reference only. Clean-Core.io is an independent
              project and is not affiliated with, or endorsed by, SAP SE (Apache-2.0 §6 grants no trademark rights).
            </p>
          </div>

          <div className="pt-8 border-t border-cc-line text-center text-xs text-cc-ink-muted font-semibold font-cc-mono uppercase tracking-[0.08em]">
            Clean-Core.io {APP_VERSION} ({APP_RELEASE_DATE})
          </div>
        </div>
      </main>
    </div>
  );
}
