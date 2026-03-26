
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
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {children || (
          <span 
            className="text-[10px] font-bold uppercase text-slate-500 truncate mr-2 border-b border-dotted border-slate-600 group-hover:text-sky-400 group-hover:border-sky-400 transition-colors cursor-help"
            style={{
              fontSize: '10px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              color: '#64748b',
              marginRight: '8px',
              borderBottom: '1px dotted #475569',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              cursor: 'help'
            }}
          >
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
          <div 
            className="bg-slate-800 text-white text-[10px] font-medium p-3 rounded-lg shadow-2xl border border-white/10 backdrop-blur-md text-center w-auto max-w-[200px] min-w-[120px] animate-in fade-in zoom-in-95 duration-150 relative"
            style={{
              backgroundColor: '#1e293b',
              color: 'white',
              fontSize: '10px',
              fontWeight: '500',
              padding: '12px',
              borderRadius: '8px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
              textAlign: 'center',
              width: 'auto',
              maxWidth: '200px',
              minWidth: '120px',
              position: 'relative',
              animation: 'fadeIn 0.15s ease-out'
            }}
          >
            {description && (
              <p 
                className="leading-relaxed mb-1"
                style={{
                  lineHeight: '1.5',
                  marginBottom: '4px',
                  margin: '0 0 4px 0'
                }}
              >
                {description}
              </p>
            )}
            {shortcutText && (
                <div 
                  className="mt-1 pt-1 border-t border-white/10 flex justify-center"
                  style={{
                    marginTop: '4px',
                    paddingTop: '4px',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    justifyContent: 'center'
                  }}
                >
                    <span 
                      className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] font-mono text-sky-300 tracking-wider"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        paddingLeft: '6px',
                        paddingRight: '6px',
                        paddingTop: '2px',
                        paddingBottom: '2px',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontFamily: 'monospace',
                        color: '#7dd3fc',
                        letterSpacing: '0.05em'
                      }}
                    >
                      {shortcutText}
                    </span>
                </div>
            )}
            <div 
                className={`absolute w-0 h-0 border-4 border-transparent ${
                  position.placement === 'top' ? 'top-full border-t-slate-800' : 'bottom-full border-b-slate-800'
                }`}
                style={{
                    position: 'absolute',
                    width: 0,
                    height: 0,
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderTop: position.placement === 'top' ? '4px solid #1e293b' : '4px solid transparent',
                    borderBottom: position.placement === 'bottom' ? '4px solid #1e293b' : '4px solid transparent',
                    left: `calc(50% - ${position.shift}px)`,
                    transform: 'translateX(-50%)',
                    ...(position.placement === 'top' ? { top: '100%' } : { bottom: '100%' })
                }}
            ></div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
