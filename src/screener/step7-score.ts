import type { DailyBar, FinSummary, ScoreBreakdown } from '../types';
import { CONFIG } from '../config';
import { stddev } from '../utils/statistics';

/** Step 7: 二次評価スコアリング（10点満点） */
export function calculateScore(
  bars: DailyBar[],
  financials: FinSummary | null,
): ScoreBreakdown {
  const last20 = bars.slice(-20);

  const rangeCompression = scoreRangeCompression(last20);
  const floorFormation = scoreFloorFormation(last20);
  const volumeRatio = scoreVolumeRatio(last20);
  const volatility = scoreVolatility(last20);
  const fundamental = scoreFundamental(bars, financials);

  return {
    rangeCompression,
    floorFormation,
    volumeRatio,
    volatility,
    fundamental,
    total: rangeCompression + floorFormation + volumeRatio + volatility + fundamental,
  };
}

/** ① レンジ圧縮度 */
function scoreRangeCompression(bars: DailyBar[]): number {
  if (bars.length === 0) return 0;
  const maxHigh = Math.max(...bars.map((b) => b.AdjH));
  const minLow = Math.min(...bars.map((b) => b.AdjL));
  if (minLow <= 0) return 0;
  const ratio = (maxHigh - minLow) / minLow;

  if (ratio <= CONFIG.SCORE_RANGE_COMPRESSION.pt2) return 2;
  if (ratio <= CONFIG.SCORE_RANGE_COMPRESSION.pt1) return 1;
  return 0;
}

/** ② フロア形成度 */
function scoreFloorFormation(bars: DailyBar[]): number {
  if (bars.length === 0) return 0;
  const lows = bars.map((b) => b.AdjL);
  const minLow = Math.min(...lows);
  if (minLow <= 0) return 0;

  // 1%刻みでグルーピング
  const bucketSize = minLow * 0.01;
  const buckets = new Map<number, number>();
  for (const low of lows) {
    const bucket = Math.floor(low / bucketSize);
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }

  const maxCount = Math.max(...buckets.values());
  const concentration = maxCount / bars.length;

  if (concentration >= CONFIG.SCORE_FLOOR_FORMATION.pt2) return 2;
  if (concentration >= CONFIG.SCORE_FLOOR_FORMATION.pt1) return 1;
  return 0;
}

/** ③ 陰線/陽線出来高比率 */
function scoreVolumeRatio(bars: DailyBar[]): number {
  const bullish = bars.filter((b) => b.AdjC > b.AdjO);
  const bearish = bars.filter((b) => b.AdjC < b.AdjO);

  if (bullish.length === 0 || bearish.length === 0) return 0;

  const avgBullVol = bullish.reduce((s, b) => s + b.AdjVo, 0) / bullish.length;
  const avgBearVol = bearish.reduce((s, b) => s + b.AdjVo, 0) / bearish.length;

  if (avgBullVol <= 0) return 0;
  const ratio = avgBearVol / avgBullVol;

  if (ratio <= CONFIG.SCORE_VOLUME_RATIO.pt2) return 2;
  if (ratio <= CONFIG.SCORE_VOLUME_RATIO.pt1) return 1;
  return 0;
}

/** ④ ボラティリティ */
function scoreVolatility(bars: DailyBar[]): number {
  if (bars.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i - 1].AdjC > 0) {
      returns.push(bars[i].AdjC / bars[i - 1].AdjC - 1);
    }
  }

  const vol = stddev(returns);

  if (vol <= CONFIG.SCORE_VOLATILITY.pt2) return 2;
  if (vol <= CONFIG.SCORE_VOLATILITY.pt1) return 1;
  return 0;
}

/** ⑤ ファンダ（スタンダード） */
function scoreFundamental(
  bars: DailyBar[],
  financials: FinSummary | null,
): number {
  if (!financials) return 0;

  const lastClose = bars.length > 0 ? bars[bars.length - 1].AdjC : 0;
  const bps = financials.BPS;
  const eqar = financials.EqAR;

  const hasPbr = bps !== null && bps > 0 && lastClose > 0;
  const pbr = hasPbr ? lastClose / bps! : null;

  const pbrOk = pbr !== null && pbr <= CONFIG.SCORE_FUNDA_PBR;
  const eqarOk = eqar !== null && eqar >= CONFIG.SCORE_FUNDA_EQUITY_RATIO * 100;

  if (pbrOk && eqarOk) return 2;
  if (pbrOk || eqarOk) return 1;
  return 0;
}
