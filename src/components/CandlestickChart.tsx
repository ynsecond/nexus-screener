import { useEffect, useRef } from 'react';
import type { DailyBar } from '../types';

interface Props {
  bars: DailyBar[];
  boxUpper?: number;
  boxLower?: number;
}

const MA_CONFIGS = [
  { period: 5, color: '#f59e0b', label: '5日' },
  { period: 25, color: '#3b82f6', label: '25日' },
  { period: 75, color: '#ef4444', label: '75日' },
];

function calcMA(bars: DailyBar[], period: number): (number | null)[] {
  return bars.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].AdjC;
    return sum / period;
  });
}

export function CandlestickChart({ bars, boxUpper, boxLower }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || bars.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = 300;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Use last 60 bars max
    const displayBars = bars.slice(-60);
    const maData = MA_CONFIGS.map((c) => calcMA(bars, c.period).slice(-60));

    const allPrices: number[] = [];
    displayBars.forEach((b) => {
      allPrices.push(b.AdjH, b.AdjL);
    });
    maData.forEach((ma) => ma.forEach((v) => { if (v !== null) allPrices.push(v); }));
    if (boxUpper) allPrices.push(boxUpper);
    if (boxLower) allPrices.push(boxLower);

    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice || 1;

    const paddingLeft = 60;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 25;
    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;

    const barWidth = chartW / displayBars.length;
    const candleW = Math.max(1, barWidth * 0.6);

    const toX = (i: number) => paddingLeft + i * barWidth + barWidth / 2;
    const toY = (price: number) => paddingTop + chartH - ((price - minPrice) / priceRange) * chartH;

    // Background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 0.5;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = paddingTop + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      const price = maxPrice - (priceRange / gridLines) * i;
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(price.toFixed(0), paddingLeft - 5, y + 3);
    }

    // Box range
    if (boxUpper && boxLower) {
      const boxY1 = toY(boxUpper);
      const boxY2 = toY(boxLower);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      ctx.fillRect(paddingLeft, boxY1, chartW, boxY2 - boxY1);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(paddingLeft, boxY1);
      ctx.lineTo(width - paddingRight, boxY1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(paddingLeft, boxY2);
      ctx.lineTo(width - paddingRight, boxY2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Candlesticks
    displayBars.forEach((bar, i) => {
      const x = toX(i);
      const oY = toY(bar.AdjO);
      const cY = toY(bar.AdjC);
      const hY = toY(bar.AdjH);
      const lY = toY(bar.AdjL);

      const isBull = bar.AdjC >= bar.AdjO;
      ctx.strokeStyle = isBull ? '#22c55e' : '#ef4444';
      ctx.fillStyle = isBull ? '#22c55e' : '#ef4444';

      // Wick
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, hY);
      ctx.lineTo(x, lY);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(oY, cY);
      const bodyH = Math.max(1, Math.abs(cY - oY));
      if (isBull) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyH);
      } else {
        ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
      }
    });

    // Moving averages
    MA_CONFIGS.forEach((config, mi) => {
      const ma = maData[mi];
      ctx.strokeStyle = config.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      ma.forEach((v, i) => {
        if (v === null) return;
        const x = toX(i);
        const y = toY(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    });

    // Date labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(displayBars.length / 6));
    for (let i = 0; i < displayBars.length; i += step) {
      const date = displayBars[i].Date.replace(/-/g, '').slice(4);
      const label = `${date.slice(0, 2)}/${date.slice(2, 4)}`;
      ctx.fillText(label, toX(i), height - 5);
    }
  }, [bars, boxUpper, boxLower]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-xs">
        <span className="text-gray-500">日足チャート (60日)</span>
        {MA_CONFIGS.map((c) => (
          <span key={c.period} className="flex items-center gap-1">
            <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: c.color }} />
            <span className="text-gray-400">{c.label}MA</span>
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 inline-block bg-blue-500 opacity-40" />
          <span className="text-gray-400">箱レンジ</span>
        </span>
      </div>
      <div ref={containerRef} className="w-full">
        <canvas ref={canvasRef} className="rounded" />
      </div>
    </div>
  );
}
