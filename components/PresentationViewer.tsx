import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Maximize2 } from 'lucide-react';

export interface SlideData {
  title: string;
  type: 'title' | 'bullets' | 'split' | 'quote';
  subtitle?: string;
  content?: string[];
  leftContent?: string;
  rightContent?: string;
  quote?: string;
  author?: string;
  speakerNotes?: string;
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
