'use client';

import { X, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function UpgradeModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden border border-gray-100 p-8 text-center"
        >
          <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
             <X size={20} />
          </button>
          
          <Crown className="w-16 h-16 text-purple-600 mx-auto mb-4" />
          <h3 className="text-xl font-black text-gray-950 mb-2">Jira Integration (Planned)</h3>
          <p className="text-gray-500 mb-8 text-sm">
            Direct Jira Cloud sync — auto-generating Epics and user stories from your Solution Design — is on the roadmap and not enabled yet. For now, export your design and import it into Jira manually. Everything on Clean-Core.io is free.
          </p>

          <button
            onClick={onClose}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md active:scale-95"
          >
            Got it
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
