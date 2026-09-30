'use client';

import { useState, useMemo } from 'react';
import { ShieldCheck, HelpCircle, Link2 } from 'lucide-react';
import type { SupportFinding } from '@/lib/abap/class-model';
import SupportLevelMark from '@/components/analyze/SupportLevelMark';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcCodeSurface, { type CcCodeLine } from '@/components/cc/CodeSurface';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';

/** A snippet as plain lines for the code surface — no highlighting is claimed. */
function snippetLines(code: string): CcCodeLine[] {
  return code.split('\n').map((text, index) => ({ number: index + 1, tokens: [{ kind: 'plain', text }] }));
}

interface SecurityHardeningItem {
  category: string;
  requirement: string;
  packageOrConfig: string;
}

interface SecurityHardeningChecklistProps {
  securityHardening?: SecurityHardeningItem[];
  /** Optional findings from Analyze — used to map hardening items to specific constructs */
  findings?: SupportFinding[];
}

/** Maps hardening keywords to relevant construct types from the SUPPORT_MATRIX */
const HARDENING_CONSTRUCT_MAP: Record<string, string[]> = {
  'auth': ['badi-enhancement', 'dynamic-call'],
  'jwt': ['badi-enhancement', 'dynamic-call'],
  'principal': ['badi-enhancement'],
  'token': ['badi-enhancement', 'dynamic-call'],
  'access control': ['badi-enhancement', 'direct-select'],
  'dcl': ['badi-enhancement', 'direct-select'],
  'authority': ['badi-enhancement'],
  'audit': ['kernel-call', 'rtti-dynamic-type'],
  'dependency': ['kernel-call', 'rtti-dynamic-type', 'missing-dependency'],
  'helmet': ['dynpro-screen'],
  'csp': ['dynpro-screen'],
  'xss': ['dynpro-screen'],
  'injection': ['complex-sql-join', 'direct-select'],
  'sql': ['complex-sql-join', 'direct-select'],
};

export const securityTermExplanations: Record<string, { title: string, explanation: string, technicalImpact: string, implementationPattern: string }> = {
  jwt: {
    title: 'Stateless JWT Validation',
    explanation: 'JSON Web Token (JWT) stateless validation enables the Node.js application to securely authenticate incoming requests without querying a central session database. It checks the cryptographic signature of the token using trusted public keys (e.g., from XSUAA or Identity Providers), guaranteeing identity and scope permissions.',
    technicalImpact: 'Stateless authentication reduces latency, eliminates database bottleneck overheads, and enables horizontal scaling of the microservices.',
    implementationPattern: "app.use(passport.authenticate('JWT', { session: false }));"
  },
  helmet: {
    title: 'Helmet.js Security Headers',
    explanation: 'Helmet.js is a crucial middleware that secures Express applications by automatically configuring essential HTTP headers. This mitigates common web vulnerabilities like Cross-Site Scripting (XSS), Clickjacking, MIME-sniffing, and HTTP Parameter Pollution.',
    technicalImpact: 'Enforces secure defaults such as Content-Security-Policy (CSP) and Strict-Transport-Security (HSTS), shielding the application from client-side injection exploits.',
    implementationPattern: "import helmet from 'helmet';\napp.use(helmet());"
  },
  principal: {
    title: 'Principal Propagation',
    explanation: 'Principal Propagation securely forwards the identity and security context of the logged-in cloud user to the legacy SAP backend (S/4HANA). This ensures backend execution respects the exact user identity, preserving core auditing, access controls, and user-level logging.',
    technicalImpact: 'Ensures zero bypass of corporate governance, maintaining exact user traceability and compliance records in the ERP core.',
    implementationPattern: "// Propagates JWT token to backend destination\nconst dest = await Connectivity.getDestination({ \n  destinationName: 'S4HANA_Backend',\n  jwt: userJwtToken \n});"
  },
  audit: {
    title: 'Supply-Chain Dependency Auditing',
    explanation: 'Dependency auditing scans NPM packages for documented vulnerabilities during development and CI/CD pipelines. This blocks malicious software packages, outdated libraries with active CVE exploits, and prototype pollution hazards from entering production.',
    technicalImpact: 'Guarantees the integrity of the supply chain, ensuring only hardened, security-cleared packages are compiled and deployed.',
    implementationPattern: "npm audit --audit-level=high"
  },
  default: {
    title: 'Security Hardening Protocol',
    explanation: 'This security protocol establishes enterprise-grade security rules for the transformed architecture. It ensures standard data protections, boundary checks, and access controls are actively enforced across all application layers.',
    technicalImpact: 'Mitigates common vulnerabilities listed in the OWASP Top 10, protecting enterprise cloud environments.',
    implementationPattern: "See architectural standard configuration guides."
  }
};

export const getSecurityExplanation = (req: string, pkg: string) => {
  const text = `${req} ${pkg}`.toLowerCase();
  if (text.includes('jwt') || text.includes('token') || text.includes('auth')) return securityTermExplanations.jwt;
  if (text.includes('helmet')) return securityTermExplanations.helmet;
  if (text.includes('principal') || text.includes('propagation')) return securityTermExplanations.principal;
  if (text.includes('audit') || text.includes('dependency') || text.includes('snyk')) return securityTermExplanations.audit;
  return securityTermExplanations.default;
};

