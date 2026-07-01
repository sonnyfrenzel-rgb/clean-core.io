'use client';

import { useState } from 'react';
import { Shield, Database, Activity, Users, AlertTriangle, Monitor, Clock, ArrowRightLeft, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

export interface NFRData {
  dataMigration?: string;
  dataRetention?: string;
  auditTrail?: string;
  authorizationConcept?: string;
  errorHandling?: string;
  monitoring?: string;
  slaRequirements?: string;
  cutoverStrategy?: string;
}

interface Props {
  nfr: NFRData | null | undefined;
}

const NFR_ITEMS: { key: keyof NFRData; label: string; icon: typeof Shield; color: string }[] = [
  { key: 'dataMigration', label: 'Data Migration Strategy', icon: Database, color: 'text-blue-600 bg-blue-50 border-blue-100' },
  { key: 'dataRetention', label: 'Data Retention & Archival', icon: Clock, color: 'text-purple-600 bg-purple-50 border-purple-100' },
  { key: 'auditTrail', label: 'Audit Trail & Compliance', icon: Shield, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  { key: 'authorizationConcept', label: 'Authorization Concept', icon: Users, color: 'text-amber-600 bg-amber-50 border-amber-100' },
  { key: 'errorHandling', label: 'Error Handling & Retry', icon: AlertTriangle, color: 'text-rose-600 bg-rose-50 border-rose-100' },
  { key: 'monitoring', label: 'Monitoring & Observability', icon: Monitor, color: 'text-cyan-600 bg-cyan-50 border-cyan-100' },
  { key: 'slaRequirements', label: 'SLA Requirements', icon: Activity, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
  { key: 'cutoverStrategy', label: 'Cutover & Parallel Operation', icon: ArrowRightLeft, color: 'text-slate-600 bg-slate-50 border-slate-100' },
];

export default function NonFunctionalRequirements({ nfr }: Props) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  if (!nfr) return null;

  // Check if any NFR fields are populated
  const hasContent = NFR_ITEMS.some(item => nfr[item.key]);
  if (!hasContent) return null;

  const toggle = (key: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-8 py-5 sm:py-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-2 rounded-xl backdrop-blur-md">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">Enterprise Readiness</span>
            <h3 className="text-lg sm:text-xl font-black tracking-tight">Non-Functional Requirements</h3>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {NFR_ITEMS.map(({ key, label, icon: Icon, color }) => {
          const content = nfr[key];
          if (!content) return null;
          const isOpen = openItems.has(key);
          const colorClasses = color.split(' ');

          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="w-full text-left px-4 sm:px-8 py-4 hover:bg-slate-50/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={clsx('p-1.5 rounded-lg border shrink-0', colorClasses[1], colorClasses[2])}>
                    <Icon className={clsx('w-4 h-4', colorClasses[0])} />
                  </div>
                  <span className="font-bold text-sm text-slate-900 truncate">{label}</span>
                </div>
                {isOpen
                  ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                }
              </div>
              {isOpen && (
                <div className="mt-3 ml-10 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {content}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
