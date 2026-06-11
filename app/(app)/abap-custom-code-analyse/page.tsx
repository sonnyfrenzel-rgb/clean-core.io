import type { Metadata } from 'next';
import { BookOpen, ArrowLeft, Cpu, Activity, ShieldCheck, Link2, Check } from 'lucide-react';
import Link from 'next/link';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'ABAP Custom Code Analyse für S/4HANA Upgrades | Clean-Core.io',
  description: 'Automatische statische Analyse von ABAP Legacy Code, Erkennung von Tabellenzugriffen und Zuordnung zu offiziellen Standard-SAP-APIs.',
  alternates: {
    canonical: 'https://clean-core.io/abap-custom-code-analyse',
  },
  openGraph: {
    title: 'ABAP Custom Code Analyse für S/4HANA Upgrades | Clean-Core.io',
    description: 'Automatische statische Analyse von ABAP Legacy Code, Erkennung von Tabellenzugriffen und Zuordnung zu offiziellen Standard-SAP-APIs.',
    url: 'https://clean-core.io/abap-custom-code-analyse',
    type: 'website',
  }
};

const faqs = [
  {
    question: "Warum scheitern klassische S/4HANA Upgrades?",
    answer: "Viele SAP-Systeme weisen eine starke Verflechtung (enge Kopplung) zwischen kundenspezifischem ABAP-Code und den Standard-Tabellen von SAP auf. Bei Upgrades verändern sich die zugrunde liegenden Datenstrukturen, was zu Systemfehlern und massivem Testaufwand führt."
  },
  {
    question: "Wie hilft die automatisierte ABAP-Analyse?",
    answer: "Die Analyse isoliert Modifikationen im ABAP-Code und ordnet Direktzugriffe auf Tabellen wie VBAK, LIKP oder BSEG automatisch den freigegebenen Standard-OData/REST-APIs im SAP API Business Hub zu. Dadurch wird die Kopplung aufgelöst."
  }
];

export default function AbapAnalysisPage() {
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
            <Cpu size={14} /> Core Technology
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            ABAP Custom Code <span className="text-green-400">Analyse</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            Entkoppeln Sie Ihre Altsysteme. Analysieren Sie unstrukturierten ABAP-Code und transformieren Sie ihn automatisch in eine zukunftssichere Side-by-Side BTP Architektur.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
        {/* Left 2 Columns: Text content */}
        <div className="md:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-950">
              Die Herausforderung: Custom Code als Upgrade-Bremse
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              In jahrzehntelang gewachsenen SAP-ERP-Systemen befinden sich oft tausende Zeilen kundeneigener ABAP-Entwicklungen. Viele davon greifen direkt auf Standard-Tabellen oder nicht freigegebene SAP-Funktionsbausteine zu. Bei einem Upgrade auf <strong>SAP S/4HANA</strong> führt diese enge Kopplung zu Systembrüchen, hohen Modernisierungskosten und monatelangen Testphasen.
            </p>
            <p className="text-gray-700 leading-relaxed font-medium">
              Die manuelle <strong>ABAP Custom Code Analyse</strong> und anschließende Refaktorisierung ist extrem zeitaufwendig. Genau hier setzt die automatisierte Plattform von Clean-Core.io an: Unser Tool liest Ihren Legacy-ABAP-Code, parst Syntaxbäume und analysiert Datenflüsse, um Abhängigkeiten automatisch zu isolieren.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-950">
              Wie die automatisierte Pipeline funktioniert
            </h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-950">Static AST Parsing</h3>
                  <p className="text-gray-600 text-sm font-medium mt-1">
                    Der ABAP-Quellcode wird in abstrakte Syntaxbäume (AST) zerlegt. Dadurch erkennen wir Verzweigungen, Datenbankoperationen (SELECT, INSERT, UPDATE) und externe Aufrufe.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                  <Link2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-950">SAP API Hub Alignment</h3>
                  <p className="text-gray-600 text-sm font-medium mt-1">
                    Gefundene Tabellenzugriffe werden mit der offiziellen API Business Hub Datenbank abgeglichen. Das System sucht automatisch nach freigegebenen OData- oder REST-Schnittstellen (z. B. Business Partner, Sales Order APIs) und schlägt diese als Ersatz vor.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center text-green-600">
                  <Activity size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-950">Target Architecture Routing</h3>
                  <p className="text-gray-600 text-sm font-medium mt-1">
                    Auf Basis des ermittelten Kopplungsgrades entscheidet das Routing, ob der Code In-App in ABAP Cloud (RAP) umgeschrieben oder als Side-by-Side Service auf SAP BTP (Node.js CAP) entkoppelt werden soll.
                  </p>
                </div>
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
                <Check className="text-green-600 shrink-0" size={16} /> 80% schnellere Code-Bewertung
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Automatische OData API-Zuordnung
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> SAP Clean Core Richtlinienkonform
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Reduziert Technische Upgradeschulden
              </li>
            </ul>
            <div className="pt-4 border-t border-gray-200">
              <Link 
                href="/?auth=signup" 
                className="block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm"
              >
                Kostenlos analysieren
              </Link>
            </div>
          </div>

          <div className="border border-slate-200 rounded-[2rem] p-6 space-y-4 bg-white">
            <h3 className="font-black text-sm text-gray-400 uppercase tracking-wider">Verwandte Themen</h3>
            <div className="space-y-2 font-bold text-sm">
              <Link href="/clean-core-score" className="block text-green-600 hover:underline">
                → Was ist der Clean Core Score?
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
              <h3 className="text-gray-950 font-black">{faq.question}</h3>
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
