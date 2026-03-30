import { useState, useEffect, useCallback } from 'react';
import type { ScreenerResult, DailyBar } from '../types';
import { fetchDailyBars } from '../api/jquants';
import { formatDate } from '../utils/date';
import { CandlestickChart } from './CandlestickChart';

interface Props {
  result: ScreenerResult;
}

export function StockDetail({ result: r }: Props) {
  const [bars, setBars] = useState<DailyBar[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChart = useCallback(async () => {
    setLoading(true);
    setError(null);
    const now = new Date();
    const from = new Date(now);
    from.setFullYear(from.getFullYear() - 2);

    // 429の場合は自動リトライ（レート制限は1分枠なので長めに待つ）
    const waits = [20000, 40000, 60000];
    for (let attempt = 0; attempt <= waits.length; attempt++) {
      try {
        const data = await fetchDailyBars(r.code, formatDate(from), formatDate(now));
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
  }, [r.code]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  const scoreLabels = ['①レンジ圧縮', '②フロア形成', '③陰陽出来高比', '④ボラティリティ', '⑤ファンダ'];
  const scoreValues = [
    r.score.rangeCompression,
    r.score.floorFormation,
    r.score.volumeRatio,
    r.score.volatility,
    r.score.fundamental,
  ];

  return (
    <div className="bg-[#1e2435] border border-gray-600 rounded-lg mx-3 mb-2 p-4 space-y-4">
      {/* チャート */}
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
        <CandlestickChart bars={bars} boxUpper={r.boxUpper} boxLower={r.boxLower} />
      )}

      {/* 基本情報 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <InfoItem label="銘柄コード" value={r.code.slice(0, 4)} />
        <InfoItem label="市場" value={r.market} />
        <InfoItem label="棚" value={r.shelf} />
        <InfoItem label="型" value={r.patternType} />
        <InfoItem label="フェーズ" value={r.phase} />
        <InfoItem label="箱上限" value={`¥${r.boxUpper.toLocaleString()}`} />
        <InfoItem label="箱下限" value={`¥${r.boxLower.toLocaleString()}`} />
        <InfoItem label="25日MA" value={`¥${r.ma25.toLocaleString()}`} />
      </div>

      {/* スコア内訳 */}
      <div>
        <h4 className="text-xs text-gray-500 mb-2">二次スコア内訳 ({r.score.total}/10)</h4>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {scoreLabels.map((label, i) => (
            <div key={label} className="text-center">
              <div
                className={`text-lg font-bold ${
                  scoreValues[i] === 2
                    ? 'text-green-400'
                    : scoreValues[i] === 1
                      ? 'text-yellow-400'
                      : 'text-gray-600'
                }`}
              >
                {scoreValues[i]}
              </div>
              <div className="text-[10px] text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 吸収日情報 */}
      <div className="grid grid-cols-2 gap-3">
        <InfoItem label="Quiet吸収日" value={`${r.quietCount}回`} />
        <InfoItem label="Shakeout吸収日" value={`${r.shakeoutCount}回`} />
      </div>

      {/* 監視ライン */}
      <div>
        <h4 className="text-xs text-gray-500 mb-1">監視ライン（エントリー検討ゾーン）</h4>
        <p className="text-sm text-gray-300">
          ¥{r.watchZoneLower.toLocaleString()} 〜 ¥{r.watchZoneUpper.toLocaleString()}
        </p>
      </div>

      {/* 撤退条件 */}
      <div>
        <h4 className="text-xs text-gray-500 mb-1">撤退条件（いずれか1つで即撤退）</h4>
        <ul className="space-y-0.5">
          {r.exitConditions.map((cond, i) => (
            <li key={i} className="text-xs text-gray-400 flex items-start gap-1">
              <span className="text-red-500 mt-0.5">!</span>
              {cond}
            </li>
          ))}
        </ul>
      </div>

      {/* エントリー基準 */}
      <div className="bg-[#232a3b] rounded p-3">
        <h4 className="text-xs text-gray-500 mb-1">エントリー基準（参考）</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-400">
          <div>エントリーゾーン: 箱下限〜25日MA付近</div>
          <div>分割買い: 最大3〜4分割、初回20〜30%</div>
          <div>最大ホールド: 15営業日</div>
          <div>点火後追いかけ: 揺さぶりリスク高</div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-sm text-gray-200 font-medium">{value}</div>
    </div>
  );
}
