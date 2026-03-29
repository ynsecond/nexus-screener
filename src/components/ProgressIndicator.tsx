import type { ScreenerProgress } from '../types';

interface Props {
  progress: ScreenerProgress;
}

export function ProgressIndicator({ progress }: Props) {
  const pct =
    progress.totalCount > 0
      ? Math.round((progress.currentCount / progress.totalCount) * 100)
      : Math.round((progress.step / progress.totalSteps) * 100);

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-300">{progress.message}</span>
        <span className="text-sm text-gray-400">
          Step {progress.step}/{progress.totalSteps}
        </span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress.totalCount > 0 && (
        <div className="text-xs text-gray-500 mt-1 text-right">
          {progress.currentCount} / {progress.totalCount}
        </div>
      )}
    </div>
  );
}
