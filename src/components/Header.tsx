export function Header() {
  return (
    <header className="bg-[#151a27] text-white">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">NEXUS スクリーナー</h1>
          <span className="text-xs text-blue-300 bg-blue-900/50 px-2 py-0.5 rounded">v3.2.1</span>
        </div>
        <div className="text-xs text-gray-300">買い集め検出</div>
      </div>
      <div className="bg-yellow-900/40 border-t border-yellow-700/40">
        <div className="max-w-7xl mx-auto px-4 py-1.5">
          <p className="text-xs text-yellow-200/90">
            本ツールは投資助言ではありません。スクリーニング結果は参考情報であり、最終的な売買判断・責任は利用者ご自身に帰属します。
          </p>
        </div>
      </div>
    </header>
  );
}
