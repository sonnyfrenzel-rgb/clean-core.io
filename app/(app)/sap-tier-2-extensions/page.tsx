import type { Metadata } from 'next';
import { BookOpen, ArrowLeft, Layers, ShieldCheck, Check, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'SAP Tier-2 Extensions & Cloud Readiness | Clean-Core.io',
  description: 'Verstehen Sie das ABAP Cloud 3-Tier Extensibility Modell und lernen Sie, wie Sie Legacy-Datenstrukturen sicher kapseln.',
  alternates: {
    canonical: 'https://clean-core.io/sap-tier-2-extensions',
  },
  openGraph: {
    title: 'SAP Tier-2 Extensions & Cloud Readiness | Clean-Core.io',
    description: 'Verstehen Sie das ABAP Cloud 3-Tier Extensibility Modell und lernen Sie, wie Sie Legacy-Datenstrukturen sicher kapseln.',
    url: 'https://clean-core.io/sap-tier-2-extensions',
    type: 'website',
  }
};

const faqs = [
  {
    question: "Was unterscheidet Tier-1 von Tier-2 ABAP Cloud Code?",
    answer: "Tier-1 (Cloud-native ABAP) verwendet ausschließlich von SAP freigegebene APIs und CDS-Views. Tier-2 (Cloud Readiness) dient als Wrapper-Schicht, um nicht-freigegebene SAP-Objekte sauber zu kapseln und über freigegebene Schnittstellen für Tier-1 nutzbar zu machen. Dadurch bleibt Tier-1 sauber."
  },
  {
    question: "Wann sind Tier-2 Extensions zwingend erforderlich?",
    answer: "Tier-2 ist notwendig, wenn Altsystem-Tabellen oder kundenspezifische Z-Tabellen ohne offizielle SAP-APIs angebunden werden müssen. Anstatt Tier-1 Code mit diesen Legacy-Strukturen zu verschmutzen, wird eine Kapselungsschicht dazwischengeschaltet."
  }
];

export default function SapExtensionsPage() {
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
            <Layers size={14} /> Architecture Patterns
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            Tier-2 <span className="text-green-400">Extensions</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            Entwickeln Sie zukunftssicher im 3-Tier Extensibility Modell. Lernen Sie, wie Sie Alt-Code sauber abkapseln und Ihre ERP-Erweiterungen cloudfähig machen.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
        {/* Left 2 Columns: Text content */}
        <div className="md:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              Das ABAP Cloud 3-Tier Erweiterungsmodell
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              Um die Upgradefähigkeit von S/4HANA-Systemen zu gewährleisten, hat SAP das <strong>3-Tier-Erweiterungsmodell</strong> eingeführt. Dieses unterteilt jegliche ABAP-Entwicklungen in drei separate Schichten:
            </p>
            <div className="space-y-4 pt-2">
              <div className="p-5 border border-gray-200 rounded-2xl bg-slate-50/50">
                <h3 className="font-black text-gray-955 text-base">Tier 1: Cloud-native ABAP</h3>
                <p className="text-xs text-gray-600 mt-1 font-medium leading-relaxed">
                  Der reine Cloud-Standard. Nutzt ausschließlich freigegebene Sprachelemente (ABAP Cloud) und SAP APIs. Dieser Code ist absolut upgrade-sicher und läuft direkt in Public Cloud Umgebungen.
                </p>
              </div>
              <div className="p-5 border border-green-200 rounded-2xl bg-green-50/10">
                <h3 className="font-black text-gray-955 text-base text-green-700">Tier 2: Cloud Readiness Wrapper</h3>
                <p className="text-xs text-gray-600 mt-1 font-medium leading-relaxed">
                  Die Kapselungsschicht. Wenn notwendige SAP-Funktionalitäten in Tier-1 fehlen, wird in Tier-2 eine eigene API gebaut, die den Legacy-Zugriff kapselt und nach oben hin eine saubere Tier-1-Schnittstelle anbietet.
                </p>
              </div>
              <div className="p-5 border border-gray-200 rounded-2xl bg-slate-50/50">
                <h3 className="font-black text-gray-955 text-base">Tier 3: Legacy ABAP</h3>
                <p className="text-xs text-gray-600 mt-1 font-medium leading-relaxed">
                  Die klassische Entwicklungsschicht. Erlaubt Modifikationen und die Nutzung veralteter Tabellen (z. B. VBAK). Tier-3 ist die typische Upgradesperre und soll sukzessive abgebaut werden.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              Sinnvolle Nutzung von Tier-2-Extensions
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              Ziel von Clean-Core.io ist es, Ihren Legacy-ABAP-Code so weit wie möglich in <strong>Tier-1</strong> oder <strong>BTP CAP</strong> (Side-by-Side) zu migrieren. Wo dies aufgrund fehlender Standard-APIs nicht sofort möglich ist, generiert unsere Plattform automatisch den passenden Tier-2-Wrapper. 
            </p>
            <p className="text-gray-700 leading-relaxed font-medium">
              Durch diese automatisierte Kapselung bleibt Ihr Hauptanwendungscode sauber und zukunftssicher. Sobald SAP zu einem späteren Zeitpunkt eine offizielle API für die gekapselte Funktion bereitstellt, kann der Tier-2-Wrapper einfach durch den Standard ersetzt werden, ohne die Geschäftslogik zu brechen.
            </p>
          </section>
        </div>

        {/* Right Column: Key Metrics / Sidebar */}
        <div className="space-y-6">
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-6">
            <h3 className="font-black text-lg text-gray-950 uppercase tracking-tight">Vorteile auf einen Blick</h3>
            <ul className="space-y-3 font-bold text-sm text-gray-700">
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Strukturierter Legacy-Abbau
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Zukunftssichere API-Kapselung
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Minimiert Tier-3 Abhängigkeiten
              </li>
              <li className="flex gap-2 items-center">
                <Check className="text-green-600 shrink-0" size={16} /> Upgradebereite Systemarchitektur
              </li>
            </ul>
            <div className="pt-4 border-t border-gray-200">
              <Link 
                href="/?auth=signup" 
                className="block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm"
              >
                Code validieren
              </Link>
            </div>
          </div>

          <div className="border border-slate-200 rounded-[2rem] p-6 space-y-4 bg-white">
            <h3 className="font-black text-sm text-gray-400 uppercase tracking-wider">Verwandte Themen</h3>
            <div className="space-y-2 font-bold text-sm">
              <Link href="/abap-custom-code-analyse" className="block text-green-600 hover:underline">
                → ABAP Custom Code Analyse
              </Link>
              <Link href="/clean-core-score" className="block text-green-600 hover:underline">
                → Was ist der Clean Core Score?
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
