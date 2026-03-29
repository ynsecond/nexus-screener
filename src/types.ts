/** J-Quants 銘柄マスタ */
export interface StockMaster {
  Code: string;
  CoName: string;
  MktNm: string;
  S33Nm: string;
  ScaleCat: string;
}

/** J-Quants 日足OHLCV（調整後） */
export interface DailyBar {
  Date: string;
  Code: string;
  AdjO: number;
  AdjH: number;
  AdjL: number;
  AdjC: number;
  AdjVo: number;
}

/** J-Quants 財務サマリ */
export interface FinSummary {
  Code: string;
  DiscDate: string;
  CurPerEn: string;
  Sales: number | null;
  OP: number | null;
  BPS: number | null;
  EqAR: number | null;
}

/** J-Quants TOPIX日足 */
export interface TopixDaily {
  Date: string;
  O: number;
  H: number;
  L: number;
  C: number;
}

/** 箱（レンジ）定義 */
export interface BoxDefinition {
  upper: number;
  lower: number;
  widthPct: number;
  isAscending: boolean;      // 斜めレンジ
  isStaircase: boolean;      // 階段型上昇
  midpoint: number;
}

/** 吸収日情報 */
export interface AbsorptionDay {
  date: string;
  type: 'quiet' | 'shakeout';
  volume: number;
  close: number;
}

/** 吸収フェーズ判定結果 */
export interface AbsorptionResult {
  passed: boolean;
  quietCount: number;
  shakeoutCount: number;
  absorptionDays: AbsorptionDay[];
  boxBreakDetected: boolean;
  reabsorptionDetected: boolean;
}

/** 型 */
export type PatternType = 'Quiet型' | '混在型' | '再吸収型';

/** 棚 */
export type ShelfType = 'A1' | 'A2' | 'B';

/** フェーズ */
export type PhaseType = '吸収中' | '前夜' | '点火済み';

/** 二次スコア内訳 */
export interface ScoreBreakdown {
  rangeCompression: number;   // ①レンジ圧縮度 0-2
  floorFormation: number;     // ②フロア形成度 0-2
  volumeRatio: number;        // ③陰陽出来高比率 0-2
  volatility: number;         // ④ボラティリティ 0-2
  fundamental: number;        // ⑤ファンダ 0-2
  total: number;              // 合計 0-10
}

/** 注意フラグ */
export interface Flags {
  recentHighWithin5Days: boolean;    // 直近5日以内に60日高値
  postSpikeConsolidation: boolean;   // 吹き上げ後横横の可能性
  ignited: boolean;                  // 点火済み
}

/** スクリーニング結果（1銘柄） */
export interface ScreenerResult {
  code: string;
  name: string;
  market: string;
  shelf: ShelfType;
  patternType: PatternType;
  phase: PhaseType;
  score: ScoreBreakdown;
  quietCount: number;
  shakeoutCount: number;
  boxUpper: number;
  boxLower: number;
  watchZoneLower: number;
  watchZoneUpper: number;
  exitConditions: string[];
  avgVolume20: number;
  flags: Flags;
  ma25: number;
}

/** 除外リスト */
export interface ExclusionList {
  tob: string[];
  delisting: string[];
  fraud: string[];
}

/** 地合い */
export interface MarketCondition {
  topix25maDeviation: number;
  mode: '通常' | '慎重' | '暴落';
  scoreThreshold: number;
}

/** スクリーニング進捗 */
export interface ScreenerProgress {
  step: number;
  totalSteps: number;
  message: string;
  currentCount: number;
  totalCount: number;
}

/** グラウンドトゥルースケース */
export interface GroundTruthCase {
  id: number;
  code: string;
  name: string;
  market: string;
  startDate: string;
  endDate: string;
  patternType: PatternType;
  shelf: ShelfType;
  boxUpper: number;
  boxLower: number;
  boxWidth: number;
  quietDays: number;
  shakeoutDays: number;
  score: string;
  ignitionDate: string;
  note: string;
}
