'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Sparkles, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';
import { callGemini } from '@/lib/gemini';
import { GLOSSARY_ITEMS } from '@/lib/glossary';
import { buildKnowledgeBase } from '@/lib/chatbot-knowledge';
import { useUserProfile } from '@/hooks/useUserProfile';
import clsx from 'clsx';
import { renderMarkdownSafe } from '@/lib/sanitize-html';

interface Message {
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
}

export default function GlossaryChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'bot',
      text: 'Greetings. I am your S/4HANA Modernization Architect Assistant. I can help guide you on Clean Core principles, BTP extensions (CAP), In-App extensions (RAP), released standard APIs, and abapGit handovers. What architecture question can I resolve for you today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const { profile } = useUserProfile();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Listen for global trigger to open the chatbot
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-chatbot', handleOpen);
    return () => window.removeEventListener('open-chatbot', handleOpen);
  }, []);

  const suggestionChips = [
    'Explain RAP vs CAP',
    'How do I set up S/4 Live Tenant?',
    'Walk me through the platform',
    'What is Clean Core?',
    'How does TCO analysis work?',
    'What is BYOK?'
  ];

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: Message = {
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      // Build comprehensive system prompt with full platform knowledge base
      const knowledgeBase = buildKnowledgeBase();

      const systemPrompt = `You are a professional SAP S/4HANA Modernization Architect chatbot at Clean-Core.io. Your mission is to provide high-grade technical and business assistance to enterprise architects and developers using the Clean-Core.io platform.

You have access to the COMPLETE Clean-Core.io platform knowledge base below. Use it to answer questions about ANY part of the platform accurately and in detail.

## GLOSSARY OF S/4HANA & BTP TERMS
${JSON.stringify(GLOSSARY_ITEMS, null, 2)}

${knowledgeBase}

CRITICAL GUARDRAILS AND SAFETY RULES:
- You must under no circumstances be used or "abused" for general-purpose questions unrelated to SAP, S/4HANA, BTP, Clean Core, or the Clean-Core.io platform.
- If the user asks about unrelated topics (e.g. cooking recipes, general Python/Java coding outside of SAP contexts, writing stories/poetry, weather, non-SAP history, pop culture, sports), you must politely but firmly refuse to answer. You should reply EXACTLY in this tone:
"My apologies, but as an SAP S/4HANA Modernization Architect, I am strictly configured to assist only with ERP upgrades, Clean Core guidelines, BTP cloud extensions, and Clean-Core.io platform walk-throughs. Please ask an SAP-related question."
- Keep your answers highly professional, factual, and technically accurate. Use clear corporate English (or German if the user initiates the conversation in German). Use markdown formatting for structures, code snippets, or bullet points. Avoid marketing fluff.
- When referencing platform pages, mention the navigation path (e.g. "Go to Testing > Live Tenant tab") to help users find features quickly.`;

      const promptContext = `${systemPrompt}\n\nUser Question: ${text}\nAssistant Response:`;

      const responseText = await callGemini(promptContext, 'gemini-3-flash-preview', false, profile?.geminiApiKey);

      const botMessage: Message = {
        sender: 'bot',
        text: responseText || 'My apologies, I could not compile a response. Please rephrase your architecture question.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Chatbot error:', error);
      const botMessage: Message = {
        sender: 'bot',
        text: 'Error: Failed to connect to the AI modernization engine. Please ensure your Gemini API key is configured in Settings.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, botMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .prose-chat table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
          font-size: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
        }
        .prose-chat th {
          background-color: #f1f5f9;
          color: #334155;
          font-weight: 800;
          text-align: left;
          padding: 6px 10px;
          border-bottom: 2px solid #e2e8f0;
          text-transform: uppercase;
          font-size: 9px;
        }
        .prose-chat td {
          padding: 6px 10px;
          color: #475569;
          border-top: 1px solid #f1f5f9;
          background-color: #ffffff;
        }
        .prose-chat tr:nth-child(even) td {
          background-color: #f8fafc;
        }
      `}} />

      {/* Floating Glowing Assistant Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={clsx(
          "fixed bottom-6 right-6 z-[80] p-4 rounded-full shadow-2xl transition-all duration-350 hover:scale-105 active:scale-95 group border flex items-center gap-2",
          isOpen 
            ? "bg-slate-900 text-white border-slate-800" 
            : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30",
          (!isOpen && profile?.desktopChatbotEnabled === false) && "md:hidden"
        )}
        title="Open Modernization AI Chatbot"
      >
        {isOpen ? <X size={20} /> : <MessageSquare size={20} className="group-hover:rotate-6 transition-transform" />}
        <span className="text-xs font-black uppercase tracking-wider hidden sm:inline-block pr-1">
          {isOpen ? 'Close AI' : 'Ask AI'}
        </span>
      </button>

      {/* Floating Chat Panel Wrapper */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-2rem)] h-[520px] bg-white border border-slate-200 shadow-2xl rounded-3xl z-[85] flex flex-col justify-between overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
          
          {/* Header */}
          <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20 text-emerald-400">
                <Sparkles size={16} className="animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-white leading-none">SAP Modernization AI</h4>
                <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest block mt-0.5">Architect Assistant</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Active</span>
            </div>
          </div>

          {/* Messages Console (Scrollable) */}
          <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-slate-50/30">
            <div className="bg-slate-100/60 p-3 rounded-2xl border border-slate-200/50 flex gap-2 text-[10px] text-slate-600 leading-normal">
              <ShieldCheck size={14} className="text-slate-500 shrink-0 mt-0.5" />
              <p className="font-semibold">Context-restricted secure sandbox. Focused exclusively on SAP S/4HANA Clean Core architectures.</p>
            </div>

            {messages.map((msg, idx) => {
              const isBot = msg.sender === 'bot';
              
              return (
                <div 
                  key={idx}
                  className={clsx(
                    "flex flex-col max-w-[85%] space-y-1 animate-in fade-in slide-in-from-bottom-1 duration-200",
                    isBot ? "self-start items-start" : "self-end items-end ml-auto"
                  )}
                >
                  <div 
                    className={clsx(
                      "p-3.5 rounded-2xl text-xs font-semibold leading-relaxed shadow-sm border",
                      isBot 
                        ? "bg-white text-slate-800 border-slate-150 rounded-tl-sm prose prose-sm prose-slate max-w-none text-slate-800 prose-headings:text-slate-950 prose-headings:font-extrabold prose-headings:mt-3 prose-headings:mb-1.5 prose-p:my-1.5 prose-p:leading-relaxed prose-ul:my-1.5 prose-ul:pl-4 prose-li:my-0.5 prose-table:my-3"
                        : "bg-emerald-600 text-white border-emerald-500 rounded-tr-sm whitespace-pre-line"
                    )}
                  >
                    {isBot ? (
                      <div 
                        className="prose-chat"
                        dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(msg.text) }} 
                      />
                    ) : msg.text}
                  </div>
                  <span className="text-[8px] font-bold text-slate-400 font-mono tracking-wider px-1">
                    {msg.timestamp}
                  </span>
                </div>
              );
            })}

            {/* AI Loading state */}
            {loading && (
              <div className="self-start flex flex-col items-start space-y-1 animate-pulse">
                <div className="bg-white border border-slate-150 p-3 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-1.5 py-4 px-5">
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Quick suggestions chips */}
          <div className="px-4 py-2 border-t border-slate-100 flex flex-wrap gap-1.5 shrink-0 bg-white select-none">
            {suggestionChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(chip)}
                disabled={loading}
                className="text-[9px] font-bold text-slate-600 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-100 px-2.5 py-1.5 rounded-full transition-all disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Message input panel */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(inputValue); }}
            className="p-3 border-t border-slate-150 bg-white flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              placeholder="Ask S/4HANA Modernization Architect..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={loading}
              className="flex-grow bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white transition-all disabled:opacity-75"
            />
            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="p-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-green-100 disabled:opacity-50 disabled:hover:bg-emerald-600 cursor-pointer shrink-0 transition-all active:scale-95"
            >
              <Send size={14} />
            </button>
          </form>

        </div>
      )}
    </>
  );
}
