'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { MessageSquare, X, Send, PenLine, ShieldCheck } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcIconButton from '@/components/cc/IconButton';
import CcField from '@/components/cc/Field';
import { usePathname } from 'next/navigation';
import { callGemini } from '@/lib/gemini';
import { GLOSSARY_ITEMS } from '@/lib/glossary';
import { glossaryAnswerFor } from '@/lib/glossary-lookup';
import { buildKnowledgeBase } from '@/lib/chatbot-knowledge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { cn } from '@/lib/utils';
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
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';

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
 * Said under the input, in both scopes: the assistant sends only the current
 * question, never the conversation so far (owner decision 30.09.2026, QA
 * 795c0e739916), so a follow-up has to carry its own context.
 */
const INDEPENDENT_QUESTION_NOTE =
  'Each question is answered on its own, without the earlier messages — include the context you need.';

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

/**
 * The glossary in the prompt: the names, not the definitions.
 *
 * It used to be `JSON.stringify(GLOSSARY_ITEMS, null, 2)` — every entry, indented,
 * in the system prompt of **every** model call. Measured on 23.09.2026 after 6.6
 * grew the glossary from 13 entries to 45: **30,044 characters, about 8,584
 * tokens, on every single call.** The names alone are 308.
 *
 * What makes the definitions unnecessary is a change one step earlier: since 6.6
 * and 6.8 a glossary question is answered *from the entry*, without a model
 * (`glossaryAnswerFor`, and the case branch in `handleSend` returns before any
 * call). The model was carrying the text of answers it no longer gives. What it
 * still needs is to know which terms are spoken for, so it does not define one
 * differently in passing — and that is a list of names.
 */
/**
 * The time a message was written, on the reader's clock, 24-hour and with the
 * zone — `DESIGN.md` §3 ("Uhrzeiten mit Zeitzone"), e.g. "14:05 GMT+2". It used
 * to be `toLocaleTimeString([])`, which printed whatever the browser's locale
 * chose and no zone at all.
 */
function clockNow(): string {
  const parts = new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const zone = part('timeZoneName');
  return `${part('hour')}:${part('minute')}${zone ? ` ${zone === 'GMT' ? 'UTC' : zone}` : ''}`;
}

const glossaryTermList = (): string =>
  Object.values(GLOSSARY_ITEMS)
    .map((item) => item.term)
    .join(', ');

const greeting = (): Message => ({
  sender: 'bot',
  text: 'Greetings. I am your S/4HANA Modernization Architect Assistant. I can help guide you on Clean Core principles, BTP extensions (CAP), In-App extensions (RAP), released standard APIs, and abapGit handovers. What architecture question can I resolve for you today?',
  timestamp: clockNow(),
});

