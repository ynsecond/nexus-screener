import type { DailyBar, BoxDefinition, AbsorptionResult, PatternType, ShelfType, PhaseType } from '../types';
import { CONFIG } from '../config';
import { detectReabsorption } from './step5-absorption';

export interface TypeShelfResult {
  patternType: PatternType;
  shelf: ShelfType;
  phase: PhaseType;
}

/** Step 6: 型と棚の付与 */
export function assignTypeAndShelf(
  bars: DailyBar[],
  box: BoxDefinition,
  absorption: AbsorptionResult,
): TypeShelfResult {
  const patternType = determineType(bars, box, absorption);
  const phase = determinePhase(bars, box);
  const shelf = determineShelf(patternType, phase);

  return { patternType, shelf, phase };
}

/** 型の自動判定 */
function determineType(
  bars: DailyBar[],
  box: BoxDefinition,
  absorption: AbsorptionResult,
): PatternType {
  // 再吸収型の判定
  if (detectReabsorption(bars, box)) {
    return '再吸収型';
  }

  const shakeoutCount = absorption.shakeoutCount;
  const quietCount = absorption.quietCount;

  if (shakeoutCount === 0) {
    return 'Quiet型';
  }
  if (quietCount > 0 && shakeoutCount > 0) {
    return '混在型';
  }
  // Shakeoutのみの場合も混在型として扱う
  return '混在型';
}

/** フェーズ判定 */
function determinePhase(
  bars: DailyBar[],
  box: BoxDefinition,
): PhaseType {
  if (bars.length === 0) return '吸収中';

  const lastBar = bars[bars.length - 1];

  // --- 点火フェーズ ---
  const ignitionPrice = box.upper * CONFIG.IGNITION_PRICE_THRESHOLD;
  if (lastBar.AdjC >= ignitionPrice) {
    // 出来高条件チェック
    const vol60 = bars.slice(-CONFIG.BOX_LOOKBACK_DAYS).map((b) => b.AdjVo);
    const sortedVol = [...vol60].sort((a, b) => b - a);
    const topThreshold = sortedVol[
      Math.max(0, Math.floor(vol60.length * CONFIG.IGNITION_VOLUME_PERCENTILE) - 1)
    ];
    const v20 =
      bars.slice(-CONFIG.V20_PERIOD).reduce((s, b) => s + b.AdjVo, 0) /
      CONFIG.V20_PERIOD;

    if (
      lastBar.AdjVo >= topThreshold ||
      lastBar.AdjVo >= CONFIG.IGNITION_VOLUME_RATIO * v20
    ) {
      return '点火済み';
    }
  }

  // --- 前夜フェーズ ---
  const last5 = bars.slice(-CONFIG.PRE_IGNITION_WINDOW);
  if (last5.length >= CONFIG.PRE_IGNITION_WINDOW) {
    const closeAboveMid = last5.filter(
      (b) => b.AdjC >= box.midpoint,
    ).length;

    // 押しが浅い = 直近5日の安値 > 箱の中間値
    const shallowPullback = last5.every((b) => b.AdjL >= box.midpoint);

    // トライ増加 = 直近5日の高値が箱上限に接近（箱上限の98%以上）
    const tryCount = last5.filter(
      (b) => b.AdjH >= box.upper * 0.98,
    ).length;

    if (
      closeAboveMid >= CONFIG.PRE_IGNITION_CLOSE_ABOVE_MID &&
      shallowPullback &&
      tryCount >= 2
    ) {
      return '前夜';
    }
  }

  return '吸収中';
}

/** 棚の付与 */
function determineShelf(patternType: PatternType, phase: PhaseType): ShelfType {
  if (phase === '点火済み') {
    return 'B';
  }
  if (patternType === '再吸収型') {
    return 'A2';
  }
  return 'A1';
}
