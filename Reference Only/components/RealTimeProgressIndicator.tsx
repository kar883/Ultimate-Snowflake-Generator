import React from 'react';

interface RealTimeProgressIndicatorProps {
  progress: number;
  stage: string;
  stageProgress?: number;
  isVisible: boolean;
  slotCuttingActive?: boolean;
}

export const RealTimeProgressIndicator: React.FC<RealTimeProgressIndicatorProps> = ({ 
  progress, 
  stage, 
  stageProgress = progress,
  isVisible,
  slotCuttingActive = false
}) => {
  if (!isVisible) return null;

  const totalPercentage = Math.round(progress * 100);
  const stagePercentage = Math.round(stageProgress * 100);
  const isComplete = progress >= 1.0;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-[9999]">
      <div className="bg-slate-900/95 backdrop-blur-md rounded-2xl p-8 shadow-2xl border border-white/10 min-w-96 max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-white font-semibold text-xl">Generating 3D Model</h3>
        </div>

        {/* Stage Information */}
        <div className="text-slate-300 text-base mb-6 min-h-8 flex items-center justify-center">
          {stage}
        </div>

        {/* Slot Cutting Warning - REMOVED */}

        {/* Sequential Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Current Stage</span>
            <span className="text-white text-sm font-medium">{stagePercentage}%</span>
          </div>
          <div className="relative">
            <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden">
              <div 
                className="h-full transition-all duration-300 ease-out rounded-full bg-blue-500 shadow-lg shadow-blue-500/30"
                style={{ width: `${stagePercentage}%` }}
              >
                {/* Animated shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Total Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Total Progress</span>
            <span className="text-white text-sm font-medium">{totalPercentage}%</span>
          </div>
          <div className="relative">
            <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
              <div 
                className="h-full transition-all duration-500 ease-out rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/20"
                style={{ width: `${totalPercentage}%` }}
              >
                {/* Subtle animated gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Loading Animation */}
        <div className="flex justify-center mb-4">
          <div className="flex space-x-2">
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>

        {/* Performance Tips */}
        {progress < 0.3 && (
          <div className="text-center text-slate-400 text-sm">
            💡 Complex models with slots take longer to generate
          </div>
        )}
      </div>
    </div>
  );
};
