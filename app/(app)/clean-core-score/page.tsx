import type { Metadata } from 'next';
import { BookOpen, ArrowLeft, Activity, ShieldCheck, Check, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'SAP Clean Core Score & TCO Analyse | Clean-Core.io',
  description: 'Erfahren Sie, wie der Clean Core Score berechnet wird und wie Sie Ihre Upgrade-Aufwände durch Entkopplung um bis zu 80% senken können.',
  alternates: {
    canonical: 'https://clean-core.io/clean-core-score',
  },
  openGraph: {
    title: 'SAP Clean Core Score & TCO Analyse | Clean-Core.io',
    description: 'Erfahren Sie, wie der Clean Core Score berechnet wird und wie Sie Ihre Upgrade-Aufwände durch Entkopplung um bis zu 80% senken können.',
    url: 'https://clean-core.io/clean-core-score',
    type: 'website',
  }
};

const faqs = [
  {
    question: "Was bedeutet ein Clean Core Score von 100%?",
    answer: "Ein Score von 100% signalisiert, dass alle kundenspezifischen Erweiterungen vollständig regelkonform implementiert wurden. Das bedeutet, dass In-App-Modifikationen nur über freigegebene Key-User Apps laufen und Side-by-Side BTP-Erweiterungen ausschließlich über zertifizierte Schnittstellen kommunizieren. Das SAP-System ist zu 100% upgradebereit."
  },
  {
    question: "Wie hängen Clean Core Score und TCO zusammen?",
    answer: "Je niedriger der Clean Core Score ist, desto höher sind die laufenden Betriebskosten (Total Cost of Ownership, TCO). Modifikationen müssen bei jedem SAP Support Package aufwendig nachgetestet und korrigiert werden. Ein hoher Score minimiert diesen Testaufwand dramatisch."
  }
];

export default function CleanCoreScorePage() {
  const schemaJson = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12 animate-in fade-in duration-300 bg-white min-h-screen text-gray-900 font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }}
      />

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-slate-50 px-5 py-2.5 rounded-full border border-gray-200 hover:border-green-200"
        >
          <ArrowLeft size={14} /> Zurück zur Startseite
        </Link>
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-bold text-green-400 tracking-wide uppercase">
            <Activity size={14} /> Business Metrics
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            SAP Clean Core <span className="text-green-400">Score</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            Messen Sie die Zukunftsfähigkeit Ihres SAP ERP. Berechnen Sie die Einhaltung offizieller SAP Clean Core Guidelines und prognostizieren Sie Ihre TCO-Einsparungen.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
        {/* Left 2 Columns: Text content */}
        <div className="md:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-950">
              Was ist der Clean Core Score?
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              Der <strong>SAP Clean Core Score</strong> ist die zentrale Kennzahl (KPI) zur Bewertung des Entkopplungsgrades kundenspezifischer ABAP-Modifikationen. Er zeigt auf einer Skala von 0 % (vollständig modifiziertes Legacy-System) bis 100 % (Standard-ERP ohne Modifikationen) an, wie reibungslos Ihr System aktualisiert werden kann.
            </p>
            <p className="text-gray-700 leading-relaxed font-medium">
              Durch die Einhaltung eines „sauberen Kerns“ stellen Unternehmen sicher, dass Kernprozesse stabil bleiben, während Innovationen side-by-side auf der <strong>SAP Business Technology Platform (BTP)</strong> oder in-app über freigegebene Schnittstellen realisiert werden.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-950">
              Die Berechnungsgrundlagen der KPI
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              Unser Analysealgorithmus bewertet hochgeladene Custom-Code-Projekte anhand von vier zentralen Säulen:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <ShieldCheck className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-950">Schnittstellen-Freigabe</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Prüft, ob verwendete SAP APIs und Data Dictionary Objekte offiziell von SAP für Cloud-Erweiterungen freigegeben sind.
                </p>
              </div>

              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <Activity className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-950">Kopplungsgrad (Coupling)</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Misst, wie stark kundenspezifische Tabellen und Geschäftsabläufe mit SAP ERP-Modulen verwoben sind.
                </p>
              </div>

              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <Sparkles className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-950">Modernes ABAP Cloud</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Valdiert die Nutzung von modernem ABAP Cloud Syntax (RAP Model) anstelle veralteter ABAP Reports.
                </p>
              </div>

              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <TrendingUp className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-950">TCO Optimierungspotenzial</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Berechnet die Reduktion von Test- und Entwicklungskosten bei zukünftigen System-Upgrades.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Key Metrics / Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-6">
            <h3 className="font-black text-lg text-gray-950 uppercase tracking-tight">Vorteile auf einen Blick</h3>
            <ul className="space-y-3 font-bold text-sm text-gray-700">
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Klare KPI für das IT-Management
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Benchmarking gegen SAP-Best-Practices
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Identifikation kritischer Kopplungen
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Bis zu 80% Einsparung bei Testing
              </li>
            </ul>
            <div className="pt-4 border-t border-gray-200">
              <Link 
                href="/?auth=signup" 
                className="block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm"
              >
                Score berechnen
              </Link>
            </div>
          </div>

          <div className="border border-slate-200 rounded-[2rem] p-6 space-y-4 bg-white">
            <h3 className="font-black text-sm text-gray-400 uppercase tracking-wider">Verwandte Themen</h3>
            <div className="space-y-2 font-bold text-sm">
              <Link href="/abap-custom-code-analyse" className="block text-green-600 hover:underline">
                → ABAP Custom Code Analyse
              </Link>
              <Link href="/sap-tier-2-extensions" className="block text-green-600 hover:underline">
                → ABAP Cloud & Tier-2-Extensions
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* FAQs */}
      <div className="bg-slate-50 border border-gray-200 rounded-[2.5rem] p-8 space-y-6">
        <h2 className="text-2xl font-black text-gray-950">Häufig gestellte Fragen (FAQ)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-bold text-sm">
          {faqs.map((faq, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="text-gray-955 font-black">{faq.question}</h3>
              <p className="text-gray-600 font-medium leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className="text-center text-[10px] text-gray-500 font-mono font-bold uppercase tracking-wider pt-10 border-t border-gray-200">
        Clean-Core.io {APP_VERSION} • {APP_RELEASE_DATE} • Non-Commercial Pilot Edition
      </div>
    </div>
  );
}
