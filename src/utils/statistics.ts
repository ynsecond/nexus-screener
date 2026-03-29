/** 中央値を計算 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 標準偏差を計算 */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return Math.sqrt(sq / (values.length - 1));
}

/** 線形回帰の傾きを計算 */
export function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** パーセンタイル値を取得（0-1） */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

/** 上位N%の値のリストを取得（降順ソート → 上位N個） */
export function topPercentile(values: number[], pct: number): number[] {
  const sorted = [...values].sort((a, b) => b - a);
  const count = Math.max(1, Math.round(values.length * pct));
  return sorted.slice(0, count);
}

/** 下位N%の値のリストを取得（昇順ソート → 下位N個） */
export function bottomPercentile(values: number[], pct: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const count = Math.max(1, Math.round(values.length * pct));
  return sorted.slice(0, count);
}
