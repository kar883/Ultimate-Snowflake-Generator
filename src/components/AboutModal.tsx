import React, { useState } from 'react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-2xl w-[600px] max-w-[96vw] max-h-[88vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-5 pt-5 pb-3 border-b border-white/5 shrink-0">
          <h2 className="text-base font-black text-white uppercase tracking-tight">About Ultimate Snowflake Generator</h2>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 min-h-0">
          {/* App Info */}
          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5">
            <h3 className="text-sm font-black text-white mb-3">Ultimate Snowflake Generator</h3>
            <p className="text-[11px] text-slate-300 mb-4 leading-relaxed">
              Version 1.0.4 • Created by Kyle Russell
            </p>
            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
              A beautiful 3D snowflake design generator for art and 3D printing. 
              Create stunning snowflake patterns with custom text, shapes, and fractal designs.
            </p>
            
            {/* GitHub Link */}
            <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/10">
              <svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 4.142 9.5 9.5 3.5 0 1.993 2.143 4 4.5 4-5.299 0-3.965-1.826-7.5-1.826-3.535 0-5.299 1.826-7.5 1.826zm5.5 0c-1.993 0-3.5 1.826-3.5 4s1.507 4 3.5 4 1.993 0 3.5-1.826 3.5-4z"/>
              </svg>
              <div>
                <a 
                  href="https://github.com/kar883/Ultimate-Snowflake-Generator" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[11px] font-black text-sky-400 hover:text-sky-300 transition-colors underline"
                >
                  View on GitHub
                </a>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5">
            <h4 className="text-xs font-black text-white mb-3">Key Features</h4>
            <ul className="text-[11px] text-slate-300 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-sky-400">•</span>
                <span>Custom text and font support with real-time preview</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-400">•</span>
                <span>Abstract shapes and fractal generators</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-400">•</span>
                <span>3D STL export for printing</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-400">•</span>
                <span>AI-powered randomization</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-400">•</span>
                <span>Cross-platform desktop app</span>
              </li>
            </ul>
          </div>

          {/* License */}
          <div className="p-4 bg-slate-800/40 rounded-xl border border-white/5">
            <h4 className="text-xs font-black text-white mb-3">License</h4>
            <p className="text-[11px] text-slate-300">
              MIT License • Free to use, modify, and distribute
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
