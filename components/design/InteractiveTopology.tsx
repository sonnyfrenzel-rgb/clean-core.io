'use client';

import { Globe, Network, Terminal, Layers, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';

interface InteractiveTopologyProps {
  isAbapCloud: boolean;
}

export default function InteractiveTopology({ isAbapCloud }: InteractiveTopologyProps) {
  const steps = isAbapCloud ? [
    { label: 'UI Consumer', desc: 'Fiori Elements', icon: <Globe className="w-5 h-5 text-emerald-450" /> },
    { label: 'Service Exposure', desc: 'OData V4 Binding', icon: <Network className="w-5 h-5 text-emerald-450" /> },
    { label: 'Business Logic', desc: 'ABAP ABP Class', icon: <Terminal className="w-5 h-5 text-emerald-450" /> },
    { label: 'Data Modeling', desc: 'Projection CDS', icon: <Layers className="w-5 h-5 text-emerald-450" /> },
    { label: 'ERP Standard', desc: 'Protected Core', icon: <ShieldCheck className="w-5 h-5 text-emerald-450" /> }
  ] : [
    { label: 'UI Consumer', desc: 'Fiori App / API Client', icon: <Globe className="w-5 h-5 text-emerald-450" /> },
    { label: 'BTP CAP App', desc: 'Node.js Microservice', icon: <Terminal className="w-5 h-5 text-emerald-450" /> },
    { label: 'Secure Tunnel', desc: 'BTP Destination', icon: <ShieldCheck className="w-5 h-5 text-emerald-450" /> },
    { label: 'Released API', desc: 'Standard OData / REST', icon: <Network className="w-5 h-5 text-emerald-450" /> },
    { label: 'ERP Core', desc: 'S/4HANA Standard', icon: <Layers className="w-5 h-5 text-emerald-450" /> }
  ];

  return (
    <div className="bg-slate-950 text-white rounded-[2rem] p-6 sm:p-8 border border-slate-800 shadow-xl relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -ml-16 -mb-16"></div>

      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -20;
          }
        }
        .animate-dash-flow {
          stroke-dasharray: 6, 4;
          animation: dash 1.2s linear infinite;
        }
      `}</style>

      <div className="mb-8 relative z-10">
        <span className="text-[9px] font-bold tracking-widest text-emerald-400 uppercase font-mono">Decoupled Target Architecture Diagram</span>
        <h4 className="text-xl font-black text-white mt-1">Interactive Target Topology</h4>
        <p className="text-xs text-slate-400 mt-1">Visualizing the decoupled transactional boundary and clean core interfaces.</p>
      </div>

      <div className="w-full overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-2 relative z-10 md:min-w-[1000px] px-2 pb-2">
          {steps.map((step, idx) => (
            <div key={idx} className="flex flex-col md:flex-row items-center w-full md:w-auto">
              {/* Step Pill */}
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 hover:border-emerald-500/30 hover:bg-white/10 transition-all duration-300 p-4 rounded-2xl w-full md:w-44 lg:w-48 shadow-sm">
                <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20 shrink-0">
                  {step.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{step.label}</div>
                  <div className="text-xs font-black text-white truncate mt-0.5">{step.desc}</div>
                </div>
              </div>

              {/* Dotted Arrow Connector */}
              {idx < steps.length - 1 && (
                <>
                  {/* Desktop arrow */}
                  <div className="hidden md:flex items-center justify-center shrink-0 w-8 lg:w-12 h-6">
                    <svg className="w-full h-full" viewBox="0 0 48 24" fill="none">
                      <path d="M0 12H44M44 12L38 6M44 12L38 18" stroke="#10B981" strokeWidth="2" className="animate-dash-flow" />
                    </svg>
                  </div>
                  {/* Mobile arrow */}
                  <div className="flex md:hidden items-center justify-center shrink-0 w-6 h-8">
                    <svg className="w-full h-full" viewBox="0 0 24 32" fill="none">
                      <path d="M12 0V28M12 28L6 22M12 28L18 22" stroke="#10B981" strokeWidth="2" className="animate-dash-flow" />
                    </svg>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
