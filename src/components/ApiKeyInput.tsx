import { useState } from 'react';
import { getApiKey, setApiKey, getWorkerUrl, setWorkerUrl } from '../api/auth';
import { testApiConnection } from '../api/jquants';

interface Props {
  onReady: () => void;
}

export function ApiKeyInput({ onReady }: Props) {
  const [apiKey, setApiKeyState] = useState(getApiKey() || '');
  const [workerUrl, setWorkerUrlState] = useState(getWorkerUrl() || '');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleTest = async () => {
    if (!apiKey.trim() || !workerUrl.trim()) {
      setError('APIキーとWorker URLを入力してください');
      return;
    }

    setTesting(true);
    setError(null);
    setApiKey(apiKey.trim());
    setWorkerUrl(workerUrl.trim());

    try {
      const ok = await testApiConnection();
      if (ok) {
        setSuccess(true);
        setTimeout(() => onReady(), 500);
      } else {
        setError('API接続に失敗しました。APIキーとWorker URLを確認してください。');
      }
    } catch (err) {
      setError(`接続エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSkip = () => {
    if (apiKey.trim() && workerUrl.trim()) {
      setApiKey(apiKey.trim());
      setWorkerUrl(workerUrl.trim());
      onReady();
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg p-8 w-full max-w-md shadow-xl border border-gray-800">
        <h2 className="text-2xl font-bold text-white mb-2">NEXUS スクリーナー</h2>
        <p className="text-gray-400 text-sm mb-6">
          J-Quants APIキーとCloudflare Worker URLを設定してください
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Cloudflare Worker URL
            </label>
            <input
              type="url"
              value={workerUrl}
              onChange={(e) => setWorkerUrlState(e.target.value)}
              placeholder="https://your-worker.workers.dev"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              J-Quants APIキー
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKeyState(e.target.value)}
              placeholder="your-api-key"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              キーはブラウザのlocalStorageにのみ保存されます
            </p>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded p-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-900/30 border border-green-700 rounded p-3">
              <p className="text-green-300 text-sm">接続成功</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded px-4 py-2 text-sm font-medium transition-colors"
            >
              {testing ? '接続テスト中...' : '接続テスト & 開始'}
            </button>
            <button
              onClick={handleSkip}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-4 py-2 text-sm transition-colors"
            >
              スキップ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
