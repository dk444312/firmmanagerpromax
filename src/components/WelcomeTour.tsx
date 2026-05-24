import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, ChevronLeft, Sparkles, FileText, MessageSquare, Mail } from 'lucide-react';

const steps = [
  {
    id: 'intro',
    title: 'Major Update Available',
    description: 'We have made huge improvements to FirmManager. Let us show you what is new!',
    icon: Sparkles,
    target: null,
  },
  {
    id: 'atlas',
    title: 'Atlas AI',
    description: 'Your new AI legal assistant. Research case law, summarize documents, and ask for drafting advice directly within the app.',
    icon: Sparkles,
    target: 'nav-atlas',
  },
  {
    id: 'drafting',
    title: 'Drafting Documents',
    description: 'Create and organize your pleadings, contracts, and letters easily with the new Drafting tool.',
    icon: FileText,
    target: 'nav-drafting',
  },
  {
    id: 'messages',
    title: 'Team Messages',
    description: 'Collaborate with your firm members via direct channels and real-time chat.',
    icon: MessageSquare,
    target: 'nav-messages',
  },
  {
    id: 'emails',
    title: 'Sent Emails',
    description: 'Keep track of all out-bound client communications via the Sent Emails log.',
    icon: Mail,
    target: 'nav-emails',
  }
];

export default function WelcomeTour({ onComplete }: { onComplete: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const step = steps[currentStep];

  useEffect(() => {
    if (step.target) {
      const el = document.getElementById(step.target);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
        // Auto scroll into view if needed
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setTargetRect(null);
    }
    
    const handleResize = () => {
      if (step.target) {
        const el = document.getElementById(step.target);
        if (el) setTargetRect(el.getBoundingClientRect());
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentStep, step.target]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(curr => curr + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(curr => curr - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
      {/* Dimmed Background */}
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 pointer-events-auto"
        />
      </AnimatePresence>
      
      {/* Highlighting the active element via a cut-out or border */}
      <AnimatePresence>
        {targetRect && (
          <motion.div
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1, top: targetRect.top - 8, left: targetRect.left - 8, width: targetRect.width + 16, height: targetRect.height + 16 }}
            transition={{ type: 'spring', damping: 20 }}
            className="absolute border-2 border-emerald-500 rounded-lg pointer-events-none z-[101] shadow-[0_0_20px_rgba(16,185,129,0.3)] bg-emerald-500/10"
          />
        )}
      </AnimatePresence>
      
      {/* Tour Modal positioned dynamically or centered */}
      <AnimatePresence mode="wait">
        <motion.div
           key={currentStep}
           initial={{ opacity: 0, scale: 0.9, y: 10 }}
           animate={{ 
             opacity: 1, 
             scale: 1,
             y: 0,
             left: targetRect ? targetRect.right + 24 : 'auto',
             top: targetRect ? targetRect.top : 'auto',
           }}
           transition={{ type: 'spring', damping: 25, stiffness: 200 }}
           className={`absolute w-80 bg-[#1e1e1e] border border-white/10 shadow-2xl rounded-2xl pointer-events-auto z-[102] overflow-hidden ${!targetRect ? 'relative left-auto right-auto top-auto bottom-auto' : ''}`}
        >
          {targetRect && (
            <div className="absolute left-[-12px] top-6 w-0 h-0 border-y-8 border-y-transparent border-r-[12px] border-r-emerald-500/50" />
          )}

          <div className="p-6 relative">
            <button 
              onClick={onComplete}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                <step.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white tracking-wide">{step.title}</h3>
            </div>
            
            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              {step.description}
            </p>
            
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {steps.map((s, i) => (
                  <div key={s.id} className={`w-2 h-2 rounded-full transition-colors ${i === currentStep ? 'bg-emerald-500' : 'bg-white/20'}`} />
                ))}
              </div>
              
              <div className="flex items-center gap-2">
                 {currentStep === 0 && (
                   <button 
                     onClick={onComplete}
                     className="text-xs font-medium text-slate-400 hover:text-white mr-2 px-2"
                   >
                     Skip Tour
                   </button>
                 )}
                 {currentStep > 0 && (
                   <button 
                     onClick={handlePrev}
                     className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors"
                   >
                     <ChevronLeft className="w-4 h-4" />
                   </button>
                 )}
                 <button 
                   onClick={handleNext}
                   className="flex items-center gap-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold rounded-lg transition-colors"
                 >
                   {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
                   {currentStep < steps.length - 1 && <ChevronRight className="w-4 h-4" />}
                 </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
