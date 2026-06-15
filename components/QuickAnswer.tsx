interface QuickAnswerProps {
  question: string;
  answer: string;
}

export default function QuickAnswer({ question, answer }: QuickAnswerProps) {
  return (
    <div className="bg-green-50/50 rounded-3xl p-6 border border-green-100 shadow-sm max-w-4xl mx-auto text-left md:text-center">
      <h2 className="text-[10px] sm:text-xs font-black text-green-800 uppercase tracking-widest mb-2 text-center">Quick Answer</h2>

      {/* Mobile: collapsible via native <details> — no JS, fully SSR-safe */}
      <details className="md:hidden" open>
        <summary className="flex items-center justify-between text-left cursor-pointer py-1 list-none [&::-webkit-details-marker]:hidden">
          <span className="text-sm sm:text-base font-bold text-gray-950 pr-4 leading-tight">{question}</span>
          <span className="shrink-0 bg-green-100/50 p-1.5 rounded-full border border-green-200/40">
            <svg className="w-4 h-4 text-green-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </summary>
        <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-medium mt-3">
          {answer}
        </p>
      </details>

      {/* Desktop: always visible, no toggle needed */}
      <div className="hidden md:block">
        <h3 className="text-base font-bold text-gray-950 mb-2 text-center">
          {question}
        </h3>
        <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-medium">
          {answer}
        </p>
      </div>
    </div>
  );
}
