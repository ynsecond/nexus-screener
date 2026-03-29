import { useState, useCallback } from 'react';
import type { ScreenerResult, ScreenerProgress, MarketCondition } from '../types';
import { runScreener, getMarketCondition } from '../screener/pipeline';
import { ResultTable } from './ResultTable';
import { ProgressIndicator } from './ProgressIndicator';
import { MarketFilter } from './MarketFilter';
import { ExclusionManager, useExclusionList } from './ExclusionManager';
import { BacktestPanel } from './BacktestPanel';

export function ScreenerDashboard() {
  const [results, setResults] = useState<ScreenerResult[] | null>(null);
  const [progress, setProgress] = useState<ScreenerProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketCondition, setMarketCondition] = useState<MarketCondition | null>(null);
  const [showExclusion, setShowExclusion] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const { list: exclusionList, save: saveExclusionList } = useExclusionList();

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResults(null);
    setProgress({ step: 0, totalSteps: 8, message: '開始中...', currentCount: 0, totalCount: 0 });

    try {
      // 地合い判定を並行実行
      const [screenerResults, condition] = await Promise.all([
        runScreener(setProgress),
        getMarketCondition(),
      ]);

      setResults(screenerResults);
      setMarketCondition(condition);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
      {/* コントロールバー */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleRun}
          disabled={running}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg px-6 py-2.5 text-sm font-medium transition-colors flex items-center gap-2"
        >
          {running ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              スクリーニング中...
            </>
          ) : (
            'スクリーニング実行'
          )}
        </button>

        <button
          onClick={() => setShowExclusion(true)}
          className="bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          除外リスト管理
        </button>

        <button
          onClick={() => setShowBacktest(!showBacktest)}
          className="bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {showBacktest ? 'バックテスト閉じる' : 'Recall検証'}
        </button>

        {results && (
          <span className="text-sm text-gray-400 ml-auto">
            {results.length}銘柄検出
          </span>
        )}
      </div>

      {/* 地合い */}
      <MarketFilter condition={marketCondition} />

      {/* 進捗 */}
      {running && progress && <ProgressIndicator progress={progress} />}

      {/* エラー */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* バックテスト */}
      {showBacktest && <BacktestPanel />}

      {/* 結果 */}
      {results && <ResultTable results={results} />}

      {/* 除外リスト管理モーダル */}
      {showExclusion && (
        <ExclusionManager
          list={exclusionList}
          onSave={saveExclusionList}
          onClose={() => setShowExclusion(false)}
        />
      )}
    </div>
  );
}
