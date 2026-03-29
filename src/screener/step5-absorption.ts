import type { DailyBar, BoxDefinition, AbsorptionDay, AbsorptionResult } from '../types';
import { CONFIG } from '../config';

/** Step 5: 吸収日の判定と吸収フェーズ判定 */
export function detectAbsorption(
  bars: DailyBar[],
  box: BoxDefinition,
): AbsorptionResult {
  const lookback60 = bars.slice(-CONFIG.BOX_LOOKBACK_DAYS);
  const volumes60 = lookback60.map((b) => b.AdjVo);
  const sortedVolumes = [...volumes60].sort((a, b) => b - a);

  // V20 = 直近20営業日の平均出来高
  const last20 = bars.slice(-CONFIG.V20_PERIOD);
  const v20 = last20.reduce((s, b) => s + b.AdjVo, 0) / last20.length;

  // 出来高パーセンタイル閾値
  const quietVolThreshold30 = sortedVolumes[
    Math.max(0, Math.floor(volumes60.length * CONFIG.QUIET_VOLUME_PERCENTILE) - 1)
  ];
  const shakeoutVolThreshold15 = sortedVolumes[
    Math.max(0, Math.floor(volumes60.length * CONFIG.SHAKEOUT_VOLUME_PERCENTILE) - 1)
  ];

  // 吸収ウィンドウ: 直近10-15営業日
  const windowMax = CONFIG.ABSORPTION_WINDOW_MAX;
  const windowBars = bars.slice(-windowMax);

  const absorptionDays: AbsorptionDay[] = [];
  let boxBreakDetected = false;

  for (let i = 0; i < windowBars.length; i++) {
    const bar = windowBars[i];
    const vol = bar.AdjVo;
    const close = bar.AdjC;

    // 箱崩れ判定
    if (close < box.lower && vol >= CONFIG.BOX_BREAK_VOLUME_RATIO * v20) {
      boxBreakDetected = true;
      absorptionDays.length = 0; // リセット
      continue;
    }

    const isInBox = close >= box.lower && close <= box.upper;
    const volRatioQuiet = vol >= CONFIG.QUIET_VOLUME_RATIO * v20;
    const volPercQuiet = vol >= quietVolThreshold30;
    const volRatioShake = vol >= CONFIG.SHAKEOUT_VOLUME_RATIO * v20;
    const volPercShake = vol >= shakeoutVolThreshold15;

    // Quiet吸収日
    if ((volRatioQuiet || volPercQuiet) && isInBox) {
      absorptionDays.push({ date: bar.Date, type: 'quiet', volume: vol, close });
      continue;
    }

    // Shakeout吸収日
    if (volRatioShake || volPercShake) {
      if (isInBox) {
        absorptionDays.push({ date: bar.Date, type: 'shakeout', volume: vol, close });
        continue;
      }
      // 翌営業日に箱内に回帰するか確認
      const nextBar = i < windowBars.length - 1 ? windowBars[i + 1] : null;
      if (nextBar && nextBar.AdjC >= box.lower && nextBar.AdjC <= box.upper) {
        absorptionDays.push({ date: bar.Date, type: 'shakeout', volume: vol, close });
      }
    }
  }

  const quietCount = absorptionDays.filter((d) => d.type === 'quiet').length;
  const shakeoutCount = absorptionDays.filter((d) => d.type === 'shakeout').length;

  // 一次合格判定: A / B / C のいずれか
  const condA = quietCount >= 2;
  const condB = quietCount >= 1 && shakeoutCount >= 1;
  const condC = shakeoutCount >= 2;
  const passed = condA || condB || condC;

  return {
    passed,
    quietCount,
    shakeoutCount,
    absorptionDays,
    boxBreakDetected,
    reabsorptionDetected: false, // step6で判定
  };
}

/** 再吸収パターンの検出（過去60日以内に箱崩れ後の再吸収） */
export function detectReabsorption(
  bars: DailyBar[],
  box: BoxDefinition,
): boolean {
  const lookback = bars.slice(-CONFIG.BOX_LOOKBACK_DAYS);
  const last20 = bars.slice(-CONFIG.V20_PERIOD);
  const v20 = last20.reduce((s, b) => s + b.AdjVo, 0) / last20.length;

  let boxBroken = false;
  let reabsorbing = false;
  let reabsorptionQuiet = 0;

  for (const bar of lookback) {
    const close = bar.AdjC;
    const vol = bar.AdjVo;
    const isInBox = close >= box.lower && close <= box.upper;

    if (!boxBroken) {
      // 箱崩れを探す
      if (close < box.lower && vol >= CONFIG.BOX_BREAK_VOLUME_RATIO * v20) {
        boxBroken = true;
      }
    } else if (!reabsorbing) {
      // 箱崩れ後に箱内に戻ったら再吸収開始
      if (isInBox) {
        reabsorbing = true;
        reabsorptionQuiet = 1;
      }
    } else {
      // 再吸収中に吸収日をカウント
      if (isInBox && vol >= CONFIG.QUIET_VOLUME_RATIO * v20) {
        reabsorptionQuiet++;
      }
    }
  }

  return boxBroken && reabsorptionQuiet >= 2;
}
