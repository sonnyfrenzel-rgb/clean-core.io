# Benefit card consult — x-ai/grok-4.20

**Date:** 2026-08-27 · **Model:** `x-ai/grok-4.20` via OpenRouter
**Usage:** 7589 prompt / 5461 completion tokens, 65s.

The question, the component source, the measured mobile facts and the standing plan
(`2026-08-26-BENEFIT-NEXT-STEPS.md`) were all supplied. **Unedited output — no claim here has been
checked against the code.**

---

**Diagnosis**  
The premise is wrong. A two-column “business question vs IT question” with the fictional credit-check story on the left does not survive mobile (where most visitors arrive) and does not survive scrutiny. The left column is a hand-written mockup; the right column is honest, recomputable data from the shipped reference ABAP file. That reversal kills trust. The card is also 383 words and 2.3 screens tall on a phone, so the argument (“we answer the question the market ignores”) is experienced as “read this long fictional story, then scroll forever to see the real numbers.”

The fix is not better responsiveness. The fix is to throw away the two-column layout and the invented BPMN/RACI content. Replace them with a single, mobile-first vertical story that leads with the *real* reference program from the repo. Business understanding first (now grounded in the frozen pyramid fixture), effort second. The ordering stays, the visual comparison dies. Height drops to ~1.1 screens on 360 px.

**The card I would ship (mobile-first, works at every breakpoint)**

```tsx
<section aria-labelledby="benefit-heading" className="rounded-[2rem] border border-slate-200 bg-white shadow-xl overflow-hidden">
  {/* Top: situation — cut from 3 blocks to 1 paragraph */}
  <div className="px-6 sm:px-10 pt-8 pb-6">
    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">The usual starting point</p>
    <h2 id="benefit-heading" className="mt-2 text-3xl font-black tracking-tight text-gray-950">
      Nobody remembers what this program does.
    </h2>
    <p className="mt-4 text-slate-600 max-w-2xl">
      No documentation, the original developer left years ago, and it sits untouched until the next S/4HANA upgrade makes it someone’s problem. 
      We answer both questions that then decide its fate — with a free SAP custom code assessment that ships signed drafts and named limits.
    </p>
  </div>

  <div className="bg-slate-50 px-6 sm:px-10 py-8 space-y-10">
    {/* 1. Business answer — now grounded in the real reference fixture (proposal 2) */}
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-emerald-600 font-black uppercase text-xs tracking-widest">The question the business asks</span>
        <span className="rounded bg-emerald-100 text-emerald-700 text-[10px] px-2 py-px font-black">Answered from the actual reference file</span>
      </div>
      
      <h3 className="text-2xl font-black text-gray-950">“What does this thing actually do?”</h3>
      
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs uppercase font-black tracking-widest text-slate-400 mb-2">Summary generated from the 907-line reference program</p>
        <p className="text-slate-700 leading-relaxed">
          Checks open orders against the customer’s credit limit and blocks delivery when it is exceeded.
        </p>
        <p className="mt-5 text-xs text-slate-500">
          Full five-level business pyramid, standard operating procedure, business value statement, and decision points are in the 
          <Link href="/reference-analysis" className="text-emerald-700 hover:underline">frozen reference pack</Link>. 
          Every sentence is either traced to a statement in the ABAP or explicitly marked as inferred.
        </p>
      </div>
    </div>

    {/* 2. Effort answer — the honest part, unchanged except tighter */}
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-slate-400 font-black uppercase text-xs tracking-widest">The question IT asks</span>
      </div>
      
      <h3 className="text-2xl font-black text-gray-950">“How much work is this?”</h3>
      
      <p className="mt-4 text-xs text-slate-500">
        On the 907-line reference program we publish — 42 findings:
      </p>

      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full border border-slate-200">
        {bands.map((b) => (
          <div key={b.label} className={b.bar} style={{ width: `${pct(b.n)}%` }} />
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-6">
        {bands.map((b) => (
          <div key={b.label}>
            <dt className="text-4xl font-black tabular-nums text-gray-950">{b.n}</dt>
            <dd className={`text-xs font-black ${b.text}`}>{b.label}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-xs text-slate-500">
        Hand work = dynpro, native-sql — structurally out of reach for any generator, so they are flagged rather than guessed at.
        {handedBackKinds.includes('modification') && ' The modification is an upgrade blocker: it must be reset in SPAU.'}
      </p>

      <ul className="mt-8 space-y-3 text-xs">
        <li className="flex gap-2"><span className="text-emerald-500">→</span> Object → released API mapping</li>
        <li className="flex gap-2"><span className="text-emerald-500">→</span> A first RAP draft you can correct</li>
        <li className="flex gap-2"><span className="text-emerald-500">→</span> Matching test scaffolding</li>
      </ul>

      <Link href="/reference-analysis" className="mt-8 inline-flex items-center gap-2 text-xs font-black text-emerald-700">
        See the full reference run <ArrowRight size={14} />
      </Link>
    </div>
  </div>

  {/* Bottom: the argument — updated for linear layout */}
  <div className="px-6 sm:px-10 py-8 border-t border-slate-200 text-sm">
    <p className="font-bold text-gray-900">
      Most assessment tools only answer the second question. Telling the business what the program actually does is what decides whether it is worth keeping at all.
    </p>
    <p className="mt-4 text-slate-600">
      Both answers are drafts for you to correct. Limits are published before you upload anything ({constructsFullyCovered} of {constructsTotal} construct classes fully covered). 
      Every run is frozen into a signed audit trail you can hand to a reviewer or auditor.
    </p>
    
    <div className="mt-6 flex flex-wrap gap-x-8 gap-y-1 text-xs text-slate-500">
      <Link href="/catalog" className="hover:text-emerald-700">
        <strong>{classifiedObjects.toLocaleString('en-US')}</strong> SAP objects classified from SAP’s own data
      </Link>
      <span>Free. No sales call, no trial, no card.</span>
    </div>
  </div>
</section>
```

**What is deleted (be specific)**
- The entire two-column `lg:grid-cols-5` layout and both “Answered here” badges.
- The fictional BPMN flow array, the rendered BPMN row, and the “The process behind it · BPMN 2.0” box.
- The entire RACI table, the “Who owns which step” box, and the `raci` array.
- The fourth paragraph that repeated “a draft to correct”.
- The closing sentence that referred to “the question on the right” (now false on mobile).
- ~200 words. The card is now ~180 words and fits in one mobile screen.

**The one thing I would do if only one change were possible**  
Delete the BPMN and RACI blocks completely and replace the left column with the single “Summary generated from the 907-line reference program” box that links to the real frozen pyramid. That single swap removes the mockup smell, cuts height dramatically, and makes the most important claim (what the program does) feel as honest as the numbers on the right. Everything else can wait.