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
 * トークンバケット型レートリミッター
 * J-Quants Standard: 120件/分 = 2件/秒
 * 少し余裕を持たせて1.8件/秒（333ms間隔×2並列）で制御
 */
class RateLimiter {
  private queue: (() => void)[] = [];
  private tokens: number;
  private maxTokens: number;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(requestsPerMinute: number) {
    // 同時2リクエスト、トークン補充で流量制御
    this.maxTokens = 2;
    this.tokens = 2;
    this.intervalMs = Math.ceil(60000 / requestsPerMinute);
  }

  private startRefill() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.tokens < this.maxTokens) {
        this.tokens++;
        const next = this.queue.shift();
        if (next) {
          this.tokens--;
          next();
        }
      }
      // キューもトークンも空なら停止
      if (this.queue.length === 0 && this.tokens >= this.maxTokens) {
        clearInterval(this.timer!);
        this.timer = null;
      }
    }, this.intervalMs);
  }

  acquire(): Promise<void> {
    if (this.tokens > 0) {
      this.tokens--;
      this.startRefill();
      return Promise.resolve();
    }
    this.startRefill();
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    // トークンバケット方式では release 不要（時間ベースで補充）
  }
}

// J-Quants Standard: 120件/分
const limiter = new RateLimiter(110); // 少し余裕を持たせる

async function fetchApi<T>(path: string, params?: Record<string, string>): Promise<T[]> {
  const workerUrl = getWorkerUrl();
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('APIキーが設定されていません');
  if (!workerUrl) throw new Error('Worker URLが設定されていません');

  const url = new URL(workerUrl + path);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  await limiter.acquire();
  try {
    const resp = await fetch(url.toString(), {
      headers: { 'X-API-KEY': apiKey },
      cache: 'no-store',
    });

    // 429の場合: 1回だけ短時間待ってリトライ
    if (resp.status === 429) {
      await new Promise((r) => setTimeout(r, 1000));
      const resp2 = await fetch(url.toString(), {
        headers: { 'X-API-KEY': apiKey },
        cache: 'no-store',
      });
      if (!resp2.ok) {
        const text = await resp2.text();
        throw new JQuantsApiError(resp2.status, `API error ${resp2.status}: ${text}`);
      }
      const json = await resp2.json() as { data: T[] };
      return json.data;
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new JQuantsApiError(resp.status, `API error ${resp.status}: ${text}`);
    }

    const json = await resp.json() as { data: T[] };
    return json.data;
  } finally {
    limiter.release();
  }
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
