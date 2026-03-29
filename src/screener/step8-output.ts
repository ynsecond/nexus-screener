import type { DailyBar, BoxDefinition, ScreenerResult, ScoreBreakdown, PatternType, ShelfType, PhaseType, Flags } from '../types';
import { CONFIG } from '../config';

/** Step 8: 出力情報の組み立て */
export function buildOutput(params: {
  code: string;
  name: string;
  market: string;
  bars: DailyBar[];
  box: BoxDefinition;
  patternType: PatternType;
  shelf: ShelfType;
  phase: PhaseType;
  score: ScoreBreakdown;
  quietCount: number;
  shakeoutCount: number;
  flags: { recentHighWithin5Days: boolean; postSpikeConsolidation: boolean };
}): ScreenerResult {
  const { code, name, market, bars, box, patternType, shelf, phase, score, quietCount, shakeoutCount, flags } = params;

  const last20 = bars.slice(-CONFIG.V20_PERIOD);
  const avgVolume20 = last20.reduce((s, b) => s + b.AdjVo, 0) / Math.max(last20.length, 1);

  // 25日移動平均線
  const last25 = bars.slice(-CONFIG.MA25_PERIOD);
  const ma25 = last25.reduce((s, b) => s + b.AdjC, 0) / Math.max(last25.length, 1);

  // 監視ライン: 箱下限〜箱下限+箱幅×30%
  const boxWidth = box.upper - box.lower;
  const watchZoneLower = box.lower;
  const watchZoneUpper = box.lower + boxWidth * 0.3;

  // 撤退条件
  const exitConditions = [
    '箱下限終値割り + 出来高増 (V≥1.3×V20)',
    '25日線終値割り + 出来高増',
    '安値更新3日連続',
    'ネガティブIR',
  ];

  const resultFlags: Flags = {
    recentHighWithin5Days: flags.recentHighWithin5Days,
    postSpikeConsolidation: flags.postSpikeConsolidation,
    ignited: phase === '点火済み',
  };

  return {
    code,
    name,
    market,
    shelf,
    patternType,
    phase,
    score,
    quietCount,
    shakeoutCount,
    boxUpper: Math.round(box.upper * 10) / 10,
    boxLower: Math.round(box.lower * 10) / 10,
    watchZoneLower: Math.round(watchZoneLower * 10) / 10,
    watchZoneUpper: Math.round(watchZoneUpper * 10) / 10,
    exitConditions,
    avgVolume20: Math.round(avgVolume20),
    flags: resultFlags,
    ma25: Math.round(ma25 * 10) / 10,
  };
}

/** ソート: 二次スコア降順 → 棚（A1>A2>B）→ 型 */
export function sortResults(results: ScreenerResult[]): ScreenerResult[] {
  const shelfOrder: Record<string, number> = { A1: 0, A2: 1, B: 2 };
  const typeOrder: Record<string, number> = { 'Quiet型': 0, '混在型': 1, '再吸収型': 2 };

  return [...results].sort((a, b) => {
    // スコア降順
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    // 棚
    if (shelfOrder[a.shelf] !== shelfOrder[b.shelf])
      return shelfOrder[a.shelf] - shelfOrder[b.shelf];
    // 型
    return (typeOrder[a.patternType] || 0) - (typeOrder[b.patternType] || 0);
  });
}
