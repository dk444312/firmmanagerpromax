import React from 'react';
import { motion } from 'motion/react';
import { Lock, Sparkles } from 'lucide-react';

interface ComingSoonOverlayProps {
  title: string;
  description?: string;
}

export default function ComingSoonOverlay({ title, description }: ComingSoonOverlayProps) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-[100] flex items-center justify-center bg-[#0d0d0e]/80 backdrop-blur-md"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: "spring", damping: 25 }}
        className="max-w-md w-full p-8 bg-[#121213] border border-white/10 rounded-3xl shadow-2xl text-center space-y-6"
      >
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full animate-pulse" />
          <div className="relative w-full h-full bg-[#1c1c1d] border border-white/5 rounded-2xl flex items-center justify-center">
            <Lock className="w-8 h-8 text-emerald-500" />
          </div>
          <motion.div 
            animate={{ 
              rotate: [0, 15, -15, 0],
              scale: [1, 1.1, 1]
            }}
            transition={{ 
              duration: 4, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute -top-2 -right-2 p-2 bg-amber-500 rounded-lg shadow-lg"
          >
            <Sparkles className="w-4 h-4 text-black" />
          </motion.div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {title}
          </h2>
          <p className="text-slate-400 text-sm font-light leading-relaxed">
            {description || "Enhancing your litigation workflow with advanced AI-powered tools. This feature is currently in final synchronization."}
          </p>
        </div>

        <div className="pt-4">
          <div className="inline-flex items-center px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
              These features are coming soon
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
