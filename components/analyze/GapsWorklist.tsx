'use client';

import { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  Filter, 
  ArrowUpRight,
  ShieldCheck, 
  ChevronDown, 
  ListFilter,
  Check,
  TrendingUp,
  Brain
} from 'lucide-react';
import clsx from 'clsx';
import type { Project, WorklistItem } from '@/lib/types';
import type { SupportFinding } from '@/lib/abap/class-model';
import GapsPrioritization from './GapsPrioritization';

interface GapsWorklistProps {
  projectId: string;
  project: Project;
  findings: SupportFinding[];
  analysisGaps: Array<{
    title: string;
    severity: 'High' | 'Medium' | 'Low';
    strategy: string;
    rationale: string;
    complexity: 'High' | 'Medium' | 'Low';
  }>;
  showHelpMode: boolean;
  onUpdateWorklist: (updatedWorklist: WorklistItem[]) => Promise<void>;
}

export default function GapsWorklist({
  projectId,
  project,
  findings,
  analysisGaps,
  showHelpMode,
  onUpdateWorklist
}: GapsWorklistProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  // Derive unified worklist items, lazily fallback if not present in Firestore
  const worklistItems = useMemo(() => {
    if (project.worklist && project.worklist.length > 0) {
      return project.worklist;
    }

    const items: WorklistItem[] = [];

    // 1. Map static findings
    findings.forEach((f, idx) => {
      items.push({
        id: `finding-${f.construct}-${idx}`,
        title: f.title,
        category: 'Finding',
        level: f.level === 'fully' ? 'fully' : f.level === 'partial' ? 'review' : 'out_of_scope',
        severity: f.level === 'not-supported' ? 'High' : f.level === 'partial' ? 'Medium' : 'Low',
        location: f.location ? `${f.location.file}:${f.location.line}` : 'main.abap',
        recommendation: f.recommendation,
        status: f.requiresSignOff ? 'open' : 'signed_off',
        effort: f.level === 'not-supported' ? 'High' : f.level === 'partial' ? 'Medium' : 'Low',
        targetAnchor: typeof f.targetAnchor === 'string' ? f.targetAnchor : undefined,
        detail: f.detail
      });
    });

    // 2. Map LLM functional gaps
    analysisGaps.forEach((g, idx) => {
      items.push({
        id: `gap-${idx}`,
        title: g.title,
        category: 'Functional Gap',
        severity: g.severity,
        location: 'S/4HANA Configuration',
        recommendation: g.rationale,
        strategy: g.strategy,
        status: 'open',
        effort: g.complexity
      });
    });

    return items;
  }, [project.worklist, findings, analysisGaps]);

  // Status counters for burndown rollup
  const stats = useMemo(() => {
    const total = worklistItems.length;
    const signedOff = worklistItems.filter(i => i.status === 'signed_off').length;
    const inReview = worklistItems.filter(i => i.status === 'in_review').length;
    const open = worklistItems.filter(i => i.status === 'open').length;

    const signedOffPct = total > 0 ? Math.round((signedOff / total) * 100) : 0;
    const inReviewPct = total > 0 ? Math.round((inReview / total) * 100) : 0;
    const openPct = total > 0 ? Math.round((open / total) * 100) : 0;

    return { total, signedOff, inReview, open, signedOffPct, inReviewPct, openPct };
  }, [worklistItems]);

  // Handle status updates
  const handleStatusChange = async (itemId: string, newStatus: 'open' | 'in_review' | 'signed_off') => {
    setUpdatingItemId(itemId);
    try {
      const updatedList = worklistItems.map(item => {
        if (item.id === itemId) {
          return { ...item, status: newStatus };
        }
        return item;
      });
      await onUpdateWorklist(updatedList);
    } catch (err) {
      console.error('Failed to update backlog item status:', err);
    } finally {
      setUpdatingItemId(null);
    }
  };

  // Filtered list
  const filteredItems = useMemo(() => {
    return worklistItems.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.recommendation.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.location.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesSeverity = severityFilter === 'all' || item.severity === severityFilter || item.effort === severityFilter;
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesSeverity && matchesCategory;
    });
  }, [worklistItems, searchTerm, statusFilter, severityFilter, categoryFilter]);

  // Map functional gaps category to 2x2 matrix gaps category format
  const gapsCat = useMemo(() => {
    const quickWins: any[] = [];
    const complexStandard: any[] = [];
    const strategic: any[] = [];
    const retire: any[] = [];

    analysisGaps.forEach(g => {
      const mappedGap = {
        title: g.title,
        severity: g.severity,
        strategy: g.strategy,
        complexity: g.complexity,
        rationale: g.rationale
      };

      if (g.strategy.toLowerCase().includes('decommission') || g.strategy.toLowerCase().includes('retire')) {
        retire.push(mappedGap);
      } else if (g.complexity === 'Low') {
        quickWins.push(mappedGap);
      } else if (g.strategy.toLowerCase().includes('btp') || g.strategy.toLowerCase().includes('side-by-side')) {
        strategic.push(mappedGap);
      } else {
        complexStandard.push(mappedGap);
      }
    });

    return { quickWins, complexStandard, strategic, retire };
  }, [analysisGaps]);

  return (
    <div className="space-y-10">
      {/* Burndown Rollup Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-6 md:p-8 border border-slate-800 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#10b98115,transparent_50%)]"></div>
        <div className="space-y-2 relative z-10 w-full md:max-w-md">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/30">Migration Burndown</span>
            {stats.signedOffPct === 100 && (
              <span className="text-[9px] font-black uppercase tracking-widest bg-green-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check size={10} strokeWidth={3} /> Cleared
              </span>
            )}
          </div>
          <h3 className="text-2xl font-black tracking-tight">Project Backlog Clearance</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Resolve architectural findings and functional standard fits. All required sign-offs must be cleared to generate the final deployment bundle.
          </p>
        </div>

        {/* Big Counter and Burndown Chart */}
        <div className="flex flex-col sm:flex-row items-center gap-8 relative z-10 shrink-0 w-full md:w-auto">
          <div className="text-center sm:text-left">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Items Signed-Off</span>
            <div className="flex items-baseline gap-2 justify-center sm:justify-start">
              <span className="text-4xl font-black text-white">{stats.signedOff}</span>
              <span className="text-slate-500 text-lg">/</span>
              <span className="text-lg text-slate-400 font-bold">{stats.total}</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 justify-center sm:justify-start mt-0.5">
              <TrendingUp size={12} /> {stats.signedOffPct}% Completed
            </span>
          </div>

          {/* Styled Horizontal Burndown Progress Bar */}
          <div className="flex-1 sm:w-64 space-y-2.5 w-full">
            <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-green-600 transition-all duration-500" 
                style={{ width: `${stats.signedOffPct}%` }}
                title={`Signed Off: ${stats.signedOff} (${stats.signedOffPct}%)`}
              />
              <div 
                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500" 
                style={{ width: `${stats.inReviewPct}%` }}
                title={`In Review: ${stats.inReview} (${stats.inReviewPct}%)`}
              />
              <div 
                className="h-full bg-slate-700 transition-all duration-500" 
                style={{ width: `${stats.openPct}%` }}
                title={`Open: ${stats.open} (${stats.openPct}%)`}
              />
            </div>
            <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              <span className="text-emerald-400">Signed Off ({stats.signedOff})</span>
              <span className="text-amber-400">In Review ({stats.inReview})</span>
              <span>Open ({stats.open})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and List */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="bg-slate-50 border-b border-slate-100 p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ListFilter size={16} className="text-slate-400" />
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-widest">Gaps Backlog Worklist</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Search backlog..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-205 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-green-500 bg-white placeholder-slate-400"
              />
            </div>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="border border-slate-205 rounded-xl px-3 py-2 text-xs font-bold bg-white text-slate-600 focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="Finding">Statischer Finding</option>
              <option value="Functional Gap">Functional Gap</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-slate-205 rounded-xl px-3 py-2 text-xs font-bold bg-white text-slate-600 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="open">🔴 Open</option>
              <option value="in_review">🟡 In Review</option>
              <option value="signed_off">🟢 Signed Off</option>
            </select>
          </div>
        </div>

        {/* Table content */}
        <div className="overflow-x-auto">
          {filteredItems.length > 0 ? (
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-40">Status</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Backlog Item / Code Location</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell w-28">Category</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:table-cell w-28">Effort / Severity</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modernization Action / Mitigation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredItems.map(item => {
                  const isUpdating = updatingItemId === item.id;
                  
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/20 transition-colors align-top group">
                      {/* Status select column */}
                      <td className="py-4 px-6">
                        <div className="relative">
                          <select
                            disabled={isUpdating}
                            value={item.status}
                            onChange={e => handleStatusChange(item.id, e.target.value as any)}
                            className={clsx(
                              "w-36 appearance-none border rounded-xl py-2 pl-3 pr-8 text-[11px] font-bold outline-none cursor-pointer transition-all shadow-sm focus:ring-1 focus:ring-slate-400",
                              item.status === 'signed_off' && "bg-emerald-50/30 text-emerald-800 border-emerald-200 hover:border-emerald-300",
                              item.status === 'in_review' && "bg-amber-50/30 text-amber-800 border-amber-205 hover:border-amber-300",
                              item.status === 'open' && "bg-slate-100/50 text-slate-700 border-slate-205 hover:border-slate-300"
                            )}
                          >
                            <option value="open">🔴 Open</option>
                            <option value="in_review">🟡 In Review</option>
                            <option value="signed_off">🟢 Signed Off</option>
                          </select>
                          <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                      </td>

                      {/* Item details */}
                      <td className="py-4 px-6 space-y-1.5 max-w-[280px]">
                        <h5 className="font-extrabold text-slate-900 text-sm leading-snug">{item.title}</h5>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-50 border border-slate-150 px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                            <span>📍</span>
                            <span>{item.location}</span>
                          </span>
                          {item.targetAnchor && (
                            <a
                              href={`https://clean-core.io/how-it-works#${item.targetAnchor}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[9px] font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-widest flex items-center gap-0.5 hover:underline"
                            >
                              Docs <ArrowUpRight size={10} />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-4 px-6 hidden lg:table-cell">
                        <span className={clsx(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm inline-block",
                          item.category === 'Finding' 
                            ? "bg-blue-50/50 text-blue-700 border-blue-100" 
                            : "bg-purple-50/50 text-purple-700 border-purple-100"
                        )}>
                          {item.category === 'Finding' ? 'Finding' : 'Gap'}
                        </span>
                      </td>

                      {/* Severity/Effort */}
                      <td className="py-4 px-6 hidden sm:table-cell">
                        <span className={clsx(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border inline-block",
                          item.effort === 'High' ? "bg-rose-50 text-rose-700 border-rose-100" :
                          item.effort === 'Medium' ? "bg-amber-50 text-amber-700 border-amber-100" :
                          "bg-emerald-50 text-emerald-700 border-emerald-100"
                        )}>
                          {item.effort}
                        </span>
                      </td>

                      {/* Action detail */}
                      <td className="py-4 px-6 space-y-1 text-slate-650 max-w-[340px]">
                        <p className="leading-relaxed font-semibold">{item.recommendation}</p>
                        {item.strategy && (
                          <div className="flex gap-1.5 items-start mt-1.5 bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-[11px]">
                            <Brain size={12} className="text-purple-500 shrink-0 mt-0.5" />
                            <p className="text-slate-600 font-medium leading-normal">
                              <span className="font-bold text-slate-800">Strategy:</span> {item.strategy}
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center p-12 text-slate-500">
              <span className="text-2xl">🔍</span>
              <p className="text-xs font-bold mt-2">No backlog items matching filters found.</p>
            </div>
          )}
        </div>
      </div>

      {/* 2x2 Prioritization Matrix */}
      <GapsPrioritization showHelpMode={showHelpMode} gapsCat={gapsCat} />
    </div>
  );
}
