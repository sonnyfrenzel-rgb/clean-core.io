'use client';

import { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface JiraIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  solutionDesign: string;
  projectId: string;
}

export default function JiraIntegrationModal({ isOpen, onClose, solutionDesign, projectId }: JiraIntegrationModalProps) {
  const [step, setStep] = useState<'connect' | 'connecting' | 'configure' | 'syncing' | 'success'>('connect');
  const [jiraProject, setJiraProject] = useState('TRANSFORM-1');
  
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => setStep('connect'), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin is from AI Studio preview or localhost
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'JIRA_AUTH_SUCCESS') {
        setStep('configure');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnect = async () => {
    setStep('connecting');
    try {
      const response = await fetch('/api/auth/jira/url');
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();

      const authWindow = window.open(
        url,
        'oauth_popup',
        'width=600,height=700'
      );

      if (!authWindow) {
        alert('Please allow popups for this site to connect your Jira account.');
        setStep('connect');
      }
    } catch (error) {
      console.error('OAuth error:', error);
      setStep('connect');
    }
  };

  const handleSync = () => {
    setStep('syncing');
    // Simulate Jira API Sync Delay
    setTimeout(() => {
      setStep('success');
    }, 2500);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="bg-[#0052CC] p-1.5 rounded-lg">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold tracking-tight text-gray-900 text-lg">Jira Enterprise Sync</h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
              <X size={20} />
            </button>
          </div>

          <div className="p-8">
            {step === 'connect' && (
              <div className="text-center">
                <Layers className="w-16 h-16 text-[#0052CC] mx-auto mb-4 opacity-80" />
                <h4 className="text-xl font-bold text-gray-900 mb-2">Connect to Jira Cloud</h4>
                <p className="text-gray-500 mb-8 text-sm">
                  We need your permission to create Epics and User Stories in your Jira instance automatically.
                </p>
                <button
                  onClick={handleConnect}
                  className="w-full bg-[#0052CC] hover:bg-[#0047b3] text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md active:scale-[0.98]"
                >
                  Authorize via Atlassian
                </button>
              </div>
            )}

            {step === 'connecting' && (
              <div className="text-center py-10 text-gray-400">
                <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-4 text-[#0052CC]" />
                <p className="font-medium text-gray-600">Waiting for authorization...</p>
                <p className="text-xs mt-2">Please complete the flow in the popup window.</p>
              </div>
            )}

            {step === 'configure' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Select Target Project</label>
                  <select 
                    value={jiraProject}
                    onChange={(e) => setJiraProject(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-[#0052CC] focus:border-[#0052CC] block p-3"
                  >
                    <option value="TRANSFORM-1">S/4HANA Core Team (S4CT)</option>
                    <option value="BTP-03">BTP Innovation Hub (BTP)</option>
                    <option value="LEGACY">Legacy Decommissioning (LEG)</option>
                  </select>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3 text-blue-900">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm">
                    <strong>Sync profile active:</strong> Will create 1 Master Epic, ~12 User Stories, and attach the Solution Design document automatically.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSync}
                    className="w-full bg-gray-950 hover:bg-black text-white font-bold py-3 px-4 rounded-xl transition-all shadow-xl active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} /> Push to Jira
                  </button>
                </div>
              </div>
            )}

            {step === 'syncing' && (
              <div className="text-center py-10">
                <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-4 text-purple-600" />
                <p className="font-bold text-gray-900">Synchronizing Work Packages...</p>
                <p className="text-sm text-gray-500 mt-2">Writing to {jiraProject}</p>
              </div>
            )}

            {step === 'success' && (
              <div className="text-center py-6 text-green-600">
                <CheckCircle2 className="w-16 h-16 mx-auto mb-4" />
                <h4 className="text-xl font-bold text-gray-900 mb-2">Sync Complete!</h4>
                <p className="text-gray-500 mb-8 text-sm text-balance">
                  Your Solution Design has been transformed into detailed Epics and User stories in Jira.
                </p>
                <button
                  onClick={onClose}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2.5 px-6 rounded-xl transition-all"
                >
                  Close Window
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
