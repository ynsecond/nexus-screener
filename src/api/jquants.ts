import type { StockMaster, DailyBar, FinSummary, TopixDaily } from '../types';
import { getApiKey, getWorkerUrl } from './auth';

class JQuantsApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'JQuantsApiError';
    this.status = status;
  }
}

async function fetchApi<T>(path: string, params?: Record<string, string>): Promise<T[]> {
  const workerUrl = getWorkerUrl();
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('APIキーが設定されていません');
  if (!workerUrl) throw new Error('Worker URLが設定されていません');

  const url = new URL(workerUrl + path);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const resp = await fetch(url.toString(), {
    headers: { 'X-API-KEY': apiKey },
    cache: 'no-store',
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new JQuantsApiError(resp.status, `API error ${resp.status}: ${text}`);
  }

  const json = await resp.json() as { data: T[] };
  return json.data;
}

/** Step 1: 全上場銘柄一覧を取得 */
export async function fetchStockMaster(): Promise<StockMaster[]> {
  return fetchApi<StockMaster>('/api/master');
}

/** Step 3: 日足OHLCV取得 */
export async function fetchDailyBars(
  code: string,
  from: string,
  to: string,
): Promise<DailyBar[]> {
  return fetchApi<DailyBar>('/api/bars', { code, from, to });
}

/** 財務サマリ取得 */
export async function fetchFinSummary(code: string): Promise<FinSummary[]> {
  return fetchApi<FinSummary>('/api/fins', { code });
}

/** TOPIX日足取得 */
export async function fetchTopixDaily(from: string, to: string): Promise<TopixDaily[]> {
  return fetchApi<TopixDaily>('/api/topix', { from, to });
}

/** 全銘柄の日足を日付指定で一括取得 */
export async function fetchDailyBarsByDate(date: string): Promise<DailyBar[]> {
  return fetchApi<DailyBar>('/api/bars', { date });
}

/** APIキー疎通確認 */
export async function testApiConnection(): Promise<boolean> {
  try {
    const data = await fetchStockMaster();
    return data.length > 0;
  } catch {
    return false;
  }
}
