import type {
  StockMaster, FinSummary, ExclusionList,
  ScreenerResult, ScreenerProgress, MarketCondition,
} from '../types';
import { CONFIG } from '../config';
import { fetchStockMaster, fetchDailyBars, fetchFinSummary, fetchTopixDaily } from '../api/jquants';
import { applyEntryFilter, loadExclusionList, checkSalesGrowth } from './step2-filter';
import { defineBox, isBoxWidthExceeded } from './step4-box';
import { detectAbsorption } from './step5-absorption';
import { assignTypeAndShelf } from './step6-type-shelf';
import { calculateScore } from './step7-score';
import { buildOutput, sortResults } from './step8-output';
import { formatDate, subtractBusinessDays } from '../utils/date';

type ProgressCallback = (progress: ScreenerProgress) => void;

/** メインパイプライン: 全ステップを順次実行 */
export async function runScreener(
  onProgress: ProgressCallback,
): Promise<ScreenerResult[]> {
  const results: ScreenerResult[] = [];
  const now = new Date();
  const fromDate = subtractBusinessDays(now, CONFIG.DATA_LOOKBACK_DAYS);
  const fromStr = formatDate(fromDate);
  const toStr = formatDate(now);

  // --- Step 1: 銘柄リスト取得 ---
  onProgress({ step: 1, totalSteps: 8, message: '銘柄リスト取得中...', currentCount: 0, totalCount: 0 });
  const allStocks = await fetchStockMaster();

  // 普通株式のみ（5桁目が0）
  const stocks = allStocks.filter((s) => s.Code.endsWith('0'));

  // --- 除外リスト取得 ---
  const exclusionList = await loadExclusionList();

  // --- Step 2: 入口フィルター（市場ベースの簡易フィルター） ---
  onProgress({ step: 2, totalSteps: 8, message: '入口フィルター適用中...', currentCount: 0, totalCount: stocks.length });

  const candidates: StockMaster[] = [];
  for (const stock of stocks) {
    // 市場が空の場合はスキップ
    if (!stock.MktNm) continue;

    // ETF, REIT, インフラ等を除外（株式のみ）
    const mkt = stock.MktNm;
    if (!mkt.includes('プライム') && !mkt.includes('スタンダード') && !mkt.includes('グロース')) {
      continue;
    }

    // 除外リストチェック（財務データなしで先にチェックできる部分）
    if (
      exclusionList.tob.includes(stock.Code) ||
      exclusionList.delisting.includes(stock.Code) ||
      exclusionList.fraud.includes(stock.Code)
    ) {
      continue;
    }

    candidates.push(stock);
  }

  onProgress({
    step: 2, totalSteps: 8,
    message: `入口フィルター通過: ${candidates.length}銘柄`,
    currentCount: candidates.length, totalCount: stocks.length,
  });

  // --- Step 3〜8: 各銘柄を処理 ---
  const batchSize = 3; // レート制限対策: 並列数を抑制
  const batchDelay = 500; // バッチ間ディレイ(ms)
  let processed = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);

    const batchPromises = batch.map(async (stock) => {
      try {
        return await processStock(stock, fromStr, toStr, exclusionList);
      } catch (err) {
        console.warn(`[${stock.Code}] エラー:`, err);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if (result) results.push(result);
    }

    processed += batch.length;
    onProgress({
      step: 5, totalSteps: 8,
      message: `スクリーニング中... (${processed}/${candidates.length})`,
      currentCount: processed, totalCount: candidates.length,
    });

    // レート制限回避のためバッチ間にディレイ
    if (i + batchSize < candidates.length) {
      await new Promise((r) => setTimeout(r, batchDelay));
    }
  }

  // --- ソート ---
  const sorted = sortResults(results);

  onProgress({
    step: 8, totalSteps: 8,
    message: `完了: ${sorted.length}銘柄検出`,
    currentCount: sorted.length, totalCount: sorted.length,
  });

  return sorted;
}

