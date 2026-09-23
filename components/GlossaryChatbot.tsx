'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, X, Send, PenLine, ShieldCheck } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { callGemini } from '@/lib/gemini';
import { GLOSSARY_ITEMS } from '@/lib/glossary';
import { glossaryAnswerFor } from '@/lib/glossary-lookup';
import { buildKnowledgeBase } from '@/lib/chatbot-knowledge';
import { useUserProfile } from '@/hooks/useUserProfile';
import clsx from 'clsx';
import { renderMarkdownSafe } from '@/lib/sanitize-html';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { readSource, decisionLines, type DecisionLine } from '@/lib/first-look';
import { buildWorkspaceSearchIndex, type SearchResult } from '@/lib/workspace-search';
import {
  answerCase,
  citedAnchors,
  preAnsweredDecisionAnswer,
  PRE_ANSWERED_QUESTION,
  UNANCHORED_PROPOSAL,
  type CaseFact,
} from '@/lib/case-answer';
import { cleanModelText } from '@/lib/model-text';
import { provenance, type ProvenanceValue } from '@/lib/provenance';

interface Message {
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  /**
   * Set when this message was answered from the glossary rather than a model
   * call — roadmap 6.6, `DESIGN.md` §6.1: *"eine Frage „What is …?" zu einem
   * Glossarbegriff beantwortet der Eintrag selbst … die Antwort nennt, wenn sie
   * aus dem Glossar kommt"*. Undefined on every other message, including the
   * greeting, so the badge appears only where it is true.
   */
  source?: 'glossary';
  /** The SAP source the entry names, when it has one (ADR-034). */
  glossarySource?: string;
  /**
   * Roadmap 6.8 — inside a project every statement is bound to the code it
   * rests on. These are the line anchors of the evidence the answer was built
   * from; for a model proposal they are the anchors the proposal *itself*
   * cited, not the ones it was offered, because the offer is not the claim.
   * An in-project bot message with none of these is by construction one of the
   * two "nothing to show" answers — never an assertion about the code.
   */
  anchors?: string[];
  /** The evidence itself, listed under an answer that has to show its working. */
  evidence?: readonly CaseFact[];
  /** Which row of `lib/provenance.ts` this answer is. Absent outside a project. */
  provenance?: ProvenanceValue;
  /** True when no model was called for this message — the glossary and case paths. */
  noModelCall?: boolean;
}

/**
 * Everything the assistant is allowed to know inside one project — roadmap 6.8.
 *
 * The index is the one roadmap 6.6 already built (`lib/workspace-search.ts`),
 * read off the same reading of the source the workspace itself renders, so a
 * question and the ⌘K dialog cannot disagree about what is in this code.
 */
interface CaseContext {
  projectId: string;
  legacyCode: string;
  index: SearchResult[];
  decisions: DecisionLine[];
  /** Why there is no evidence, when there is none — shown instead of silence. */
  unreadable: string | null;
}

