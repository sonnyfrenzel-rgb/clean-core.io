{/* ==========================================================================
   TransformationShowroom.tsx
   SSR-only (Server Component) — No 'use client'.
   Tab switching via hidden radio inputs + CSS :checked sibling selectors.
   All code examples rendered in the DOM at build time for SEO.
   ========================================================================== */}

export default function TransformationShowroom() {
  return (
    <div
      data-testid="transformation-showroom"
      className="w-full"
    >
      <div className="max-w-7xl mx-auto">

        {/* ── CSS-Only Tab Machinery ──
            Three hidden radio inputs control visibility via the
            general sibling combinator (~). Each panel has a matching
            peer class that reacts to :checked.
        */}
        <style>{`
          /* ── Tab panel visibility ── */
          #showroom-tab-1:checked ~ .showroom-panels .panel-1,
          #showroom-tab-2:checked ~ .showroom-panels .panel-2,
          #showroom-tab-3:checked ~ .showroom-panels .panel-3 {
            display: block !important;
          }
          #showroom-tab-1:checked ~ .showroom-panels .panel-2,
          #showroom-tab-1:checked ~ .showroom-panels .panel-3,
          #showroom-tab-2:checked ~ .showroom-panels .panel-1,
          #showroom-tab-2:checked ~ .showroom-panels .panel-3,
          #showroom-tab-3:checked ~ .showroom-panels .panel-1,
          #showroom-tab-3:checked ~ .showroom-panels .panel-2 {
            display: none !important;
          }

          /* ── Active tab label styling ── */
          #showroom-tab-1:checked ~ .showroom-tab-bar .tab-label-1,
          #showroom-tab-2:checked ~ .showroom-tab-bar .tab-label-2,
          #showroom-tab-3:checked ~ .showroom-tab-bar .tab-label-3 {
            background-color: #fff;
            color: #0f172a;
            border-color: #e2e8f0;
            border-bottom-color: #fff;
            box-shadow: 0 -2px 6px rgba(0,0,0,0.04);
          }
        `}</style>

        {/* Hidden radios — must be siblings of .showroom-tab-bar & .showroom-panels */}
        <input
          type="radio"
          name="showroom-tab"
          id="showroom-tab-1"
          className="sr-only"
          defaultChecked
          aria-label="Sales Order (VBAK) tab"
        />
        <input
          type="radio"
          name="showroom-tab"
          id="showroom-tab-2"
          className="sr-only"
          aria-label="Journal Entry (BSEG) tab"
        />
        <input
          type="radio"
          name="showroom-tab"
          id="showroom-tab-3"
          className="sr-only"
          aria-label="Dynamic Dispatch (CALL FUNCTION) tab"
        />

        {/* ── Tab Bar ── */}
        <div className="showroom-tab-bar flex flex-wrap gap-0 border-b border-slate-200 mb-0">
          <label
            htmlFor="showroom-tab-1"
            className="tab-label-1 cursor-pointer px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold text-slate-500 border border-transparent rounded-t-xl transition-colors hover:text-slate-900 select-none"
          >
            Sales Order (VBAK)
          </label>
          <label
            htmlFor="showroom-tab-2"
            className="tab-label-2 cursor-pointer px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold text-slate-500 border border-transparent rounded-t-xl transition-colors hover:text-slate-900 select-none"
          >
            Journal Entry (BSEG)
          </label>
          <label
            htmlFor="showroom-tab-3"
            className="tab-label-3 cursor-pointer px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold text-slate-500 border border-transparent rounded-t-xl transition-colors hover:text-slate-900 select-none"
          >
            Dynamic Dispatch
          </label>
        </div>

        {/* ── Tab Panels ── */}
        <div className="showroom-panels border border-t-0 border-slate-200 rounded-b-2xl bg-white">
          {/* ────────────────────────────────────────────────────────────── */}
          {/* TAB 1 — Sales Order (VBAK)                                   */}
          {/* ────────────────────────────────────────────────────────────── */}
          <div className="panel-1 p-4 sm:p-6 lg:p-8">
            {/* Business context */}
            <div className="mb-6 bg-slate-50 border border-slate-200/80 rounded-xl p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1 block">Business Context</span>
                  <p className="text-sm text-slate-600 leading-relaxed font-medium">A sales operations team needs to query open standard orders (type &apos;OR&apos;) from SAP to populate a real-time order fulfillment dashboard. The legacy ABAP directly reads the VBAK database table — a non-released internal structure that breaks during S/4HANA upgrades. The engine transforms this into a clean CDS view consuming the released I_SalesOrder API, preserving the exact filter logic while making it upgrade-safe and unit-testable.</p>
                </div>
              </div>
            </div>

            {/* Two-column code layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ── LEFT: Legacy Input ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Legacy ABAP Input
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 border-b border-slate-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                    <span className="ml-2 text-[10px] font-mono font-bold text-slate-400">
                      Z_LEGACY_ORDERS.abap
                    </span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-[11px] sm:text-[13px] leading-relaxed">
                    <code className="font-mono text-slate-700">
                      <span className="text-slate-400">{`" Direct table read — violates Clean Core`}</span>
{`
`}<span className="text-blue-700 font-bold">SELECT</span>{` vbeln, erdat, netwr
  `}<span className="text-blue-700 font-bold">FROM</span>{` `}<span className="text-amber-700 font-bold">vbak</span>{`
  `}<span className="text-blue-700 font-bold">INTO TABLE</span>{` @DATA(lt_orders)
  `}<span className="text-blue-700 font-bold">WHERE</span>{` auart = `}<span className="text-green-700">'OR'</span>{`.`}
                    </code>
                  </pre>
                </div>
              </div>

              {/* ── RIGHT: Generated RAP Output ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    Generated RAP Output
                  </span>
                </div>
                <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-1.5 px-4 py-2 bg-emerald-100/60 border-b border-emerald-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                    <span className="ml-2 text-[10px] font-mono font-bold text-emerald-600">
                      ZI_SalesOrderCustom.cds
                    </span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-[11px] sm:text-[13px] leading-relaxed">
                    <code className="font-mono text-slate-800">
                      <span className="text-blue-700 font-bold">define view entity</span>{` ZI_SalesOrderCustom
  `}<span className="text-blue-700 font-bold">as select from</span>{` `}<span className="text-emerald-700 font-bold">I_SalesOrder</span>{`
{
  `}<span className="text-blue-700 font-bold">key</span>{` SalesOrder      `}<span className="text-blue-700 font-bold">as</span>{` SalesOrderNumber,
      CreationDate    `}<span className="text-blue-700 font-bold">as</span>{` OrderDate,
      TotalNetAmount  `}<span className="text-blue-700 font-bold">as</span>{` NetAmount
}
`}<span className="text-blue-700 font-bold">where</span>{` SalesOrderType = `}<span className="text-green-700">'OR'</span>{`;`}
                    </code>
                  </pre>
                </div>
              </div>
            </div>

            {/* Generated Test */}
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-violet-600">
                  Generated ABAP-Unit Test
                </span>
              </div>
              <div className="bg-violet-50/30 border border-violet-200/60 rounded-xl overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-2 bg-violet-100/40 border-b border-violet-200/60">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                  <span className="ml-2 text-[10px] font-mono font-bold text-violet-500">
                    ltcl_sales_order.abap
                  </span>
                </div>
                <pre className="p-4 overflow-x-auto text-[11px] sm:text-[13px] leading-relaxed">
                  <code className="font-mono text-slate-700">
                    <span className="text-blue-700 font-bold">CLASS</span>{` ltcl_sales_order `}<span className="text-blue-700 font-bold">DEFINITION FINAL FOR TESTING</span>{`
  `}<span className="text-blue-700 font-bold">DURATION SHORT RISK LEVEL HARMLESS</span>{`.
  `}<span className="text-blue-700 font-bold">PRIVATE SECTION</span>{`.
    `}<span className="text-blue-700 font-bold">CLASS-DATA</span>{` environment `}<span className="text-blue-700 font-bold">TYPE REF TO</span>{` if_cds_test_environment.
    `}<span className="text-blue-700 font-bold">CLASS-METHODS</span>{` class_setup.
    `}<span className="text-blue-700 font-bold">METHODS</span>{` test_order_filter `}<span className="text-blue-700 font-bold">FOR TESTING</span>{`.
`}<span className="text-blue-700 font-bold">ENDCLASS</span>{`.

`}<span className="text-blue-700 font-bold">CLASS</span>{` ltcl_sales_order `}<span className="text-blue-700 font-bold">IMPLEMENTATION</span>{`.
  `}<span className="text-blue-700 font-bold">METHOD</span>{` class_setup.
    environment = cl_cds_test_environment=>`}<span className="text-blue-700 font-bold">create</span>{`( i_for_entity = 'ZI_SALESORDERCUSTOM' ).
  `}<span className="text-blue-700 font-bold">ENDMETHOD</span>{`.
  `}<span className="text-blue-700 font-bold">METHOD</span>{` test_order_filter.
    `}<span className="text-blue-700 font-bold">DATA</span>{` lt_result `}<span className="text-blue-700 font-bold">TYPE STANDARD TABLE OF</span>{` ZI_SalesOrderCustom.
    `}<span className="text-blue-700 font-bold">SELECT</span>{` * `}<span className="text-blue-700 font-bold">FROM</span>{` ZI_SalesOrderCustom
      `}<span className="text-blue-700 font-bold">INTO TABLE</span>{` @lt_result.
    cl_abap_unit_assert=>`}<span className="text-blue-700 font-bold">assert_not_initial</span>{`( act = lines( lt_result ) ).
  `}<span className="text-blue-700 font-bold">ENDMETHOD</span>{`.
`}<span className="text-blue-700 font-bold">ENDCLASS</span>{`.`}
                  </code>
                </pre>
              </div>
            </div>

            {/* Parser Insight + Validation Row */}
            <div className="mt-6 flex flex-col sm:flex-row gap-4">
              {/* Parser Insight Badge */}
              <div className="flex-1 bg-blue-50/50 border border-blue-200/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                    Parser Insight
                  </span>
                </div>
                <p className="text-sm text-slate-700 font-medium leading-relaxed">
                  Table <code className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-bold font-mono">VBAK</code> → Resolved to released API{' '}
                  <code className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-xs font-bold font-mono">I_SalesOrder</code>{' '}
                  <span className="text-slate-400">(SAP API Business Hub)</span>.
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                    Confidence: High — deterministic rule match
                  </span>
                </div>
              </div>

              {/* Validation Badges */}
              <div className="flex flex-col gap-2 justify-center shrink-0">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-bold text-green-700">
                    CDS test environment created
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-bold text-green-700">
                    1 of 1 unit tests passed
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────── */}
          {/* TAB 2 — Journal Entry (BSEG)                                 */}
          {/* ────────────────────────────────────────────────────────────── */}
          <div className="panel-2 p-4 sm:p-6 lg:p-8" style={{ display: 'none' }}>
            {/* Business context */}
            <div className="mb-6 bg-slate-50 border border-slate-200/80 rounded-xl p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1 block">Business Context</span>
                  <p className="text-sm text-slate-600 leading-relaxed font-medium">The finance controlling team extracts accounting document line items for company code 1000 to feed an external reporting tool. The legacy code reads BSEG directly — one of SAP&apos;s largest and most problematic cluster tables, deprecated in S/4HANA. The engine maps this to the released CDS view <code className="px-1 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs font-bold font-mono">I_JournalEntry</code>, wrapped in a cloud-native CAP Node.js service that decouples the reporting logic from the core ERP entirely.</p>
                </div>
              </div>
            </div>

            {/* Two-column code layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ── LEFT: Legacy Input ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Legacy ABAP Input
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 border-b border-slate-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                    <span className="ml-2 text-[10px] font-mono font-bold text-slate-400">
                      Z_FI_DOCUMENTS.abap
                    </span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-[11px] sm:text-[13px] leading-relaxed">
                    <code className="font-mono text-slate-700">
                      <span className="text-slate-400">{`" Financial doc segment read — non-released table`}</span>
{`
`}<span className="text-blue-700 font-bold">SELECT</span>{` bukrs, belnr, gjahr, dmbtr
  `}<span className="text-blue-700 font-bold">FROM</span>{` `}<span className="text-amber-700 font-bold">bseg</span>{`
  `}<span className="text-blue-700 font-bold">INTO TABLE</span>{` @DATA(lt_items)
  `}<span className="text-blue-700 font-bold">WHERE</span>{` bukrs = `}<span className="text-green-700">'1000'</span>{`.`}
                    </code>
                  </pre>
                </div>
              </div>

              {/* ── RIGHT: Generated CAP Node.js Output ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    Generated CAP Node.js Output
                  </span>
                </div>
                <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-1.5 px-4 py-2 bg-emerald-100/60 border-b border-emerald-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                    <span className="ml-2 text-[10px] font-mono font-bold text-emerald-600">
                      srv/journal-service.cds
                    </span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-[11px] sm:text-[13px] leading-relaxed">
                    <code className="font-mono text-slate-800">
                      <span className="text-slate-400">{'// srv/journal-service.cds'}</span>
{`
`}<span className="text-blue-700 font-bold">using</span>{` { `}<span className="text-emerald-700 font-bold">I_JournalEntry</span>{` } `}<span className="text-blue-700 font-bold">from</span>{` `}<span className="text-green-700">'../srv/external'</span>{`;

`}<span className="text-blue-700 font-bold">service</span>{` JournalService {
  `}<span className="text-violet-600">@readonly</span>{`
  `}<span className="text-blue-700 font-bold">entity</span>{` JournalEntries `}<span className="text-blue-700 font-bold">as projection on</span>{` `}<span className="text-emerald-700 font-bold">I_JournalEntry</span>{` {
    `}<span className="text-blue-700 font-bold">key</span>{` CompanyCode,
    `}<span className="text-blue-700 font-bold">key</span>{` AccountingDocument,
    `}<span className="text-blue-700 font-bold">key</span>{` FiscalYear,
        AmountInCompanyCodeCurrency
  }
}`}
                    </code>
                  </pre>
                </div>
              </div>
            </div>

            {/* Parser Insight + Validation Row */}
            <div className="mt-6 flex flex-col sm:flex-row gap-4">
              {/* Parser Insight Badge */}
              <div className="flex-1 bg-blue-50/50 border border-blue-200/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                    Parser Insight
                  </span>
                </div>
                <p className="text-sm text-slate-700 font-medium leading-relaxed">
                  Table <code className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-bold font-mono">BSEG</code> → Resolved to released CDS view{' '}
                  <code className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-xs font-bold font-mono">I_JournalEntry</code>{' '}
                  <span className="text-slate-400">(SAP API Business Hub)</span>.
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">
                    Confidence: High — deterministic rule match
                  </span>
                </div>
              </div>

              {/* Validation Badges */}
              <div className="flex flex-col gap-2 justify-center shrink-0">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-bold text-green-700">
                    Service definition compiled
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-bold text-green-700">
                    Schema validated
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ────────────────────────────────────────────────────────────── */}
          {/* TAB 3 — Dynamic Dispatch (CALL FUNCTION)                     */}
          {/* ────────────────────────────────────────────────────────────── */}
          <div className="panel-3 p-4 sm:p-6 lg:p-8" style={{ display: 'none' }}>
            {/* Business context */}
            <div className="mb-6 bg-slate-50 border border-slate-200/80 rounded-xl p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1 block">Business Context</span>
                  <p className="text-sm text-slate-600 leading-relaxed font-medium">A logistics module dynamically dispatches function calls at runtime based on business rules — a common pattern in older SAP systems for flexible processing chains. Since the target function is resolved at runtime, no static API mapping is possible. The engine correctly identifies this as a low-confidence scenario, flags it for architect review, and provides structured remediation guidance (factory pattern refactoring) rather than generating potentially incorrect code.</p>
                </div>
              </div>
            </div>

            {/* Two-column code layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ── LEFT: Legacy Input ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Legacy ABAP Input
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 border-b border-slate-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                    <span className="ml-2 text-[10px] font-mono font-bold text-slate-400">
                      Z_DYNAMIC_DISPATCH.abap
                    </span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-[11px] sm:text-[13px] leading-relaxed">
                    <code className="font-mono text-slate-700">
                      <span className="text-slate-400">{`" Dynamic function module call — cannot be statically resolved`}</span>
{`
`}<span className="text-blue-700 font-bold">DATA</span>{`: lv_func `}<span className="text-blue-700 font-bold">TYPE</span>{` funcname.
lv_func = get_dynamic_function( ).
`}<span className="text-blue-700 font-bold">CALL FUNCTION</span>{` lv_func
  `}<span className="text-blue-700 font-bold">EXPORTING</span>{` iv_param = lv_value
  `}<span className="text-blue-700 font-bold">IMPORTING</span>{` ev_result = lv_result.`}
                    </code>
                  </pre>
                </div>
              </div>

              {/* ── RIGHT: Generated Output (with warning) ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                    Generated Output (Flagged)
                  </span>
                </div>
                <div className="bg-amber-50/40 border border-amber-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-1.5 px-4 py-2 bg-amber-100/60 border-b border-amber-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                    <span className="ml-2 text-[10px] font-mono font-bold text-amber-600">
                      REVIEW_REQUIRED.abap
                    </span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-[11px] sm:text-[13px] leading-relaxed">
                    <code className="font-mono text-slate-700">
                      <span className="text-amber-600 font-bold">{`" ⚠ LOW CONFIDENCE — Manual review recommended.`}</span>
{`
`}<span className="text-slate-400">{`" Reason: Dynamic CALL FUNCTION target cannot be
" resolved at parse time. The function module name
" is determined at runtime via get_dynamic_function().
"
" Suggested action:
"   1. Identify all possible target function modules
"   2. Create explicit wrapper methods for each
"   3. Replace dynamic dispatch with a factory pattern`}</span>
{`
`}<span className="text-slate-400">{`" Original statement preserved for architect review:
" CALL FUNCTION lv_func ...`}</span>
                    </code>
                  </pre>
                </div>
              </div>
            </div>

            {/* Parser Insight + Validation Row */}
            <div className="mt-6 flex flex-col sm:flex-row gap-4">
              {/* Parser Insight Badge */}
              <div className="flex-1 bg-amber-50/50 border border-amber-200/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                    Parser Insight
                  </span>
                </div>
                <p className="text-sm text-slate-700 font-medium leading-relaxed">
                  Dynamic <code className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-bold font-mono">CALL FUNCTION</code> with runtime-resolved name.
                  Target function module cannot be determined at parse time.
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                  <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">
                    Confidence: Low — manual review recommended
                  </span>
                </div>
              </div>

              {/* Validation Badges */}
              <div className="flex flex-col gap-2 justify-center shrink-0">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-xs font-bold text-amber-700">
                    Flagged for manual review
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                  <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-xs font-bold text-amber-700">
                    Architect sign-off required
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Version Stamp ── */}
        <div className="mt-6 text-center">
          <span className="text-[11px] font-mono font-bold text-slate-400 tracking-wide">
            Verified against Clean-Core Engine v1.7.3 · June 2026
          </span>
        </div>
      </div>
    </div>
  );
}
