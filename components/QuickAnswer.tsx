'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface QuickAnswerProps {
  question: string;
  answer: string;
}

export default function QuickAnswer({ question, answer }: QuickAnswerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-green-50/50 rounded-3xl p-6 border border-green-100 shadow-sm max-w-4xl mx-auto text-left md:text-center">
      <h2 className="text-[10px] sm:text-xs font-black text-green-800 uppercase tracking-widest mb-2 text-center md:text-center">Quick Answer</h2>
      
      {/* Mobile Toggle Button (hidden on desktop) */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full md:hidden flex items-center justify-between text-left focus:outline-none py-1"
        aria-expanded={isOpen}
      >
        <span className="text-sm sm:text-base font-bold text-gray-950 pr-4 leading-tight">{question}</span>
        <span className="shrink-0 bg-green-100/50 p-1.5 rounded-full border border-green-200/40">
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-green-800" />
          ) : (
            <ChevronDown className="w-4 h-4 text-green-800" />
          )}
        </span>
      </button>

      {/* Desktop Heading (hidden on mobile) */}
      <h3 className="hidden md:block text-base font-bold text-gray-950 mb-2 text-center">
        {question}
      </h3>

      {/* Answer Paragraph: Toggleable on mobile, always visible on desktop */}
      <p className={`text-xs sm:text-sm text-gray-700 leading-relaxed font-medium mt-3 md:mt-0 ${isOpen ? 'block' : 'hidden'} md:block`}>
        {answer}
      </p>
    </div>
  );
}
