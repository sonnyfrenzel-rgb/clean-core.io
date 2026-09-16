'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Link2, Check, FileDown, Linkedin, Share2 } from 'lucide-react';

/**
 * The share area at the top of /clean-core-explained.
 *
 * The page only pays off if it travels, so the three ways it travels get equal
 * billing: a link to paste, a PDF to keep and attach, and a LinkedIn post.
 *
 * There was a fourth — a form that mailed the PDF to an address the visitor
 * typed. It is gone deliberately. Any endpoint that sends mail from our domain
 * to an arbitrary recipient is a spam relay unless every defence holds, and this
 * domain also carries the community list: one abuse incident would cost
 * deliverability for everyone on it. The download covers the same intention with
 * none of that exposure.
 *
 * Animation is deliberately narrow: an entrance, a hover lift, and the one state
 * change that needs confirming. Anything more competes with a twenty-minute read
 * for attention, and it all collapses to a plain fade when the visitor has asked
 * for reduced motion.
 */

const GUIDE_URL = 'https://clean-core.io/clean-core-explained';
const PDF_URL = '/clean-core-explained.pdf';

export default function GuideShareBar() {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  async function handleCopy() {
    // "Link copied" was shown whatever happened: the fallback selected a field
    // and removed it again without ever copying, so in an embedded browser the
    // reader pasted whatever was in the clipboard before
    // (QA review of 33471220d6e9, 823a09338d58).
    let ok = false;
    try {
      await navigator.clipboard.writeText(GUIDE_URL);
      ok = true;
    } catch {
      // Clipboard API blocked — the old command still works in those browsers.
      const el = document.createElement('input');
      el.value = GUIDE_URL;
      el.setAttribute('readonly', 'true');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      el.setSelectionRange(0, GUIDE_URL.length);
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      document.body.removeChild(el);
    }
    if (!ok) {
      setCopyFailed(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyFailed(false), 6000);
      return;
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2200);
  }

  function handleLinkedIn() {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(GUIDE_URL)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=720,height=640');
  }

  const rise = reduce ? {} : { y: -3 };
  const container = {
    hidden: { opacity: 0, y: reduce ? 0 : 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const, staggerChildren: reduce ? 0 : 0.07 },
    },
  };
  const item = {
    hidden: { opacity: 0, y: reduce ? 0 : 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
  };

  const tile =
    'group relative flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2';
  const idle = 'border-gray-200 bg-gray-50/70 hover:border-green-200 hover:bg-green-50/50';

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

      <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Copy link */}
        <motion.button
          variants={item}
          whileHover={rise}
          whileTap={{ scale: 0.985 }}
          type="button"
          onClick={handleCopy}
          aria-live="polite"
          className={`${tile} ${copied ? 'border-green-300 bg-green-50' : copyFailed ? 'border-amber-300 bg-amber-50' : idle}`}
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
              {copied ? 'Link copied' : copyFailed ? 'Copy it by hand' : 'Copy the link'}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
              {copyFailed ? GUIDE_URL : 'Paste it in a chat, a ticket, an email'}
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
          className={`${tile} ${idle}`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition-colors group-hover:text-green-700">
            <FileDown size={17} />
          </span>
          <span>
            <span className="block text-sm font-black text-gray-950">Download the PDF</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
              Typeset for printing — and for attaching to your own mail
            </span>
          </span>
        </motion.a>

        {/* LinkedIn */}
        <motion.button
          variants={item}
          whileHover={rise}
          whileTap={{ scale: 0.985 }}
          type="button"
          onClick={handleLinkedIn}
          className={`${tile} ${idle}`}
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
    </motion.section>
  );
}
