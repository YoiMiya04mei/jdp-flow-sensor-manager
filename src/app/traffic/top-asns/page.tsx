"use client";

import React, { useState, useEffect, useCallback } from "react";
import { formatBytes, formatBps } from "@/components/traffic/traffic-chart";
import type { TopAsnAnalyticsResult, AsnAggregateEntry } from "@/server/asn/asn-enrichment-service";
import {
  Globe,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Layers,
  Upload,
} from "lucide-react";

const TIME_PRESETS = [
  { id: "15m", label: "15m" },
  { id: "1h", label: "1h" },
  { id: "6h", label: "6h" },
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
];

export default function TopAsnsPage() {
  const [timePreset, setTimePreset] = useState<string>("1h");
  const [data, setData] = useState<TopAsnAnalyticsResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [coverage, setCoverage] = useState<{
    totalAsnsInDirectory: number;
    totalPrefixesInTrie: number;
    totalCustomerNetworksInTrie: number;
  } | null>(null);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importJsonText, setImportJsonText] = useState<string>("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/traffic/top-asns?preset=${timePreset}&limit=15`);
      if (res.ok) {
        const json = await res.json();
        if (json?.success) {
          setData(json.data);
          if (json.data.coverage) {
            setCoverage(json.data.coverage);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load Top ASNs:", err);
    } finally {
      setLoading(false);
    }
  }, [timePreset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleImportPrefixes = async () => {
    if (!importJsonText.trim()) return;
    setImporting(true);
    setImportStatus(null);

    try {
      let parsed = JSON.parse(importJsonText);
      if (!Array.isArray(parsed) && Array.isArray(parsed.prefixes)) {
        parsed = parsed.prefixes;
      }
      if (!Array.isArray(parsed)) {
        throw new Error("Input must be a JSON array of { cidr, asn } objects");
      }

      const res = await fetch("/api/asn/prefixes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: parsed }),
      });

      const resJson = await res.json();
      if (res.ok && resJson?.success) {
        setImportStatus(
          `Sukses mengimpor: ${resJson.data.inserted} ditambahkan, ${resJson.data.updated} diperbarui, ${resJson.data.duplicates} duplikat, ${resJson.data.rejected} ditolak.`
        );
        fetchData();
        setTimeout(() => {
          setIsImportModalOpen(false);
          setImportJsonText("");
          setImportStatus(null);
        }, 2000);
      } else {
        setImportStatus(`Error: ${resJson?.error || "Gagal mengimpor prefix"}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportStatus(`JSON Parse Error: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  const renderAsnList = (
    title: string,
    icon: React.ElementType,
    items: AsnAggregateEntry[],
    colorClass: string
  ) => {
    return (
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {React.createElement(icon, { className: `w-4 h-4 ${colorClass}` })}
            <span className="text-xs font-bold text-slate-100">{title}</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Top {items.length} Origins
          </span>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-500 py-12 font-mono">
            Belum ada data trafik flow pada rentang waktu ini.
          </div>
        ) : (
          <div className="space-y-3.5 flex-1">
            {items.map((item, idx) => (
              <div key={item.name + idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-slate-500 text-[10px] w-4 shrink-0">
                      #{idx + 1}
                    </span>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold border shrink-0 ${
                        item.asn
                          ? "bg-cyan-950 text-cyan-400 border-cyan-800/80"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      {item.asn ? `AS${item.asn}` : "RFC1918 / UNK"}
                    </span>
                    <span className="font-semibold text-slate-200 truncate" title={item.name}>
                      {item.name}
                    </span>
                    {item.country && item.country !== "UNKNOWN" && (
                      <span className="font-mono text-[9px] px-1 rounded bg-slate-800 text-slate-400 shrink-0">
                        {item.country}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 font-mono text-[11px] shrink-0 ml-2">
                    <span className="text-emerald-400 font-bold">
                      {formatBps(item.estimatedBps)}
                    </span>
                    <span className="text-slate-400">
                      {formatBytes(item.adjustedBytes)}
                    </span>
                    <span className="text-cyan-400 font-bold text-[10px] w-9 text-right">
                      {item.percentage}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full"
                    style={{ width: `${Math.max(2, item.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <Globe className="w-5 h-5 text-cyan-400" />
              Top ASNs & Network Origin Analytics
            </h1>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/80">
              Phase 6 BGP Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Peringkat Autonomous System Numbers (ASN) sumber dan tujuan trafik jaringan NOC ISP JDP.
          </p>
        </div>

        {/* Time Presets & Actions */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          {/* Preset Buttons */}
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

          {/* Import Prefixes Button */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-mono transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            Import BGP Prefixes
          </button>

          {/* Refresh */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
            title="Refresh Top ASNs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Coverage & Precedence Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-300">
          <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            BGP LPM Engine:{" "}
            <span className="text-cyan-400 font-bold">
              {coverage?.totalAsnsInDirectory ?? 0} ASNs
            </span>{" "}
            terdaftar |{" "}
            <span className="text-emerald-400 font-bold">
              {coverage?.totalPrefixesInTrie ?? 0} Prefixes
            </span>{" "}
            di Radix Trie |{" "}
            <span className="text-indigo-400 font-bold">
              {coverage?.totalCustomerNetworksInTrie ?? 0} Customer Networks
            </span>
          </span>
        </div>
        <div className="text-[11px] text-slate-400">
          Precedence:{" "}
          <span className="text-slate-200">
            1. Exporter ASN ➔ 2. LPM Prefix Trie ➔ 3. RFC1918 Private ➔ 4. Unknown
          </span>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Total Volume Dianalisis</div>
          <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
            {data ? formatBytes(data.totalAdjustedVolume) : "—"}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            {data ? data.totalFlows.toLocaleString() : "0"} flows tercatat
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">BGP Resolved Traffic</div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {data && data.totalAdjustedVolume > 0
              ? `${Math.max(
                  0,
                  Math.round(
                    ((data.totalAdjustedVolume - data.unmappedVolume - data.privateVolume) /
                      data.totalAdjustedVolume) *
                      1000
                  ) / 10
                )}%`
              : "—"}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Origin ASN teratribusi
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Private / RFC1918 Traffic</div>
          <div className="text-xl font-bold font-mono text-indigo-400 mt-1">
            {data ? formatBytes(data.privateVolume) : "—"}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Internal WAN / subscriber pool
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Unmapped / Unknown ASN</div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {data ? formatBytes(data.unmappedVolume) : "—"}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Perlu pembaruan prefix BGP
          </div>
        </div>
      </div>

      {/* Top ASNs Side-by-Side Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {renderAsnList(
          "Top Source ASNs (Origin Traffic)",
          ArrowUpRight,
          data?.topSourceAsns || [],
          "text-cyan-400"
        )}

        {renderAsnList(
          "Top Destination ASNs (Target Traffic)",
          ArrowDownLeft,
          data?.topDestinationAsns || [],
          "text-indigo-400"
        )}
      </div>

      {/* Import Prefixes Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  Import BGP Prefix Mappings
                </h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 text-xs font-mono"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Masukkan daftar prefix IPv4 dalam format JSON array. Prefix akan divalidasi dan diindeks ke dalam Radix Trie Longest Prefix Match (LPM).
            </p>

            <textarea
              rows={8}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder={`[
  { "cidr": "8.8.8.0/24", "asn": 15169, "source": "google_dns" },
  { "cidr": "1.1.1.0/24", "asn": 13335, "source": "cloudflare" }
]`}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />

            {importStatus && (
              <div
                className={`p-3 rounded-lg text-xs font-mono border ${
                  importStatus.startsWith("Sukses")
                    ? "bg-emerald-950/60 border-emerald-800 text-emerald-400"
                    : "bg-rose-950/60 border-rose-800 text-rose-400"
                }`}
              >
                {importStatus}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                disabled={importing || !importJsonText.trim()}
                onClick={handleImportPrefixes}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 text-xs font-bold font-mono transition-colors"
              >
                {importing ? "Memproses Import..." : "Import ke Radix Trie"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
