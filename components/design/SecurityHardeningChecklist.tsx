'use client';

import { useState, useMemo } from 'react';
import { ShieldCheck, HelpCircle, X, Link2 } from 'lucide-react';
import clsx from 'clsx';
import type { SupportFinding } from '@/lib/abap/class-model';
import { LEVEL_EMOJI } from '@/lib/abap/support-matrix';

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

  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between">
      <div>
        <div className="mb-6">
          <h4 className="font-extrabold text-slate-900 text-lg">Security Hardening Checklist</h4>
          <p className="text-xs text-slate-405 mt-1">Concrete actions to secure the side-by-side Node.js application.</p>
        </div>
        
        <div className="space-y-3">
          {securityHardening.map((item, idx) => (
            <div 
              key={idx} 
              onClick={() => setActiveTerm(item.requirement)}
              className="bg-slate-50 p-4 rounded-2xl border border-slate-105 flex items-start gap-3.5 text-xs hover:border-emerald-500/40 hover:bg-slate-100/30 cursor-pointer transition-all shadow-sm active:scale-[0.98] group"
            >
              <div className="bg-emerald-100/50 p-1.5 rounded-xl text-emerald-600 shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">{item.category}</span>
                    <span className="text-[9px] text-slate-400 font-mono font-medium bg-slate-200/50 px-1.5 py-0.5 rounded">({item.packageOrConfig})</span>
                  </div>
                  <span className="text-[9px] font-bold text-slate-400 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <HelpCircle className="w-3 h-3 text-emerald-500" /> Explain
                  </span>
                </div>
                <p className="text-slate-600 mt-1 leading-relaxed">{item.requirement}</p>
                {/* Construct coupling badges */}
                {hardeningToFindings.has(idx) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {hardeningToFindings.get(idx)!.map((f, fIdx) => (
                      <span
                        key={fIdx}
                        className={clsx(
                          'inline-flex items-center gap-1 text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border',
                          f.level === 'not-supported' ? 'bg-red-50 text-red-600 border-red-100' :
                          f.level === 'partial' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                          'bg-emerald-50 text-emerald-600 border-emerald-100'
                        )}
                        title={f.recommendation}
                      >
                        <Link2 className="w-2.5 h-2.5" />
                        {LEVEL_EMOJI[f.level]} {f.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Specialist Term Modal Overlay */}
      {activeTerm && (() => {
        let matchedItem = securityHardening.find((h) => h.requirement === activeTerm);
        const explanation = getSecurityExplanation(activeTerm, matchedItem?.packageOrConfig || '');

        return (
          <div 
            className="fixed inset-0 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md z-[100] animate-in fade-in duration-200"
            onClick={() => setActiveTerm(null)}
          >
            <div 
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-xl w-full text-white shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative gradient blob */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none"></div>
              
              <button 
                onClick={() => setActiveTerm(null)}
                className="absolute top-5 right-5 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 p-1.5 rounded-full transition-colors"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3.5 mb-6">
                <div className="bg-emerald-500/20 p-2 rounded-2xl text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">Specialist Security Concept</span>
                  <h3 className="text-xl font-extrabold text-white mt-0.5">{explanation.title}</h3>
                </div>
              </div>

              <div className="space-y-5 text-sm">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">Description</h4>
                  <p className="text-slate-300 leading-relaxed">{explanation.explanation}</p>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">Technical & Architectural Impact</h4>
                  <p className="text-slate-400 leading-relaxed text-xs">{explanation.technicalImpact}</p>
                </div>

                {matchedItem && (
                  <div className="grid grid-cols-2 gap-4 border-y border-slate-850 py-3.5 my-2">
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Requirement Category</span>
                      <span className="text-xs font-bold text-slate-200 mt-1 block">{matchedItem.category}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">NPM / Configuration Target</span>
                      <span className="text-xs font-mono font-bold text-emerald-400 mt-1 block">{matchedItem.packageOrConfig}</span>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">Implementation Snippet</h4>
                  <pre className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto">
                    <code>{explanation.implementationPattern}</code>
                  </pre>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveTerm(null)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-xl transition-all shadow-lg shadow-emerald-950/20 active:scale-95"
                >
                  Acknowledge & Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
