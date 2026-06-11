import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { 
  RotateCw, 
  Users, 
  Layers, 
  Globe, 
  Cpu, 
  Activity, 
  ShieldCheck, 
  Shield, 
  Check, 
  X,
  ArrowRight,
  Download
} from 'lucide-react';
import PilotWarningBanner from '@/components/PilotWarningBanner';
import HeaderAuthButton from '@/components/HeaderAuthButton';
import HeroCTA from '@/components/HeroCTA';
import PricingCTA from '@/components/PricingCTA';
import FooterCTA from '@/components/FooterCTA';
import LandingModals from '@/components/LandingModals';
import LandingSlideshow from '@/components/LandingSlideshow';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'SAP Clean Core Analysis & S/4HANA Modernization | Clean-Core.io',
  description: 'Automated ABAP custom code analysis and transformation to cloud-native Node.js (CAP) following official SAP Clean Core guidelines.',
  alternates: {
    canonical: 'https://clean-core.io',
  },
  openGraph: {
    title: 'SAP Clean Core Analysis & S/4HANA Modernization | Clean-Core.io',
    description: 'Automated ABAP custom code analysis and transformation to cloud-native Node.js (CAP) following official SAP Clean Core guidelines.',
    url: 'https://clean-core.io',
    type: 'website',
    siteName: 'Clean-Core.io',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SAP Clean Core Analysis & S/4HANA Modernization | Clean-Core.io',
    description: 'Automated ABAP custom code analysis and transformation to cloud-native Node.js (CAP) following official SAP Clean Core guidelines.',
  }
};

