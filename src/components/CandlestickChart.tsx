import { useEffect, useRef, useState, useCallback } from 'react';
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
    const d = new Date(b.Date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
    let key: string;
    if (tf === 'weekly') {
      // ISO week: Monday-based
      const day = d.getDay() || 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - day + 1);
      key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    } else {
      key = b.Date.slice(0, 6); // YYYYMM
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
    // Date rank: 1=oldest ... n=newest (already sorted by date)
    // Price rank: sort by close ascending, rank 1=lowest
    const indexed = slice.map((b, j) => ({ dateRank: j + 1, close: b.C }));
    const sorted = [...indexed].sort((a, b) => a.close - b.close);
    const priceRankMap = new Map<number, number>();
    sorted.forEach((item, j) => {
      // Handle ties by averaging ranks
      if (!priceRankMap.has(item.dateRank)) {
        priceRankMap.set(item.dateRank, j + 1);
      }
    });

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
  const clean = dateStr.replace(/-/g, '');
  const y = clean.slice(0, 4);
  const m = clean.slice(4, 6);
  const d = clean.slice(6, 8);
  if (tf === 'monthly') return `${y}/${m}`;
  return `${m}/${d}`;
}

// Sections layout
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
  const [viewStart, setViewStart] = useState(-1); // -1 = auto (show latest)
  const [viewCount, setViewCount] = useState(120);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startViewStart: number } | null>(null);

  const aggBars = aggregateBars(bars, timeframe);
  const totalBars = aggBars.length;

  // Compute effective viewStart
  const effectiveStart = viewStart < 0
    ? Math.max(0, totalBars - viewCount)
    : Math.min(Math.max(0, viewStart), Math.max(0, totalBars - viewCount));

  const displayBars = aggBars.slice(effectiveStart, effectiveStart + viewCount);

  // Pre-calculate indicators on full data, then slice
  const allMA = MA_CONFIGS.map((c) => calcMA(aggBars, c.period));
  const allRCI = RCI_CONFIGS.map((c) => calcRCI(aggBars, c.period));

  const displayMA = allMA.map((ma) => ma.slice(effectiveStart, effectiveStart + viewCount));
  const displayRCI = allRCI.map((rci) => rci.slice(effectiveStart, effectiveStart + viewCount));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || displayBars.length === 0) return;

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
    displayBars.forEach((b) => { allPrices.push(b.H, b.L); });
    displayMA.forEach((ma) => ma.forEach((v) => { if (v !== null) allPrices.push(v); }));
    if (boxUpper) allPrices.push(boxUpper);
    if (boxLower) allPrices.push(boxLower);
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
    displayBars.forEach((bar, i) => {
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

      // Wick
      ctx.beginPath(); ctx.moveTo(x, hY); ctx.lineTo(x, lY); ctx.stroke();

      // Body
      const bodyTop = Math.min(oY, cY);
      const bodyH = Math.max(1, Math.abs(cY - oY));
      if (isBull) {
        ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyH);
      } else {
        ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
      }
    });

    // Moving averages
    MA_CONFIGS.forEach((config, mi) => {
      const ma = displayMA[mi];
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let started = false;
      ma.forEach((v, i) => {
        if (v === null) return;
        const x = toX(i);
        const y = toY(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      });
      ctx.stroke();
    });

    // --- VOLUME SECTION ---
    // Section border
    ctx.strokeStyle = '#252d40';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PADDING_LEFT, volTop); ctx.lineTo(width - PADDING_RIGHT, volTop); ctx.stroke();

    const maxVol = Math.max(...displayBars.map((b) => b.V), 1);
    displayBars.forEach((bar, i) => {
      const x = toX(i);
      const h = (bar.V / maxVol) * (volH - 4);
      const isBull = bar.C >= bar.O;
      ctx.fillStyle = isBull ? 'rgba(38,166,154,0.6)' : 'rgba(239,83,80,0.6)';
      ctx.fillRect(x - candleW / 2, volTop + volH - h, candleW, h);
    });

    // Vol label
    ctx.fillStyle = '#6b7b94';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Vol', PADDING_LEFT - 5, volTop + 10);

    // --- RCI SECTION ---
    ctx.strokeStyle = '#252d40';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(PADDING_LEFT, rciTop); ctx.lineTo(width - PADDING_RIGHT, rciTop); ctx.stroke();

    // RCI grid: +80, 0, -80
    const rciToY = (val: number) => rciTop + rciH / 2 - (val / 100) * (rciH / 2);
    ctx.strokeStyle = '#252d40';
    ctx.lineWidth = 0.5;
    [80, 0, -80].forEach((v) => {
      const y = rciToY(v);
      ctx.beginPath(); ctx.moveTo(PADDING_LEFT, y); ctx.lineTo(width - PADDING_RIGHT, y); ctx.stroke();
      ctx.fillStyle = '#6b7b94';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${v}`, PADDING_LEFT - 5, y + 3);
    });

    // RCI lines
    RCI_CONFIGS.forEach((config, ri) => {
      const rci = displayRCI[ri];
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let started = false;
      rci.forEach((v, i) => {
        if (v === null) return;
        const x = toX(i);
        const y = rciToY(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      });
      ctx.stroke();
    });

    // RCI label
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

      // Find closest bar index
      const idx = Math.round((mx - PADDING_LEFT - barWidth / 2) / barWidth);
      if (idx >= 0 && idx < displayBars.length) {
        const cx = toX(idx);

        // Vertical line across all sections
        ctx.strokeStyle = 'rgba(200, 210, 230, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(cx, PADDING_TOP); ctx.lineTo(cx, totalHeight - PADDING_BOTTOM); ctx.stroke();
        ctx.setLineDash([]);

        // Horizontal line in active section
        ctx.strokeStyle = 'rgba(200, 210, 230, 0.3)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(PADDING_LEFT, my); ctx.lineTo(width - PADDING_RIGHT, my); ctx.stroke();
        ctx.setLineDash([]);

        // Info tooltip
        const bar = displayBars[idx];
        const dateLabel = formatDateLabel(bar.Date, timeframe);
        const change = bar.C - bar.O;
        const changePct = ((change / bar.O) * 100).toFixed(2);
        const changeSign = change >= 0 ? '+' : '';

        // Background for tooltip
        const tooltipX = cx + 15 > width - 200 ? cx - 205 : cx + 15;
        const tooltipY = Math.min(my, totalHeight - 110);
        ctx.fillStyle = 'rgba(25, 32, 48, 0.92)';
        ctx.strokeStyle = '#3a4560';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tooltipX, tooltipY, 190, 100, 4);
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
        ctx.fillText(`出来高: ${bar.V.toLocaleString()}`, tooltipX + 8, ty);

        // RCI values at this index
        const rciVals = displayRCI.map((rci) => rci[idx]);
        if (rciVals.some((v) => v !== null)) {
          ty += 16;
          const rciText = RCI_CONFIGS.map((c, ri) =>
            rciVals[ri] !== null ? `${c.label}: ${rciVals[ri]!.toFixed(0)}` : '',
          ).filter(Boolean).join('  ');
          ctx.fillStyle = '#8896b3';
          ctx.fillText(`RCI ${rciText}`, tooltipX + 8, ty);
        }
      }
    }
  }, [displayBars, displayMA, displayRCI, mousePos, boxUpper, boxLower, timeframe]);

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

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 20 : -20;
    setViewCount((prev) => {
      const next = Math.max(20, Math.min(totalBars, prev + delta));
      // Adjust viewStart to keep center point
      if (viewStart >= 0) {
        const center = viewStart + prev / 2;
        setViewStart(Math.max(0, Math.round(center - next / 2)));
      }
      return next;
    });
  }, [totalBars, viewStart]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startViewStart: effectiveStart,
    };
  }, [effectiveStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX;
      const chartW = rect.width - PADDING_LEFT - PADDING_RIGHT;
      const barWidth = chartW / viewCount;
      const barDelta = Math.round(-dx / barWidth);
      const newStart = Math.max(0, Math.min(totalBars - viewCount, dragRef.current.startViewStart + barDelta));
      setViewStart(newStart);
    }
  }, [viewCount, totalBars]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
    dragRef.current = null;
  }, []);

  const tfLabel = (tf: Timeframe) => tf === 'daily' ? '日足' : tf === 'weekly' ? '週足' : '月足';

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {(['daily', 'weekly', 'monthly'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
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
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />
      </div>
    </div>
  );
}
