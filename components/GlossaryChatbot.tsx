'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Sparkles, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';
import { callGemini } from '@/lib/gemini';
import { GLOSSARY_ITEMS } from '@/lib/glossary';
import { useUserProfile } from '@/hooks/useUserProfile';
import clsx from 'clsx';
import nextDynamic from 'next/dynamic';

const ReactMarkdown = nextDynamic(() => import('react-markdown'), { ssr: false });

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
    'How do I use abapGit?',
    'Why Released APIs?'
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
      // Formulate S/4HANA Modernization Architect prompt embedding glossary & platform guide context
      const systemPrompt = `You are a professional SAP S/4HANA Modernization Architect chatbot at Clean-Core.io. Your mission is to provide high-grade technical and business assistance to enterprise architects and developers using the Clean-Core.io platform.

You have access to the following platform context:
1. GLOSSARY OF S/4HANA & BTP TERMS:
${JSON.stringify(GLOSSARY_ITEMS, null, 2)}

2. PLATFORM WORKFLOW (HOW-TO GUIDE):
- Step 1 (Technical Analytics): Upload custom ABAP source files. Static analysis parses code, maps database tables, and calculates a Clean Core score.
- Step 2 (Solution Design): Design the side-by-side CAP Node.js blueprint. Maps database operations to Released stable standard S/4HANA Public APIs (api.sap.com) to decouple extensions from ERP tables.
- Step 3 (Code Transformation): AI transforms legacy ABAP into clean ABAP Cloud RAP (abapGit-compliant layout) or modular CAP Node.js files (plus erp-triggers event publisher).
- Step 4 (Testing & Sandbox): Execute tests. For ABAP Cloud, compiles standard ABAP Unit classes (CL_AUNIT_ASSERT) with real ADT Eclipse test cockpits. For BTP, runs containerized Express sandbox tests.
- Step 5 (Handover): Build and download abapGit package (ABAP Cloud RAP) or standard CAP project directories in modular ZIP archives.

3. S/4HANA LIVE TENANT INTEGRATION (BYOT SETUP GUIDE):
Clean-Core.io supports connecting non-productive S/4HANA Cloud or On-Premise tenants directly for live OData connection tests and schema validation. Here is how to set it up:

- Navigate to Settings > "S/4HANA Live Tenant Integration" section (requires Pilot/Premium tier).
- Provide the HTTPS endpoint of your S/4HANA system (e.g. https://my-s4.example.com:443/sap/opu/odata/sap/API_BUSINESS_PARTNER).
- Choose one of the supported authentication methods:
  a) Basic Authentication: Enter a technical communication user and password configured in your S/4HANA system (transaction SU01).
  b) OAuth 2.0 Client Credentials: Provide a Token URL (e.g. https://<subdomain>.authentication.<region>.hana.ondemand.com/oauth/token), Client ID, and Client Secret. Clean-Core.io exchanges these for a Bearer token before calling the S/4 endpoint.
  c) SAP API Hub Sandbox Key: Enter your api.sap.com API key for testing against SAP's public sandbox APIs.
  d) SAP BTP Destination Service (JSON): Paste the full JSON export from your SAP BTP Destination configuration. Clean-Core.io auto-detects the auth type (BasicAuthentication, OAuth2ClientCredentials, PrincipalPropagation, NoAuthentication) and resolves credentials accordingly.
- Click "Test Connection" to perform a live HTTP handshake that verifies endpoint reachability, DNS resolution, TLS certificate validity, and authentication status.
- Click "Save Connection" to persist the configuration securely in Firestore.
- Security: All credentials are stored server-side in encrypted Firestore documents. Passwords and secrets are never exposed in client-side code or logs. TLS is enforced for all outbound connections.
- For the full Knowledge Hub and architecture references, visit /knowledge.

CRITICAL GUARDRAILS AND SAFETY RULES:
- You must under no circumstances be used or "abused" for general-purpose questions unrelated to SAP, S/4HANA, BTP, Clean Core, or the Clean-Core.io platform.
- If the user asks about unrelated topics (e.g. cooking recipes, general Python/Java coding outside of SAP contexts, writing stories/poetry, weather, non-SAP history, pop culture, sports), you must politely but firmly refuse to answer. You should reply EXACTLY in this tone:
"My apologies, but as an SAP S/4HANA Modernization Architect, I am strictly configured to assist only with ERP upgrades, Clean Core guidelines, BTP cloud extensions, and Clean-Core.io platform walk-throughs. Please ask an SAP-related question."
- Keep your answers highly professional, factual, and technically accurate. Use clear corporate English (or German if the user initiates the conversation in German). Use markdown formatting for structures, code snippets, or bullet points. Avoid marketing fluff.`;

      const promptContext = `${systemPrompt}

User Question: ${text}
Assistant Response:`;

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
      {/* Floating Glowing Assistant Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={clsx(
          "fixed bottom-6 right-6 z-[80] p-4 rounded-full shadow-2xl transition-all duration-350 hover:scale-105 active:scale-95 group border flex items-center gap-2",
          isOpen 
            ? "bg-slate-900 text-white border-slate-800" 
            : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30"
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
                      <ReactMarkdown
                        components={{
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-3 rounded-xl border border-slate-250 shadow-inner bg-slate-50/50">
                              <table className="min-w-full divide-y divide-slate-200 text-[10px] m-0">
                                {children}
                              </table>
                            </div>
                          ),
                          th: ({ children }) => (
                            <th className="px-3 py-2 bg-slate-100 text-slate-700 font-extrabold text-left uppercase tracking-wider text-[9px] border-b border-slate-200">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="px-3 py-2 text-slate-600 font-semibold border-t border-slate-150 bg-white">
                              {children}
                            </td>
                          )
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
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
