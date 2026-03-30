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

/**
 * シリアルキュー型レートリミッター
 * J-Quants Standard: 120件/分
 * Workerのページネーションで実リクエストが増えるため、クライアント側60件/分に制限
 */
class SerialQueue {
  private queue: { execute: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];
  private running = false;
  private intervalMs: number;

  constructor(requestsPerMinute: number) {
    this.intervalMs = Math.ceil(60000 / requestsPerMinute);
  }

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: fn as () => Promise<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.process();
    });
  }

  private async process() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const result = await item.execute();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
      // 次のリクエストまで待機
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, this.intervalMs));
      }
    }

    this.running = false;
  }
}

// 60件/分 = 1秒に1件（Workerページネーション考慮）
const apiQueue = new SerialQueue(60);

async function rawFetch<T>(url: string, apiKey: string): Promise<T[]> {
  const resp = await fetch(url, {
    headers: { 'X-API-KEY': apiKey },
    cache: 'no-store',
  });

  // 429の場合: 2秒待って1回リトライ
  if (resp.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    const resp2 = await fetch(url, {
      headers: { 'X-API-KEY': apiKey },
      cache: 'no-store',
    });
    if (!resp2.ok) {
      const text = await resp2.text();
      throw new JQuantsApiError(resp2.status, `API error ${resp2.status}: ${text}`);
    }
    return (await resp2.json() as { data: T[] }).data;
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new JQuantsApiError(resp.status, `API error ${resp.status}: ${text}`);
  }

  return (await resp.json() as { data: T[] }).data;
}

function fetchApi<T>(path: string, params?: Record<string, string>): Promise<T[]> {
  const workerUrl = getWorkerUrl();
  const apiKey = getApiKey();
  if (!apiKey) return Promise.reject(new Error('APIキーが設定されていません'));
  if (!workerUrl) return Promise.reject(new Error('Worker URLが設定されていません'));

  const url = new URL(workerUrl + path);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  return apiQueue.enqueue(() => rawFetch<T>(url.toString(), apiKey));
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
