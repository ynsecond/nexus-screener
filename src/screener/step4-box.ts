import type { DailyBar, BoxDefinition } from '../types';
import { CONFIG } from '../config';
import { median, topPercentile, bottomPercentile, linearRegressionSlope } from '../utils/statistics';

export interface BoxResult {
  box: BoxDefinition | null;
  excluded: boolean;
  excludeReason?: string;
  flags: {
    recentHighWithin5Days: boolean;
    postSpikeConsolidation: boolean;
  };
}

/** Step 4: 箱（レンジ）の定義 */
export function defineBox(bars: DailyBar[]): BoxResult {
  const lookback = CONFIG.BOX_LOOKBACK_DAYS;
  const recent = bars.slice(-lookback);

  if (recent.length < 30) {
    return {
      box: null,
      excluded: true,
      excludeReason: 'データ不足（30日未満）',
      flags: { recentHighWithin5Days: false, postSpikeConsolidation: false },
    };
  }

  const highs = recent.map((b) => b.AdjH);
  const lows = recent.map((b) => b.AdjL);
  const closes = recent.map((b) => b.AdjC);

  // --- 下落トレンド判定 ---
  const highSlope = linearRegressionSlope(highs);
  const lowSlope = linearRegressionSlope(lows);
  if (highSlope < 0 && lowSlope < 0) {
    // 高値・安値が両方切り下がっている
    const highDeclineRatio = Math.abs(highSlope * recent.length) / highs[0];
    const lowDeclineRatio = Math.abs(lowSlope * recent.length) / lows[0];
    if (highDeclineRatio > 0.05 && lowDeclineRatio > 0.05) {
      return {
        box: null,
        excluded: true,
        excludeReason: '明確な下落トレンド',
        flags: { recentHighWithin5Days: false, postSpikeConsolidation: false },
      };
    }
  }

  // --- 箱上限・箱下限 ---
  const topHighs = topPercentile(highs, CONFIG.BOX_TOP_PERCENTILE);
  const bottomLows = bottomPercentile(lows, CONFIG.BOX_BOTTOM_PERCENTILE);
  const upper = median(topHighs);
  const lower = median(bottomLows);

  if (lower <= 0) {
    return {
      box: null,
      excluded: true,
      excludeReason: '箱下限が0以下',
      flags: { recentHighWithin5Days: false, postSpikeConsolidation: false },
    };
  }

  const widthPct = (upper - lower) / lower;
  const isAscending = linearRegressionSlope(lows) > 0;
  const midpoint = (upper + lower) / 2;

  // --- 階段型上昇の検出 ---
  const isStaircase = detectStaircase(closes, highs, lows);

  // --- フラグ ---
  const maxHigh = Math.max(...highs);
  const last5Highs = highs.slice(-5);
  const recentHighWithin5Days = last5Highs.some(
    (h) => Math.abs(h - maxHigh) / maxHigh < 0.001,
  );

  // 吹き上げ後横横の簡易判定
  const firstHalfMax = Math.max(...highs.slice(0, Math.floor(highs.length / 2)));
  const secondHalfRange =
    (Math.max(...highs.slice(Math.floor(highs.length / 2))) -
      Math.min(...lows.slice(Math.floor(lows.length / 2)))) /
    Math.min(...lows.slice(Math.floor(lows.length / 2)));
  const postSpikeConsolidation =
    firstHalfMax > upper * 1.05 && secondHalfRange < 0.1;

  return {
    box: { upper, lower, widthPct, isAscending, isStaircase, midpoint },
    excluded: false,
    flags: { recentHighWithin5Days, postSpikeConsolidation },
  };
}

/** 箱幅が型別上限を超えているか判定 */
export function isBoxWidthExceeded(
  widthPct: number,
  typeKey: string,
  isAscending: boolean,
): boolean {
  if (isAscending) return false; // 斜めレンジは上限なし
  const limit = CONFIG.BOX_WIDTH_LIMITS[typeKey];
  if (limit === undefined) return false;
  return widthPct > limit;
}

/** 階段型上昇の検出 */
function detectStaircase(
  closes: number[],
  highs: number[],
  lows: number[],
): boolean {
  if (closes.length < 20) return false;

  // 直近20日の変動率を計算
  const range20 =
    (Math.max(...highs.slice(-20)) - Math.min(...lows.slice(-20))) /
    Math.min(...lows.slice(-20));

  // 全体の変動率
  const rangeAll =
    (Math.max(...highs) - Math.min(...lows)) / Math.min(...lows);

  // 直近が横横（変動率低い）かつ全体では上昇している
  return range20 < 0.1 && rangeAll > 0.15 && linearRegressionSlope(closes) > 0;
}
