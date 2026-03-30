import { useState, useEffect, useCallback } from 'react';
import type { ScreenerResult, DailyBar } from '../types';
import { fetchDailyBars } from '../api/jquants';
import { formatDate } from '../utils/date';
import { CandlestickChart } from './CandlestickChart';


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

/** 履歴エントリ展開時のチャート表示 */
function HistoryStockDetail({ entry }: { entry: HistoryEntry }) {
  const [bars, setBars] = useState<DailyBar[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChart = useCallback(async () => {
    setLoading(true);
    setError(null);
    const now = new Date();
    const from = new Date(now);
    from.setFullYear(from.getFullYear() - 2);

    const waits = [20000, 40000, 60000];
    for (let attempt = 0; attempt <= waits.length; attempt++) {
      try {
        const data = await fetchDailyBars(entry.code, formatDate(from), formatDate(now));
        setBars(data);
        setLoading(false);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('429') && attempt < waits.length) {
          const sec = waits[attempt] / 1000;
          setError(`レート制限のため${sec}秒待機中...（${attempt + 1}/3回目）`);
          await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
          setError(null);
          continue;
        }
        setBars(null);
        setError(msg.includes('429')
          ? 'レート制限中です。1分ほど待ってからリトライしてください。'
          : 'チャートデータの取得に失敗しました。');
        setLoading(false);
        return;
      }
    }
  }, [entry.code]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  return (
    <div className="bg-[#1e2435] border border-gray-600 rounded-lg p-4 space-y-4 mt-1">
      {loading && (
        <div className="text-center text-gray-400 text-sm py-4">チャート読み込み中...</div>
      )}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded p-3 flex items-center justify-between">
          <span className="text-red-300 text-sm">{error}</span>
          <button
            onClick={loadChart}
            className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded ml-3 shrink-0"
          >
            リトライ
          </button>
        </div>
      )}
      {bars && bars.length > 0 && (
        <CandlestickChart bars={bars} boxUpper={entry.boxUpper} boxLower={entry.boxLower} />
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] text-gray-400">銘柄コード</div>
          <div className="text-sm text-gray-100 font-medium">{entry.code.slice(0, 4)}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">市場</div>
          <div className="text-sm text-gray-100 font-medium">{entry.market}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">棚 / 型</div>
          <div className="text-sm text-gray-100 font-medium">{entry.shelf} / {entry.patternType}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">フェーズ</div>
          <div className="text-sm text-gray-100 font-medium">{entry.phase}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">箱上限</div>
          <div className="text-sm text-gray-100 font-medium">{entry.boxUpper > 0 ? `¥${entry.boxUpper.toLocaleString()}` : '-'}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">箱下限</div>
          <div className="text-sm text-gray-100 font-medium">{entry.boxLower > 0 ? `¥${entry.boxLower.toLocaleString()}` : '-'}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">検出日</div>
          <div className="text-sm text-gray-100 font-medium">{entry.detectedDate}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">スコア</div>
          <div className="text-sm text-gray-100 font-medium">{entry.score}/10</div>
        </div>
      </div>
    </div>
  );
}

