"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { formatBytes, formatBps } from "@/components/traffic/traffic-chart";
import type { SankeyGraphResult, SankeyNode, SankeyLink } from "@/server/asn/asn-enrichment-service";
import Link from "next/link";
import {
  GitMerge,
  RefreshCw,
  SlidersHorizontal,
  ExternalLink,
  Layers,
  ArrowRight,
  Info,
} from "lucide-react";

const TIME_PRESETS = [
  { id: "15m", label: "15m" },
  { id: "1h", label: "1h" },
  { id: "6h", label: "6h" },
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
];

export default function SankeyPage() {
  const [mode, setMode] = useState<"asn_to_asn" | "asn_to_customer">("asn_to_asn");
  const [metric, setMetric] = useState<"bytes" | "packets" | "bps">("bytes");
  const [timePreset, setTimePreset] = useState<string>("1h");
  const [maxNodes, setMaxNodes] = useState<number>(15);

  const [graphData, setGraphData] = useState<SankeyGraphResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Hover state
  const [hoveredLink, setHoveredLink] = useState<SankeyLink | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        preset: timePreset,
        mode,
        metric,
        maxNodes: String(maxNodes),
      });

      const res = await fetch(`/api/traffic/sankey?${q.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json?.success) {
          setGraphData(json.data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch Sankey data:", err);
    } finally {
      setLoading(false);
    }
  }, [timePreset, mode, metric, maxNodes]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Compute Layout Positions for SVG Sankey
  const layout = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0 || graphData.links.length === 0) {
      return null;
    }

    const width = 860;
    const height = 480;
    const nodeWidth = 18;
    const paddingY = 24;
    const usableHeight = height - paddingY * 2;

    const sourceNodes = graphData.nodes.filter((n) => n.category === "source_asn");
    const targetNodes = graphData.nodes.filter((n) => n.category !== "source_asn");

    const totalSourceVal = sourceNodes.reduce((sum, n) => sum + n.value, 0) || 1;
    const totalTargetVal = targetNodes.reduce((sum, n) => sum + n.value, 0) || 1;

    // Allocate vertical positions for source nodes
    const nodeYMap = new Map<string, { y0: number; y1: number; h: number; x: number }>();
    const nodeLinkOffsets = new Map<string, { outOffset: number; inOffset: number }>();

    let currentSrcY = paddingY;
    const srcSpacing = Math.max(4, 8);

    for (const sn of sourceNodes) {
      const nodeH = Math.max(14, (sn.value / totalSourceVal) * (usableHeight - (sourceNodes.length - 1) * srcSpacing));
      nodeYMap.set(sn.id, { y0: currentSrcY, y1: currentSrcY + nodeH, h: nodeH, x: 40 });
      nodeLinkOffsets.set(sn.id, { outOffset: 0, inOffset: 0 });
      currentSrcY += nodeH + srcSpacing;
    }

    // Allocate vertical positions for target nodes
    let currentDstY = paddingY;
    const dstSpacing = Math.max(4, 8);

    for (const tn of targetNodes) {
      const nodeH = Math.max(14, (tn.value / totalTargetVal) * (usableHeight - (targetNodes.length - 1) * dstSpacing));
      nodeYMap.set(tn.id, { y0: currentDstY, y1: currentDstY + nodeH, h: nodeH, x: width - 40 - nodeWidth });
      nodeLinkOffsets.set(tn.id, { outOffset: 0, inOffset: 0 });
      currentDstY += nodeH + dstSpacing;
    }

    // Allocate ribbon paths for links
    const linkPaths = graphData.links.map((link) => {
      const srcPos = nodeYMap.get(link.source);
      const dstPos = nodeYMap.get(link.target);

      if (!srcPos || !dstPos) return null;

      const srcOffsets = nodeLinkOffsets.get(link.source)!;
      const dstOffsets = nodeLinkOffsets.get(link.target)!;

      const linkThickness = Math.max(2, (link.value / graphData.totalValue) * usableHeight * 0.7);

      const y0 = srcPos.y0 + srcOffsets.outOffset;
      const y1 = dstPos.y0 + dstOffsets.inOffset;

      srcOffsets.outOffset = Math.min(srcPos.h - 2, srcOffsets.outOffset + linkThickness);
      dstOffsets.inOffset = Math.min(dstPos.h - 2, dstOffsets.inOffset + linkThickness);

      const x0 = srcPos.x + nodeWidth;
      const x1 = dstPos.x;
      const xi = (x0 + x1) / 2;

      // Curved SVG ribbon path
      const pathD = `M ${x0} ${y0} C ${xi} ${y0}, ${xi} ${y1}, ${x1} ${y1} L ${x1} ${y1 + linkThickness} C ${xi} ${y1 + linkThickness}, ${xi} ${y0 + linkThickness}, ${x0} ${y0 + linkThickness} Z`;

      return {
        link,
        pathD,
        x0,
        y0,
        x1,
        y1,
        thickness: linkThickness,
      };
    }).filter(Boolean);

    return {
      width,
      height,
      nodeWidth,
      sourceNodes,
      targetNodes,
      nodeYMap,
      linkPaths,
    };
  }, [graphData]);

  const formatMetricValue = (val: number) => {
    switch (metric) {
      case "bps":
        return formatBps(val);
      case "packets":
        return `${val.toLocaleString()} pkts`;
      case "bytes":
      default:
        return formatBytes(val);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-cyan-400" />
              Interactive Sankey Flow Analysis
            </h1>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/80">
              Phase 6 Sankey Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Visualisasi alur trafik multi-dimensi bergaya Akvorado dengan ketebalan link proporsional terhadap volume nyata.
          </p>
        </div>

        {/* Controls: Mode, Metric, Presets */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Dimension Mode Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
            <button
              onClick={() => setMode("asn_to_asn")}
              className={`px-3 py-1 font-semibold rounded-md transition-all ${
                mode === "asn_to_asn"
                  ? "bg-cyan-600 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Mode A: ASN ➔ ASN
            </button>
            <button
              onClick={() => setMode("asn_to_customer")}
              className={`px-3 py-1 font-semibold rounded-md transition-all ${
                mode === "asn_to_customer"
                  ? "bg-cyan-600 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Mode B: ASN ➔ Customer
            </button>
          </div>

          {/* Metric Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
            <button
              onClick={() => setMetric("bytes")}
              className={`px-2.5 py-1 font-semibold rounded-md transition-all ${
                metric === "bytes"
                  ? "bg-slate-700 text-cyan-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Bytes
            </button>
            <button
              onClick={() => setMetric("bps")}
              className={`px-2.5 py-1 font-semibold rounded-md transition-all ${
                metric === "bps"
                  ? "bg-slate-700 text-cyan-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              bps
            </button>
            <button
              onClick={() => setMetric("packets")}
              className={`px-2.5 py-1 font-semibold rounded-md transition-all ${
                metric === "packets"
                  ? "bg-slate-700 text-cyan-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Packets
            </button>
          </div>

          {/* Time Preset Buttons */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {TIME_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setTimePreset(p.id)}
                className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md transition-all ${
                  timePreset === p.id
                    ? "bg-cyan-600 text-slate-950 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={fetchGraph}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
            title="Refresh Sankey"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Sankey Canvas Area */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
        {/* Graph Header & Legend */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs pb-2 border-b border-slate-800/80 gap-2">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-200">
              {mode === "asn_to_asn"
                ? "Autonomous System Flow Ribbons (Origin ➔ Destination)"
                : "Transit & CDN Traffic to Customer Networks"}
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              Total: {formatMetricValue(graphData?.totalValue || 0)}
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-cyan-400 inline-block" />
              Source Origins
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-indigo-400 inline-block" />
              {mode === "asn_to_asn" ? "Destination ASNs" : "Customer Networks"}
            </div>
          </div>
        </div>

        {/* SVG Drawing Canvas */}
        {loading ? (
          <div className="h-96 flex items-center justify-center text-slate-500 font-mono text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mr-2 text-cyan-400" />
            Mengagregasi alur aliran Sankey...
          </div>
        ) : !layout || layout.linkPaths.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-full bg-slate-800/80 text-slate-500 flex items-center justify-center mb-3">
              <GitMerge className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-300">
              Tidak Ada Data Alur Flow
            </div>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Belum ada record flow yang dapat diagregasi pada rentang waktu ini. Pastikan collector aktif menerima aliran flow.
            </p>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <svg
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className="w-full h-[480px]"
            >
              <defs>
                <linearGradient id="linkGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.45" />
                </linearGradient>
                <linearGradient id="linkHoverGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0.85" />
                </linearGradient>
              </defs>

              {/* Links (Ribbons) */}
              <g className="links">
                {layout.linkPaths.map((lp: any, i: number) => {
                  const isHovered =
                    hoveredLink === lp.link ||
                    hoveredNode === lp.link.source ||
                    hoveredNode === lp.link.target;
                  const isDimmed =
                    (hoveredLink !== null && !isHovered) ||
                    (hoveredNode !== null && !isHovered);

                  return (
                    <path
                      key={i}
                      d={lp.pathD}
                      fill={isHovered ? "url(#linkHoverGradient)" : "url(#linkGradient)"}
                      opacity={isDimmed ? 0.15 : 1}
                      className="cursor-pointer transition-all duration-150"
                      onMouseEnter={() => setHoveredLink(lp.link)}
                      onMouseLeave={() => setHoveredLink(null)}
                    />
                  );
                })}
              </g>

              {/* Source Nodes (Left) */}
              <g className="source-nodes">
                {layout.sourceNodes.map((node) => {
                  const pos = layout.nodeYMap.get(node.id)!;
                  const isHovered = hoveredNode === node.id || hoveredLink?.source === node.id;

                  return (
                    <g
                      key={node.id}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredNode(node.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                    >
                      <rect
                        x={pos.x}
                        y={pos.y0}
                        width={layout.nodeWidth}
                        height={pos.h}
                        rx={3}
                        fill="#06b6d4"
                        stroke={isHovered ? "#38bdf8" : "#0891b2"}
                        strokeWidth={isHovered ? 2 : 1}
                      />
                      <text
                        x={pos.x - 8}
                        y={pos.y0 + pos.h / 2}
                        textAnchor="end"
                        dominantBaseline="middle"
                        className="font-mono text-[11px] fill-slate-300 font-semibold select-none pointer-events-none"
                      >
                        {node.id} ({node.name.length > 20 ? node.name.slice(0, 18) + "…" : node.name})
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* Target Nodes (Right) */}
              <g className="target-nodes">
                {layout.targetNodes.map((node) => {
                  const pos = layout.nodeYMap.get(node.id)!;
                  const isHovered = hoveredNode === node.id || hoveredLink?.target === node.id;

                  return (
                    <g
                      key={node.id}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredNode(node.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                    >
                      <rect
                        x={pos.x}
                        y={pos.y0}
                        width={layout.nodeWidth}
                        height={pos.h}
                        rx={3}
                        fill="#6366f1"
                        stroke={isHovered ? "#a5b4fc" : "#4f46e5"}
                        strokeWidth={isHovered ? 2 : 1}
                      />
                      <text
                        x={pos.x + layout.nodeWidth + 8}
                        y={pos.y0 + pos.h / 2}
                        textAnchor="start"
                        dominantBaseline="middle"
                        className="font-mono text-[11px] fill-slate-300 font-semibold select-none pointer-events-none"
                      >
                        {node.name.length > 24 ? node.name.slice(0, 22) + "…" : node.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredLink && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-cyan-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs font-mono z-30 pointer-events-none">
                <div className="flex items-center gap-2 font-bold text-slate-100 mb-1.5">
                  <span className="text-cyan-400">{hoveredLink.source}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-indigo-400">{hoveredLink.target}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-slate-300">
                  <div>Traffic Weight:</div>
                  <div className="text-right font-bold text-emerald-400">
                    {formatMetricValue(hoveredLink.value)}
                  </div>
                  <div>Share Percentage:</div>
                  <div className="text-right text-cyan-400 font-bold">
                    {hoveredLink.percentage}%
                  </div>
                  <div>Flow Records:</div>
                  <div className="text-right text-slate-400">
                    {hoveredLink.flowCount.toLocaleString()} flows
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Companion Flow Table */}
      {graphData && graphData.links.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-300">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>Sankey Relationship Table ({graphData.links.length} Paths)</span>
            </div>
            <Link
              href="/traffic/explorer"
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono text-[11px]"
            >
              Drill-down ke Flow Explorer
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-semibold text-slate-400 font-mono">
                  <th className="py-2.5 px-3.5">#</th>
                  <th className="py-2.5 px-3">Source Origin (ASN)</th>
                  <th className="py-2.5 px-1 text-center w-6"></th>
                  <th className="py-2.5 px-3">
                    {mode === "asn_to_asn" ? "Destination ASN" : "Customer / Network"}
                  </th>
                  <th className="py-2.5 px-3 text-right">Volume ({metric.toUpperCase()})</th>
                  <th className="py-2.5 px-3 text-right">Share (%)</th>
                  <th className="py-2.5 px-3 text-right">Flows</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {graphData.links.map((link, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-2.5 px-3.5 text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-3 text-cyan-400 font-bold">{link.source}</td>
                    <td className="py-2.5 px-1 text-center text-slate-600">➔</td>
                    <td className="py-2.5 px-3 text-indigo-300 font-semibold">{link.target}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                      {formatMetricValue(link.value)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-cyan-400 font-semibold">
                      {link.percentage}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      {link.flowCount.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Link
                        href={`/traffic/explorer?search=${encodeURIComponent(link.source.replace("AS", ""))}`}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[10px]"
                      >
                        Explore
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
