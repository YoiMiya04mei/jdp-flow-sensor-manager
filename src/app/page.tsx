"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Server,
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Radio,
  ShieldCheck,
  ArrowRight,
  Database,
  Terminal,
  FileText,
} from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";

interface DashboardData {
  totalDevices: number;
  totalSensors: number;
  sensorsByStatus: {
    active: number;
    waiting: number;
    stale: number;
    error: number;
    draft: number;
    disabled: number;
  };
  collectorStatus: {
    state: string;
    netflowPort: number;
    sflowPort: number;
    mode: string;
    message: string;
  };
  isDemo: boolean;
}

export default function DashboardOverviewPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/overview")
      .then((res) => {
        if (res.status === 401) {
          // If not logged in, prompt sign in or show unauthenticated placeholder
          throw new Error("UNAUTHORIZED");
        }
        return res.json();
      })
      .then((res) => {
        if (res.success) {
          setData(res.data);
        } else {
          setError(res.error || "Failed to load dashboard data");
        }
      })
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") {
          setError("Silakan Sign In terlebih dahulu untuk melihat data NOC.");
        } else {
          setError(err.message || "Network error");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-100">
              NOC Operational Overview
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800/60">
              PHASE 1
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Monitoring inventori router, sensor flow multi-protokol, dan kesiapan collector UDP.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/devices"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
          >
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            Device Inventory
          </Link>
          <Link
            href="/sensors"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-900 text-xs font-semibold transition-colors"
          >
            <Activity className="w-3.5 h-3.5" />
            Sensor Manager
          </Link>
        </div>
      </div>

      {/* Demo Banner Notification */}
      {data?.isDemo && (
        <div className="bg-amber-950/40 border border-amber-600/30 rounded-xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-amber-200">
                Mode Data Demonstrasi Aktif [DEMO]
              </div>
              <div className="text-[11px] text-amber-300/70">
                Data perangkat dan sensor yang ditampilkan adalah fixture demonstrasi aman untuk pengujian Phase 1.
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-amber-900/60 text-amber-300 border border-amber-700/50 uppercase">
            Fixture Data
          </span>
        </div>
      )}

      {/* Authentication Notice if not logged in */}
      {error && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 text-center">
          <ShieldCheck className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
          <h2 className="text-sm font-semibold text-slate-200">{error}</h2>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            Akses dashboard overview dan RBAC memerlukan autentikasi aktif.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-900 text-xs font-semibold transition-colors"
          >
            Menuju Halaman Login
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Core KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl bg-slate-900/40 border border-slate-800 animate-pulse"
            />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Devices */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Total Perangkat</span>
              <Server className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-slate-100">
                {data.totalDevices}
              </div>
              <div className="text-[11px] text-slate-500">Core, Edge & Firewalls</div>
            </div>
            <Link
              href="/devices"
              className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium pt-2 border-t border-slate-800/60"
            >
              Lihat Inventori <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Total Sensors */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Total Sensor Flow</span>
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-slate-100">
                {data.totalSensors}
              </div>
              <div className="text-[11px] text-slate-500">NetFlow, IPFIX, sFlow</div>
            </div>
            <Link
              href="/sensors"
              className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium pt-2 border-t border-slate-800/60"
            >
              Kelola Sensor <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Active Flow Sensors */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Sensor Aktif</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {data.sensorsByStatus.active}
              </div>
              <div className="text-[11px] text-slate-500">Menerima paket flow valid</div>
            </div>
            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
              Threshold Stale: <span className="font-mono text-slate-200">180s</span>
            </div>
          </div>

          {/* Waiting for Flow */}
          <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium">Waiting for Flow</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-amber-400">
                {data.sensorsByStatus.waiting}
              </div>
              <div className="text-[11px] text-slate-500">Tersimpan di registri collector</div>
            </div>
            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
              Menunggu flow pertama exporter
            </div>
          </div>
        </div>
      ) : null}

      {/* Sensor State Breakdown & Collector Architecture */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Status Breakdown Panel */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4 flex items-center justify-between">
              <span>Status Distribusi Sensor</span>
              <span className="text-[10px] font-mono text-slate-500">Lifecycle State</span>
            </h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60">
                <StatusPill status="active" />
                <span className="font-mono font-bold text-slate-100 text-sm">
                  {data.sensorsByStatus.active}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60">
                <StatusPill status="waiting_for_flow" />
                <span className="font-mono font-bold text-slate-100 text-sm">
                  {data.sensorsByStatus.waiting}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60">
                <StatusPill status="stale" />
                <span className="font-mono font-bold text-slate-100 text-sm">
                  {data.sensorsByStatus.stale}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60">
                <StatusPill status="error" />
                <span className="font-mono font-bold text-slate-100 text-sm">
                  {data.sensorsByStatus.error}
                </span>
              </div>
            </div>
          </div>

          {/* Collector Architecture & Ports */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <span>Collector Dynamic Engine</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60 space-y-1">
                <div className="text-slate-400 font-medium">NetFlow & IPFIX Listener</div>
                <div className="flex items-center justify-between font-mono text-slate-200">
                  <span>UDP Port: {data.collectorStatus.netflowPort}</span>
                  <span className="text-emerald-400 text-[11px]">Ready / Standby</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60 space-y-1">
                <div className="text-slate-400 font-medium">sFlow v5 Listener</div>
                <div className="flex items-center justify-between font-mono text-slate-200">
                  <span>UDP Port: {data.collectorStatus.sflowPort}</span>
                  <span className="text-emerald-400 text-[11px]">Ready / Standby</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60 space-y-1">
                <div className="text-slate-400 font-medium">Mekanisme Pendaftaran</div>
                <div className="text-slate-200 font-mono text-[11px]">
                  Zero Manual Config: Sensor ditambahkan via Web UI langsung mengikat memory registry.
                </div>
              </div>
            </div>
          </div>

          {/* Security & Provisioning Guardrails */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Guardrails & Keamanan</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60 space-y-1">
                <div className="text-slate-400 font-medium">Live Router Provisioning</div>
                <div className="flex items-center justify-between font-mono">
                  <span className="text-slate-300">Default Mode:</span>
                  <span className="text-amber-400 font-semibold">MANUAL COPY-PASTE</span>
                </div>
                <div className="text-[10px] text-slate-500 pt-1">
                  Live commit dinonaktifkan secara ketat untuk mencegah outage router.
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60 space-y-1">
                <div className="text-slate-400 font-medium">Enkripsi Kredensial</div>
                <div className="flex items-center justify-between font-mono">
                  <span className="text-slate-300">Algoritma:</span>
                  <span className="text-cyan-400">AES-256-GCM</span>
                </div>
                <div className="text-[10px] text-slate-500 pt-1">
                  Password SNMP & SSH tidak pernah dikirim balik dalam plaintext.
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/60 space-y-1">
                <div className="text-slate-400 font-medium">Audit Trail</div>
                <div className="flex items-center justify-between font-mono">
                  <span className="text-slate-300">Status:</span>
                  <span className="text-emerald-400">ACTIVE LOGGING</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Navigation Cards to Upcoming Modules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <Link
          href="/traffic/explorer"
          className="group p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 hover:border-cyan-800/60 hover:bg-slate-900/70 transition-all"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-mono text-cyan-400 font-semibold">PHASE 5 TARGET</span>
            <Activity className="w-4 h-4 text-cyan-500" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
            Flow Explorer & Top Talkers
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Analisis granular bps, packets, port, IP prefix, dan protokol trafik jaringan.
          </p>
        </Link>

        <Link
          href="/analytics/sankey"
          className="group p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 hover:border-cyan-800/60 hover:bg-slate-900/70 transition-all"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-mono text-purple-400 font-semibold">PHASE 6 TARGET</span>
            <Database className="w-4 h-4 text-purple-500" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200 group-hover:text-purple-300 transition-colors">
            ASN Enrichment & Sankey Diagram
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Visualisasi alur trafik Source ASN ke Destination ASN bergaya Akvorado.
          </p>
        </Link>

        <Link
          href="/config-generator"
          className="group p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 hover:border-cyan-800/60 hover:bg-slate-900/70 transition-all"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-mono text-emerald-400 font-semibold">PHASE 7 TARGET</span>
            <Terminal className="w-4 h-4 text-emerald-500" />
          </div>
          <h4 className="text-sm font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors">
            Router Config Generator
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Template konfigurasi Juniper, Huawei, MikroTik, Cisco, dan Nokia.
          </p>
        </Link>
      </div>
    </div>
  );
}