/** 個別銘柄の処理（Step 3〜8） */
async function processStock(
  stock: StockMaster,
  fromStr: string,
  toStr: string,
  exclusionList: ExclusionList,
): Promise<ScreenerResult | null> {
  // Step 3: 日足データ取得
  const bars = await fetchDailyBars(stock.Code, fromStr, toStr);
  if (bars.length < 30) return null; // データ不足

  // 財務データ取得
  let financials: FinSummary | null = null;
  let allFinancials: FinSummary[] = [];
  try {
    allFinancials = await fetchFinSummary(stock.Code);
    if (allFinancials.length > 0) {
      // 最新の決算を取得
      financials = allFinancials.sort((a, b) =>
        b.DiscDate.localeCompare(a.DiscDate),
      )[0];
    }
  } catch {
    // 財務データ取得失敗は許容
  }

  // Step 2の残りフィルター（出来高、グロース例外、プライム大型）
  // 時価総額概算は不明（発行済株式数がmaster APIにないため）
  // プライム大型は今回はスキップ（正確な値が取れない場合）
  const filter = applyEntryFilter(stock, bars, financials, exclusionList);
  if (!filter.passed) return null;

  // グロース銘柄の売上成長チェック
  if (stock.MktNm.includes('グロース') && allFinancials.length > 0) {
    if (!checkSalesGrowth(allFinancials)) {
      return null; // 売上成長条件未達
    }
  }

  // Step 4: 箱定義
  const boxResult = defineBox(bars);
  if (boxResult.excluded || !boxResult.box) return null;

  // Step 5: 吸収フェーズ判定（まず最大箱幅30%で仮判定）
  const maxWidthLimit = CONFIG.BOX_WIDTH_LIMITS.reabsorption;
  if (!boxResult.box.isAscending && boxResult.box.widthPct > maxWidthLimit) {
    return null;
  }

  const absorption = detectAbsorption(bars, boxResult.box);
  if (!absorption.passed) return null;

  // Step 6: 型・棚
  const { patternType, shelf, phase } = assignTypeAndShelf(
    bars, boxResult.box, absorption,
  );

  // 型に応じた箱幅上限で再チェック
  const typeKey = patternType === 'Quiet型' ? 'quiet'
    : patternType === '混在型' ? 'mixed' : 'reabsorption';
  if (isBoxWidthExceeded(boxResult.box.widthPct, typeKey, boxResult.box.isAscending)) {
    return null;
  }

  // Step 7: 二次スコア
  const score = calculateScore(bars, financials);

  // Step 8: 出力
  return buildOutput({
    code: stock.Code,
    name: stock.CoName,
    market: stock.MktNm,
    bars,
    box: boxResult.box,
    patternType,
    shelf,
    phase,
    score,
    quietCount: absorption.quietCount,
    shakeoutCount: absorption.shakeoutCount,
    flags: boxResult.flags,
  });
}

/** 地合い判定 */
export async function getMarketCondition(): Promise<MarketCondition> {
  try {
    const now = new Date();
    const from = subtractBusinessDays(now, 40);
    const topixData = await fetchTopixDaily(formatDate(from), formatDate(now));

    if (topixData.length < 25) {
      return { topix25maDeviation: 0, mode: '通常', scoreThreshold: 7 };
    }

    const last25 = topixData.slice(-25);
    const ma25 = last25.reduce((s, d) => s + d.C, 0) / 25;
    const lastClose = topixData[topixData.length - 1].C;
    const deviation = (lastClose - ma25) / ma25;

    let mode: MarketCondition['mode'];
    let scoreThreshold: number;

    if (deviation < CONFIG.MARKET_FILTER_WEAK) {
      mode = '暴落';
      scoreThreshold = 999; // 打診禁止
    } else if (deviation < CONFIG.MARKET_FILTER_NORMAL) {
      mode = '慎重';
      scoreThreshold = 8;
    } else {
      mode = '通常';
      scoreThreshold = 7;
    }

    return {
      topix25maDeviation: Math.round(deviation * 10000) / 100,
      mode,
      scoreThreshold,
    };
  } catch {
    return { topix25maDeviation: 0, mode: '通常', scoreThreshold: 7 };
  }
}
