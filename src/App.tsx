import { useState } from 'react';
import { Header } from './components/Header';
import { ApiKeyInput } from './components/ApiKeyInput';
import { ScreenerDashboard } from './components/ScreenerDashboard';
import { DetectionHistory } from './components/DetectionHistory';
import { getApiKey, getWorkerUrl } from './api/auth';

type Page = 'screener' | 'history';

function App() {
  const [ready, setReady] = useState(!!getApiKey() && !!getWorkerUrl());
  const [page, setPage] = useState<Page>('screener');

  if (!ready) {
    return <ApiKeyInput onReady={() => setReady(true)} />;
  }

  return (
    <div className="min-h-screen bg-[#1a1f2e] text-gray-100">
      <Header />
      {/* タブナビゲーション */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="flex gap-1 border-b border-gray-600">
          <button
            onClick={() => setPage('screener')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              page === 'screener'
                ? 'bg-[#232a3b] text-white border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            スクリーニング
          </button>
          <button
            onClick={() => setPage('history')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              page === 'history'
                ? 'bg-[#232a3b] text-white border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            検出履歴
          </button>
        </div>
      </div>
      <div style={{ display: page === 'screener' ? 'block' : 'none' }}>
        <ScreenerDashboard />
      </div>
      <div style={{ display: page === 'history' ? 'block' : 'none' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <DetectionHistory />
        </div>
      </div>
    </div>
  );
}

export default App;
