'use client';

import { useState, useEffect } from 'react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getAuth } from '@/lib/firebase';
import { ShieldCheck, ArrowRight, CheckCircle2, MessageSquare, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LegalOverlay from '@/app/components/LegalOverlay';

export default function UserOnboarding() {
  const { profile, loading, createProfile } = useUserProfile();
  const auth = getAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [motivation, setMotivation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedGDPR, setAgreedGDPR] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDatenschutz, setShowDatenschutz] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);

  // Return early during SSR if Firebase Auth is bypassed on the server
  if (!auth) return null;

  useEffect(() => {
    if (auth.currentUser?.displayName && !firstName && !lastName) {
      const displayName = auth.currentUser.displayName.trim();
      const parts = displayName.split(/\s+/);
      if (parts.length > 0) {
        setFirstName(parts[0]);
        if (parts.length > 1) {
          setLastName(parts.slice(1).join(' '));
        }
      }
    }
  }, [auth.currentUser, firstName, lastName]);

  if (loading) return null;
  if (profile || !auth.currentUser) return null;

  if (showCancelConfirmation) {
    return (
      <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-red-100 p-6 md:p-8"
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 shadow-inner text-red-600">
              <ShieldCheck className="w-8 h-8 rotate-180" />
            </div>
            <h2 className="text-2xl font-black mb-3 text-gray-900 tracking-tight uppercase">Are you sure you want to cancel?</h2>
            <p className="text-gray-500 font-medium text-sm mb-6 leading-relaxed">
              If you leave now, you will lose access to our advanced Generative AI modernization tools and fail to modernise your ERP core.
            </p>
            
            <div className="w-full bg-slate-50 border border-slate-150 rounded-2xl p-5 text-left mb-8 space-y-3.5">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">What you will miss:</h4>
              <ul className="space-y-2.5 text-xs text-gray-700 font-medium">
                <li className="flex items-start gap-2.5">
                  <span className="text-green-600 font-bold">✓</span>
                  <div>
                    <strong className="text-gray-900">5 Free transformations</strong>: Modernize monolithic legacy ABAP logic into modular side-by-side Node.js applications.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-green-600 font-bold">✓</span>
                  <div>
                    <strong className="text-gray-900">Process Blueprinting</strong>: Map business domains to Levels 1-4 with professional BPMN 2.0 XML exports.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-green-600 font-bold">✓</span>
                  <div>
                    <strong className="text-gray-900">Stakeholder Presentations</strong>: Generate management-ready executive briefs with strategic ROI metrics.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-green-600 font-bold">✓</span>
                  <div>
                    <strong className="text-gray-900">Developer Community Forum</strong>: Share modernization insights and edge cases with SAP Clean Core practitioners.
                  </div>
                </li>
              </ul>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button 
                onClick={() => setShowCancelConfirmation(false)}
                className="flex-1 bg-gradient-to-br from-[#006b2c] to-[#00873a] text-white py-3.5 rounded-xl font-black text-sm uppercase tracking-wider transition-all shadow-md hover:shadow-lg active:scale-95"
              >
                Stay & Claim Access
              </button>
              <button 
                onClick={async () => {
                  try {
                    await auth.signOut();
                    window.location.reload();
                  } catch (e) {
                    console.error("Sign-out error:", e);
                  }
                }}
                className="flex-1 bg-red-55 text-red-600 border border-red-150 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider hover:bg-red-100 transition-all active:scale-95"
              >
                Cancel & Sign Out
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedGDPR || !agreedTerms) return;
    setIsSubmitting(true);
    try {
      const user = auth.currentUser!;
      await createProfile(user, firstName, lastName, motivation);
      
      // Dispatch the approval request email in the background
      try {
        const token = await auth.currentUser?.getIdToken();
        await fetch('/api/request-pilot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            uid: user.uid,
            email: user.email || '',
            name: `${firstName} ${lastName}`,
            motivation: motivation,
          }),
        });
      } catch (emailErr) {
        console.error('Failed to trigger pilot registration approval email:', emailErr);
      }

      setShowSuccess(true);
    } catch (error) {
      console.error('Error creating profile:', error);
      setIsSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-md p-8 text-center border border-gray-100"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-black mb-3">Registration pending</h2>
          <p className="text-gray-600 font-medium mb-6">
            Your request for the Clean-Core.io Pilot has been submitted. Because we are in a closed beta phase, access needs to be manually approved.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm mb-6 text-left">
            <p className="font-bold text-gray-900 mb-2">Next Step:</p>
            <p className="text-gray-600">Our team will review your request. To speed up the process, you can send an email to <a href="mailto:info@clean-core.io" className="text-green-600 font-bold hover:underline">info@clean-core.io</a> from {auth.currentUser.email}.</p>
          </div>
          <button onClick={() => window.location.reload()} className="w-full bg-gray-900 text-white rounded-xl py-3 font-bold">Refresh Page</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden max-h-[95vh] overflow-y-auto"
      >
        <div className="bg-green-600 p-5 md:p-8 text-white relative">
          <button 
            type="button" 
            onClick={() => setShowCancelConfirmation(true)}
            className="absolute top-5 right-5 md:top-6 md:right-6 p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            title="Cancel Application"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-2 md:mb-4">
            <div className="bg-white/20 p-1.5 md:p-2 rounded-lg md:rounded-xl">
              <ShieldCheck className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <h2 className="text-xl md:text-3xl font-black tracking-tight uppercase">Join the Pilot</h2>
          </div>
          <p className="text-green-50 text-xs md:text-sm font-medium opacity-90 leading-relaxed">
            Apply for our non-commercial Pilot program. Access is currently limited.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 md:p-8 space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="block text-[10px] md:text-xs font-black text-gray-400 mb-1.5 md:mb-2 uppercase tracking-widest">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder="John"
                className="w-full px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl border border-gray-200 focus:ring-2 focus:ring-green-600 focus:border-green-600 outline-none transition-all font-medium text-gray-900 text-sm md:text-base"
              />
            </div>
            <div>
              <label className="block text-[10px] md:text-xs font-black text-gray-400 mb-1.5 md:mb-2 uppercase tracking-widest">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                placeholder="Doe"
                className="w-full px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl border border-gray-200 focus:ring-2 focus:ring-green-600 focus:border-green-600 outline-none transition-all font-medium text-gray-900 text-sm md:text-base"
              />
            </div>
          </div>
          
          <div>
            <label className="flex items-center gap-2 text-[10px] md:text-xs font-black text-gray-400 mb-1.5 md:mb-2 uppercase tracking-widest"><MessageSquare size={14}/> Why do you want to join? (Optional)</label>
            <textarea
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="Tell us a bit about your use-case..."
              rows={2}
              className="w-full px-4 py-2.5 rounded-lg md:rounded-xl border border-gray-200 focus:ring-2 focus:ring-green-600 focus:border-green-600 outline-none transition-all font-medium text-gray-900 text-sm resize-none"
            />
          </div>

          <div className="space-y-3 pt-3 md:pt-4 border-t border-gray-100">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5 shrink-0">
                <input 
                  type="checkbox" 
                  checked={agreedGDPR} 
                  onChange={(e) => setAgreedGDPR(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 md:w-5 md:h-5 border-2 rounded transition-all flex items-center justify-center ${agreedGDPR ? 'bg-green-600 border-green-600' : 'border-gray-300 group-hover:border-green-600'}`}>
                  {agreedGDPR && <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-white" />}
                </div>
              </div>
              <span className="text-[11px] md:text-sm text-gray-600 leading-relaxed font-medium">
                I agree to the{' '}
                <button 
                  type="button" 
                  onClick={(e) => { e.preventDefault(); setShowDatenschutz(true); }}
                  className="text-gray-950 font-bold underline hover:text-green-600 transition-colors"
                >
                  GDPR provisions and Privacy Policy
                </button>{' '}
                and understand that this is a non-commercial pilot preview.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5 shrink-0">
                <input 
                  type="checkbox" 
                  checked={agreedTerms} 
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 md:w-5 md:h-5 border-2 rounded transition-all flex items-center justify-center ${agreedTerms ? 'bg-green-600 border-green-600' : 'border-gray-300 group-hover:border-green-600'}`}>
                  {agreedTerms && <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-white" />}
                </div>
              </div>
              <span className="text-[11px] md:text-sm text-gray-600 leading-relaxed font-medium">
                I accept the{' '}
                <button 
                  type="button" 
                  onClick={(e) => { e.preventDefault(); setShowTerms(true); }}
                  className="text-gray-950 font-bold underline hover:text-green-600 transition-colors"
                >
                  Terms of Service and Guidelines
                </button>
                .
              </span>
            </label>
          </div>

          <div className="bg-gray-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-100">
            <h4 className="font-black text-gray-900 mb-1 text-[10px] md:text-sm uppercase tracking-wider">Pilot Plan Details</h4>
            <ul className="text-[10px] md:text-xs text-gray-600 space-y-1">
              <li className="flex items-center gap-2">• Up to 5 App Transformations for testing</li>
              <li className="flex items-center gap-2">• Community feedback & collaboration</li>
              <li className="flex items-center gap-2 font-bold">• Manual approval by admin required</li>
            </ul>
          </div>

          {/* System Disclaimer & Pilot Terms */}
          <div className="bg-amber-50/50 p-4 rounded-xl md:rounded-2xl border border-amber-200/60 text-[10px] md:text-xs text-amber-900 space-y-2">
            <h4 className="font-black uppercase tracking-wider flex items-center gap-1.5 text-amber-950 text-xs md:text-sm">
              ⚡ System Disclaimer & Pilot Terms
            </h4>
            <p className="leading-relaxed font-medium">
              This application is a <strong>non-commercial pilot research project</strong>. All transformation analyses and code migrations are powered by <strong>Generative AI models</strong> and may contain inaccuracies, hallucinations, or syntactical errors.
            </p>
            <p className="leading-relaxed font-medium">
              We assume <strong>no warranty, guarantees, or liability</strong> for the performance, reliability, or execution safety of generated codes. Before deploying any output, it must be thoroughly inspected and verified by qualified software architects.
            </p>
            <p className="leading-relaxed font-bold text-amber-950">
              By requesting access, you acknowledge these conditions and agree to our{' '}
              <button 
                type="button" 
                onClick={(e) => { e.preventDefault(); setShowDatenschutz(true); }}
                className="underline hover:text-green-700 font-black"
              >
                Privacy Policy (Datenschutz)
              </button>{' '}
              and standard terms.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !agreedGDPR || !agreedTerms || !firstName || !lastName}
              className="flex-[2] flex items-center justify-center gap-2 bg-gray-950 hover:bg-gray-900 text-white py-3.5 md:py-4 rounded-xl md:rounded-2xl font-black text-sm md:text-base transition-all shadow-lg hover:shadow-xl disabled:bg-gray-300 disabled:shadow-none"
            >
              {isSubmitting ? 'Submitting...' : 'Request Pilot Access'} <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <button
              type="button"
              onClick={() => setShowCancelConfirmation(true)}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3.5 md:py-4 rounded-xl md:rounded-2xl font-bold text-sm md:text-base transition-all border border-gray-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </motion.div>

      {/* GDPR privacy policy overlay */}
      <LegalOverlay isOpen={showDatenschutz} onClose={() => setShowDatenschutz(false)} title="Privacy Policy (GDPR Compliance)">
        <div className="space-y-6 text-slate-800">
          <div>
            <h3 className="text-lg font-bold mb-2">1. Privacy at a Glance</h3>
            <p className="text-sm leading-relaxed mb-2">
              Protecting your personal data is our top priority. Below, we inform you about what data we collect, process, and store during your visit and use of our Pilot program.
            </p>
            <p className="text-xs text-slate-500">
              <strong>Controller:</strong> Felix Frenzel, Hellerstraße 9, 96047 Bamberg, Germany, E-Mail: info@clean-core.io.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">2. Data Collection & Processing Purposes</h3>
            <p className="text-sm leading-relaxed mb-3">
              We process personal data of our users only as far as necessary to provide a functional pilot platform as well as our contents and services.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600">
              <li>
                <strong>Google Authentication (Firebase Auth):</strong> To sign in, we use Google Sign-In. This securely reads your name, email address, and profile picture from your Google account to authenticate your user session and establish access privileges.
              </li>
              <li>
                <strong>Firestore User Profiles:</strong> We store metadata about your platform usage (e.g., number of performed code transformations, system limits, as well as your first and last name) in our secure database.
              </li>
              <li>
                <strong>Bring Your Own Key (BYOK):</strong> If you configure your own Google Gemini API key in the settings, this key is encrypted and stored in our secure Firestore instance. It is used exclusively to forward your transformation requests directly via a secure backend proxy to the Gemini API, never exposing your key to the browser.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">3. Processing of Source Code & Project Assets</h3>
            <p className="text-sm leading-relaxed">
              The ABAP source files you upload and the generated modernization artifacts (such as solution designs, TypeScript code, and test cases) are stored in our secure Google Firebase cloud environment in Europe.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              <strong>Important Security Notice:</strong> We do not sell, rent, or use your uploaded source code for commercial purposes. For AI-driven modernization, source code is transmitted via secure, authenticated channels to the <strong>Google Gemini API</strong>. Our integration utilizes stateless API requests, meaning that your uploaded codes and projects are never stored or used to train Google's foundational AI models.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">4. Cloud Node Hosting & Third-Party Services</h3>
            <p className="text-sm leading-relaxed">
              To provide this service, we rely on the following trusted cloud services:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs text-slate-600">
              <li>
                <strong>Google Cloud Platform & Firebase:</strong> Hosted on secure European servers in the <strong>Belgium (europe-west1)</strong> region for low-latency, fully GDPR-compliant authentication and database operations.
              </li>
              <li>
                <strong>Google Gemini API:</strong> Generative AI models used exclusively for code transformation, utilizing secure stateless proxy layers.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">5. Your Rights Under GDPR (including Art. 17 Deletion)</h3>
            <p className="text-sm leading-relaxed mb-2">
              Since our platform is hosted in compliance with EU regulations, you have all rights under the General Data Protection Regulation (GDPR):
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
              <li>Right of Access (Art. 15 GDPR)</li>
              <li>Right to Rectification (Art. 16 GDPR)</li>
              <li>Right to Erasure / "Right to be Forgotten" (Art. 17 GDPR)</li>
              <li>Right to Restriction of Processing (Art. 18 GDPR)</li>
              <li>Right to Data Portability (Art. 20 GDPR)</li>
              <li>Right to Withdraw Consent (Art. 7 Abs. 3 GDPR)</li>
            </ul>
            <p className="text-xs text-slate-500 mt-2">
              To exercise these rights, particularly to cascadingly erase all your data immediately, you can trigger account deletion directly in your Profile Settings under the **Danger Zone**, which will permanently and instantly wipe all database and authentication entries. Alternatively, contact us at <strong>info@clean-core.io</strong>.
            </p>
          </div>
        </div>
      </LegalOverlay>

      {/* Terms of Service & Guidelines overlay */}
      <LegalOverlay isOpen={showTerms} onClose={() => setShowTerms(false)} title="Terms of Service & Guidelines">
        <div className="space-y-6 text-slate-800">
          <div>
            <h3 className="text-lg font-bold mb-2">1. Scope and Purpose</h3>
            <p className="text-sm leading-relaxed">
              This Clean-Core.io pilot program is designed solely for research and evaluation purposes in the domain of automated code modernization (ABAP to Cloud-Native Node.js). By participating, you help shape and improve this community utility.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">2. Non-Commercial Usage</h3>
            <p className="text-sm leading-relaxed text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-100 font-medium">
              During this closed pilot phase, platform access is completely free of charge and intended purely for private, educational, or research-based testing. Commercial utilization of the platform or deployment of the generated code in live production environments is prohibited without a separate commercial agreement.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">3. AI Code Generation & Liability Disclaimer</h3>
            <p className="text-sm leading-relaxed">
              Modernization analyses and source codes are synthesized automatically using Generative AI models. We assume **no warranty, guarantees, or liability** for the reliability, correctness, security, or compilation status of the generated codes.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              <strong>Architect Directive:</strong> Before applying or utilizing any generated code in staging or production environments, all files must be thoroughly inspected, validated, and approved by qualified software architects.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-2">4. Community Guidelines & Code of Conduct</h3>
            <p className="text-sm leading-relaxed mb-2">
              As a community pilot participant, you agree to adhere to constructive and respectful rules of engagement:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
              <li>Do not upload malicious software, illegal scripts, or proprietary source code that violates intellectual property rights.</li>
              <li>Maintain a respectful, collaborative, and professional tone in our community spaces.</li>
              <li>Report system hallucinations, security vulnerabilities, or compilation errors to help us continuously refine the engine.</li>
            </ul>
          </div>
        </div>
      </LegalOverlay>
    </div>
  );
}
