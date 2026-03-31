import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { DailyBar } from '../types';

interface Props {
  bars: DailyBar[];
  boxUpper?: number;
  boxLower?: number;
}

type Timeframe = 'daily' | 'weekly' | 'monthly';

const MA_CONFIGS = [
  { period: 5, color: '#f59e0b', label: '5' },
  { period: 25, color: '#3b82f6', label: '25' },
  { period: 75, color: '#ef4444', label: '75' },
];

const RCI_CONFIGS = [
  { period: 9, color: '#00e5ff', label: '9' },
  { period: 26, color: '#ff6e40', label: '26' },
  { period: 52, color: '#b388ff', label: '52' },
];

interface AggBar {
  Date: string;
  O: number;
  H: number;
  L: number;
  C: number;
  V: number;
}

/** 日付文字列をYYYYMMDD形式に正規化 */
function normalizeDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/** YYYYMMDD or YYYY-MM-DD文字列からDateオブジェクトを生成 */
function parseBarDate(dateStr: string): Date {
  const clean = normalizeDate(dateStr);
  const y = parseInt(clean.slice(0, 4));
  const m = parseInt(clean.slice(4, 6)) - 1;
  const d = parseInt(clean.slice(6, 8));
  return new Date(y, m, d);
}

function aggregateBars(bars: DailyBar[], tf: Timeframe): AggBar[] {
  if (tf === 'daily') {
    return bars.map((b) => ({
      Date: b.Date,
      O: b.AdjO,
      H: b.AdjH,
      L: b.AdjL,
      C: b.AdjC,
      V: b.AdjVo,
    }));
  }

  const groups = new Map<string, DailyBar[]>();
  for (const b of bars) {
    let key: string;
    if (tf === 'weekly') {
      const d = parseBarDate(b.Date);
      const day = d.getDay() || 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - day + 1);
      key = `${monday.getFullYear()}${String(monday.getMonth() + 1).padStart(2, '0')}${String(monday.getDate()).padStart(2, '0')}`;
    } else {
      const clean = normalizeDate(b.Date);
      key = clean.slice(0, 6);
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }

  const result: AggBar[] = [];
  for (const [, group] of groups) {
    result.push({
      Date: group[0].Date,
      O: group[0].AdjO,
      H: Math.max(...group.map((b) => b.AdjH)),
      L: Math.min(...group.map((b) => b.AdjL)),
      C: group[group.length - 1].AdjC,
      V: group.reduce((s, b) => s + b.AdjVo, 0),
    });
  }
  return result;
}

function calcMA(bars: AggBar[], period: number): (number | null)[] {
  return bars.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].C;
    return sum / period;
  });
}

function calcRCI(bars: AggBar[], period: number): (number | null)[] {
  return bars.map((_, i) => {
    if (i < period - 1) return null;
    const slice = bars.slice(i - period + 1, i + 1);
    const indexed = slice.map((b, j) => ({ dateRank: j + 1, close: b.C }));
    const sorted = [...indexed].sort((a, b) => a.close - b.close);

    let sumD2 = 0;
    for (const item of indexed) {
      const priceRank = sorted.findIndex((s) => s.dateRank === item.dateRank) + 1;
      const d = item.dateRank - priceRank;
      sumD2 += d * d;
    }
    const n = period;
    return (1 - (6 * sumD2) / (n * (n * n - 1))) * 100;
  });
}

function formatDateLabel(dateStr: string, tf: Timeframe): string {
  const clean = normalizeDate(dateStr);
  const y = clean.slice(0, 4);
  const m = clean.slice(4, 6);
  const d = clean.slice(6, 8);
  if (tf === 'monthly') return `${y}/${m}`;
  return `${m}/${d}`;
}

// Layout constants
const PRICE_RATIO = 0.55;
const VOL_RATIO = 0.15;
const RCI_RATIO = 0.22;
const GAP = 8;
const PADDING_LEFT = 65;
const PADDING_RIGHT = 10;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 22;

