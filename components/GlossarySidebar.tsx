'use client';

import { useState, useMemo } from 'react';
import { GLOSSARY_ITEMS } from '@/lib/glossary';
import { BookOpen, X, Search, ChevronRight, HelpCircle, Layers } from 'lucide-react';
import clsx from 'clsx';

export default function GlossarySidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);

  // Convert glossary dictionary into a list
  const glossaryList = useMemo(() => {
    return Object.values(GLOSSARY_ITEMS);
  }, []);

  // Filter items dynamically based on search query and category selector
  const filteredItems = useMemo(() => {
    return glossaryList.filter((item) => {
      const matchesSearch = 
        item.shortName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.definition.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = !selectedCategory || item.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [glossaryList, searchQuery, selectedCategory]);

  const categories = ['ERP Core', 'BTP Extension', 'Architecture', 'Integration'];

  const toggleTerm = (term: string) => {
    setExpandedTerm((prev) => (prev === term ? null : term));
  };

  return (
    <>
      {/* Floating Glowing Premium Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-24 sm:right-40 z-[80] bg-emerald-600 hover:bg-emerald-500 text-white p-4 rounded-full shadow-2xl transition-all duration-350 hover:scale-105 active:scale-95 group flex items-center gap-2 border border-emerald-500/30"
        title="Open Clean Core Glossary Guide"
      >
        <BookOpen size={20} className="group-hover:rotate-6 transition-transform" />
        <span className="text-xs font-black uppercase tracking-wider hidden sm:inline-block pr-1">Glossary</span>
      </button>

      {/* Floating Drawer overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-[100] bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200"
          ></div>

          {/* Right Sliding Drawer */}
          <div 
            className="fixed top-0 right-0 h-full w-[420px] max-w-full bg-white z-[105] shadow-2xl border-l border-slate-200 flex flex-col justify-between animate-in slide-in-from-right duration-350"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="text-emerald-600 w-5 h-5" />
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 leading-none">Clean Core Glossary</h3>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mt-1">S/4HANA Modernization Guide</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Container (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Search input */}
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-450" />
                <input
                  type="text"
                  placeholder="Search glossary terms..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-xs font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                />
              </div>

              {/* Category selector capsules */}
              <div className="space-y-2">
                <span className="text-[9px] font-bold text-slate-450 uppercase tracking-wider block font-mono">Filter by Category</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={clsx(
                      "text-[10px] px-3 py-1.5 rounded-full font-bold uppercase border transition-all shadow-sm",
                      !selectedCategory
                        ? "bg-slate-900 border-slate-900 text-white"
                        : "bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-100"
                    )}
                  >
                    All Terms
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={clsx(
                        "text-[10px] px-3 py-1.5 rounded-full font-bold uppercase border transition-all shadow-sm",
                        selectedCategory === cat
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-100"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Terms list */}
              <div className="space-y-3.5">
                <span className="text-[9px] font-bold text-slate-450 uppercase tracking-wider block font-mono">Glossary Definitions ({filteredItems.length})</span>
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => {
                    const isExpanded = expandedTerm === item.shortName;
                    
                    return (
                      <div 
                        key={item.shortName}
                        className={clsx(
                          "border rounded-2xl bg-white shadow-sm overflow-hidden transition-all duration-300",
                          isExpanded ? "border-emerald-500/40 ring-1 ring-emerald-500/10 shadow-md" : "border-slate-150 hover:border-slate-250"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleTerm(item.shortName)}
                          className="w-full flex items-center justify-between p-4 text-left focus:outline-none"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <h4 className="font-extrabold text-slate-900 text-sm">{item.shortName}</h4>
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                                {item.category}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium block leading-none truncate max-w-[280px]">
                              {item.term}
                            </span>
                          </div>
                          <ChevronRight size={14} className={clsx("text-slate-400 transition-transform shrink-0 ml-2", isExpanded && "transform rotate-90 text-emerald-600")} />
                        </button>

                        <div className={clsx(
                          "transition-all duration-300 ease-in-out overflow-hidden border-slate-100",
                          isExpanded ? "max-h-[500px] border-t p-4 bg-slate-50/50 space-y-4" : "max-h-0"
                        )}>
                          <p className="text-[11px] text-slate-650 leading-relaxed font-medium bg-white p-3 rounded-xl border border-slate-150/60 shadow-sm">
                            {item.definition}
                          </p>
                          <div className="bg-emerald-50/45 p-3 rounded-xl border border-emerald-100/50 flex gap-2 text-[10px] text-emerald-800 leading-normal">
                            <HelpCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="block text-[8px] font-black text-emerald-700 uppercase tracking-wider font-mono">Clean Core Implication</span>
                              <p className="font-semibold mt-0.5">{item.cleanCoreImplication}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Layers size={36} className="text-slate-350 mx-auto mb-3" />
                    <p className="text-xs text-slate-400 font-semibold">No glossary terms matched your filters.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 text-center text-[10px] text-slate-400 font-semibold">
              Clean-Core.io Architecture Framework
            </div>
          </div>
        </>
      )}
    </>
  );
}
