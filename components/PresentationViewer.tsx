import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Maximize2, ExternalLink } from 'lucide-react';

export interface SlideData {
  title: string;
  type: 'title' | 'bullets' | 'split' | 'quote' | 'metrics' | 'matrix' | 'risk';
  subtitle?: string;
  content?: string[];
  leftContent?: string;
  rightContent?: string;
  quote?: string;
  author?: string;
  speakerNotes?: string;
  metrics?: { label: string; value: string | number; sub?: string }[];
  rows?: {
    col1: string;
    col2: string;
    col3?: string;
    col4?: string;
    status?: 'success' | 'warning' | 'danger' | 'info' | string;
    url?: string;
  }[];
}

export interface PresentationData {
  title: string;
  date: string;
  author: string;
  slides: SlideData[];
}

export const PresentationViewer = ({ data }: { data: PresentationData }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  if (!data || !data.slides || data.slides.length === 0) {
    return <div className="p-8 text-center text-gray-500">No presentation data available.</div>;
  }

  const slide = data.slides[currentSlide];

  const nextSlide = () => setCurrentSlide((prev) => Math.min(prev + 1, data.slides.length - 1));
  const prevSlide = () => setCurrentSlide((prev) => Math.max(prev - 1, 0));

  return (
    <div className="flex flex-col w-full max-w-5xl mx-auto bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-gray-100">
      {/* Slide Content Area */}
      <div className="relative aspect-auto min-h-[300px] sm:aspect-video bg-gradient-to-br from-gray-50 to-gray-100 p-6 sm:p-8 md:p-12 flex flex-col justify-center">
        {/* Slide Number */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-8 text-xs sm:text-sm font-bold text-gray-400">
          {currentSlide + 1} / {data.slides.length}
        </div>
        
        {/* Company/Project Branding */}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-8 text-xs sm:text-sm font-black text-gray-300 uppercase tracking-widest truncate max-w-[60%]">
          {data.title}
        </div>

        {/* Slide Layouts */}
        {slide.type === 'title' && (
          <div className="text-center animate-in fade-in zoom-in-95 duration-500 mt-8 sm:mt-0">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 tracking-tight mb-4 sm:mb-6">{slide.title}</h1>
            {slide.subtitle && <p className="text-lg sm:text-xl md:text-2xl text-gray-500 font-medium">{slide.subtitle}</p>}
            <div className="mt-8 sm:mt-12 text-xs sm:text-sm text-gray-400 font-bold uppercase tracking-widest">
              {data.author} • {new Date().toLocaleDateString()}
            </div>
          </div>
        )}

        {slide.type === 'bullets' && (
          <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8 sm:mt-0">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-6 sm:mb-10 border-b-4 border-green-500 pb-2 sm:pb-4 inline-block self-start">{slide.title}</h2>
            <ul className="space-y-4 sm:space-y-6 flex-grow">
              {slide.content?.map((point, idx) => (
                <li key={idx} className="flex items-start gap-3 sm:gap-4 text-base sm:text-lg md:text-xl text-gray-700">
                  <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-green-500 mt-2 sm:mt-2.5 flex-shrink-0" />
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {slide.type === 'split' && (
          <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8 sm:mt-0">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-6 sm:mb-10 border-b-4 border-blue-500 pb-2 sm:pb-4 inline-block self-start">{slide.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 md:gap-12 flex-grow items-center">
              <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 h-full flex items-center text-base sm:text-lg md:text-xl text-gray-700 leading-relaxed">
                {slide.leftContent}
              </div>
              <div className="bg-gray-900 text-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-xl h-full flex items-center text-base sm:text-lg md:text-xl leading-relaxed">
                {slide.rightContent}
              </div>
            </div>
          </div>
        )}

        {slide.type === 'quote' && (
          <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-500 px-4 sm:px-8 md:px-12 mt-8 sm:mt-0">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-400 uppercase tracking-widest mb-6 sm:mb-8">{slide.title}</h2>
            <blockquote className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-gray-900 leading-tight mb-6 sm:mb-8">
              &quot;{slide.quote}&quot;
            </blockquote>
            {slide.author && <cite className="text-base sm:text-lg md:text-xl text-gray-500 font-medium not-italic">— {slide.author}</cite>}
          </div>
        )}

        {slide.type === 'metrics' && (
          <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8 sm:mt-0">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-2 border-b-4 border-green-500 pb-2 sm:pb-3 inline-block self-start">
              {slide.title}
            </h2>
            {slide.subtitle && (
              <p className="text-xs sm:text-sm text-gray-500 font-bold mb-4 uppercase tracking-wider">{slide.subtitle}</p>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-4">
              {slide.metrics?.map((metric, idx) => (
                <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center text-center">
                  <span className="text-2xl sm:text-4xl font-black text-green-600 tracking-tight mb-1">
                    {metric.value}
                  </span>
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    {metric.label}
                  </span>
                  {metric.sub && (
                    <span className="text-[10px] text-gray-400 mt-0.5 font-medium leading-tight">
                      {metric.sub}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {slide.content && slide.content.length > 0 && (
              <ul className="space-y-1.5 sm:space-y-2 mt-2 flex-grow">
                {slide.content.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {slide.type === 'matrix' && (
          <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8 sm:mt-0">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-2 border-b-4 border-blue-500 pb-2 sm:pb-3 inline-block self-start">
              {slide.title}
            </h2>
            {slide.subtitle && (
              <p className="text-xs sm:text-sm text-gray-500 font-bold mb-4 uppercase tracking-wider">{slide.subtitle}</p>
            )}
            
            <div className="overflow-x-auto rounded-2xl border border-gray-150 shadow-sm bg-white flex-grow">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-150 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="p-3 sm:p-4">Construct</th>
                    <th className="p-3 sm:p-4 text-center">Occurrences</th>
                    <th className="p-3 sm:p-4">Recommendation</th>
                    <th className="p-3 sm:p-4">Level</th>
                    <th className="p-3 sm:p-4 text-right">Spec</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {slide.rows?.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-3 sm:p-4 font-bold text-gray-900">{row.col1}</td>
                      <td className="p-3 sm:p-4 text-center font-bold text-gray-500">{row.col2}</td>
                      <td className="p-3 sm:p-4 text-gray-600 font-medium leading-relaxed">{row.col3}</td>
                      <td className="p-3 sm:p-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                          row.status === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                          row.status === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          row.status === 'danger' ? 'bg-red-50 text-red-700 border border-red-200' :
                          'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          {row.col4}
                        </span>
                      </td>
                      <td className="p-3 sm:p-4 text-right">
                        {row.url ? (
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-[9px] font-black text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-widest"
                          >
                            Doc <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {slide.type === 'risk' && (
          <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8 sm:mt-0">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-2 border-b-4 border-red-500 pb-2 sm:pb-3 inline-block self-start">
              {slide.title}
            </h2>
            {slide.subtitle && (
              <p className="text-xs sm:text-sm text-gray-500 font-bold mb-4 uppercase tracking-wider">{slide.subtitle}</p>
            )}
            
            <div className="overflow-x-auto rounded-2xl border border-gray-150 shadow-sm bg-white flex-grow">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-150 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="p-3 sm:p-4">Identified Risk</th>
                    <th className="p-3 sm:p-4">Owner</th>
                    <th className="p-3 sm:p-4">Mitigation Strategy</th>
                    <th className="p-3 sm:p-4">Quality Gate / Condition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {slide.rows?.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-3 sm:p-4 font-bold text-gray-900 flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          row.status === 'success' ? 'bg-green-500' :
                          row.status === 'warning' ? 'bg-amber-500' :
                          'bg-red-500'
                        }`} />
                        {row.col1}
                      </td>
                      <td className="p-3 sm:p-4 font-bold text-gray-500">{row.col2}</td>
                      <td className="p-3 sm:p-4 text-gray-600 font-medium leading-relaxed">{row.col3}</td>
                      <td className="p-3 sm:p-4 font-bold text-gray-800">{row.col4}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Controls & Speaker Notes */}
      <div className="bg-gray-900 text-white p-4 sm:p-6 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <button 
            onClick={() => setShowNotes(!showNotes)}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${showNotes ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            <FileText size={16} /> Speaker Notes
          </button>
          
          <div className="flex items-center gap-4 w-full sm:w-auto justify-center">
            <button 
              onClick={prevSlide}
              disabled={currentSlide === 0}
              className="p-3 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <button 
              onClick={nextSlide}
              disabled={currentSlide === data.slides.length - 1}
              className="p-3 rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>

        {/* Speaker Notes Panel */}
        {showNotes && (
          <div className="mt-2 sm:mt-4 p-4 sm:p-6 bg-gray-800 rounded-2xl border border-gray-700 animate-in slide-in-from-top-2">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Speaker Notes</h4>
            <p className="text-gray-300 leading-relaxed text-sm">
              {slide.speakerNotes || "No speaker notes for this slide."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
