
import React, { createContext, useContext, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

export const TooltipContext = createContext(true);

export const TooltipProvider: React.FC<{ enabled: boolean; children: React.ReactNode }> = ({ enabled, children }) => (
  <TooltipContext.Provider value={enabled}>{children}</TooltipContext.Provider>
);

export const formatShortcut = (def?: { key: string; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean }) => {
  if (!def) return null;
  const parts = [];
  if (def.ctrlKey) parts.push('Ctrl');
  if (def.metaKey) parts.push('Cmd');
  if (def.shiftKey) parts.push('Shift');
  if (def.altKey) parts.push('Alt');
  parts.push(def.key.toUpperCase());
  return parts.join('+');
};

interface InfoTooltipProps {
  label?: string;
  description?: string;
  shortcut?: string | { key: string; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean };
  children?: React.ReactNode;
  className?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ label, description, shortcut, children, className = "", placement: preferredPlacement = 'auto' }) => {
  const enabled = useContext(TooltipContext);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'top', shift: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const shortcutText = typeof shortcut === 'object' ? formatShortcut(shortcut) : shortcut;

  const handleMouseEnter = () => {
    if (enabled && triggerRef.current && (description || shortcutText || label)) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      const spaceAbove = rect.top;
      const spaceBelow = viewportHeight - rect.bottom;
      
      let finalPlacement = preferredPlacement;
      if (finalPlacement === 'auto') {
          finalPlacement = spaceAbove < 150 ? 'bottom' : 'top';
      }

      let left = rect.left + rect.width / 2;
      let top = 0;
      let shift = 0;
      const tooltipWidth = 200; 
      const margin = 10;

      if (left - tooltipWidth / 2 < margin) {
          shift = (margin - (left - tooltipWidth / 2));
      } else if (left + tooltipWidth / 2 > viewportWidth - margin) {
          shift = ((viewportWidth - margin) - (left + tooltipWidth / 2));
      }

      if (finalPlacement === 'top') {
          top = rect.top - 10;
      } else if (finalPlacement === 'bottom') {
          top = rect.bottom + 10;
      } else if (finalPlacement === 'left') {
          // Simplified for horizontal
          top = rect.top;
          left = rect.left - 10;
      }

      setPosition({
        top,
        left,
        placement: finalPlacement as string,
        shift
      });
      setIsVisible(true);
    }
  };

  return (
    <>
      <div 
        ref={triggerRef}
        className={`group relative flex items-center justify-center ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children || (
          <span className="text-[10px] font-bold uppercase text-slate-500 truncate mr-2 border-b border-dotted border-slate-600 group-hover:text-sky-400 group-hover:border-sky-400 transition-colors cursor-help">
            {label}
          </span>
        )}
      </div>
      {isVisible && enabled && (description || shortcutText) && createPortal(
        <div 
          className="fixed z-[9999] pointer-events-none"
          style={{ 
             top: position.top, 
             left: position.left,
             transform: `translateX(calc(-50% + ${position.shift}px)) ${position.placement === 'top' ? 'translateY(-100%)' : 'translateY(0)'}`
          }}
        >
          <div className="bg-slate-800 text-white text-[10px] font-medium p-3 rounded-lg shadow-2xl border border-white/10 backdrop-blur-md text-center w-auto max-w-[200px] min-w-[120px] animate-in fade-in zoom-in-95 duration-150 relative">
            {description && <p className="leading-relaxed mb-1">{description}</p>}
            {shortcutText && (
                <div className="mt-1 pt-1 border-t border-white/10 flex justify-center">
                    <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] font-mono text-sky-300 tracking-wider">{shortcutText}</span>
                </div>
            )}
            <div 
                className={`absolute w-0 h-0 border-4 border-transparent ${
                  position.placement === 'top' ? 'top-full border-t-slate-800' : 'bottom-full border-b-slate-800'
                }`}
                style={{
                    left: `calc(50% - ${position.shift}px)`,
                    transform: 'translateX(-50%)'
                }}
            ></div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
