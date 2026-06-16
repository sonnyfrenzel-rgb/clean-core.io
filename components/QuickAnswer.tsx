interface QuickAnswerProps {
  question: string;
  answer: string;
}

export default function QuickAnswer({ question, answer }: QuickAnswerProps) {
  return (
    <div className="bg-green-50/50 rounded-3xl p-6 border border-green-100 shadow-sm max-w-4xl mx-auto text-left md:text-center">
      <span className="text-[10px] sm:text-xs font-black text-green-800 uppercase tracking-widest mb-2 block text-center">Quick Answer</span>


      <h3 className="text-sm sm:text-base font-bold text-gray-950 mb-2 md:mb-2 leading-tight md:text-center">
        {question}
      </h3>
      <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-medium">
        {answer}
      </p>
    </div>
  );
}
