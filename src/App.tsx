import { useState } from 'react';
import { Header } from './components/Header';
import { ApiKeyInput } from './components/ApiKeyInput';
import { ScreenerDashboard } from './components/ScreenerDashboard';
import { getApiKey, getWorkerUrl } from './api/auth';

function App() {
  const [ready, setReady] = useState(!!getApiKey() && !!getWorkerUrl());

  if (!ready) {
    return <ApiKeyInput onReady={() => setReady(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Header />
      <ScreenerDashboard />
    </div>
  );
}

export default App;
