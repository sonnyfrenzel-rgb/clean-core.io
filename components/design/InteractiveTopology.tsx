'use client';

import { Globe, Network, Terminal, Layers, ShieldCheck, ArrowRight, ArrowDown } from 'lucide-react';

interface InteractiveTopologyProps {
  isAbapCloud: boolean;
}

const ICON = 'w-5 h-5 text-cc-ink-muted';

export default function InteractiveTopology({ isAbapCloud }: InteractiveTopologyProps) {
  // The layers are fixed per route, not derived from the design — so no provenance chip.
  const steps = isAbapCloud ? [
    { label: 'UI Consumer', desc: 'Fiori Elements', icon: <Globe className={ICON} aria-hidden="true" /> },
    { label: 'Service Exposure', desc: 'OData V4 Binding', icon: <Network className={ICON} aria-hidden="true" /> },
    { label: 'Business Logic', desc: 'ABAP ABP Class', icon: <Terminal className={ICON} aria-hidden="true" /> },
    { label: 'Data Modeling', desc: 'Projection CDS', icon: <Layers className={ICON} aria-hidden="true" /> },
    { label: 'ERP Standard', desc: 'Protected Core', icon: <ShieldCheck className={ICON} aria-hidden="true" /> }
  ] : [
    { label: 'UI Consumer', desc: 'Fiori App / API Client', icon: <Globe className={ICON} aria-hidden="true" /> },
    { label: 'BTP CAP App', desc: 'Node.js Microservice', icon: <Terminal className={ICON} aria-hidden="true" /> },
    { label: 'Secure Tunnel', desc: 'BTP Destination', icon: <ShieldCheck className={ICON} aria-hidden="true" /> },
    { label: 'Released API', desc: 'Standard OData / REST', icon: <Network className={ICON} aria-hidden="true" /> },
    { label: 'ERP Core', desc: 'S/4HANA Standard', icon: <Layers className={ICON} aria-hidden="true" /> }
  ];

  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc">
      <div className="mb-6">
        <span className="cc-text-label text-cc-ink-muted">Decoupled Target Architecture Diagram</span>
        <h4 className="cc-text-h2 text-cc-ink mt-1">Interactive Target Topology</h4>
        <p className="cc-text-cell text-cc-ink-muted mt-1">Visualizing the decoupled transactional boundary and clean core interfaces.</p>
      </div>

      <div className="w-full overflow-x-auto pb-2">
        <ol className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-2 md:min-w-[1000px] px-2 pb-2">
          {steps.map((step, idx) => (
            <li key={idx} className="flex flex-col md:flex-row items-center w-full md:w-auto">
              <div className="flex items-center gap-3 bg-cc-surface-muted border border-cc-line p-4 rounded-cc-row w-full md:w-44 lg:w-48">
                <div className="shrink-0">{step.icon}</div>
                <div className="min-w-0">
                  <div className="cc-text-label text-cc-ink-muted truncate">{step.label}</div>
                  <div className="cc-text-h3 text-cc-ink truncate mt-1">{step.desc}</div>
                </div>
              </div>

              {idx < steps.length - 1 && (
                <>
                  <div aria-hidden="true" className="hidden md:flex items-center justify-center shrink-0 w-8 lg:w-12 h-6">
                    <ArrowRight className="w-5 h-5 text-cc-ink-muted" />
                  </div>
                  <div aria-hidden="true" className="flex md:hidden items-center justify-center shrink-0 w-6 h-8">
                    <ArrowDown className="w-5 h-5 text-cc-ink-muted" />
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