export default function SecurityHardeningChecklist({ securityHardening, findings }: SecurityHardeningChecklistProps) {
  const [activeTerm, setActiveTerm] = useState<string | null>(null);

  // Build a mapping of hardening item index → matched findings
  const hardeningToFindings = useMemo(() => {
    if (!findings || findings.length === 0 || !securityHardening) return new Map<number, SupportFinding[]>();
    const map = new Map<number, SupportFinding[]>();
    securityHardening.forEach((item, idx) => {
      const text = `${item.requirement} ${item.packageOrConfig} ${item.category}`.toLowerCase();
      const matchedConstructs = new Set<string>();
      for (const [keyword, constructs] of Object.entries(HARDENING_CONSTRUCT_MAP)) {
        if (text.includes(keyword)) {
          constructs.forEach(c => matchedConstructs.add(c));
        }
      }
      if (matchedConstructs.size > 0) {
        const matched = findings.filter(f => matchedConstructs.has(f.construct));
        if (matched.length > 0) map.set(idx, matched);
      }
    });
    return map;
  }, [securityHardening, findings]);

  if (!securityHardening || securityHardening.length === 0) return null;

  const matchedItem = activeTerm ? securityHardening.find((h) => h.requirement === activeTerm) : undefined;
  const explanation = activeTerm ? getSecurityExplanation(activeTerm, matchedItem?.packageOrConfig || '') : null;

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc flex flex-col justify-between">
      <div>
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="cc-text-h2 text-cc-ink">Security Hardening Checklist</h4>
            {/* The checklist items are the model's; the explanations behind "Explain" are ours. */}
            <CcProvenanceChip value="proposed" />
          </div>
          <p className="cc-text-cell text-cc-ink-muted mt-1">Concrete actions to secure the side-by-side Node.js application.</p>
        </div>

        <ul className="space-y-3">
          {securityHardening.map((item, idx) => (
            <li
              key={idx}
              data-security-item={idx}
              className="bg-cc-surface-muted p-4 rounded-cc-row border border-cc-line flex items-start gap-3"
            >
              <ShieldCheck className="w-4 h-4 mt-1 text-cc-ink-muted shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cc-text-h3 text-cc-ink">{item.category}</span>
                    <span className="font-cc-mono cc-text-meta text-cc-ink-muted">({item.packageOrConfig})</span>
                  </div>
                  <CcButton
                    variant="ghost"
                    icon={<HelpCircle size={16} aria-hidden={true} />}
                    onClick={() => setActiveTerm(item.requirement)}
                    aria-haspopup="dialog"
                  >
                    Explain
                  </CcButton>
                </div>
                <p className="cc-text-cell text-cc-ink mt-1">{item.requirement}</p>
                {/* Construct coupling: the findings of the analysis this item answers */}
                {hardeningToFindings.has(idx) && (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {hardeningToFindings.get(idx)!.map((f, fIdx) => (
                      <li
                        key={fIdx}
                        className="inline-flex items-center gap-1 cc-text-meta text-cc-ink"
                        title={f.recommendation}
                      >
                        <Link2 className="w-4 h-4 text-cc-ink-muted" aria-hidden="true" />
                        <SupportLevelMark level={f.level} />
                        <span aria-hidden="true" className="text-cc-ink-muted">·</span>
                        <span>{f.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Specialist term explanation */}
      <CcDialog
        open={Boolean(activeTerm && explanation)}
        title={explanation?.title ?? ''}
        lead="Specialist Security Concept"
        size="wide"
        onClose={() => setActiveTerm(null)}
        actions={
          <CcButton variant="ghost" onClick={() => setActiveTerm(null)}>
            Acknowledge & Close
          </CcButton>
        }
      >
        {explanation ? (
          <div className="space-y-5">
            <div>
              <h3 className="cc-text-label text-cc-ink-muted mb-1">Description</h3>
              <p className="cc-text-body text-cc-ink">{explanation.explanation}</p>
            </div>

            <div>
              <h3 className="cc-text-label text-cc-ink-muted mb-1">Technical & Architectural Impact</h3>
              <p className="cc-text-cell text-cc-ink">{explanation.technicalImpact}</p>
            </div>

            {matchedItem && (
              <div className="grid grid-cols-2 gap-4 border-y border-cc-line py-3">
                <div>
                  <span className="cc-text-label text-cc-ink-muted block">Requirement Category</span>
                  <span className="cc-text-h3 text-cc-ink mt-1 block">{matchedItem.category}</span>
                </div>
                <div>
                  <span className="cc-text-label text-cc-ink-muted block">NPM / Configuration Target</span>
                  <span className="font-cc-mono cc-text-identifier text-cc-ink mt-1 block">{matchedItem.packageOrConfig}</span>
                </div>
              </div>
            )}

            <div>
              <h3 className="cc-text-label text-cc-ink-muted mb-2">Implementation Snippet</h3>
              <CcCodeSurface label={`${explanation.title} — implementation snippet`} lines={snippetLines(explanation.implementationPattern)} />
            </div>
          </div>
        ) : null}
      </CcDialog>
    </div>
  );
}
