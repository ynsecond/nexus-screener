import { useState, useEffect, useCallback } from 'react';
import type { ScreenerResult } from '../types';
import { fetchDailyBars } from '../api/jquants';
import { formatDate } from '../utils/date';

export interface HistoryEntry {
  code: string;
  name: string;
  market: string;
  shelf: string;
  patternType: string;
  phase: string;
  score: number;
  detectedDate: string;       // YYYY-MM-DD
  detectedPrice: number;      // 検出時終値
  currentPrice: number | null;
  priceChange: number | null;  // 円
  priceChangePct: number | null; // %
  boxUpper: number;
  boxLower: number;
}

const STORAGE_KEY = 'nexus_detection_history';

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** スクリーニング結果を履歴に追加（重複防止） */
export function addToHistory(results: ScreenerResult[], bars: Map<string, number>) {
  const existing = loadHistory();
  const existingCodes = new Set(existing.map((e) => e.code));
  const today = new Date().toISOString().slice(0, 10);

  const newEntries: HistoryEntry[] = [];
  for (const r of results) {
    if (existingCodes.has(r.code)) continue;
    const price = bars.get(r.code) || 0;
    newEntries.push({
      code: r.code,
      name: r.name,
      market: r.market,
      shelf: r.shelf,
      patternType: r.patternType,
      phase: r.phase,
      score: r.score.total,
      detectedDate: today,
      detectedPrice: price,
      currentPrice: null,
      priceChange: null,
      priceChangePct: null,
      boxUpper: r.boxUpper,
      boxLower: r.boxLower,
    });
  }

  if (newEntries.length > 0) {
    saveHistory([...newEntries, ...existing]);
  }
  return newEntries.length;
}

type SortKey = 'date' | 'changePct' | 'name';

