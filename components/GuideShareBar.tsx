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
    // Each outcome clears the other: a failed second click used to leave
    // "Link copied" standing from the first, and a success after a failure
    // fell back to "Copy it by hand" when its timer expired
    // (QA review of 146ac2e1a724, aa9317005839).
    if (copyTimer.current) clearTimeout(copyTimer.current);
    if (!ok) {
      setCopied(false);
      setCopyFailed(true);
      copyTimer.current = setTimeout(() => setCopyFailed(false), 6000);
      return;
    }
    setCopyFailed(false);
    setCopied(true);
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
    'group relative flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus focus-visible:ring-offset-2';
  const idle = 'border-cc-line bg-cc-surface-muted hover:border-cc-brand hover:bg-cc-brand-surface';

  return (
    <motion.section
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      aria-labelledby="share-heading"
      className="relative overflow-hidden rounded-3xl border border-cc-line bg-cc-surface p-6 sm:p-9"
    >
      <motion.div variants={item} className="relative mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-cc-brand bg-cc-brand-surface px-3 py-1 text-xs font-bold uppercase tracking-widest text-cc-brand-strong">
          <Share2 size={12} aria-hidden="true" /> Pass it on
        </span>
        <h2 id="share-heading" className="text-lg font-extrabold tracking-tight text-cc-ink">
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
          className={`${tile} ${copied ? 'border-cc-success-border bg-cc-success-bg' : copyFailed ? 'border-cc-warning-border bg-cc-warning-bg' : idle}`}
        >
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl border border-cc-line bg-cc-surface text-cc-ink-muted transition-colors group-hover:text-cc-brand-strong">
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="done"
                  initial={{ scale: 0.6, opacity: 0, rotate: reduce ? 0 : -25 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <Check size={16} className="text-cc-success" />
                </motion.span>
              ) : (
                <motion.span
                  key="link"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <Link2 size={16} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span>
            <span className="block text-sm font-bold text-cc-ink">
              {copied ? 'Link copied' : copyFailed ? 'Copy it by hand' : 'Copy the link'}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-cc-ink-muted">
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
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl border border-cc-line bg-cc-surface text-cc-ink-muted transition-colors group-hover:text-cc-brand-strong">
            <FileDown size={16} />
          </span>
          <span>
            <span className="block text-sm font-bold text-cc-ink">Download the PDF</span>
            <span className="mt-1 block text-xs leading-relaxed text-cc-ink-muted">
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
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl border border-cc-line bg-cc-surface text-cc-ink-muted transition-colors group-hover:text-cc-brand-strong">
            <Linkedin size={16} />
          </span>
          <span>
            <span className="block text-sm font-bold text-cc-ink">Share on LinkedIn</span>
            <span className="mt-1 block text-xs leading-relaxed text-cc-ink-muted">
              Opens the post composer
            </span>
          </span>
        </motion.button>
      </div>
    </motion.section>
  );
}
