"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  TrafficChart,
  formatBps,
  formatPps,
  formatBytes,
} from "@/components/traffic/traffic-chart";
import { FlowDetailDrawer } from "@/components/traffic/flow-detail-drawer";
import { TopTalkersCard } from "@/components/traffic/top-talkers-card";
import type {
  TrafficOverviewMetrics,
  TimeSeriesBucket,
  TopTalkersResult,
  FlowSortColumn,
  FlowSortOrder,
} from "@/server/analytics/types";
import type { EnrichedFlowRecord } from "@/server/analytics/traffic-query-service";
import {
  Activity,
  RefreshCw,
  Search,
  Filter,
  ArrowUpDown,
  Layers,
  ArrowRight,
  Database,
  BarChart2,
  Table,
  SlidersHorizontal,
} from "lucide-react";

const TIME_PRESETS = [
  { id: "15m", label: "15m" },
  { id: "1h", label: "1h" },
  { id: "6h", label: "6h" },
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
];

export default function TrafficExplorerPage() {
  // Navigation & Time
  const [activeTab, setActiveTab] = useState<"table" | "topTalkers">("table");
  const [timePreset, setTimePreset] = useState<string>("1h");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  // Data States
  const [overview, setOverview] = useState<TrafficOverviewMetrics | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesBucket[]>([]);
  const [topTalkers, setTopTalkers] = useState<TopTalkersResult | null>(null);
  const [records, setRecords] = useState<EnrichedFlowRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [retentionDesc, setRetentionDesc] = useState<string>("");

  // Metadata dropdowns
  const [deviceList, setDeviceList] = useState<Array<{ id: string; hostname: string }>>([]);
  const [sensorList, setSensorList] = useState<Array<{ id: string; name: string }>>([]);

  // Filter States
  const [search, setSearch] = useState<string>("");
  const [filterDevice, setFilterDevice] = useState<string>("all");
  const [filterSensor, setFilterSensor] = useState<string>("all");
  const [filterProtocol, setFilterProtocol] = useState<string>("all");
  const [filterIpProtocol, setFilterIpProtocol] = useState<string>("all");
  const [filterPort, setFilterPort] = useState<string>("");

  // Sort & Pagination States
  const [sortBy, setSortBy] = useState<FlowSortColumn>("timestamp");
  const [sortOrder, setSortOrder] = useState<FlowSortOrder>("desc");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // UI States
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedFlow, setSelectedFlow] = useState<EnrichedFlowRecord | null>(null);

  // Load dropdown devices & sensors
  useEffect(() => {
    fetch("/api/devices")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data) {
          setDeviceList(
            data.data.map((d: any) => ({ id: d.id, hostname: d.hostname }))
          );
        }
      })
      .catch(() => {});

    fetch("/api/sensors")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data) {
          setSensorList(
            data.data.map((s: any) => ({ id: s.id, name: s.name }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Fetch overview metrics & time series chart
  const fetchAnalyticsOverview = useCallback(async () => {
    try {
      const qParams = new URLSearchParams();
      qParams.set("preset", timePreset);
      if (filterDevice !== "all") qParams.set("deviceId", filterDevice);
      if (filterSensor !== "all") qParams.set("sensorId", filterSensor);

      const [resOverview, resTimeseries] = await Promise.all([
        fetch(`/api/traffic/overview?${qParams.toString()}`),
        fetch(`/api/traffic/timeseries?${qParams.toString()}`),
      ]);

      if (resOverview.ok) {
        const data = await resOverview.json();
        if (data?.success) {
          setOverview(data.data.overview);
          if (data.data.storeStats?.retentionDescription) {
            setRetentionDesc(data.data.storeStats.retentionDescription);
          }
        }
      }

      if (resTimeseries.ok) {
        const data = await resTimeseries.json();
        if (data?.success) {
          setTimeSeries(data.data.buckets || []);
        }
      }
    } catch (err) {
      console.error("Error loading traffic overview:", err);
    }
  }, [timePreset, filterDevice, filterSensor]);

  // Fetch flow table records
  const fetchFlowRecords = useCallback(async () => {
    setLoading(true);
    try {
      const qParams = new URLSearchParams();
      qParams.set("preset", timePreset);
      if (search.trim()) qParams.set("search", search.trim());
      if (filterDevice !== "all") qParams.set("deviceId", filterDevice);
      if (filterSensor !== "all") qParams.set("sensorId", filterSensor);
      if (filterProtocol !== "all") qParams.set("protocol", filterProtocol);
      if (filterIpProtocol !== "all") qParams.set("ipProtocol", filterIpProtocol);
      if (filterPort.trim()) qParams.set("port", filterPort.trim());

      qParams.set("sortBy", sortBy);
      qParams.set("sortOrder", sortOrder);
      qParams.set("limit", String(pageSize));
      qParams.set("offset", String((page - 1) * pageSize));

      const res = await fetch(`/api/traffic/explorer?${qParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.success) {
          setRecords(data.data.records || []);
          setTotalRecords(data.data.total || 0);
        }
      }
    } catch (err) {
      console.error("Error loading flow records:", err);
    } finally {
      setLoading(false);
    }
  }, [
    timePreset,
    search,
    filterDevice,
    filterSensor,
    filterProtocol,
    filterIpProtocol,
    filterPort,
    sortBy,
    sortOrder,
    page,
    pageSize,
  ]);

  // Fetch Top Talkers
  const fetchTopTalkers = useCallback(async () => {
    try {
      const qParams = new URLSearchParams();
      qParams.set("preset", timePreset);
      if (filterDevice !== "all") qParams.set("deviceId", filterDevice);
      if (filterSensor !== "all") qParams.set("sensorId", filterSensor);
      qParams.set("limit", "10");

      const res = await fetch(`/api/traffic/top-talkers?${qParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.success) {
          setTopTalkers(data.data);
        }
      }
    } catch (err) {
      console.error("Error loading top talkers:", err);
    }
  }, [timePreset, filterDevice, filterSensor]);

  // Load all on preset / filter changes
  useEffect(() => {
    fetchAnalyticsOverview();
    if (activeTab === "table") {
      fetchFlowRecords();
    } else {
      fetchTopTalkers();
    }
  }, [fetchAnalyticsOverview, fetchFlowRecords, fetchTopTalkers, activeTab]);

  // Auto-refresh interval (10s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchAnalyticsOverview();
      if (activeTab === "table") fetchFlowRecords();
      else fetchTopTalkers();
    }, 10_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAnalyticsOverview, fetchFlowRecords, fetchTopTalkers, activeTab]);

  const handleSort = (column: FlowSortColumn) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Traffic & Flow Explorer
            </h1>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/80">
              Phase 5 Ingestion Store
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Eksplorasi granular flow records, bandwidth rates (bps), packet rates (pps), dan Top Talkers.
          </p>
        </div>

        {/* Time Presets & Auto Refresh */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Preset Buttons */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {TIME_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setTimePreset(p.id);
                  setPage(1);
                }}
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

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-colors ${
              autoRefresh
                ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                : "bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800"
            }`}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${autoRefresh ? "animate-spin" : ""}`}
            />
            {autoRefresh ? "Auto (10s)" : "Auto Off"}
          </button>

          {/* Manual Refresh */}
          <button
            onClick={() => {
              fetchAnalyticsOverview();
              if (activeTab === "table") fetchFlowRecords();
              else fetchTopTalkers();
            }}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
            title="Refresh Data Sekarang"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Storage & Daemon Status Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-300">
          <Database className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Active Storage: <span className="text-cyan-300 font-bold">SQLite WAL (100,000 Flow FIFO Cap)</span>
            <span className="text-slate-400 ml-2 text-[11px] block sm:inline">
              [Notice: Queries on 6h/24h/7d presets are bounded by the 100k most recent flows]
            </span>
          </span>
        </div>
        <div className="text-[11px] text-slate-400 shrink-0">
          ClickHouse Engine: <span className="text-amber-400 font-medium">Target Production Profile (Standby)</span>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Estimated Throughput</div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {overview ? formatBps(overview.estimatedBps) : "—"}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Sampling-corrected rate
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Packet Rate</div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {overview ? formatPps(overview.estimatedPps) : "—"}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Packets per second
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Total Flow Volume</div>
          <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
            {overview ? formatBytes(overview.totalAdjustedBytes) : "—"}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Raw: {overview ? formatBytes(overview.totalBytes) : "—"}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Total Flow Records</div>
          <div className="text-xl font-bold font-mono text-slate-100 mt-1">
            {overview ? overview.totalFlows.toLocaleString() : "0"}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            Normalized ingests
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 col-span-2 sm:col-span-1">
          <div className="text-[11px] text-slate-400 font-medium">Active Sources</div>
          <div className="text-xl font-bold font-mono text-indigo-400 mt-1">
            {overview?.activeExportersCount ?? 0} Exporters
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
            {overview?.activeSensorsCount ?? 0} Matched Sensors
          </div>
        </div>
      </div>

      {/* Traffic Rate Trend Chart */}
      <TrafficChart buckets={timeSeries} loading={false} />

      {/* Navigation Tabs (Flow Table vs Top Talkers) */}
      <div className="border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("table")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === "table"
                ? "border-cyan-500 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Table className="w-4 h-4" />
            Flow Records Table ({totalRecords.toLocaleString()})
          </button>
          <button
            onClick={() => setActiveTab("topTalkers")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === "topTalkers"
                ? "border-cyan-500 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            Top Talkers & Application Breakdown
          </button>
        </div>
      </div>

      {/* TAB 1: FLOW RECORDS TABLE */}
      {activeTab === "table" && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between text-xs">
            {/* Search input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari Source IP, Destination IP, atau Exporter..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Device filter */}
              <select
                value={filterDevice}
                onChange={(e) => {
                  setFilterDevice(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="all">All Devices</option>
                {deviceList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.hostname}
                  </option>
                ))}
              </select>

              {/* Sensor filter */}
              <select
                value={filterSensor}
                onChange={(e) => {
                  setFilterSensor(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="all">All Sensors</option>
                {sensorList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {/* Wire Protocol filter */}
              <select
                value={filterProtocol}
                onChange={(e) => {
                  setFilterProtocol(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="all">All Ingest Protocols</option>
                <option value="netflow_v5">NetFlow v5</option>
                <option value="netflow_v9">NetFlow v9</option>
                <option value="ipfix">IPFIX</option>
                <option value="sflow_v5">sFlow v5</option>
              </select>

              {/* L4 Protocol filter */}
              <select
                value={filterIpProtocol}
                onChange={(e) => {
                  setFilterIpProtocol(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="all">All L4 Protos</option>
                <option value="6">TCP (6)</option>
                <option value="17">UDP (17)</option>
                <option value="1">ICMP (1)</option>
              </select>

              {/* Port filter */}
              <input
                type="text"
                placeholder="Port..."
                value={filterPort}
                onChange={(e) => {
                  setFilterPort(e.target.value);
                  setPage(1);
                }}
                className="w-20 px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          {/* Table Container */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold text-slate-400 select-none">
                    <th
                      onClick={() => handleSort("timestamp")}
                      className="py-3 px-3.5 cursor-pointer hover:text-slate-200"
                    >
                      <div className="flex items-center gap-1.5">
                        Timestamp
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("srcIp")}
                      className="py-3 px-3 cursor-pointer hover:text-slate-200"
                    >
                      <div className="flex items-center gap-1.5">
                        Source IP : Port
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="py-3 px-1 text-center w-6"></th>
                    <th
                      onClick={() => handleSort("dstIp")}
                      className="py-3 px-3 cursor-pointer hover:text-slate-200"
                    >
                      <div className="flex items-center gap-1.5">
                        Destination IP : Port
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="py-3 px-2.5 text-center">Proto</th>
                    <th
                      onClick={() => handleSort("byteCount")}
                      className="py-3 px-3 text-right cursor-pointer hover:text-slate-200"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        Volume (Raw / Adj)
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("packetCount")}
                      className="py-3 px-3 text-right cursor-pointer hover:text-slate-200"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        Packets
                        <ArrowUpDown className="w-3 h-3 text-slate-500" />
                      </div>
                    </th>
                    <th className="py-3 px-3">Router / Sensor</th>
                    <th className="py-3 px-3 text-right">Detail</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        <Activity className="w-4 h-4 animate-spin inline-block mr-2 text-cyan-400" />
                        Mengambil record flow...
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        Tidak ada record flow yang cocok dengan kriteria filter.
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedFlow(r)}
                        className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        {/* Time */}
                        <td className="py-2.5 px-3.5 text-slate-400 whitespace-nowrap">
                          {new Date(r.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                          <span className="text-[10px] text-slate-600 ml-1">
                            .{String(r.timestamp % 1000).padStart(3, "0")}
                          </span>
                        </td>

                        {/* Source IP:Port */}
                        <td className="py-2.5 px-3 text-slate-200 whitespace-nowrap">
                          <span className="font-semibold">{r.srcIp}</span>
                          {r.srcPort !== null && (
                            <span className="text-slate-400 ml-1">:{r.srcPort}</span>
                          )}
                          {r.srcAsn && (
                            <span className="text-[10px] text-cyan-500 ml-1.5">
                              AS{r.srcAsn}
                            </span>
                          )}
                        </td>

                        {/* Arrow */}
                        <td className="py-2.5 px-1 text-center text-slate-600">
                          <ArrowRight className="w-3 h-3 inline-block" />
                        </td>

                        {/* Destination IP:Port */}
                        <td className="py-2.5 px-3 text-slate-200 whitespace-nowrap">
                          <span className="font-semibold">{r.dstIp}</span>
                          {r.dstPort !== null && (
                            <span className="text-slate-400 ml-1">:{r.dstPort}</span>
                          )}
                          {r.dstAsn && (
                            <span className="text-[10px] text-cyan-500 ml-1.5">
                              AS{r.dstAsn}
                            </span>
                          )}
                        </td>

                        {/* Protocol badge */}
                        <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              r.ipProtocol === 6
                                ? "bg-cyan-950 text-cyan-400 border-cyan-800"
                                : r.ipProtocol === 17
                                ? "bg-amber-950 text-amber-400 border-amber-800"
                                : "bg-slate-800 text-slate-300 border-slate-700"
                            }`}
                          >
                            {r.protocolName}
                          </span>
                        </td>

                        {/* Volume */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="text-emerald-400 font-semibold">
                            {formatBytes(r.samplingAdjustedBytes)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            raw {formatBytes(r.byteCount)}
                          </div>
                        </td>

                        {/* Packets */}
                        <td className="py-2.5 px-3 text-right text-slate-300 whitespace-nowrap">
                          <div>{r.samplingAdjustedPackets.toLocaleString()}</div>
                          <div className="text-[10px] text-slate-500">
                            raw {r.packetCount}
                          </div>
                        </td>

                        {/* Device / Sensor */}
                        <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap truncate max-w-[160px]">
                          <div className="text-slate-200 truncate">
                            {r.deviceHostname || r.exporterIp}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {r.sensorName || (r.inIfIndex ? `ifIndex ${r.inIfIndex}` : "Global")}
                          </div>
                        </td>

                        {/* Action view */}
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFlow(r);
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[10px] font-mono transition-colors"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
              <div>
                Menampilkan{" "}
                <span className="text-slate-200 font-bold">
                  {records.length > 0 ? (page - 1) * pageSize + 1 : 0}
                </span>{" "}
                -{" "}
                <span className="text-slate-200 font-bold">
                  {Math.min(page * pageSize, totalRecords)}
                </span>{" "}
                dari <span className="text-slate-200 font-bold">{totalRecords}</span> flows
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 hover:bg-slate-800 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TOP TALKERS */}
      {activeTab === "topTalkers" && (
        <TopTalkersCard data={topTalkers} loading={false} />
      )}

      {/* Slide-over Detail Drawer */}
      <FlowDetailDrawer
        flow={selectedFlow}
        onClose={() => setSelectedFlow(null)}
      />
    </div>
  );
}
