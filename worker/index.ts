/**
 * Cloudflare Worker: J-Quants APIプロキシ
 * フロントエンドからのリクエストをJ-Quants APIに転送する
 */

const JQUANTS_BASE = 'https://api.jquants.com/v2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY',
};

interface Env {}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const apiKey = request.headers.get('X-API-KEY');

    if (!apiKey) {
      return jsonResponse({ error: 'X-API-KEY header is required' }, 401);
    }

    let jquantsPath: string;
    const params = url.searchParams;

    if (path === '/api/master') {
      jquantsPath = '/equities/master';
    } else if (path === '/api/bars') {
      jquantsPath = '/equities/bars/daily';
    } else if (path === '/api/fins') {
      jquantsPath = '/fins/summary';
    } else if (path === '/api/topix') {
      jquantsPath = '/indices/bars/daily/topix';
    } else {
      return jsonResponse({ error: 'Unknown endpoint' }, 404);
    }

    const jquantsUrl = new URL(JQUANTS_BASE + jquantsPath);
    params.forEach((value, key) => {
      jquantsUrl.searchParams.set(key, value);
    });

    try {
      let allData: unknown[] = [];
      let nextUrl: string | null = jquantsUrl.toString();

      while (nextUrl) {
        const resp = await fetch(nextUrl, {
          headers: { 'X-API-KEY': apiKey },
        });

        if (!resp.ok) {
          const text = await resp.text();
          return jsonResponse(
            { error: `J-Quants API error: ${resp.status}`, detail: text },
            resp.status
          );
        }

        const json = (await resp.json()) as Record<string, unknown>;
        const dataKey = Object.keys(json).find(
          (k) => k !== 'pagination_key'
        );
        if (dataKey && Array.isArray(json[dataKey])) {
          allData = allData.concat(json[dataKey] as unknown[]);
        }

        const paginationKey = json.pagination_key as string | undefined;
        if (paginationKey) {
          const nextUrlObj = new URL(jquantsUrl.toString());
          nextUrlObj.searchParams.set('pagination_key', paginationKey);
          nextUrl = nextUrlObj.toString();
        } else {
          nextUrl = null;
        }
      }

      return jsonResponse({ data: allData });
    } catch (err) {
      return jsonResponse(
        { error: 'Proxy error', detail: String(err) },
        500
      );
    }
  },
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}
