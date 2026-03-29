/**
 * 暫定仕様パラメータ（変更容易性のため定数切り出し）
 * v3.2.1準拠
 */
export const CONFIG = {
  // --- 箱（レンジ）定義 ---
  BOX_LOOKBACK_DAYS: 60,
  BOX_TOP_PERCENTILE: 0.20,
  BOX_BOTTOM_PERCENTILE: 0.20,
  BOX_WIDTH_LIMITS: {
    quiet: 0.20,
    mixed: 0.25,
    reabsorption: 0.30,
  } as Record<string, number>,

  // --- 吸収日判定 ---
  QUIET_VOLUME_RATIO: 1.3,
  QUIET_VOLUME_PERCENTILE: 0.30,
  SHAKEOUT_VOLUME_RATIO: 1.6,
  SHAKEOUT_VOLUME_PERCENTILE: 0.15,
  BOX_BREAK_VOLUME_RATIO: 1.3,

  // --- 吸収フェーズ判定ウィンドウ ---
  ABSORPTION_WINDOW_MIN: 10,
  ABSORPTION_WINDOW_MAX: 15,

  // --- 点火条件 ---
  IGNITION_PRICE_THRESHOLD: 1.01,
  IGNITION_VOLUME_PERCENTILE: 0.10,
  IGNITION_VOLUME_RATIO: 1.8,

  // --- 入口フィルター ---
  MIN_AVG_VOLUME_20D: 3000,
  PRIME_MARKET_CAP_LIMIT: 500_000_000_000, // 5000億円

  // --- グロース例外条件 ---
  GROWTH_EQUITY_RATIO_MIN: 0.40,
  GROWTH_SALES_GROWTH_PERIODS: 2,

  // --- 移動平均 ---
  V20_PERIOD: 20,
  MA25_PERIOD: 25,

  // --- 二次スコア閾値 ---
  SCORE_RANGE_COMPRESSION: { pt2: 0.03, pt1: 0.05 },
  SCORE_FLOOR_FORMATION: { pt2: 0.30, pt1: 0.20 },
  SCORE_VOLUME_RATIO: { pt2: 0.8, pt1: 1.0 },
  SCORE_VOLATILITY: { pt2: 0.008, pt1: 0.012 },
  SCORE_FUNDA_PBR: 0.8,
  SCORE_FUNDA_EQUITY_RATIO: 0.50,

  // --- 地合いフィルター ---
  MARKET_FILTER_NORMAL: -0.03,
  MARKET_FILTER_WEAK: -0.07,

  // --- API ---
  JQUANTS_BASE_URL: 'https://api.jquants.com/v2',
  WORKER_BASE_URL: '', // 実行時に設定
  DATA_LOOKBACK_DAYS: 90, // 65営業日 + バッファ

  // --- 前夜フェーズ ---
  PRE_IGNITION_WINDOW: 5,
  PRE_IGNITION_CLOSE_ABOVE_MID: 3,
} as const;