export function DetectionHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(loadHistory());
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setEntries(loadHistory());
  }, []);

  const updatePrices = useCallback(async () => {
    setUpdating(true);
    const updated = [...entries];
    const today = formatDate(new Date());
    const weekAgo = formatDate(new Date(Date.now() - 7 * 86400000));

    for (const entry of updated) {
      try {
        const bars = await fetchDailyBars(entry.code, weekAgo, today);
        if (bars.length > 0) {
          const lastBar = bars[bars.length - 1];
          entry.currentPrice = lastBar.AdjC;
          if (entry.detectedPrice > 0) {
            entry.priceChange = Math.round((lastBar.AdjC - entry.detectedPrice) * 10) / 10;
            entry.priceChangePct = Math.round(((lastBar.AdjC - entry.detectedPrice) / entry.detectedPrice) * 10000) / 100;
          }
        }
      } catch { /* skip */ }
    }

    saveHistory(updated);
    setEntries([...updated]);
    setUpdating(false);
  }, [entries]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) { setSortAsc(!sortAsc); }
    else { setSortKey(key); setSortAsc(false); }
  };

  const sorted = [...entries].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'date') cmp = a.detectedDate.localeCompare(b.detectedDate);
    else if (sortKey === 'changePct') cmp = (a.priceChangePct ?? -999) - (b.priceChangePct ?? -999);
    else if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
    return sortAsc ? cmp : -cmp;
  });

  const toggleSelect = (code: string) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code); else next.add(code);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.code)));
    }
  };

  const deleteSelected = () => {
    const filtered = entries.filter((e) => !selected.has(e.code));
    saveHistory(filtered);
    setEntries(filtered);
    setSelected(new Set());
  };

  const deleteOne = (code: string) => {
    const filtered = entries.filter((e) => e.code !== code);
    saveHistory(filtered);
    setEntries(filtered);
    selected.delete(code);
    setSelected(new Set(selected));
  };

  const changePctColor = (pct: number | null) => {
    if (pct === null) return 'text-gray-500';
    if (pct > 0) return 'text-green-400';
    if (pct < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  return (
    <div className="space-y-4">
      {/* コントロール */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <h2 className="text-lg font-bold text-white">検出履歴</h2>
        <span className="text-sm text-gray-400">{entries.length}銘柄</span>
        <div className="flex gap-2 sm:ml-auto flex-wrap">
          <button
            onClick={updatePrices}
            disabled={updating || entries.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded px-3 py-1.5 text-xs font-medium transition-colors"
          >
            {updating ? '価格更新中...' : '現在価格を更新'}
          </button>
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              className="bg-red-600 hover:bg-red-700 text-white rounded px-3 py-1.5 text-xs font-medium transition-colors"
            >
              選択削除 ({selected.size})
            </button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
          検出履歴がありません。スクリーニングを実行すると自動的に記録されます。
        </div>
      ) : (
        <>
          {/* ソートボタン */}
          <div className="flex gap-1 items-center">
            <span className="text-xs text-gray-500 mr-1">ソート:</span>
            {([['date', '検出日'], ['changePct', '騰落率'], ['name', '銘柄名']] as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleSort(key)}
                className={`text-xs px-2 py-1 rounded ${sortKey === key ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
              >
                {label} {sortKey === key ? (sortAsc ? '↑' : '↓') : ''}
              </button>
            ))}
            <button
              onClick={toggleSelectAll}
              className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-400 hover:bg-gray-600 ml-auto"
            >
              {selected.size === entries.length ? '全解除' : '全選択'}
            </button>
          </div>

          {/* テーブル (デスクトップ) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-700">
                  <th className="py-2 px-2 w-8"></th>
                  <th className="py-2 px-2">銘柄</th>
                  <th className="py-2 px-2">検出日</th>
                  <th className="py-2 px-2">棚/型</th>
                  <th className="py-2 px-2">スコア</th>
                  <th className="py-2 px-2">検出時株価</th>
                  <th className="py-2 px-2">現在株価</th>
                  <th className="py-2 px-2">騰落額</th>
                  <th className="py-2 px-2">騰落率</th>
                  <th className="py-2 px-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.code} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-2 px-2">
                      <input
                        type="checkbox"
                        checked={selected.has(e.code)}
                        onChange={() => toggleSelect(e.code)}
                        className="rounded"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="text-gray-200">{e.code.slice(0, 4)} {e.name}</div>
                      <div className="text-xs text-gray-500">{e.market}</div>
                    </td>
                    <td className="py-2 px-2 text-gray-300 font-mono text-xs">{e.detectedDate}</td>
                    <td className="py-2 px-2">
                      <span className="text-xs text-gray-300">{e.shelf} / {e.patternType}</span>
                    </td>
                    <td className="py-2 px-2 text-gray-300">{e.score}/10</td>
                    <td className="py-2 px-2 text-gray-300 font-mono">
                      {e.detectedPrice > 0 ? `¥${e.detectedPrice.toLocaleString()}` : '-'}
                    </td>
                    <td className="py-2 px-2 text-gray-300 font-mono">
                      {e.currentPrice ? `¥${e.currentPrice.toLocaleString()}` : '-'}
                    </td>
                    <td className={`py-2 px-2 font-mono ${changePctColor(e.priceChange)}`}>
                      {e.priceChange !== null ? `${e.priceChange > 0 ? '+' : ''}${e.priceChange.toLocaleString()}` : '-'}
                    </td>
                    <td className={`py-2 px-2 font-mono font-bold ${changePctColor(e.priceChangePct)}`}>
                      {e.priceChangePct !== null ? `${e.priceChangePct > 0 ? '+' : ''}${e.priceChangePct.toFixed(2)}%` : '-'}
                    </td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => deleteOne(e.code)}
                        className="text-gray-500 hover:text-red-400 text-xs"
                        title="削除"
                      >
                        x
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* カード (モバイル) */}
          <div className="md:hidden space-y-2">
            {sorted.map((e) => (
              <div key={e.code} className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selected.has(e.code)}
                      onChange={() => toggleSelect(e.code)}
                      className="rounded shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-sm text-white truncate block">{e.code.slice(0, 4)} {e.name}</span>
                      <span className="text-xs text-gray-500">{e.detectedDate} | {e.shelf}/{e.patternType}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteOne(e.code)}
                    className="text-gray-500 hover:text-red-400 text-xs shrink-0 ml-2"
                  >
                    x
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">
                    検出時 ¥{e.detectedPrice > 0 ? e.detectedPrice.toLocaleString() : '-'}
                    {e.currentPrice ? ` → ¥${e.currentPrice.toLocaleString()}` : ''}
                  </span>
                  <span className={`font-mono font-bold ${changePctColor(e.priceChangePct)}`}>
                    {e.priceChangePct !== null ? `${e.priceChangePct > 0 ? '+' : ''}${e.priceChangePct.toFixed(2)}%` : '-'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
