import type { StockMaster, DailyBar, FinSummary, ExclusionList } from '../types';
import { CONFIG } from '../config';

export interface FilterResult {
  passed: boolean;
  reason?: string;
}

/** 除外リストをfetchで取得 */
export async function loadExclusionList(): Promise<ExclusionList> {
  try {
    const resp = await fetch('./exclusion_list.json');
    return await resp.json();
  } catch {
    return { tob: [], delisting: [], fraud: [] };
  }
}

/** Step 2: 入口フィルター */
export function applyEntryFilter(
  stock: StockMaster,
  recentBars: DailyBar[],
  financials: FinSummary | null,
  exclusionList: ExclusionList,
  marketCapApprox?: number,
): FilterResult {
  const code = stock.Code;

  // 1. TOB/MBO/公開買付中
  if (exclusionList.tob.includes(code)) {
    return { passed: false, reason: 'TOB/MBO/公開買付中' };
  }

  // 2. 上場廃止整理銘柄
  if (exclusionList.delisting.includes(code)) {
    return { passed: false, reason: '上場廃止整理銘柄' };
  }

  // 3. 不正会計銘柄
  if (exclusionList.fraud.includes(code)) {
    return { passed: false, reason: '不正会計銘柄' };
  }

  // 4. 20日平均出来高 < 3,000株
  if (recentBars.length >= 20) {
    const last20 = recentBars.slice(-20);
    const avgVol = last20.reduce((s, b) => s + b.AdjVo, 0) / last20.length;
    if (avgVol < CONFIG.MIN_AVG_VOLUME_20D) {
      return { passed: false, reason: `20日平均出来高不足 (${Math.round(avgVol)}株)` };
    }
  }

  const market = stock.MktNm;

  // 5. 東証グロース原則除外
  if (market.includes('グロース')) {
    const growthCheck = checkGrowthException(financials);
    if (!growthCheck.passed) {
      return { passed: false, reason: `グロース除外: ${growthCheck.reason}` };
    }
  }

  // 6. 東証プライム 時価総額 ≥ 5,000億円
  if (market.includes('プライム') && marketCapApprox !== undefined) {
    if (marketCapApprox >= CONFIG.PRIME_MARKET_CAP_LIMIT) {
      return { passed: false, reason: 'プライム大型株 (時価総額≥5000億円)' };
    }
  }

  return { passed: true };
}

/** グロース例外条件チェック（全て満たす場合のみ通過） */
function checkGrowthException(
  financials: FinSummary | null,
): FilterResult {
  if (!financials) {
    return { passed: false, reason: '財務データなし' };
  }

  // 1. 営業利益が黒字
  if (financials.OP === null || financials.OP <= 0) {
    return { passed: false, reason: '営業利益が赤字/データなし' };
  }

  // 2. 自己資本比率 ≥ 40%
  if (financials.EqAR === null || financials.EqAR < CONFIG.GROWTH_EQUITY_RATIO_MIN * 100) {
    return { passed: false, reason: `自己資本比率不足 (${financials.EqAR ?? 'N/A'}%)` };
  }

  // 3. 売上成長は吸収フェーズ通過後にチェック（ここではパス）
  // 条件4もフェーズ通過後
  return { passed: true };
}

/** グロース例外の売上成長チェック（複数期の財務データが必要） */
export function checkSalesGrowth(financials: FinSummary[]): boolean {
  if (financials.length < CONFIG.GROWTH_SALES_GROWTH_PERIODS + 1) return false;

  // 直近の決算をDiscDate降順でソート
  const sorted = [...financials]
    .filter((f) => f.Sales !== null)
    .sort((a, b) => b.CurPerEn.localeCompare(a.CurPerEn));

  if (sorted.length < CONFIG.GROWTH_SALES_GROWTH_PERIODS + 1) return false;

  for (let i = 0; i < CONFIG.GROWTH_SALES_GROWTH_PERIODS; i++) {
    const current = sorted[i].Sales!;
    const prev = sorted[i + 1].Sales!;
    if (current <= prev) return false;
  }
  return true;
}
