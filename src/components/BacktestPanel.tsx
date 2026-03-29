import { useState } from 'react';
import type { GroundTruthCase, FinSummary } from '../types';
import { GROUND_TRUTH_CASES } from '../screener/ground-truth';
import { fetchDailyBars, fetchFinSummary } from '../api/jquants';
import { defineBox } from '../screener/step4-box';
import { detectAbsorption } from '../screener/step5-absorption';
import { assignTypeAndShelf } from '../screener/step6-type-shelf';
import { calculateScore } from '../screener/step7-score';
import { formatDate, subtractBusinessDays, parseDate } from '../utils/date';

interface BacktestResult {
  case_: GroundTruthCase;
  detected: boolean;
  detectedPhase: string;
  detectedType: string;
  detectedShelf: string;
  detectedScore: number;
  quietCount: number;
  shakeoutCount: number;
  error?: string;
}

export function BacktestPanel() {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [currentCase, setCurrentCase] = useState<string>('');

  const runBacktest = async () => {
    setRunning(true);
    setResults([]);

    const allResults: BacktestResult[] = [];

    for (const gt of GROUND_TRUTH_CASES) {
      setCurrentCase(`${gt.code.slice(0, 4)} ${gt.name}`);

      try {
        // 点火日の前日までのデータを取得（点火前に検出できるか確認）
        const endDate = parseDate(gt.endDate);
        const startDate = subtractBusinessDays(endDate, 90);
        const fromStr = formatDate(startDate);
        const toStr = formatDate(endDate);

        const bars = await fetchDailyBars(gt.code, fromStr, toStr);

        if (bars.length < 30) {
          allResults.push({
            case_: gt,
            detected: false,
            detectedPhase: '-',
            detectedType: '-',
            detectedShelf: '-',
            detectedScore: 0,
            quietCount: 0,
            shakeoutCount: 0,
            error: `データ不足 (${bars.length}日)`,
          });
          continue;
        }

        // Step 4: 箱定義
        const boxResult = defineBox(bars);
        if (boxResult.excluded || !boxResult.box) {
          allResults.push({
            case_: gt,
            detected: false,
            detectedPhase: '-',
            detectedType: '-',
            detectedShelf: '-',
            detectedScore: 0,
            quietCount: 0,
            shakeoutCount: 0,
            error: `箱定義失敗: ${boxResult.excludeReason}`,
          });
          continue;
        }

        // Step 5: 吸収フェーズ判定
        const absorption = detectAbsorption(bars, boxResult.box);

        // Step 6: 型・棚
        const { patternType, shelf, phase } = assignTypeAndShelf(
          bars,
          boxResult.box,
          absorption,
        );

        // Step 7: スコア
        let financials: FinSummary | null = null;
        try {
          const fins = await fetchFinSummary(gt.code);
          if (fins.length > 0) {
            financials = fins.sort((a, b) =>
              b.DiscDate.localeCompare(a.DiscDate),
            )[0];
          }
        } catch {
          // 財務データ取得失敗は許容
        }
        const score = calculateScore(bars, financials);

        allResults.push({
          case_: gt,
          detected: absorption.passed,
          detectedPhase: phase,
          detectedType: patternType,
          detectedShelf: shelf,
          detectedScore: score.total,
          quietCount: absorption.quietCount,
          shakeoutCount: absorption.shakeoutCount,
        });
      } catch (err) {
        allResults.push({
          case_: gt,
          detected: false,
          detectedPhase: '-',
          detectedType: '-',
          detectedShelf: '-',
          detectedScore: 0,
          quietCount: 0,
          shakeoutCount: 0,
          error: String(err),
        });
      }

      setResults([...allResults]);
    }

    setRunning(false);
    setCurrentCase('');
  };

  const recallCount = results.filter((r) => r.detected).length;
  const totalCount = results.length;
  const recallRate = totalCount > 0 ? Math.round((recallCount / totalCount) * 100) : 0;

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white">
          グラウンドトゥルース検証（Recall テスト）
        </h3>
        <button
          onClick={runBacktest}
          disabled={running}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
        >
          {running ? `検証中... ${currentCase}` : 'バックテスト実行'}
        </button>
      </div>

      {totalCount > 0 && (
        <div className={`rounded-lg p-3 mb-4 ${
          recallRate >= 70
            ? 'bg-green-900/30 border border-green-700'
            : 'bg-red-900/30 border border-red-700'
        }`}>
          <span className={`text-lg font-bold ${recallRate >= 70 ? 'text-green-300' : 'text-red-300'}`}>
            Recall: {recallCount}/{totalCount} ({recallRate}%)
          </span>
          <span className="text-sm text-gray-400 ml-2">
            {recallRate >= 70 ? '合格 (70%以上)' : '不合格 (70%未満)'}
          </span>
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-700">
                <th className="py-2 px-2">#</th>
                <th className="py-2 px-2">銘柄</th>
                <th className="py-2 px-2">検出</th>
                <th className="py-2 px-2">型</th>
                <th className="py-2 px-2">棚</th>
                <th className="py-2 px-2">Q/S</th>
                <th className="py-2 px-2">スコア</th>
                <th className="py-2 px-2">備考</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr
                  key={r.case_.id}
                  className={`border-b border-gray-800 ${
                    r.detected ? '' : 'opacity-50'
                  }`}
                >
                  <td className="py-2 px-2 text-gray-400">{r.case_.id}</td>
                  <td className="py-2 px-2">
                    <div className="text-gray-200">{r.case_.code.slice(0, 4)} {r.case_.name}</div>
                    <div className="text-xs text-gray-500">
                      期待: {r.case_.patternType} / {r.case_.shelf}
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    {r.detected ? (
                      <span className="text-green-400 font-bold">OK</span>
                    ) : (
                      <span className="text-red-400 font-bold">NG</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-gray-300">{r.detectedType}</td>
                  <td className="py-2 px-2 text-gray-300">{r.detectedShelf}</td>
                  <td className="py-2 px-2 text-gray-300 font-mono">
                    {r.quietCount}/{r.shakeoutCount}
                  </td>
                  <td className="py-2 px-2 text-gray-300">{r.detectedScore}/10</td>
                  <td className="py-2 px-2 text-xs text-gray-500">
                    {r.error || r.case_.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
