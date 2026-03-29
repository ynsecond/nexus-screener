import { useState, useEffect } from 'react';
import type { ExclusionList } from '../types';

const STORAGE_KEY = 'nexus_exclusion_list';

export function useExclusionList() {
  const [list, setList] = useState<ExclusionList>({ tob: [], delisting: [], fraud: [] });

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setList(JSON.parse(stored));
      } catch {
        // fallback to default
      }
    }
  }, []);

  const save = (newList: ExclusionList) => {
    setList(newList);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
  };

  return { list, save };
}

interface Props {
  list: ExclusionList;
  onSave: (list: ExclusionList) => void;
  onClose: () => void;
}

export function ExclusionManager({ list, onSave, onClose }: Props) {
  const [tob, setTob] = useState(list.tob.join('\n'));
  const [delisting, setDelisting] = useState(list.delisting.join('\n'));
  const [fraud, setFraud] = useState(list.fraud.join('\n'));

  const handleSave = () => {
    const parse = (s: string) =>
      s.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    onSave({
      tob: parse(tob),
      delisting: parse(delisting),
      fraud: parse(fraud),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg p-6 w-full max-w-lg border border-gray-700 max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-white mb-4">除外リスト管理</h3>
        <p className="text-xs text-gray-400 mb-4">
          銘柄コード（5桁）を1行に1つずつ入力してください
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              TOB/MBO/公開買付中
            </label>
            <textarea
              value={tob}
              onChange={(e) => setTob(e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:border-blue-500 focus:outline-none"
              placeholder="例: 12340"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              上場廃止整理銘柄
            </label>
            <textarea
              value={delisting}
              onChange={(e) => setDelisting(e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              不正会計銘柄
            </label>
            <textarea
              value={fraud}
              onChange={(e) => setFraud(e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
          >
            保存
          </button>
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-4 py-2 text-sm transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
