import { useState } from 'react';
import type { ScreenerResult } from '../types';
import { StockDetail } from './StockDetail';

interface Props {
  results: ScreenerResult[];
}

export function ResultTable({ results }: Props) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'score' | 'shelf' | 'type'>('score');

  const sorted = [...results].sort((a, b) => {
    if (sortKey === 'score') return b.score.total - a.score.total;
    if (sortKey === 'shelf') {
      const order: Record<string, number> = { A1: 0, A2: 1, B: 2 };
      return order[a.shelf] - order[b.shelf];
    }
    return 0;
  });

  const scoreColor = (total: number) => {
    if (total >= 9) return 'bg-green-900/40 border-l-4 border-l-green-500';
    if (total >= 7) return '';
    if (total >= 5) return 'opacity-60';
    return 'opacity-40';
  };

  const shelfBadge = (shelf: string) => {
    const colors: Record<string, string> = {
      A1: 'bg-blue-600',
      A2: 'bg-purple-600',
      B: 'bg-red-600',
    };
    return colors[shelf] || 'bg-gray-600';
  };

  const phaseBadge = (phase: string) => {
    const colors: Record<string, string> = {
      '吸収中': 'bg-blue-800 text-blue-200',
      '前夜': 'bg-yellow-800 text-yellow-200',
      '点火済み': 'bg-red-800 text-red-200',
    };
    return colors[phase] || 'bg-[#232a3b]';
  };

  if (results.length === 0) {
    return (
      <div className="bg-[#232a3b] rounded-lg p-8 text-center text-gray-400">
        スクリーニング結果がありません
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-400">検出: {results.length}銘柄</span>
        <div className="flex gap-1 ml-auto">
          {(['score', 'shelf', 'type'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={`text-xs px-2 py-1 rounded ${
                sortKey === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#2d3548] text-gray-400 hover:bg-gray-600'
              }`}
            >
              {key === 'score' ? 'スコア順' : key === 'shelf' ? '棚順' : '型順'}
            </button>
          ))}
        </div>
      </div>

      {/* テーブルヘッダー */}
      <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 text-xs text-gray-500 font-medium">
        <div className="col-span-3">銘柄</div>
        <div className="col-span-1">棚</div>
        <div className="col-span-1">型</div>
        <div className="col-span-1">フェーズ</div>
        <div className="col-span-2">スコア</div>
        <div className="col-span-1">Q / S</div>
        <div className="col-span-2">箱レンジ</div>
        <div className="col-span-1">V20</div>
      </div>

      {/* 結果行 */}
      {sorted.map((r) => (
        <div key={r.code}>
          {/* デスクトップ: グリッド行 */}
          <div
            onClick={() =>
              setExpandedCode(expandedCode === r.code ? null : r.code)
            }
            className={`hidden md:grid grid-cols-12 gap-2 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-[#2d3548]/50 transition-colors border border-transparent ${scoreColor(
              r.score.total,
            )} ${expandedCode === r.code ? 'bg-[#232a3b]' : 'bg-[#232a3b]/50'}`}
          >
            {/* 銘柄 */}
            <div className="col-span-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">{r.code.slice(0, 4)}</span>
                <span className="text-sm text-white truncate">{r.name}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{r.market}</div>
            </div>

            {/* 棚 */}
            <div className="col-span-1 flex items-center">
              <span className={`text-xs px-1.5 py-0.5 rounded font-bold text-white ${shelfBadge(r.shelf)}`}>
                {r.shelf}
              </span>
            </div>

            {/* 型 */}
            <div className="col-span-1 flex items-center">
              <span className="text-xs text-gray-300">{r.patternType}</span>
            </div>

            {/* フェーズ */}
            <div className="col-span-1 flex items-center">
              <span className={`text-xs px-1.5 py-0.5 rounded ${phaseBadge(r.phase)}`}>
                {r.phase}
              </span>
            </div>

            {/* スコア */}
            <div className="col-span-2 flex items-center gap-1">
              <span className="text-lg font-bold text-white">{r.score.total}</span>
              <span className="text-xs text-gray-500">/10</span>
              <div className="hidden lg:flex gap-0.5 ml-1">
                {[
                  r.score.rangeCompression,
                  r.score.floorFormation,
                  r.score.volumeRatio,
                  r.score.volatility,
                  r.score.fundamental,
                ].map((s, idx) => (
                  <span
                    key={idx}
                    className={`w-4 h-4 rounded text-[10px] flex items-center justify-center ${
                      s === 2
                        ? 'bg-green-700 text-green-200'
                        : s === 1
                          ? 'bg-yellow-700 text-yellow-200'
                          : 'bg-[#2d3548] text-gray-500'
                    }`}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Q/S回数 */}
            <div className="col-span-1 flex items-center">
              <span className="text-xs text-gray-300 font-mono">
                {r.quietCount}/{r.shakeoutCount}
              </span>
            </div>

            {/* 箱レンジ */}
            <div className="col-span-2 flex flex-col justify-center">
              <span className="text-xs text-gray-300 font-mono">
                {r.boxUpper.toLocaleString()} - {r.boxLower.toLocaleString()}
              </span>
              <span className="text-[10px] text-gray-500">
                幅 {((r.boxUpper - r.boxLower) / r.boxLower * 100).toFixed(1)}%
              </span>
            </div>

            {/* V20 */}
            <div className="col-span-1 flex items-center">
              <span className="text-xs text-gray-400 font-mono">
                {r.avgVolume20.toLocaleString()}
              </span>
            </div>
          </div>

          {/* モバイル: カードレイアウト */}
          <div
            onClick={() =>
              setExpandedCode(expandedCode === r.code ? null : r.code)
            }
            className={`md:hidden rounded-lg cursor-pointer hover:bg-[#2d3548]/50 transition-colors border border-transparent px-3 py-3 space-y-2 ${scoreColor(
              r.score.total,
            )} ${expandedCode === r.code ? 'bg-[#232a3b]' : 'bg-[#232a3b]/50'}`}
          >
            {/* 1行目: コード・名前 + スコア */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-500 font-mono shrink-0">{r.code.slice(0, 4)}</span>
                <span className="text-sm text-white truncate">{r.name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <span className="text-lg font-bold text-white">{r.score.total}</span>
                <span className="text-xs text-gray-500">/10</span>
              </div>
            </div>

            {/* 2行目: バッジ群 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-1.5 py-0.5 rounded font-bold text-white ${shelfBadge(r.shelf)}`}>
                {r.shelf}
              </span>
              <span className="text-xs text-gray-300">{r.patternType}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${phaseBadge(r.phase)}`}>
                {r.phase}
              </span>
              <span className="text-xs text-gray-400 font-mono ml-auto">
                Q{r.quietCount}/S{r.shakeoutCount}
              </span>
            </div>
          </div>

          {/* フラグ */}
          {(r.flags.recentHighWithin5Days || r.flags.postSpikeConsolidation || r.flags.ignited) && (
            <div className="flex gap-1 px-3 py-1 flex-wrap">
              {r.flags.ignited && (
                <span className="text-[10px] bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded">
                  点火済み
                </span>
              )}
              {r.flags.recentHighWithin5Days && (
                <span className="text-[10px] bg-orange-900/50 text-orange-300 px-1.5 py-0.5 rounded">
                  直近5日以内に60日高値
                </span>
              )}
              {r.flags.postSpikeConsolidation && (
                <span className="text-[10px] bg-yellow-900/50 text-yellow-300 px-1.5 py-0.5 rounded">
                  吹き上げ後横横の可能性
                </span>
              )}
            </div>
          )}

          {/* 展開: 詳細 */}
          {expandedCode === r.code && <StockDetail result={r} />}
        </div>
      ))}
    </div>
  );
}
