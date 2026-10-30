"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  X,
  Server,
  Network,
  Activity,
  Shield,
  Zap,
  RefreshCw,
  Edit,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";

interface DeviceDetailDrawerProps {
  deviceId: string | null;
  onClose: () => void;
  onEdit: (device: any) => void;
  onDelete: (device: any) => void;
  onRefresh: () => void;
}

export function DeviceDetailDrawer({
  deviceId,
  onClose,
  onEdit,
  onDelete,
  onRefresh,
}: DeviceDetailDrawerProps) {
  const [device, setDevice] = useState<any | null>(null);
  const [interfaces, setInterfaces] = useState<any[]>([]);
  const [sensors, setSensors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // SNMP Test states
  const [snmpTesting, setSnmpTesting] = useState(false);
  const [snmpResult, setSnmpResult] = useState<any | null>(null);

  // Discover Interfaces states
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<any | null>(null);

  const fetchDetail = useCallback(() => {
    if (!deviceId) return;
    setLoading(true);
    fetch(`/api/devices/${deviceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data) {
          setDevice(data.data.device);
          setInterfaces(data.data.interfaces || []);
          setSensors(data.data.sensors || []);
        }
      })
      .catch((err) => console.error("Error fetching device details:", err))
      .finally(() => setLoading(false));
  }, [deviceId]);

  useEffect(() => {
    setSnmpResult(null);
    setDiscoverResult(null);
    fetchDetail();
  }, [fetchDetail]);

  if (!deviceId) return null;

  const handleTestSnmp = async () => {
    setSnmpTesting(true);
    setSnmpResult(null);
    try {
      const res = await fetch(`/api/devices/${deviceId}/snmp-test`, {
        method: "POST",
      });
      const data = await res.json();
      setSnmpResult(data?.data || { success: false, error: data.error });
    } catch {
      setSnmpResult({ success: false, error: "Network timeout or error" });
    } finally {
      setSnmpTesting(false);
    }
  };

  const handleDiscoverInterfaces = async () => {
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const res = await fetch(`/api/devices/${deviceId}/discover-interfaces`, {
        method: "POST",
      });
      const data = await res.json();
      if (data?.success) {
        setDiscoverResult(data.data);
        fetchDetail();
        onRefresh();
      } else {
        setDiscoverResult({ error: data.error });
      }
    } catch {
      setDiscoverResult({ error: "Failed to discover interfaces" });
    } finally {
      setDiscovering(false);
    }
  };

  const formatSpeed = (speed?: number) => {
    if (!speed) return "-";
    if (speed >= 100000000000) return `${speed / 1000000000}G (100GE)`;
    if (speed >= 10000000000) return `${speed / 1000000000}G (10GE)`;
    if (speed >= 1000000000) return `${speed / 1000000000}G (1GE)`;
    return `${speed / 1000000}M`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800/60 flex items-center justify-center font-bold">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100 font-mono">
                  {device?.hostname || "Loading..."}
                </h2>
                {device && <StatusPill status={device.status} />}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {device?.managementIp} • {device?.vendor?.toUpperCase()} {device?.model}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Memuat detail perangkat...
          </div>
        ) : device ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Action Bar */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleTestSnmp}
                disabled={snmpTesting}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors disabled:opacity-50"
              >
                <Zap className={`w-3.5 h-3.5 text-amber-400 ${snmpTesting ? "animate-spin" : ""}`} />
                {snmpTesting ? "Testing SNMP..." : "Test SNMP Connection"}
              </button>

              <button
                onClick={handleDiscoverInterfaces}
                disabled={discovering}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-cyan-950 hover:bg-cyan-900/80 text-cyan-300 text-xs font-semibold border border-cyan-800/80 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${discovering ? "animate-spin" : ""}`} />
                {discovering ? "Discovering..." : "Discover Interfaces"}
              </button>
            </div>

            {/* SNMP Test Result banner */}
            {snmpResult && (
              <div
                className={`p-3 rounded-lg border text-xs ${
                  snmpResult.success
                    ? "bg-emerald-950/60 border-emerald-800/80 text-emerald-300"
                    : "bg-rose-950/60 border-rose-800/80 text-rose-300"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  {snmpResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  )}
                  <span>
                    {snmpResult.success
                      ? `SNMP Success (${snmpResult.latencyMs} ms latency)`
                      : "SNMP Failed"}
                  </span>
                </div>
                {snmpResult.sysDescr && (
                  <div className="text-[11px] font-mono text-emerald-200/80 mt-1">
                    {snmpResult.sysDescr}
                  </div>
                )}
                {snmpResult.error && (
                  <div className="text-[11px] text-rose-300/80 mt-1">
                    {snmpResult.error}
                  </div>
                )}
              </div>
            )}

            {/* Discover Result Banner */}
            {discoverResult && (
              <div className="p-3 rounded-lg bg-cyan-950/60 border border-cyan-800/80 text-xs text-cyan-200">
                <div className="font-semibold">
                  Ditemukan {discoverResult.interfacesCount || interfaces.length} interface via SNMP!
                </div>
              </div>
            )}

            {/* Section: Specifications */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                Spesifikasi & Identitas Jaringan
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">Role Perangkat</div>
                  <div className="font-semibold text-slate-200 uppercase font-mono">
                    {device.role}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500">BGP ASN</div>
                  <div className="font-mono text-cyan-400 font-semibold">
                    {device.asnNumber ? `AS${device.asnNumber}` : "Internal (No ASN)"}
                  </div>
                </div>

                <div className="col-span-2">
                  <div className="text-slate-500">ASN Organization</div>
                  <div className="text-slate-200 font-medium">
                    {device.asnName || "-"}
                  </div>
                </div>

                <div className="col-span-2">
                  <div className="text-slate-500">Lokasi / Site Datacenter</div>
                  <div className="text-slate-200 font-medium">
                    {device.locationSite || "-"}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500">SNMP Version & Port</div>
                  <div className="text-slate-200 font-mono">
                    {device.snmpVersion?.toUpperCase()} (UDP {device.snmpPort})
                  </div>
                </div>

                <div>
                  <div className="text-slate-500">Status Kredensial</div>
                  <div className="text-emerald-400 text-[11px] font-mono">
                    {device.hasSnmpCommunity || device.hasSnmpV3AuthPass
                      ? "Encrypted (AES-256-GCM)"
                      : "Unconfigured"}
                  </div>
                </div>

                {device.tags && (
                  <div className="col-span-2">
                    <div className="text-slate-500 mb-1">Tags</div>
                    <div className="flex flex-wrap gap-1">
                      {device.tags.split(",").map((t: string) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono"
                        >
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section: Discovered Interfaces */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                  Discovered Interfaces ({interfaces.length})
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  SNMP MIB-II (RFC 1213)
                </span>
              </div>

              {interfaces.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  Belum ada interface ditemukan. Klik tombol <strong>Discover Interfaces</strong> di atas.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-mono">
                        <th className="py-1.5 px-2">ifIndex</th>
                        <th className="py-1.5 px-2">Interface</th>
                        <th className="py-1.5 px-2">Alias / Description</th>
                        <th className="py-1.5 px-2">Speed</th>
                        <th className="py-1.5 px-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {interfaces.map((iface) => (
                        <tr key={iface.id} className="hover:bg-slate-800/30">
                          <td className="py-1.5 px-2 text-cyan-400 font-semibold">
                            {iface.ifIndex}
                          </td>
                          <td className="py-1.5 px-2 text-slate-200 font-bold">
                            {iface.ifName}
                          </td>
                          <td className="py-1.5 px-2 text-slate-400 max-w-[150px] truncate">
                            {iface.ifAlias || "-"}
                          </td>
                          <td className="py-1.5 px-2 text-slate-300">
                            {formatSpeed(iface.ifSpeed)}
                          </td>
                          <td className="py-1.5 px-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                                iface.ifOperStatus === "up"
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                                  : "bg-rose-950 text-rose-400 border border-rose-800/60"
                              }`}
                            >
                              {iface.ifOperStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section: Attached Sensors */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                  Attached Flow Sensors ({sensors.length})
                </h3>
                <Link
                  href="/sensors"
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
                >
                  Manage Sensors <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {sensors.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  Belum ada flow sensor yang terpasang pada router ini.
                </div>
              ) : (
                <div className="space-y-2">
                  {sensors.map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-200">{s.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Protocol: {s.protocol.toUpperCase()} • Sampling: 1:{s.samplingRate}
                        </div>
                      </div>
                      <StatusPill status={s.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Footer Actions */}
        {device && (
          <div className="p-4 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between">
            <button
              onClick={() => onDelete(device)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-400 text-xs font-semibold border border-rose-800/60 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Device
            </button>

            <button
              onClick={() => onEdit(device)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              <Edit className="w-3.5 h-3.5 text-cyan-400" />
              Edit Metadata
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
