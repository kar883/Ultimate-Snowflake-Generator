import React from 'react';

interface ExportProgressIndicatorProps {
  progress: number;
  stage: string;
  isVisible: boolean;
  exportType: string;
  fileName?: string;
}

export const ExportProgressIndicator: React.FC<ExportProgressIndicatorProps> = ({ 
  progress, 
  stage, 
  isVisible,
  exportType,
  fileName
}) => {
  if (!isVisible) return null;

  const percentage = Math.round(progress * 100);
  const isComplete = progress >= 1.0;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999]">
      <div className="bg-slate-900/95 backdrop-blur-md rounded-2xl p-8 shadow-2xl border border-white/10 min-w-96 max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-white font-semibold text-xl">Exporting {exportType}</h3>
          {isComplete && (
            <div className="text-emerald-400 text-sm font-medium flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Complete!
            </div>
          )}
        </div>

        {/* File Name */}
        {fileName && (
          <div className="text-slate-400 text-sm mb-4 text-center">
            File: {fileName}
          </div>
        )}

        {/* Stage Information */}
        <div className="text-slate-300 text-base mb-6 min-h-8 flex items-center justify-center">
          {stage}
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Export Progress</span>
            <span className="text-white text-sm font-medium">{percentage}%</span>
          </div>
          <div className="relative">
            <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ease-out rounded-full ${
                  isComplete 
                    ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' 
                    : 'bg-purple-500 shadow-lg shadow-purple-500/30'
                }`}
                style={{ width: `${percentage}%` }}
              >
                {/* Animated shimmer effect */}
                {!isComplete && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Loading Animation */}
        {!isComplete && (
          <div className="flex justify-center mb-4">
            <div className="flex space-x-2">
              <div className="w-3 h-3 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-3 h-3 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-3 h-3 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* Export Tips */}
        {!isComplete && progress < 0.3 && (
          <div className="text-center text-slate-400 text-sm">
            📦 Preparing {exportType} file for download...
          </div>
        )}

        {/* Completion Message */}
        {isComplete && (
          <div className="text-center text-emerald-400 text-sm font-medium">
            ✅ {exportType} file exported successfully!
          </div>
        )}
      </div>
    </div>
  );
};