export default function GlossaryChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => [greeting()]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const { profile } = useUserProfile();
  const chatEndRef = useRef<HTMLDivElement>(null);
  /** Wraps the floating toggle — `CcButton` takes no ref, so the button is found inside. */
  const toggleRef = useRef<HTMLSpanElement>(null);
  /**
   * What opened the panel, and whether Escape asked for focus to go back.
   * The floating toggle is not always the opener: the header, the account
   * menu and the help menu open the panel by event — and with the desktop
   * toggle switched off in the profile the toggle is `sm:hidden` the moment
   * the panel closes, so focusing it would drop focus on the body.
   */
  const openerRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef(false);

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
  // The conversation belongs to the place it was held. The panel lives in the
  // layout and outlives a navigation, so project A's answers stood under
  // project B's "Evidence of this project" (QA slice review of 953575fcc9bf,
  // 76118078e97f). A new place starts from the greeting; the reset happens
  // while rendering, as React prescribes for state that follows a prop.
  //
  // The draft and the busy state belong to it too: a question half-typed in A
  // stood in B's input, and a request still running for A kept B's assistant
  // busy until it settled (QA review of 3c411e7b8235, 2b1101d8e13e). Each place
  // is a new conversation, and an answer or a failure that arrives for an
  // earlier one is dropped — including one asked in A, answered after the
  // reader went to B and back to A.
  const [messagesFor, setMessagesFor] = useState<string | null>(projectId);
  const [conversation, setConversation] = useState(0);
  if (messagesFor !== projectId) {
    setMessagesFor(projectId);
    setMessages([greeting()]);
    setInputValue('');
    setLoading(false);
    setConversation((n) => n + 1);
  }
  // A layout effect, not a passive one: it runs before the browser can hand
  // the reader an event, so a question asked right after a navigation is
  // stamped with the new conversation and never with the one just left
  // (QA review of 09ae0c6ee268, 5ee5ab25f097).
  const conversationRef = useRef(conversation);
  useLayoutEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  const assistantLabel = projectId ? 'Ask this case' : 'Ask the assistant';

  const [caseContext, setCaseContext] = useState<CaseContext | null>(null);
  const caseContextRef = useRef<Promise<CaseContext> | null>(null);
  const caseProjectRef = useRef<string | null>(null);

  /**
   * The project's evidence, read once per opening of the panel and then reused.
   *
   * Kept in a promise ref rather than only in state so that a question typed
   * before the warm-up finishes waits for the same read instead of starting a
   * second one — two readings of one source are two places for the line
   * numbers to disagree, which is the defect `lib/process-facts.ts` names.
   */
  /**
   * The project the panel stands in right now. The panel lives in the layout
   * and outlives a navigation, so an answer that was asked for in project A and
   * arrives after the reader moved to project B is dropped rather than shown
   * under B's heading (QA full review of v2.20.0).
   */
  const currentProjectRef = useRef<string | null>(projectId);
  useLayoutEffect(() => {
    currentProjectRef.current = projectId;
  }, [projectId]);

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
  //
  // Each opening reads afresh: the panel outlives the project's pages, and a
  // source replaced or re-analysed since the last opening would otherwise be
  // answered from the old lines (QA full review of v2.20.0).
  useEffect(() => {
    if (!isOpen || !projectId) return;
    caseContextRef.current = null;
    void ensureCase(projectId);
  }, [isOpen, projectId]);

  // Auto-scroll to bottom of chat when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // UX-045: the panel is not modal (the page stays usable beside it), but
  // Escape closes it and hands focus back to what opened it.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      returnFocusRef.current = true;
      setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // After the close has rendered, so what is hidden is known: focus goes to
  // the control that opened the panel, else to the toggle — whichever is
  // still in the document and actually shown.
  useEffect(() => {
    if (isOpen || !returnFocusRef.current) return;
    returnFocusRef.current = false;
    const shown = (el: HTMLElement | null): el is HTMLElement =>
      Boolean(el && el.isConnected && el.getClientRects().length > 0);
    const toggle = toggleRef.current?.querySelector('button') ?? null;
    const target = [openerRef.current, toggle].find(shown);
    target?.focus();
  }, [isOpen]);

  // Listen for global trigger to open the chatbot. A menu item closes with
  // its menu, so a dispatcher can name the control to come back to.
  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ returnFocusTo?: HTMLElement | null } | null>).detail;
      const active = document.activeElement;
      openerRef.current =
        detail?.returnFocusTo ?? (active instanceof HTMLElement && active !== document.body ? active : null);
      setIsOpen(true);
    };
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

    const say = (message: Omit<Message, 'sender' | 'timestamp'>) =>
    setMessages((prev) => [...prev, { sender: 'bot', timestamp: clockNow(), ...message }]);

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
  const answerInProject = async (id: string, text: string, asked: number): Promise<void> => {
    const moved = () => currentProjectRef.current !== id || conversationRef.current !== asked;
    const context = await ensureCase(id);
    if (moved()) return;
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

    const raw = await callGemini(decision.prompt, PRODUCT_GEMINI_MODEL, false);
    if (moved()) return;
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
      timestamp: clockNow()
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
        timestamp: clockNow(),
        source: 'glossary',
        glossarySource: glossary.item.source,
      };
      setMessages((prev) => [...prev, botMessage]);
      return;
    }

    setLoading(true);
    // The conversation this question belongs to; see the reset above.
    const asked = conversationRef.current;
    const superseded = () => conversationRef.current !== asked;

    // Roadmap 6.8 — inside a project the knowledge base below is not consulted
    // at all. This branch returns in every case, including its own failures:
    // falling through to the product assistant would be the boundary breaking
    // in exactly the place nobody would notice it.
    if (projectId) {
      try {
        await answerInProject(projectId, text, asked);
      } catch (error) {
        console.error('Ask this case error:', error);
        if (currentProjectRef.current !== projectId || superseded()) return;
        say({
          text: 'The evidence of this project could not be read just now, so there is no grounded answer. Reload the project page and ask again.',
          provenance: 'not-determined',
        });
      } finally {
        if (!superseded()) setLoading(false);
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

## GLOSSARY TERMS THIS PRODUCT DEFINES
These are answered from the glossary itself, without you. Do not contradict them,
and do not define them yourself — if one is asked about plainly, the entry has
already answered before this prompt was built.
${glossaryTermList()}

${knowledgeBase}

CRITICAL GUARDRAILS AND SAFETY RULES:
- You must under no circumstances be used or "abused" for general-purpose questions unrelated to SAP, S/4HANA, BTP, Clean Core, or the Clean-Core.io platform.
- If the user asks about unrelated topics (e.g. cooking recipes, general Python/Java coding outside of SAP contexts, writing stories/poetry, weather, non-SAP history, pop culture, sports), you must politely but firmly refuse to answer. You should reply EXACTLY in this tone:
"My apologies, but as an SAP S/4HANA Modernization Architect, I am strictly configured to assist only with ERP upgrades, Clean Core guidelines, BTP cloud extensions, and Clean-Core.io platform walk-throughs. Please ask an SAP-related question."
- Keep your answers highly professional, factual, and technically accurate. Use clear corporate English (or German if the user initiates the conversation in German). Use markdown formatting for structures, code snippets, or bullet points. Avoid marketing fluff.
- When referencing platform pages, mention the navigation path (e.g. "Go to Testing > Live Tenant tab") to help users find features quickly.`;

      const promptContext = `${systemPrompt}\n\nUser Question: ${text}\nAssistant Response:`;

      const responseText = await callGemini(promptContext, PRODUCT_GEMINI_MODEL, false);
      // Asked outside a project; the reader has since opened one, where this
      // panel answers from that project's evidence only.
      if (currentProjectRef.current !== null || superseded()) return;

      const botMessage: Message = {
        sender: 'bot',
        text: responseText || 'My apologies, I could not compile a response. Please rephrase your architecture question.',
        timestamp: clockNow()
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Chatbot error:', error);
      if (currentProjectRef.current !== null || superseded()) return;
      const botMessage: Message = {
        sender: 'bot',
        text: 'The assistant could not answer just now. Ask again in a moment; if you use your own Gemini API key, check it in Settings.',
        timestamp: clockNow()
      };
      setMessages((prev) => [...prev, botMessage]);
    } finally {
      if (!superseded()) setLoading(false);
    }
  };

  /**
   * One entry, not two — block D, step D.8 (`DESIGN.md` §2.1: the shell bar
   * carries help; §1.5: four button styles, none of them a green bubble).
   *
   * The shell bar's help menu leads with the named trigger ("Ask this case" /
   * "Ask the assistant") from breakpoint `sm` up, and the account menu carries
   * it too. Below
   * `sm` the shell bar has no room for it, so there this floating button is the
   * one direct way in and it is always shown. From `sm` up it is off unless
   * the reader switched it on ("Floating assistant button" on /settings, saved
   * as `true` — Sonny, 30.09.2026): the header button is the entry there, and a
   * second one for the same panel is noise. Signed out there is no profile, so
   * there is no floating button on desktop either. The panel brings its own
   * close button instead of relying on this one.
   */
  const floatingOffOnDesktop = profile?.desktopChatbotEnabled !== true;
  const openToggle = () => {
    openerRef.current = toggleRef.current?.querySelector('button') ?? null;
    setIsOpen((prev) => !prev);
  };
  const closePanel = () => {
    returnFocusRef.current = true;
    setIsOpen(false);
  };

  return (
    <>
      {/* Tables in an answer, drawn with the tokens (§1.1) and the type scale (§1.2). */}
      <style dangerouslySetInnerHTML={{ __html: `
        .chat-answer table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
          font-size: 12px;
          border: 1px solid var(--cc-line);
          border-radius: var(--cc-radius-row);
          overflow: hidden;
        }
        .chat-answer th {
          background-color: var(--cc-surface-muted);
          color: var(--cc-ink-muted);
          font-weight: 600;
          text-align: left;
          padding: 4px 8px;
          border-bottom: 1px solid var(--cc-line);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 11px;
        }
        .chat-answer td {
          padding: 4px 8px;
          color: var(--cc-ink);
          border-top: 1px solid var(--cc-line);
          background-color: var(--cc-surface);
        }
      `}} />

      {/* The floating entry, on the float layer (`app/globals.css`): above the
          page and the sticky shell bar, below every dialog and message box, so
          a question the page asks is never covered by it. */}
      <span
        ref={toggleRef}
        className={cn(
          'fixed right-4 bottom-4 z-cc-float inline-flex rounded-cc-row shadow-cc-dialog sm:right-6 sm:bottom-6',
          floatingOffOnDesktop && 'sm:hidden',
        )}
      >
        <CcButton
          variant="ghost"
          density="cozy"
          onClick={openToggle}
          aria-expanded={isOpen}
          aria-controls={isOpen ? 'chatbot-panel' : undefined}
          aria-label={isOpen ? 'Close the assistant' : assistantLabel}
          title={isOpen ? 'Close the assistant' : assistantLabel}
          data-chatbot-toggle=""
          icon={isOpen ? <X size={16} aria-hidden /> : <MessageSquare size={16} aria-hidden />}
        >
          {/* `DESIGN.md` §3.1, in so many words: „Ask AI" heißt „Ask this case".
              It travels with the path, like the header trigger and the panel:
              outside a project there is no case, and the assistant answers from
              the general knowledge base. On a phone the label is the accessible
              name only; the icon is the button. */}
          <span className="hidden sm:inline">{isOpen ? 'Close' : assistantLabel}</span>
        </CcButton>
      </span>

      {/* The panel. Not modal — the page stays usable beside it — and on the
          float layer with its button, under the overlay layer, so a CcDialog
          opened from the page covers it. */}
      {isOpen && (
        <div
          id="chatbot-panel"
          role="dialog"
          aria-labelledby="chatbot-panel-title"
          className="cc fixed right-4 bottom-20 z-cc-float flex h-[520px] max-h-[calc(100dvh-7rem)] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-cc-card border border-cc-line bg-cc-surface shadow-cc-dialog sm:right-6 sm:bottom-24"
        >
          {/* Header — light, like every other surface (§1.1); dark is for code. */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-cc-line px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {/* No sparkles: `DESIGN.md` §3.1 forbids them as the icon for
                  model work. A pen is what `lib/provenance.ts` gives the
                  value *Model proposal*, so the panel and its chips agree. */}
              <PenLine size={16} aria-hidden className="shrink-0 text-cc-ink-muted" />
              <div className="min-w-0">
                <h2 id="chatbot-panel-title" className="m-0 cc-text-h3 text-cc-ink" data-chatbot-title="">
                  {projectId ? 'Ask this case' : 'SAP Modernization Assistant'}
                </h2>
                <p className="m-0 cc-text-meta text-cc-ink-muted">
                  {projectId ? 'Evidence of this project, and the glossary' : 'Product and SAP help'}
                </p>
              </div>
            </div>
            <CcIconButton label="Close the assistant" onClick={closePanel}>
              <X size={16} aria-hidden />
            </CcIconButton>
          </div>

          {/* Messages (scrollable) */}
          <div className="flex-grow space-y-4 overflow-y-auto bg-cc-surface-muted p-4">
            <div className="flex gap-2 rounded-cc-row border border-cc-line bg-cc-surface p-3 text-[12px] leading-normal text-cc-ink-muted">
              <ShieldCheck size={16} aria-hidden className="mt-px shrink-0 text-cc-ink-muted" />
              {/* Roadmap 6.8 — the reader is told which of the two boundaries
                  is in force before they type, not after an answer disappoints
                  them. Inside a project the assistant has no other source than
                  this project's evidence — except the glossary, which roadmap
                  6.6 checks first (`handleSend`), so the sentence names it. */}
              <p className="m-0 font-medium" data-chatbot-scope="">
                {projectId
                  ? 'Inside a project this assistant answers only from the evidence of this project. An answer is shown only when it cites at least one source line of this project, and it lists the lines it cites — that does not prove every sentence in it. The one exception is a glossary term, which is answered from its glossary entry and marked as such.'
                  : 'Context-restricted assistant. Focused exclusively on SAP S/4HANA Clean Core architectures.'}
              </p>
            </div>

            {messages.map((msg, idx) => {
              const isBot = msg.sender === 'bot';

              return (
                <div
                  key={idx}
                  className={cn(
                    'flex max-w-[85%] flex-col space-y-1',
                    isBot ? 'items-start self-start' : 'ml-auto items-end self-end',
                  )}
                >
                  <div
                    className={cn(
                      'rounded-cc-card border p-3 text-[13px] leading-relaxed font-medium text-cc-ink',
                      isBot
                        ? 'cc-prose border-cc-line bg-cc-surface'
                        // The reader's own words: a neutral tint, not the brand
                        // green — green means proven (ADR-007).
                        : 'whitespace-pre-line border-cc-neutral-border bg-cc-neutral-bg',
                    )}
                  >
                    {isBot ? (
                      <div
                        className="chat-answer"
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
                    <div className="space-y-1 px-1" data-chatbot-case-answer="">
                      <p className="m-0 cc-text-label text-cc-ink-muted">
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
                        <ul className="m-0 space-y-1 p-0 text-[12px] font-medium text-cc-ink-muted list-none" data-chatbot-evidence="">
                          {msg.evidence.map((fact) => (
                            <li key={fact.id}>
                              <span className="font-cc-mono">{fact.anchor}</span>
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
                    <p
                      data-chatbot-glossary-answer=""
                      className="m-0 px-1 cc-text-label text-cc-ink-muted"
                    >
                      <span data-chatbot-no-model-call="">No model call</span>
                      {' · '}
                      {msg.glossarySource ? `Source: ${msg.glossarySource}` : 'Source not yet recorded'}
                    </p>
                  ) : null}
                  <span className="px-1 font-cc-mono text-[11px] font-medium text-cc-ink-muted">
                    {msg.timestamp}
                  </span>
                </div>
              );
            })}

            {/* Waiting for an answer: said in words, once, without a perpetual
                animation (§1.7, §2.8). */}
            {loading && (
              <p role="status" className="m-0 self-start px-1 text-[12px] font-medium text-cc-ink-muted">
                {projectId ? 'Reading the evidence of this project…' : 'Writing an answer…'}
              </p>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Quick suggestions */}
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-cc-line bg-cc-surface px-4 py-2">
            {suggestionChips.map((chip, idx) => (
              <CcButton
                key={idx}
                variant="ghost"
                onClick={() => handleSend(chip)}
                disabled={loading}
              >
                {chip}
              </CcButton>
            ))}
          </div>

          {/* Message input */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(inputValue); }}
            className="flex shrink-0 items-end gap-2 border-t border-cc-line bg-cc-surface p-3"
          >
            <div className="min-w-0 flex-grow">
              {/* Owner decision 30.09.2026 (QA 795c0e739916): no conversation
                  history is sent. Every answer stays anchored to the evidence
                  gathered for its own question (`lib/case-answer.ts`), so the
                  reader is told that before typing a follow-up like "and that
                  one?". Wired to the input through `aria-describedby`. */}
              <CcField
                label="Your question"
                help={<span data-chatbot-independent="">{INDEPENDENT_QUESTION_NOTE}</span>}
              >
                {({ id, describedBy, className }) => (
                  <input
                    id={id}
                    type="text"
                    aria-describedby={describedBy}
                    placeholder={projectId ? 'Ask about this case…' : 'Ask about SAP or the product…'}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    disabled={loading}
                    className={className}
                  />
                )}
              </CcField>
            </div>
            <CcButton
              type="submit"
              variant="primary"
              disabled={loading || !inputValue.trim()}
              icon={<Send size={16} aria-hidden />}
            >
              Send
            </CcButton>
          </form>
        </div>
      )}
    </>
  );
}