export function CandlestickChart({ bars, boxUpper, boxLower }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('daily');
  const [viewStart, setViewStart] = useState(-1);
  const [viewCount, setViewCount] = useState(120);
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startViewStart: number } | null>(null);
  const rafRef = useRef<number>(0);

  // Memoize heavy calculations
  const aggBars = useMemo(() => aggregateBars(bars, timeframe), [bars, timeframe]);
  const totalBars = aggBars.length;

  const effectiveStart = viewStart < 0
    ? Math.max(0, totalBars - viewCount)
    : Math.min(Math.max(0, viewStart), Math.max(0, totalBars - viewCount));

  const displayBars = useMemo(
    () => aggBars.slice(effectiveStart, effectiveStart + viewCount),
    [aggBars, effectiveStart, viewCount],
  );

  const allMA = useMemo(() => MA_CONFIGS.map((c) => calcMA(aggBars, c.period)), [aggBars]);
  const allRCI = useMemo(() => RCI_CONFIGS.map((c) => calcRCI(aggBars, c.period)), [aggBars]);

  const displayMA = useMemo(
    () => allMA.map((ma) => ma.slice(effectiveStart, effectiveStart + viewCount)),
    [allMA, effectiveStart, viewCount],
  );
  const displayRCI = useMemo(
    () => allRCI.map((rci) => rci.slice(effectiveStart, effectiveStart + viewCount)),
    [allRCI, effectiveStart, viewCount],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || displayBars.length === 0) return;

    const mousePos = mousePosRef.current;
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const totalHeight = 480;
    canvas.width = width * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${totalHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const chartW = width - PADDING_LEFT - PADDING_RIGHT;
    const usableH = totalHeight - PADDING_TOP - PADDING_BOTTOM;
    const priceH = usableH * PRICE_RATIO;
    const volH = usableH * VOL_RATIO;
    const rciH = usableH * RCI_RATIO;

    const priceTop = PADDING_TOP;
    const volTop = priceTop + priceH + GAP;
    const rciTop = volTop + volH + GAP;

    const barWidth = chartW / displayBars.length;
    const candleW = Math.max(1, barWidth * 0.65);

    const toX = (i: number) => PADDING_LEFT + i * barWidth + barWidth / 2;

    // --- Background ---
    ctx.fillStyle = '#151a27';
    ctx.fillRect(0, 0, width, totalHeight);

    // --- PRICE SECTION ---
    const allPrices: number[] = [];
    for (const b of displayBars) { allPrices.push(b.H, b.L); }
    for (const ma of displayMA) {
      for (const v of ma) { if (v !== null) allPrices.push(v); }
    }
    if (boxUpper) allPrices.push(boxUpper);
    if (boxLower) allPrices.push(boxLower);

    if (allPrices.length === 0) return;

    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const rangeP = maxP - minP || 1;
    const toY = (price: number) => priceTop + priceH - ((price - minP) / rangeP) * priceH;

    // Price grid
    ctx.strokeStyle = '#252d40';
    ctx.lineWidth = 0.5;
    const gridCount = 5;
    for (let i = 0; i <= gridCount; i++) {
      const y = priceTop + (priceH / gridCount) * i;
      ctx.beginPath();
      ctx.moveTo(PADDING_LEFT, y);
      ctx.lineTo(width - PADDING_RIGHT, y);
      ctx.stroke();
      const price = maxP - (rangeP / gridCount) * i;
      ctx.fillStyle = '#8896b3';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(price.toFixed(0), PADDING_LEFT - 5, y + 3);
    }

    // Box range
    if (boxUpper && boxLower) {
      const y1 = toY(boxUpper);
      const y2 = toY(boxLower);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.fillRect(PADDING_LEFT, y1, chartW, y2 - y1);
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(PADDING_LEFT, y1); ctx.lineTo(width - PADDING_RIGHT, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PADDING_LEFT, y2); ctx.lineTo(width - PADDING_RIGHT, y2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Candlesticks
    for (let i = 0; i < displayBars.length; i++) {
      const bar = displayBars[i];
      const x = toX(i);
      const oY = toY(bar.O);
      const cY = toY(bar.C);
      const hY = toY(bar.H);
      const lY = toY(bar.L);
      const isBull = bar.C >= bar.O;
      const color = isBull ? '#26a69a' : '#ef5350';

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;

      ctx.beginPath(); ctx.moveTo(x, hY); ctx.lineTo(x, lY); ctx.stroke();

      const bodyTop = Math.min(oY, cY);
      const bodyH = Math.max(1, Math.abs(cY - oY));
      if (isBull) {
        ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyH);
      } else {
        ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
      }
    }

    // Moving averages
    for (let mi = 0; mi < MA_CONFIGS.length; mi++) {
      const ma = displayMA[mi];
      ctx.strokeStyle = MA_CONFIGS[mi].color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < ma.length; i++) {
        const v = ma[i];
        if (v === null) continue;
        const x = toX(i);
        const y = toY(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      }
      ctx.stroke();
    }

    // --- VOLUME SECTION ---
    ctx.strokeStyle = '#252d40';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PADDING_LEFT, volTop); ctx.lineTo(width - PADDING_RIGHT, volTop); ctx.stroke();

    let maxVol = 1;
    for (const b of displayBars) { if (b.V > maxVol) maxVol = b.V; }
    for (let i = 0; i < displayBars.length; i++) {
      const bar = displayBars[i];
      const x = toX(i);
      const h = (bar.V / maxVol) * (volH - 4);
      const isBull = bar.C >= bar.O;
      ctx.fillStyle = isBull ? 'rgba(38,166,154,0.6)' : 'rgba(239,83,80,0.6)';
      ctx.fillRect(x - candleW / 2, volTop + volH - h, candleW, h);
    }

    ctx.fillStyle = '#6b7b94';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Vol', PADDING_LEFT - 5, volTop + 10);

    // --- RCI SECTION ---
    ctx.strokeStyle = '#252d40';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PADDING_LEFT, rciTop); ctx.lineTo(width - PADDING_RIGHT, rciTop); ctx.stroke();

    const rciToY = (val: number) => rciTop + rciH / 2 - (val / 100) * (rciH / 2);
    ctx.strokeStyle = '#252d40';
    ctx.lineWidth = 0.5;
    for (const v of [80, 0, -80]) {
      const y = rciToY(v);
      ctx.beginPath(); ctx.moveTo(PADDING_LEFT, y); ctx.lineTo(width - PADDING_RIGHT, y); ctx.stroke();
      ctx.fillStyle = '#6b7b94';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${v}`, PADDING_LEFT - 5, y + 3);
    }

    for (let ri = 0; ri < RCI_CONFIGS.length; ri++) {
      const rci = displayRCI[ri];
      ctx.strokeStyle = RCI_CONFIGS[ri].color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < rci.length; i++) {
        const v = rci[i];
        if (v === null) continue;
        const x = toX(i);
        const y = rciToY(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      }
      ctx.stroke();
    }

    ctx.fillStyle = '#6b7b94';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('RCI', PADDING_LEFT - 30, rciTop + 10);

    // --- DATE LABELS ---
    ctx.fillStyle = '#8896b3';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.floor(displayBars.length / 8));
    for (let i = 0; i < displayBars.length; i += labelStep) {
      const label = formatDateLabel(displayBars[i].Date, timeframe);
      ctx.fillText(label, toX(i), totalHeight - 5);
    }

    // --- CROSSHAIR ---
    if (mousePos) {
      const mx = mousePos.x;
      const my = mousePos.y;

      const idx = Math.round((mx - PADDING_LEFT - barWidth / 2) / barWidth);
      if (idx >= 0 && idx < displayBars.length) {
        const cx = toX(idx);

        ctx.strokeStyle = 'rgba(200, 210, 230, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(cx, PADDING_TOP); ctx.lineTo(cx, totalHeight - PADDING_BOTTOM); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(PADDING_LEFT, my); ctx.lineTo(width - PADDING_RIGHT, my); ctx.stroke();
        ctx.setLineDash([]);

        const bar = displayBars[idx];
        const dateLabel = formatDateLabel(bar.Date, timeframe);
        const change = bar.C - bar.O;
        const changePct = ((change / bar.O) * 100).toFixed(2);
        const changeSign = change >= 0 ? '+' : '';

        // Tooltip
        const tooltipW = 190;
        const tooltipH = 115;
        const tooltipX = cx + 15 > width - tooltipW - 10 ? cx - tooltipW - 10 : cx + 15;
        const tooltipY = Math.min(Math.max(my, PADDING_TOP), totalHeight - tooltipH - 10);

        ctx.fillStyle = 'rgba(25, 32, 48, 0.92)';
        ctx.strokeStyle = '#3a4560';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // roundRect fallback
        if (ctx.roundRect) {
          ctx.roundRect(tooltipX, tooltipY, tooltipW, tooltipH, 4);
        } else {
          ctx.rect(tooltipX, tooltipY, tooltipW, tooltipH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#c8d2e6';
        let ty = tooltipY + 16;
        ctx.fillText(`日付: ${dateLabel}`, tooltipX + 8, ty); ty += 16;
        ctx.fillText(`始値: ${bar.O.toLocaleString()}  高値: ${bar.H.toLocaleString()}`, tooltipX + 8, ty); ty += 16;
        ctx.fillText(`安値: ${bar.L.toLocaleString()}  終値: ${bar.C.toLocaleString()}`, tooltipX + 8, ty); ty += 16;
        ctx.fillStyle = change >= 0 ? '#26a69a' : '#ef5350';
        ctx.fillText(`変化: ${changeSign}${change.toFixed(0)} (${changeSign}${changePct}%)`, tooltipX + 8, ty); ty += 16;
        ctx.fillStyle = '#8896b3';
        ctx.fillText(`出来高: ${bar.V.toLocaleString()}`, tooltipX + 8, ty); ty += 16;

        const rciVals = displayRCI.map((rci) => rci[idx]);
        if (rciVals.some((v) => v !== null)) {
          const rciText = RCI_CONFIGS.map((c, ri) =>
            rciVals[ri] !== null ? `${c.label}: ${rciVals[ri]!.toFixed(0)}` : '',
          ).filter(Boolean).join('  ');
          ctx.fillText(`RCI ${rciText}`, tooltipX + 8, ty);
        }
      }
    }
  }, [displayBars, displayMA, displayRCI, boxUpper, boxLower, timeframe]);

  // Draw on data change
  useEffect(() => {
    draw();
  }, [draw]);

  // Reset view when timeframe changes
  useEffect(() => {
    setViewStart(-1);
    const defaultCount = timeframe === 'daily' ? 120 : timeframe === 'weekly' ? 104 : 60;
    setViewCount(defaultCount);
  }, [timeframe]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // Native wheel event to prevent page scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? 20 : -20;
      setViewCount((prev) => {
        const next = Math.max(20, Math.min(totalBars, prev + delta));
        setViewStart((vs) => {
          if (vs < 0) return vs;
          const center = vs + prev / 2;
          return Math.max(0, Math.round(center - next / 2));
        });
        return next;
      });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [totalBars]);

  // Mouse move uses ref + requestAnimationFrame (no React re-renders)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX;
      const chartW = rect.width - PADDING_LEFT - PADDING_RIGHT;
      const bw = chartW / viewCount;
      const barDelta = Math.round(-dx / bw);
      const newStart = Math.max(0, Math.min(totalBars - viewCount, dragRef.current.startViewStart + barDelta));
      setViewStart(newStart);
    } else {
      // Redraw only for crosshair (via rAF, no state change)
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => draw());
    }
  }, [viewCount, totalBars, draw]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startViewStart: effectiveStart,
    };
  }, [effectiveStart]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mousePosRef.current = null;
    dragRef.current = null;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => draw());
  }, [draw]);

  const tfLabel = (tf: Timeframe) => tf === 'daily' ? '日足' : tf === 'weekly' ? '週足' : '月足';

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(['daily', 'weekly', 'monthly'] as Timeframe[]).map((tf) => (
            <button
              type="button"
              key={tf}
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setTimeframe(tf); }}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                timeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#2d3548] text-gray-300 hover:bg-[#3a4560]'
              }`}
            >
              {tfLabel(tf)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          {MA_CONFIGS.map((c) => (
            <span key={c.period} className="flex items-center gap-1">
              <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: c.color }} />
              <span className="text-gray-300">{c.label}MA</span>
            </span>
          ))}
          <span className="text-gray-500">|</span>
          {RCI_CONFIGS.map((c) => (
            <span key={c.period} className="flex items-center gap-1">
              <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: c.color }} />
              <span className="text-gray-300">RCI{c.label}</span>
            </span>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto">
          {displayBars.length}/{totalBars}本 | ドラッグ:移動 ホイール:拡縮
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="w-full select-none"
        style={{ cursor: dragRef.current ? 'grabbing' : 'crosshair' }}
      >
        <canvas
          ref={canvasRef}
          className="rounded"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />
      </div>
    </div>
  );
}