async function loadCaseContext(projectId: string): Promise<CaseContext> {
  const empty = (unreadable: string | null): CaseContext => ({
    projectId, legacyCode: '', index: [], decisions: [], unreadable,
  });

  try {
    const project = await loadProjectAndHydrate(projectId);
    if (!project) return empty('This project could not be read, so there is no evidence to answer from.');

    const legacyCode = typeof project.legacyCode === 'string' ? project.legacyCode : '';
    const reading = legacyCode.trim() ? readSource(legacyCode) : null;
    return {
      projectId,
      legacyCode,
      index: buildWorkspaceSearchIndex({ projectId, project, reading }),
      decisions: reading ? decisionLines(reading.skeleton) : [],
      unreadable: reading ? null : 'No source has been staged in this project, so there is nothing to read an answer out of.',
    };
  } catch {
    // A failed read is not a reason to fall back to general SAP knowledge —
    // that is exactly the boundary this step draws. An empty index makes every
    // question end in "no evidence", which is the honest outcome.
    return empty('The evidence of this project could not be loaded, so nothing can be answered from it.');
  }
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

  /**
   * Roadmap 6.8, owner decision of 15.09.2026: **no second chat**. The same
   * assistant answers everywhere, and the only thing that changes is where it
   * is allowed to get an answer from. Inside a project that is the project's
   * own evidence and nothing else; outside it is the product knowledge base,
   * exactly as before.
   *
   * Which of the two it is comes from the path rather than from a prop,
   * because this component is mounted once in `app/(app)/layout.tsx` and there
   * is no context to thread one through (the house rule: Firestore is the
   * source of truth, not a provider tree).
   */
  const pathname = usePathname();
  const projectId = useMemo(() => {
    const match = /^\/project\/([^/]+)/.exec(pathname ?? '');
    return match ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  /**
   * One name for the assistant, derived from the one thing that decides what it
   * does. `app/(app)/layout.tsx` builds the same label from the same regex for
   * the header and the account menu; keeping the expression identical is the
   * point — two spellings of "am I in a project" drift apart.
   */
  const assistantLabel = projectId ? 'Ask this case' : 'Ask the assistant';

  const [caseContext, setCaseContext] = useState<CaseContext | null>(null);
  const caseContextRef = useRef<Promise<CaseContext> | null>(null);
  const caseProjectRef = useRef<string | null>(null);

  /**
   * The project's evidence, read once per project and then reused.
   *
   * Kept in a promise ref rather than only in state so that a question typed
   * before the warm-up finishes waits for the same read instead of starting a
   * second one — two readings of one source are two places for the line
   * numbers to disagree, which is the defect `lib/process-facts.ts` names.
   */
  const ensureCase = (id: string): Promise<CaseContext> => {
    if (caseProjectRef.current !== id || !caseContextRef.current) {
      caseProjectRef.current = id;
      caseContextRef.current = loadCaseContext(id).then((ctx) => {
        setCaseContext(ctx);
        return ctx;
      });
    }
    return caseContextRef.current;
  };

  // Warm the evidence up when the panel opens inside a project, so the first
  // question does not pay for the read. Nothing here answers anything.
  useEffect(() => {
    if (!isOpen || !projectId) return;
    void ensureCase(projectId);
  }, [isOpen, projectId]);

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

  /**
   * Roadmap 2.7 — the question answered in advance, out of the branches of the
   * code and without a model call. Offered as the first chip inside a project,
   * and only when the code actually branches somewhere: a chip that leads to
   * "this program branches in 0 places" teaches nothing.
   */
  const hasPreAnswer = Boolean(projectId && preAnsweredDecisionAnswer(caseContext?.decisions ?? []));

  const suggestionChips = projectId
    ? [
        ...(hasPreAnswer ? [PRE_ANSWERED_QUESTION] : []),
        'What is Clean Core?',
      ]
    : [
        'Explain RAP vs CAP',
        'How do I set up S/4 Live Tenant?',
        'Walk me through the platform',
        'What is Clean Core?',
        'How does TCO analysis work?',
        'What is BYOK?'
      ];

  const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const say = (message: Omit<Message, 'sender' | 'timestamp'>) =>
    setMessages((prev) => [...prev, { sender: 'bot', timestamp: now(), ...message }]);

  /**
   * The in-project half — roadmap 6.8. Everything it can say comes out of
   * `lib/case-answer.ts`, and there are exactly three outcomes:
   *
   *   - **no evidence** — no model call at all, and the reader is told that
   *     nothing in this project matched. This is the outcome the step is
   *     really about: the assistant does not fall back on general SAP
   *     knowledge to have *something* to say.
   *   - **answered from the evidence** — the pre-answered decision question of
   *     roadmap 2.7. Also no model call; marked *Reconstructed*, because that
   *     is what a statement read off the code is (`DESIGN.md` §4).
   *   - **a model proposal, grounded** — the model sees the anchored evidence
   *     and nothing else, and the reply is only shown if it cites at least one
   *     of those anchors. Marked *Model proposal*.
   */
  const answerInProject = async (id: string, text: string): Promise<void> => {
    const context = await ensureCase(id);
    const decision = answerCase(
      context.index,
      { projectId: id, legacyCode: context.legacyCode },
      text,
      context.decisions,
    );

    if (decision.mode === 'no-evidence') {
      say({
        text: context.unreadable ?? decision.text,
        anchors: [],
        provenance: 'not-determined',
        noModelCall: true,
      });
      return;
    }

    if (decision.mode === 'deterministic') {
      say({
        text: decision.text,
        anchors: [...decision.anchors],
        provenance: 'reconstructed',
        noModelCall: true,
      });
      return;
    }

    const raw = await callGemini(decision.prompt, 'gemini-3-flash-preview', false);
    // §3.1 — what the model wrote appears like every other text here. The chip
    // says where it came from; the prose must not.
    const { text: cleaned } = cleanModelText(raw ?? '', 'screen');
    const cited = citedAnchors(cleaned, decision.anchors);

    if (!cleaned.trim() || cited.length === 0) {
      say({
        text: UNANCHORED_PROPOSAL,
        anchors: [],
        evidence: decision.facts,
        provenance: 'not-determined',
      });
      return;
    }

    say({ text: cleaned, anchors: cited, evidence: decision.facts, provenance: 'proposed' });
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: Message = {
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    // Roadmap 6.6 / `DESIGN.md` §6.1 — a question that names a glossary term is
    // answered from that entry, never by asking Gemini to restate it. Checked
    // and answered before `setLoading(true)` and before anything below reaches
    // `callGemini`, so a test can prove the absence of a model call by watching
    // the network rather than trusting this comment.
    const glossary = glossaryAnswerFor(text);
    if (glossary) {
      const botMessage: Message = {
        sender: 'bot',
        text: glossary.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: 'glossary',
        glossarySource: glossary.item.source,
      };
      setMessages((prev) => [...prev, botMessage]);
      return;
    }

    setLoading(true);

    // Roadmap 6.8 — inside a project the knowledge base below is not consulted
    // at all. This branch returns in every case, including its own failures:
    // falling through to the product assistant would be the boundary breaking
    // in exactly the place nobody would notice it.
    if (projectId) {
      try {
        await answerInProject(projectId, text);
      } catch (error) {
        console.error('Ask this case error:', error);
        say({
          text: 'The evidence of this project could not be read just now, so there is no grounded answer. Reload the project page and ask again.',
          provenance: 'not-determined',
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      // Build comprehensive system prompt with full platform knowledge base
      const knowledgeBase = buildKnowledgeBase();

      const systemPrompt = `You are a professional SAP S/4HANA Modernization Architect assistant at Clean-Core.io. You provide accurate, technically sound help to SAP architects and developers using the platform.

ABOUT CLEAN-CORE.IO (positioning — always represent it honestly):
- It is a FREE, community-built assessment & modernization assistant. Every feature is available to every user; the only limit is 5 transformations (bring your own Google Gemini API key for unlimited runs). There are no paid, premium, or "pilot" tiers to buy.
- It is COMPLEMENTARY to SAP's own tooling (ADT, ATC, Readiness Check, Signavio) — it does not replace them, and it is NOT affiliated with, endorsed by, or certified by SAP SE. Never claim SAP certification or approval.
- AI output (transformed code, narratives, estimates) is a DRAFT for human review — never present it as production-ready or as formal SAP/legal/security advice. Be honest about limitations.
- The live S/4HANA sandbox connection is read-only, encrypted, non-production only, and admin-gated.
Do not invent features, metrics, or success percentages that are not in the knowledge base below.

You have access to the Clean-Core.io platform knowledge base below. Use it to answer questions about any part of the platform accurately and in detail.

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

      const responseText = await callGemini(promptContext, 'gemini-3-flash-preview', false);

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
        title={isOpen ? 'Close the assistant' : assistantLabel}
        data-chatbot-toggle=""
      >
        {isOpen ? <X size={20} /> : <MessageSquare size={20} className="group-hover:rotate-6 transition-transform" />}
        {/* `DESIGN.md` §3.1, in so many words: „Ask AI" heißt „Ask this case".
            The old label was also the reason `findAiSymbolism` fires on the
            exact string "Ask AI about this case" in `lib/model-text.ts`.

            It travels with the path, like the header trigger and like the panel
            three lines down: outside a project there is no case, and the
            assistant answers from the general knowledge base — a button that
            said "Ask this case" on /knowledge promised evidence about code the
            reader has not uploaded. */}
        <span className="text-xs font-black uppercase tracking-wider hidden sm:inline-block pr-1">
          {isOpen ? 'Close' : assistantLabel}
        </span>
      </button>

      {/* Floating Chat Panel Wrapper */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-2rem)] h-[520px] bg-white border border-slate-200 shadow-2xl rounded-3xl z-[85] flex flex-col justify-between overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
          
          {/* Header */}
          <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20 text-emerald-400">
                {/* No sparkles: `DESIGN.md` §3.1 forbids them as the icon for
                    model work. A pen is what `lib/provenance.ts` gives the
                    value *Model proposal*, so the panel and its chips agree. */}
                <PenLine size={16} />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-white leading-none" data-chatbot-title="">
                  {projectId ? 'Ask this case' : 'SAP Modernization Assistant'}
                </h4>
                <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest block mt-0.5">
                  {projectId ? 'Evidence of this project only' : 'Product and SAP help'}
                </span>
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
              {/* Roadmap 6.8 — the reader is told which of the two boundaries
                  is in force before they type, not after an answer disappoints
                  them. Inside a project the assistant has no other source than
                  this project's evidence, and says so. */}
              <p className="font-semibold" data-chatbot-scope="">
                {projectId
                  ? 'Inside a project this assistant answers only from the evidence of this project, and names the line each statement rests on. It has no other source.'
                  : 'Context-restricted assistant. Focused exclusively on SAP S/4HANA Clean Core architectures.'}
              </p>
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
                  {/* Roadmap 6.8 — inside a project every answer carries the
                      anchors it rests on and the row of `lib/provenance.ts` it
                      is. An answer with no anchors is one of the two "nothing
                      to show" answers, and it is marked *Not determined*
                      rather than left to look like a statement. */}
                  {msg.provenance ? (
                    <div className="px-1 space-y-1" data-chatbot-case-answer="">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {msg.noModelCall ? (
                          <>
                            <span data-chatbot-no-model-call="">No model call</span>
                            {' · '}
                          </>
                        ) : null}
                        <span data-chatbot-provenance="">{provenance(msg.provenance).label}</span>
                        {msg.anchors && msg.anchors.length > 0 ? (
                          <>
                            {' · '}
                            <span data-chatbot-anchors="">{msg.anchors.join(' · ')}</span>
                          </>
                        ) : null}
                      </p>
                      {msg.evidence && msg.evidence.length > 0 ? (
                        <ul className="text-[11px] font-semibold text-slate-600 space-y-0.5" data-chatbot-evidence="">
                          {msg.evidence.map((fact) => (
                            <li key={fact.id}>
                              <span className="font-mono">{fact.anchor}</span>
                              {` — ${fact.title}`}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  {msg.source === 'glossary' ? (
                    // Roadmap 6.6: an answer that came from the glossary says so,
                    // in the same words `run.noModelCall` uses on the signed-run
                    // side of the product, plus the SAP source when the entry
                    // carries one — printed honestly when it does not, rather
                    // than left silent (ADR-034).
                    // 11px and up, deliberately: the 8–9px labels elsewhere on this
                    // card are an open UX finding (illegible at normal zoom), not a
                    // size to repeat in new work.
                    <p
                      data-chatbot-glossary-answer=""
                      className="text-[11px] font-bold text-slate-450 uppercase tracking-wider px-1"
                    >
                      <span data-chatbot-no-model-call="">No model call</span>
                      {' · '}
                      {msg.glossarySource ? `Source: ${msg.glossarySource}` : 'Source not yet recorded'}
                    </p>
                  ) : null}
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