export function DetectionHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(loadHistory());
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

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
    if (pct === null) return 'text-gray-400';
    if (pct > 0) return 'text-emerald-400';
    if (pct < 0) return 'text-red-400';
    return 'text-gray-300';
  };

  const toggleExpand = (code: string) => {
    setExpandedCode(expandedCode === code ? null : code);
  };

  return (
    <div className="space-y-4">
      {/* コントロール */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <h2 className="text-lg font-bold text-white">検出履歴</h2>
        <span className="text-sm text-gray-300">{entries.length}銘柄</span>
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
        <div className="bg-[#232a3b] rounded-lg p-8 text-center text-gray-400">
          検出履歴がありません。スクリーニングを実行すると自動的に記録されます。
        </div>
      ) : (
        <>
          {/* ソートボタン */}
          <div className="flex gap-1 items-center">
            <span className="text-xs text-gray-400 mr-1">ソート:</span>
            {([['date', '検出日'], ['changePct', '騰落率'], ['name', '銘柄名']] as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleSort(key)}
                className={`text-xs px-2 py-1 rounded ${sortKey === key ? 'bg-blue-600 text-white' : 'bg-[#2d3548] text-gray-300 hover:bg-[#3a4560]'}`}
              >
                {label} {sortKey === key ? (sortAsc ? '↑' : '↓') : ''}
              </button>
            ))}
            <button
              onClick={toggleSelectAll}
              className="text-xs px-2 py-1 rounded bg-[#2d3548] text-gray-300 hover:bg-[#3a4560] ml-auto"
            >
              {selected.size === entries.length ? '全解除' : '全選択'}
            </button>
          </div>

          {/* テーブル (デスクトップ) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-600">
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
                  <tr key={e.code} className="group">
                    <td colSpan={10} className="p-0">
                      <div
                        onClick={() => toggleExpand(e.code)}
                        className={`grid grid-cols-[2rem_1fr_6rem_5rem_4rem_6rem_6rem_5rem_5.5rem_2rem] gap-0 items-center cursor-pointer hover:bg-[#2a3145] transition-colors border-b border-gray-700/50 ${
                          expandedCode === e.code ? 'bg-[#232a3b]' : ''
                        }`}
                      >
                        <div className="py-2 px-2" onClick={(ev) => ev.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(e.code)}
                            onChange={() => toggleSelect(e.code)}
                            className="rounded"
                          />
                        </div>
                        <div className="py-2 px-2">
                          <div className="text-gray-100">{e.code.slice(0, 4)} {e.name}</div>
                          <div className="text-xs text-gray-400">{e.market}</div>
                        </div>
                        <div className="py-2 px-2 text-gray-200 font-mono text-xs">{e.detectedDate}</div>
                        <div className="py-2 px-2">
                          <span className="text-xs text-gray-200">{e.shelf} / {e.patternType}</span>
                        </div>
                        <div className="py-2 px-2 text-gray-200">{e.score}/10</div>
                        <div className="py-2 px-2 text-gray-200 font-mono">
                          {e.detectedPrice > 0 ? `¥${e.detectedPrice.toLocaleString()}` : '-'}
                        </div>
                        <div className="py-2 px-2 text-gray-200 font-mono">
                          {e.currentPrice ? `¥${e.currentPrice.toLocaleString()}` : '-'}
                        </div>
                        <div className={`py-2 px-2 font-mono ${changePctColor(e.priceChange)}`}>
                          {e.priceChange !== null ? `${e.priceChange > 0 ? '+' : ''}${e.priceChange.toLocaleString()}` : '-'}
                        </div>
                        <div className={`py-2 px-2 font-mono font-bold ${changePctColor(e.priceChangePct)}`}>
                          {e.priceChangePct !== null ? `${e.priceChangePct > 0 ? '+' : ''}${e.priceChangePct.toFixed(2)}%` : '-'}
                        </div>
                        <div className="py-2 px-2" onClick={(ev) => ev.stopPropagation()}>
                          <button
                            onClick={() => deleteOne(e.code)}
                            className="text-gray-400 hover:text-red-400 text-xs"
                            title="削除"
                          >
                            x
                          </button>
                        </div>
                      </div>
                      {expandedCode === e.code && <HistoryStockDetail entry={e} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* カード (モバイル) */}
          <div className="md:hidden space-y-2">
            {sorted.map((e) => (
              <div key={e.code}>
                <div
                  onClick={() => toggleExpand(e.code)}
                  className={`rounded-lg cursor-pointer hover:bg-[#2a3145] transition-colors p-3 space-y-2 ${
                    expandedCode === e.code ? 'bg-[#232a3b]' : 'bg-[#232a3b]/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selected.has(e.code)}
                        onChange={() => toggleSelect(e.code)}
                        onClick={(ev) => ev.stopPropagation()}
                        className="rounded shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-sm text-white truncate block">{e.code.slice(0, 4)} {e.name}</span>
                        <span className="text-xs text-gray-400">{e.detectedDate} | {e.shelf}/{e.patternType}</span>
                      </div>
                    </div>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); deleteOne(e.code); }}
                      className="text-gray-400 hover:text-red-400 text-xs shrink-0 ml-2"
                    >
                      x
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-300">
                      検出時 ¥{e.detectedPrice > 0 ? e.detectedPrice.toLocaleString() : '-'}
                      {e.currentPrice ? ` → ¥${e.currentPrice.toLocaleString()}` : ''}
                    </span>
                    <span className={`font-mono font-bold ${changePctColor(e.priceChangePct)}`}>
                      {e.priceChangePct !== null ? `${e.priceChangePct > 0 ? '+' : ''}${e.priceChangePct.toFixed(2)}%` : '-'}
                    </span>
                  </div>
                </div>
                {expandedCode === e.code && (
                  <div className="px-1 pb-2">
                    <HistoryStockDetail entry={e} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
