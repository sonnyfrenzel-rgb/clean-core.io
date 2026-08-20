'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Link2, Check, FileDown, Mail, Linkedin, Send, X, Loader2, AlertCircle, Share2,
} from 'lucide-react';

/**
 * The share area at the top of /clean-core-explained.
 *
 * The page only pays off if it travels, so the four ways it actually travels get
 * equal billing: a link to paste, a PDF to keep, a PDF mailed to a colleague, and
 * a LinkedIn post. The mail route exists because "send this to someone" is a
 * different intention from "save this for me", and asking a reader to download a
 * file and then attach it themselves loses most of them.
 *
 * Animation is deliberately narrow: an entrance, a hover lift, and the two state
 * changes that need confirming (copied, sent). Anything more competes with a
 * twenty-minute read for attention. Everything collapses to a plain fade when the
 * visitor has asked for reduced motion.
 */

const GUIDE_URL = 'https://clean-core.io/clean-core-explained';
const PDF_URL = '/clean-core-explained.pdf';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function GuideShareBar() {
  const reduce = useReducedMotion();

  const [copied, setCopied] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [to, setTo] = useState('');
  const [senderName, setSenderName] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const emailRef = useRef<HTMLInputElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  useEffect(() => {
    if (mailOpen) emailRef.current?.focus();
  }, [mailOpen]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(GUIDE_URL);
    } catch {
      // Clipboard is blocked in some embedded browsers; the selection fallback
      // still lets the reader copy it by hand.
      const el = document.createElement('input');
      el.value = GUIDE_URL;
      document.body.appendChild(el);
      el.select();
      document.body.removeChild(el);
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2200);
  }

  function handleLinkedIn() {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(GUIDE_URL)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=720,height=640');
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;

    setStatus('sending');
    setError('');

    try {
      const res = await fetch('/api/share/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, senderName, website: honeypot }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'The message could not be sent.');
        setStatus('error');
        return;
      }

      setStatus('sent');
      setTo('');
      setSenderName('');
    } catch {
      setError('Network problem — please try again.');
      setStatus('error');
    }
  }

  function resetMail() {
    setMailOpen(false);
    setStatus('idle');
    setError('');
  }

  const rise = reduce ? {} : { y: -3 };
  const container = {
    hidden: { opacity: 0, y: reduce ? 0 : 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const, staggerChildren: reduce ? 0 : 0.06 },
    },
  };
  const item = {
    hidden: { opacity: 0, y: reduce ? 0 : 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
  };

  const tile =
    'group relative flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2';

  return (
    <motion.section
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      aria-labelledby="share-heading"
      className="relative overflow-hidden rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm sm:p-9"
    >
      {/* A single quiet sheen, so the block reads as a surface rather than another card. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_-10%,rgba(16,185,129,0.10),transparent_55%)]"
      />

      <motion.div variants={item} className="relative mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-green-700">
          <Share2 size={12} /> Pass it on
        </span>
        <h2 id="share-heading" className="text-lg font-black tracking-tight text-gray-950">
          Built to be forwarded — take it with you
        </h2>
      </motion.div>

      <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Copy link */}
        <motion.button
          variants={item}
          whileHover={rise}
          whileTap={{ scale: 0.985 }}
          type="button"
          onClick={handleCopy}
          aria-live="polite"
          className={`${tile} ${copied ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50/70 hover:border-green-200 hover:bg-green-50/50'}`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition-colors group-hover:text-green-700">
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="done"
                  initial={{ scale: 0.6, opacity: 0, rotate: reduce ? 0 : -25 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <Check size={17} className="text-green-600" />
                </motion.span>
              ) : (
                <motion.span
                  key="link"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <Link2 size={17} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span>
            <span className="block text-sm font-black text-gray-950">
              {copied ? 'Link copied' : 'Copy link'}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
              clean-core.io/clean-core-explained
            </span>
          </span>
        </motion.button>

        {/* Download PDF */}
        <motion.a
          variants={item}
          whileHover={rise}
          whileTap={{ scale: 0.985 }}
          href={PDF_URL}
          download="SAP-Clean-Core-Explained.pdf"
          className={`${tile} border-gray-200 bg-gray-50/70 hover:border-green-200 hover:bg-green-50/50`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition-colors group-hover:text-green-700">
            <FileDown size={17} />
          </span>
          <span>
            <span className="block text-sm font-black text-gray-950">Download the PDF</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
              21 pages, typeset for printing
            </span>
          </span>
        </motion.a>

        {/* Email the PDF */}
        <motion.button
          variants={item}
          whileHover={rise}
          whileTap={{ scale: 0.985 }}
          type="button"
          onClick={() => (mailOpen ? resetMail() : setMailOpen(true))}
          aria-expanded={mailOpen}
          aria-controls="share-mail-panel"
          className={`${tile} ${mailOpen ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50/70 hover:border-green-200 hover:bg-green-50/50'}`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition-colors group-hover:text-green-700">
            <Mail size={17} />
          </span>
          <span>
            <span className="block text-sm font-black text-gray-950">Email it to someone</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
              The PDF, attached, in one step
            </span>
          </span>
        </motion.button>

        {/* LinkedIn */}
        <motion.button
          variants={item}
          whileHover={rise}
          whileTap={{ scale: 0.985 }}
          type="button"
          onClick={handleLinkedIn}
          className={`${tile} border-gray-200 bg-gray-50/70 hover:border-green-200 hover:bg-green-50/50`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition-colors group-hover:text-[#0a66c2]">
            <Linkedin size={17} />
          </span>
          <span>
            <span className="block text-sm font-black text-gray-950">Share on LinkedIn</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
              Opens the post composer
            </span>
          </span>
        </motion.button>
      </div>

      {/* Mail panel */}
      <AnimatePresence initial={false}>
        {mailOpen && (
          <motion.div
            id="share-mail-panel"
            key="mail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden"
          >
            <div className="mt-4 rounded-2xl border border-green-200 bg-green-50/60 p-5 sm:p-6">
              <AnimatePresence mode="wait" initial={false}>
                {status === 'sent' ? (
                  <motion.div
                    key="sent"
                    initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-green-300 bg-white">
                      <Check size={17} className="text-green-600" />
                    </span>
                    <div>
                      <p className="text-sm font-black text-green-900">On its way</p>
                      <p className="mt-1 text-sm leading-relaxed text-green-800/90">
                        The guide has been sent with the PDF attached. We did not store the address —
                        it was used for this one message and nothing else.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setStatus('idle')}
                          className="rounded-lg border border-green-700 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-wider text-green-800 transition-colors hover:bg-green-50"
                        >
                          Send to someone else
                        </button>
                        <button
                          type="button"
                          onClick={resetMail}
                          className="rounded-lg px-4 py-2 text-[11px] font-black uppercase tracking-wider text-green-800/70 transition-colors hover:text-green-900"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onSubmit={handleSend}
                  >
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <p className="text-sm leading-relaxed text-green-900/90">
                        We will send the guide with the PDF attached. One message, no list, no
                        follow-up.
                      </p>
                      <button
                        type="button"
                        onClick={resetMail}
                        aria-label="Close"
                        className="shrink-0 rounded-lg p-1.5 text-green-800/60 transition-colors hover:bg-green-100 hover:text-green-900"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-green-800">
                          Their email
                        </span>
                        <input
                          ref={emailRef}
                          type="email"
                          required
                          value={to}
                          onChange={(e) => setTo(e.target.value)}
                          placeholder="colleague@company.com"
                          autoComplete="off"
                          className="w-full rounded-xl border border-green-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-green-800">
                          Your name <span className="font-bold text-green-700/60">(optional)</span>
                        </span>
                        <input
                          type="text"
                          value={senderName}
                          maxLength={60}
                          onChange={(e) => setSenderName(e.target.value)}
                          placeholder="So they know who sent it"
                          autoComplete="name"
                          className="w-full rounded-xl border border-green-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                        />
                      </label>
                    </div>

                    {/* Honeypot — hidden from people, irresistible to bots. */}
                    <div aria-hidden="true" className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
                      <label>
                        Website
                        <input
                          type="text"
                          tabIndex={-1}
                          autoComplete="off"
                          value={honeypot}
                          onChange={(e) => setHoneypot(e.target.value)}
                        />
                      </label>
                    </div>

                    <AnimatePresence>
                      {status === 'error' && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          role="alert"
                          className="mt-3 flex items-start gap-2 text-sm font-semibold text-red-700"
                        >
                          <AlertCircle size={15} className="mt-0.5 shrink-0" />
                          {error}
                        </motion.p>
                      )}
                    </AnimatePresence>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <motion.button
                        whileHover={status === 'sending' ? undefined : rise}
                        whileTap={{ scale: 0.985 }}
                        type="submit"
                        disabled={status === 'sending'}
                        className="inline-flex items-center gap-2 rounded-xl bg-gray-950 px-6 py-3 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {status === 'sending' ? (
                          <>
                            <Loader2 size={14} className="animate-spin" /> Sending
                          </>
                        ) : (
                          <>
                            <Send size={14} /> Send the guide
                          </>
                        )}
                      </motion.button>
                      <span className="text-xs leading-relaxed text-green-800/70">
                        The address is not saved and goes on no list.
                      </span>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