export default function Home() {
  const schemaJson = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://clean-core.io/#organization",
        "name": "Clean-Core.io",
        "url": "https://clean-core.io",
        "logo": "https://clean-core.io/icon.svg",
        "sameAs": [
          "https://github.com/clean-core-io",
          "https://www.linkedin.com/company/clean-core-io"
        ]
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://clean-core.io/#software",
        "name": "Clean-Core.io",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "All",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD"
        },
        "description": "Automated ABAP custom code analysis and S/4HANA modernization following official SAP Clean Core guidelines."
      },
      {
        "@type": "FAQPage",
        "@id": "https://clean-core.io/#faq",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is the SAP Clean Core strategy?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "The Clean Core strategy keeps the ERP standard free of custom developments by extending via in-app key-user tools or side-by-side on SAP BTP."
            }
          },
          {
            "@type": "Question",
            "name": "How does Clean-Core.io help with ABAP modernization?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Clean-Core.io automatically analyzes ABAP code and converts it to SAP BTP CAP Node.js services or cloud-ready RAP components."
            }
          }
        ]
      }
    ]
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }}
      />

      {/* Pilot Warning Banner */}
      <PilotWarningBanner />
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 text-green-600 hover:opacity-80 transition-opacity shrink-0">
            <div className="bg-green-600/10 p-2 rounded-xl hidden sm:block">
              <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg sm:text-2xl tracking-tight text-gray-900 leading-none">Clean-Core<span className="text-green-600">.io</span></span>
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 mt-1">Non-Commercial Pilot</span>
            </div>
          </Link>
          <div className="shrink-0 flex items-center gap-3">
             <div className="hidden sm:flex text-xs font-semibold bg-gray-100 text-gray-600 px-3 py-1 rounded-full items-center gap-1">
               <Users size={14} /> Community Edition
             </div>
             <HeaderAuthButton />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-32 md:pt-40 md:pb-56 overflow-hidden bg-slate-50/30">
        <style>{`
          @keyframes float-slow {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(4deg); }
          }
          @keyframes float-slower {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(20px) rotate(-4deg); }
          }
          @keyframes drift-up-left {
            0% { transform: translateY(120px) translateX(0); opacity: 0; }
            15% { opacity: 0.45; }
            85% { opacity: 0.45; }
            100% { transform: translateY(-500px) translateX(-25px); opacity: 0; }
          }
          @keyframes drift-up-right {
            0% { transform: translateY(120px) translateX(0); opacity: 0; }
            15% { opacity: 0.65; }
            85% { opacity: 0.65; }
            100% { transform: translateY(-500px) translateX(25px); opacity: 0; }
          }
          @keyframes pulse-slow {
            0%, 100% { transform: scale(1); opacity: 0.22; }
            50% { transform: scale(1.18); opacity: 0.32; }
          }
          .animate-float-slow {
            animation: float-slow 7.5s ease-in-out infinite;
          }
          .animate-float-slower {
            animation: float-slower 9.5s ease-in-out infinite;
          }
          .animate-pulse-slow {
            animation: pulse-slow 8.5s ease-in-out infinite;
          }
        `}</style>

        {/* Background Mesh Gradient Blobs */}
        <div className="absolute top-[10%] left-[5%] w-[380px] h-[380px] bg-indigo-300 rounded-full blur-[130px] opacity-25 animate-pulse-slow z-0 pointer-events-none" />
        <div className="absolute top-[22%] right-[5%] w-[420px] h-[420px] bg-emerald-300 rounded-full blur-[150px] opacity-20 animate-float-slow z-0 pointer-events-none" />
        <div className="absolute bottom-[10%] left-[20%] w-[450px] h-[450px] bg-teal-200 rounded-full blur-[140px] opacity-20 animate-float-slower z-0 pointer-events-none" />

        {/* Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808006_1px,transparent_1px),linear-gradient(to_bottom,#80808006_1px,transparent_1px)] bg-[size:40px_40px] z-0"></div>
        
        {/* Left Particle Column: Legacy ABAP */}
        <div className="hidden xl:flex absolute left-8 top-20 bottom-20 w-32 flex-col justify-around pointer-events-none overflow-hidden z-20">
          {[
            { text: 'REPORT Z_LEGACY', top: '12%', delay: '0s' },
            { text: 'SELECT * FROM', top: '27%', delay: '1.8s' },
            { text: 'FORM GET_DATA', top: '44%', delay: '0.9s' },
            { text: 'CALL FUNCTION', top: '61%', delay: '2.5s' },
            { text: 'DATA: lv_count', top: '78%', delay: '3.4s' },
            { text: 'WRITE: / lv_val', top: '92%', delay: '4.8s' }
          ].map((item, idx) => (
            <div 
              key={idx}
              className="absolute bg-slate-100 text-slate-400 font-mono text-[10px] font-black px-3 py-1.5 rounded-lg border border-slate-200/50 shadow-sm whitespace-nowrap"
              style={{
                top: item.top,
                animation: `drift-up-left 9s linear infinite`,
                animationDelay: item.delay
              }}
            >
              {item.text}
            </div>
          ))}
        </div>

        {/* Right Particle Column: Modern TS */}
        <div className="hidden xl:flex absolute right-8 top-20 bottom-20 w-36 flex-col justify-around pointer-events-none overflow-hidden z-20">
          {[
            { text: "import { Router }", top: '17%', delay: '0.4s' },
            { text: 'async function', top: '32%', delay: '2.2s' },
            { text: 'express.json()', top: '49%', delay: '1.4s' },
            { text: 'callGemini()', top: '66%', delay: '3.0s' },
            { text: 'new PrismaClient()', top: '81%', delay: '0.1s' },
            { text: 'res.status(200)', top: '94%', delay: '4.2s' }
          ].map((item, idx) => (
            <div 
              key={idx}
              className="absolute bg-emerald-50 text-emerald-600 font-mono text-[10px] font-black px-3 py-1.5 rounded-lg border border-emerald-200/50 shadow-md shadow-emerald-500/5 whitespace-nowrap"
              style={{
                top: item.top,
                animation: `drift-up-right 9s linear infinite`,
                animationDelay: item.delay
              }}
            >
              {item.text}
            </div>
          ))}
        </div>

        <div className="max-w-6xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 text-amber-700 font-bold text-xs md:text-sm mb-8 border border-amber-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Users className="w-4 h-4" />
            <span className="uppercase tracking-wider">Join our non-commercial Pilot Program</span>
          </div>
          <h1 className="text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.85] text-gray-950 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            Transform Legacy Code <br className="hidden md:block" />
            into <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-500">Cloud-Native Node.js</span>
          </h1>
          <p className="text-lg md:text-2xl text-gray-700 max-w-3xl mx-auto mb-12 leading-relaxed font-light animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
            Bridge legacy SAP and cloud-native agility. Automatically transform custom ABAP operations into clean-code architectures fully aligned with official SAP Clean Core guidelines.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-500">
            <HeroCTA />
            <div className="flex items-center gap-2 mt-2 bg-slate-100 text-slate-700 px-3.5 py-1.5 rounded-full border border-slate-200 text-xs font-bold font-mono">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span>LATEST COMMUNITY RELEASE: {APP_VERSION} ({APP_RELEASE_DATE})</span>
            </div>
          </div>
        </div>
        
        {/* Interactive Slideshow */}
        <div className="relative z-20 animate-in fade-in slide-in-from-bottom-24 duration-1000 delay-700">
          <LandingSlideshow />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 md:py-32 bg-white relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-black mb-6 text-gray-950 tracking-tighter">Pilot Features Overview</h2>
            <p className="text-lg md:text-xl text-gray-700 max-w-2xl mx-auto font-light">Test the fully automated pipeline during our non-commercial pilot phase.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Layers className="w-8 h-8 text-green-600" />,
                title: 'Extensibility Routing',
                desc: 'Intelligently classifies legacy custom logic against SAP Clean Core guidelines, automatically separating In-App ABAP Cloud (RAP) from Side-by-Side BTP (CAP) tracks.',
                link: '/sap-tier-2-extensions'
              },
              {
                icon: <Globe className="w-8 h-8 text-green-600" />,
                title: 'SAP API Hub Mapping',
                desc: 'Directly maps legacy database table operations to released, public standard SAP APIs with interactive links to official API Hub listings.',
                link: '/abap-custom-code-analysis'
              },
              {
                icon: <Cpu className="w-8 h-8 text-green-600" />,
                title: 'Dual RAP & CAP Engine',
                desc: 'Generates clean In-App ABAP Cloud RAP handlers formatted as standard abapGit directories (src/ and abapgit.xml) for local ADT import, or decoupled BTP CAP Node.js services.',
                link: '/sap-tier-2-extensions'
              },
              {
                icon: <Activity className="w-8 h-8 text-green-600" />,
                title: 'Business Value Audit & TCO',
                desc: 'Quantifies technical debt and custom IP value. Features an interactive C-Level TCO & ROI calculator predicting upgrade-impact savings based on Clean Core Scores.',
                link: '/clean-core-score'
              },
              {
                icon: <ShieldCheck className="w-8 h-8 text-green-600" />,
                title: 'ADT Cockpit Simulation',
                desc: 'Generates standard ABAP Unit classes with local database doubles, simulating execution in a virtual Eclipse ADT Test Cockpit console.',
                link: '/abap-custom-code-analysis'
              },
              {
                icon: <Layers className="w-8 h-8 text-green-600" />,
                title: 'BPMN 2.0 & Business SOP',
                desc: 'Maps modernized processes into standard BPMN 2.0 XML with swimlanes. Features a two-stage blueprint layer mapping RACI matrices, Level 5 SOP narratives, and internal compliance controls.',
                isNew: true,
                link: '/clean-core-score'
              }
            ].map((feature, idx) => (
              <div 
                key={idx} 
                className="bg-white/45 backdrop-blur-md p-8 md:p-10 rounded-[2.5rem] border border-gray-200/60 hover:border-green-400 hover:bg-white/95 transition-all hover:shadow-xl hover:shadow-green-500/5 group hover:-translate-y-1.5 duration-350 flex flex-col justify-between"
              >
                <div>
                  <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-8 border border-gray-100 shadow-sm group-hover:scale-110 transition-all duration-300 group-hover:bg-green-50 group-hover:shadow-md group-hover:border-green-200">
                    <div className="text-green-600 transition-colors">
                      {feature.icon}
                    </div>
                  </div>
                  <h3 className="text-2xl font-black mb-4 text-gray-955 tracking-tight flex items-center gap-2">
                    {feature.title}
                    {feature.isNew && (
                      <span className="px-2 py-0.5 bg-green-600 text-white text-[9px] font-black rounded-md uppercase tracking-wider">NEW</span>
                    )}
                  </h3>
                  <p className="text-gray-700 leading-relaxed font-medium text-sm md:text-base mb-6">{feature.desc}</p>
                </div>
                {feature.link && (
                  <Link 
                    href={feature.link}
                    className="text-green-600 hover:text-green-700 font-bold text-sm inline-flex items-center gap-1 hover:underline mt-auto"
                  >
                    Learn more <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & Security Section */}
      <section className="py-24 bg-slate-50/50 border-y border-gray-900/5 relative overflow-hidden">
        {/* Background ambient lighting */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <span className="text-[10px] md:text-xs font-black bg-green-50 text-[#006b2c] px-3.5 py-1.5 rounded-full border border-green-150 uppercase tracking-widest inline-flex items-center gap-1.5 mb-4 select-none">
              🛡️ Sovereign & Secured
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-gray-955 tracking-tighter mb-4">
              Built on Trust and Enterprise Standards
            </h2>
            <p className="text-gray-600 font-medium text-sm md:text-base max-w-xl mx-auto leading-relaxed">
              We design software architecture transformations with strict European safety standards, data sovereignty, and robust security frameworks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <Globe className="w-6 h-6 text-green-600" />,
                title: "Belgium Hosting (Europe)",
                desc: "All workspaces, analytical engines, and database systems are hosted strictly in the europe-west1 GCP region (Belgium) ensuring high-speed processing."
              },
              {
                icon: <ShieldCheck className="w-6 h-6 text-green-600" />,
                title: "DSGVO / GDPR Compliant",
                desc: "Full enforcement of Art. 17 DSGVO. Purge all user footprints, uploads, and data in Settings. Transactional emails are securely routed via Resend API with DSGVO imprints."
              },
              {
                icon: <Users className="w-6 h-6 text-green-600" />,
                title: "Non-Commercial Pilot",
                desc: "Purely research-oriented beta platform. Free access for enterprise architects to prototype decoupling side-by-side without licensing overhead."
              },
              {
                icon: <Shield className="w-6 h-6 text-green-600" />,
                title: "Hardened Stateless APIs",
                desc: "Your BYOK API credentials are encrypted in transit, proxied securely server-side, and never trained or exposed to public LLM builders."
              }
            ].map((trust, idx) => (
              <div 
                key={idx}
                className="bg-white/60 backdrop-blur-md p-6 rounded-3xl border border-gray-200/60 hover:border-green-400 hover:shadow-xl hover:shadow-green-500/5 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-6 border border-gray-100 shadow-sm">
                    {trust.icon}
                  </div>
                  <h3 className="text-lg font-black text-gray-955 tracking-tight mb-2 uppercase">{trust.title}</h3>
                  <p className="text-gray-600 text-xs md:text-sm leading-relaxed font-medium">{trust.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing / Licenses Section */}
      <section className="py-24 md:py-32 bg-white relative overflow-hidden" id="pricing">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-black mb-6 text-gray-955 tracking-tighter">Pilot Licenses</h2>
            <p className="text-lg md:text-xl text-gray-700 max-w-2xl mx-auto font-light">Join the community. Commercial use is not currently planned, but will be evaluated if the pilot phase proves successful.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                tier: 'Pilot Basic (Community)',
                price: 'Free',
                period: 'Non-Commercial Sandbox',
                features: [
                  'Up to 5 standard analyses',
                  'Standard Solution Designs',
                  'Community Feedback Access',
                  'Standard QA reports'
                ],
                notFeatures: [
                  'Modular ZIP Handover',
                  'Granular Sandbox Executions',
                  'BPMN 2.0 XML Exports',
                  'Confluence Blueprints'
                ],
                cta: 'Get Basic Access',
                highlight: false,
                disabled: false
              },
              {
                tier: 'Pilot Starter (Developer Upgrade)',
                price: 'Free',
                period: 'Community Pilot — Instant Self-Service Key Upgrade',
                features: [
                  'Includes all Pilot Basic features',
                  'Unlimited transformations (via BYOK*)',
                  'Granular Sandbox Testing & Runs',
                  'BPMN 2.0 & Confluence Exports',
                  'Full Multi-File ZIP Handover',
                  'Bring Your Own Key (BYOK*) — Unlock via Settings!'
                ],
                notFeatures: [
                  'Commercial SLA',
                  'Corporate SSO Integration',
                  'Active JIRA / Azure DevOps Integration'
                ],
                cta: 'Unlock Developer Access',
                highlight: true,
                disabled: false
              },
              {
                tier: 'Enterprise (Planned)',
                price: 'TBD',
                period: 'Future Commercial Release',
                features: [
                  'Unlimited team workspaces',
                  'Commercial license & SLA',
                  'SSO (Okta, Microsoft AD) ready',
                  'Custom On-Premise deployment options'
                ],
                cta: 'In Development',
                highlight: false,
                disabled: true
              }
            ].map((plan, idx) => (
              <div 
                key={idx}
                className={`relative flex flex-col p-8 rounded-[3rem] border transition-all duration-300 ${plan.highlight ? 'bg-gray-950 text-white border-gray-900 shadow-2xl z-10' : plan.disabled ? 'bg-gray-50 text-gray-400 border-gray-200 grayscale opacity-70' : 'bg-white text-gray-900 border-gray-200 hover:border-green-300 hover:shadow-xl'}`}
              >
                
                {plan.disabled && (
                  <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-gray-200 text-gray-500 border-gray-300 border text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-widest">
                    Coming Soon
                  </div>
                )}
                
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-black">{plan.tier}</h3>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black">{plan.price}</span>
                  </div>
                  <p className={`text-xs md:text-sm font-medium mt-1 ${plan.highlight ? 'text-gray-400' : 'text-gray-550'}`}>{plan.period}</p>
                </div>

                <ul className="space-y-4 mb-10 flex-grow">
                  {plan.features.map((f, i) => {
                    const isAllBasic = f.toLowerCase().includes('all pilot basic');
                    return (
                      <li 
                        key={i} 
                        className={`flex items-start gap-3 text-sm ${
                          isAllBasic 
                            ? 'text-green-400 font-extrabold tracking-wide uppercase text-xs border border-green-500/30 bg-green-500/5 px-3 py-2 rounded-xl shadow-sm shadow-green-500/5' 
                            : 'font-bold'
                        }`}
                      >
                        <Check className={`w-5 h-5 shrink-0 ${isAllBasic ? 'text-green-400' : plan.highlight ? 'text-green-400' : plan.disabled ? 'text-gray-400' : 'text-green-600'}`} /> {f}
                      </li>
                    );
                  })}
                  {plan.notFeatures?.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm font-bold opacity-40">
                      <X className="w-5 h-5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>

                <PricingCTA cta={plan.cta} highlight={plan.highlight} disabled={plan.disabled} />
              </div>
            ))}
          </div>

          <div className="mt-12 text-center text-xs md:text-sm text-gray-550 max-w-2xl mx-auto leading-relaxed border border-gray-100 bg-gray-50/50 p-5 rounded-3xl shadow-sm">
            <span className="font-extrabold text-gray-800 uppercase tracking-wider block mb-1">* BYOK (Bring Your Own Key)</span>
            Use your own Google Gemini API key to run unlimited transformations without any platform limits. Your API key remains securely stored locally in your browser and is never sent or saved on our servers, ensuring absolute privacy and data sovereignty.
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="py-24 md:py-32 bg-gray-950 text-white text-center">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-4xl md:text-6xl font-black mb-8 tracking-tighter">Ready to join the community?</h2>
          <p className="text-lg md:text-xl text-gray-400 mb-12 font-light max-w-2xl mx-auto">Help us shape the future of Core Transformations. Join our pilot program for free.</p>
          <FooterCTA />
          
          <div className="mt-24 pt-12 border-t border-gray-800 text-sm text-gray-500 font-light">
            <p>&copy; 2026 Clean-Core.io. All rights reserved.</p>
            <p className="mt-2 text-xs text-gray-600 font-mono font-bold uppercase tracking-wider">
              System Version: {APP_VERSION} • {APP_RELEASE_DATE}
            </p>
            <p className="mt-4 flex flex-wrap justify-center gap-4">
              <Link href="?legal=impressum" className="hover:text-white transition-colors cursor-pointer">Legal Notice</Link>
              <span className="text-gray-800">|</span>
              <Link href="?legal=privacy" className="hover:text-white transition-colors cursor-pointer">Privacy Policy</Link>
            </p>
            <div className="mt-12 text-[10px] text-gray-550 max-w-2xl mx-auto leading-relaxed border border-gray-900 bg-gray-950/50 p-6 rounded-2xl text-left space-y-3">
              <span className="font-extrabold text-gray-400 uppercase tracking-widest block border-b border-gray-900 pb-1.5">Legal Disclaimer & Pilot Status</span>
              <p>
                <strong>Non-Commercial Developer Sandbox:</strong> Clean-Core.io is operated exclusively as a non-commercial, open-source research and prototyping platform under administrative developer oversight (Felix Frenzel). No commercial licensing, subscriptions, or paid services are offered.
              </p>
              <p>
                <strong>AI Transformations & "As-Is" Provisioning:</strong> All solution designs, compliance scores, modular code transformations, documentation blueprints, and sandboxed test suites are dynamically generated utilizing third-party generative AI models (Google Gemini API). This platform and all compiled artifacts are provided strictly on an <em>"AS IS"</em> and <em>"AS AVAILABLE"</em> basis, without any warranties or guarantees of any kind, express or implied, including but not limited to the correctness, compilation, performance, security, or commercial compliance of the generated results. Developers must independently review, test, and validate all outputs before any commercial or production usage.
              </p>
              <p>
                <strong>Limitation of Liability:</strong> In no event shall the administrator, contributors, or developers be held liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, loss of data, system crashes, integration failures, or business interruption) however caused and on any theory of liability, whether in contract, strict liability, or tort arising in any way out of the use of this software, even if advised of the possibility of such damage.
              </p>
              <p>
                <strong>Data Privacy & GDPR:</strong> This platform is deployed on secure European cloud nodes in the Belgium (europe-west1) region. Secure stateless proxy layers ensure that uploaded legacy codes are never saved, persisted, or utilized by Google for LLM model training. All users retain the absolute right to immediate, recursive erasure (Art. 17 GDPR) via the settings dashboard.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals & Overlays Controller */}
      <Suspense fallback={null}>
        <LandingModals />
      </Suspense>
    </div>
  );
}
