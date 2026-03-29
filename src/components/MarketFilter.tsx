import type { MarketCondition } from '../types';

interface Props {
  condition: MarketCondition | null;
}

export function MarketFilter({ condition }: Props) {
  if (!condition) return null;

  const colorMap = {
    '通常': 'bg-green-900/30 border-green-700 text-green-300',
    '慎重': 'bg-yellow-900/30 border-yellow-700 text-yellow-300',
    '暴落': 'bg-red-900/30 border-red-700 text-red-300',
  };

  const modeLabel = {
    '通常': `通常モード（${condition.scoreThreshold}点以上を優先確認）`,
    '慎重': `慎重モード（${condition.scoreThreshold}点以上のみ確認）`,
    '暴落': '暴落局面（打診禁止・スクリーニング継続のみ）',
  };

  return (
    <div className={`rounded-lg p-3 border ${colorMap[condition.mode]}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0">
        <div>
          <span className="text-sm font-medium">地合い: {modeLabel[condition.mode]}</span>
        </div>
        <div className="text-xs sm:text-sm">
          TOPIX 25日線乖離率: <span className="font-mono">{condition.topix25maDeviation.toFixed(2)}%</span>
        </div>
      </div>
    </div>
  );
}
