"use client";

import React, { useState } from "react";
import type { TimeSeriesBucket } from "@/server/analytics/types";
import { Activity, BarChart2 } from "lucide-react";

interface TrafficChartProps {
  buckets: TimeSeriesBucket[];
  loading?: boolean;
}

export function formatBps(bps: number): string {
  if (bps >= 1_000_000_000_000) return `${(bps / 1_000_000_000_000).toFixed(2)} Tbps`;
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1000) return `${(bps / 1000).toFixed(2)} Kbps`;
  return `${bps} bps`;
}

export function formatPps(pps: number): string {
  if (pps >= 1_000_000) return `${(pps / 1_000_000).toFixed(2)} Mpps`;
  if (pps >= 1000) return `${(pps / 1000).toFixed(2)} Kpps`;
  return `${pps} pps`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(2)} TB`;
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

export function TrafficChart({ buckets, loading }: TrafficChartProps) {
  const [metric, setMetric] = useState<"bps" | "pps">("bps");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="h-64 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-center text-slate-500 text-xs font-mono">
        <Activity className="w-4 h-4 animate-spin mr-2 text-cyan-400" />
        Memuat data time-series flow...
      </div>
    );
  }

  const hasData = buckets.length > 0 && buckets.some((b) => b.flowCount > 0);

  if (!hasData) {
    return (
      <div className="h-64 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-slate-800/60 text-slate-500 flex items-center justify-center mb-2">
          <BarChart2 className="w-5 h-5" />
        </div>
        <div className="text-xs font-semibold text-slate-300">
          Tidak Ada Data Trafik Flow
        </div>
        <p className="text-[11px] text-slate-500 max-w-sm mt-1">
          Belum ada paket flow yang tercatat pada rentang waktu ini. Pastikan collector daemon berjalan (<code className="text-cyan-400 font-mono">npm run collector</code>) dan router mengekspor flow ke port yang sesuai.
        </p>
      </div>
    );
  }

  const values = buckets.map((b) => (metric === "bps" ? b.bps : b.pps));
  const maxVal = Math.max(...values, 1);

  const chartHeight = 160;
  const chartWidth = 800;
  const paddingX = 40;
  const paddingY = 20;
  const drawWidth = chartWidth - paddingX * 2;
  const drawHeight = chartHeight - paddingY * 2;

  const points = buckets.map((b, i) => {
    const x = paddingX + (i / Math.max(1, buckets.length - 1)) * drawWidth;
    const val = metric === "bps" ? b.bps : b.pps;
    const y = paddingY + drawHeight - (val / maxVal) * drawHeight;
    return { x, y, bucket: b, val };
  });

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, "");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${paddingY + drawHeight} L ${points[0].x} ${paddingY + drawHeight} Z`;

  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="rounded-xl bg-slate-900/80 border border-slate-800/80 p-4">
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200">
            Realtime Traffic Rate Trends
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            (Puncak: {metric === "bps" ? formatBps(maxVal) : formatPps(maxVal)})
          </span>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setMetric("bps")}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
              metric === "bps"
                ? "bg-cyan-600 text-slate-950"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Bandwidth (bps)
          </button>
          <button
            onClick={() => setMetric("pps")}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
              metric === "pps"
                ? "bg-cyan-600 text-slate-950"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Packet Rate (pps)
          </button>
        </div>
      </div>

      {/* SVG Chart Area */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-44 text-slate-800"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={chartWidth - paddingX}
            y2={paddingY}
            stroke="#1e293b"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={paddingY + drawHeight / 2}
            x2={chartWidth - paddingX}
            y2={paddingY + drawHeight / 2}
            stroke="#1e293b"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={paddingY + drawHeight}
            x2={chartWidth - paddingX}
            y2={paddingY + drawHeight}
            stroke="#334155"
          />

          {/* Area fill */}
          <path d={areaD} fill="url(#trafficGradient)" />

          {/* Stroke path */}
          <path
            d={pathD}
            fill="none"
            stroke="#06b6d4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points & Interactive Hover Columns */}
          {points.map((p, i) => (
            <g key={i}>
              <rect
                x={p.x - drawWidth / buckets.length / 2}
                y={paddingY}
                width={drawWidth / buckets.length}
                height={drawHeight}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              />
              {hoverIndex === i && (
                <>
                  <line
                    x1={p.x}
                    y1={paddingY}
                    x2={p.x}
                    y2={paddingY + drawHeight}
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="4.5"
                    fill="#38bdf8"
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                </>
              )}
            </g>
          ))}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="absolute top-2 pointer-events-none bg-slate-950/95 border border-cyan-800/80 rounded-lg p-2.5 text-[11px] shadow-xl z-20 backdrop-blur-sm"
            style={{
              left: `${Math.min(75, Math.max(10, (hoveredPoint.x / chartWidth) * 100))}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="font-mono text-cyan-400 font-bold mb-1">
              {hoveredPoint.bucket.timeLabel}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-300">
              <div>Throughput:</div>
              <div className="font-mono font-semibold text-right text-emerald-400">
                {formatBps(hoveredPoint.bucket.bps)}
              </div>
              <div>Packet Rate:</div>
              <div className="font-mono font-semibold text-right text-amber-400">
                {formatPps(hoveredPoint.bucket.pps)}
              </div>
              <div>Volume:</div>
              <div className="font-mono text-right text-slate-400">
                {formatBytes(hoveredPoint.bucket.adjustedBytes)}
              </div>
              <div>Flow Records:</div>
              <div className="font-mono text-right text-slate-400">
                {hoveredPoint.bucket.flowCount} flows
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Time axis endpoints */}
      <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1 px-8">
        <span>{buckets[0]?.timeLabel}</span>
        <span>{buckets[Math.floor(buckets.length / 2)]?.timeLabel}</span>
        <span>{buckets[buckets.length - 1]?.timeLabel}</span>
      </div>
    </div>
  );
}

