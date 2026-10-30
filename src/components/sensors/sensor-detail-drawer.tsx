"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Activity,
  Server,
  Network,
  Clock,
  Radio,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  History,
  Power,
  Edit,
  Trash2,
} from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";

interface SensorDetailDrawerProps {
  sensorId: string | null;
  onClose: () => void;
  onEdit: (sensor: any) => void;
  onDelete: (sensor: any) => void;
  onRefresh: () => void;
}

export function SensorDetailDrawer({
  sensorId,
  onClose,
  onEdit,
  onDelete,
  onRefresh,
}: SensorDetailDrawerProps) {
  const [sensor, setSensor] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchDetail = useCallback(() => {
    if (!sensorId) return;
    setLoading(true);
    fetch(`/api/sensors/${sensorId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.sensor) {
          setSensor(data.data.sensor);
        }
      })
      .catch((err) => console.error("Error fetching sensor detail:", err))
      .finally(() => setLoading(false));
  }, [sensorId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (!sensorId) return null;

  const handleToggleState = async () => {
    if (!sensor) return;
    setToggling(true);
    const willEnable = sensor.status === "disabled";
    try {
      const res = await fetch(`/api/sensors/${sensor.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable: willEnable }),
      });
      const data = await res.json();
      if (data?.success) {
        fetchDetail();
        onRefresh();
      }
    } catch (err) {
      console.error("Toggle sensor state error:", err);
    } finally {
      setToggling(false);
    }
  };

  const isEnabled = sensor?.status !== "disabled";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800/60 flex items-center justify-center font-bold">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100 font-mono">
                  {sensor?.name || "Loading..."}
                </h2>
                {sensor && <StatusPill status={sensor.status} />}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {sensor?.protocol?.toUpperCase()} • UDP Port {sensor?.collectorPort} • 1:{sensor?.samplingRate}
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
            Memuat detail sensor...
          </div>
        ) : sensor ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Quick Toggle Action Bar */}
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-200">
                  {isEnabled ? "Sensor Active in Registry" : "Sensor Disabled"}
                </div>
                <div className="text-[11px] text-slate-500">
                  {isEnabled
                    ? "Menerima paket flow dari IP router di collector registry."
                    : "Dinonaktifkan; paket dari exporter ini diabaikan."}
                </div>
              </div>

              <button
                onClick={handleToggleState}
                disabled={toggling}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  isEnabled
                    ? "bg-rose-950/60 text-rose-400 border-rose-800/60 hover:bg-rose-900/60"
                    : "bg-emerald-950/60 text-emerald-400 border-emerald-800/60 hover:bg-emerald-900/60"
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                {toggling ? "Updating..." : isEnabled ? "Disable Sensor" : "Enable Sensor"}
              </button>
            </div>

            {/* Ingestion & Telemetry Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-slate-500 text-[11px]">Last Flow Received</div>
                <div className="text-xs font-bold text-slate-200 mt-1 font-mono">
                  {sensor.lastFlowAt
                    ? new Date(sensor.lastFlowAt).toLocaleString("id-ID")
                    : "Belum pernah menerima flow"}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-slate-500 text-[11px]">Total Flows Ingested</div>
                <div className="text-xs font-bold text-cyan-400 mt-1 font-mono">
                  {sensor.totalFlowsReceived || 0} records
                </div>
              </div>
            </div>

            {/* Router & Interface Specifications */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                Router & Interface Binding
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">Device Hostname</div>
                  <div className="font-semibold text-slate-200 font-mono">
                    {sensor.device?.hostname}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500">Exporter Management IP</div>
                  <div className="font-semibold text-cyan-400 font-mono">
                    {sensor.device?.managementIp}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500">Bound Interface</div>
                  <div className="font-semibold text-slate-200 font-mono">
                    {sensor.interface?.ifName || (sensor.ifIndex ? `ifIndex ${sensor.ifIndex}` : "All Interfaces (Global)")}
                  </div>
                  {sensor.interface?.ifAlias && (
                    <div className="text-[10px] text-slate-400">
                      {sensor.interface.ifAlias}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-slate-500">Sampling & Direction</div>
                  <div className="font-semibold text-slate-200 font-mono uppercase">
                    1:{sensor.samplingRate} • {sensor.direction}
                  </div>
                </div>

                <div className="col-span-2">
                  <div className="text-slate-500">Collector Socket Target</div>
                  <div className="font-mono text-slate-200">
                    UDP {sensor.collectorIp}:{sensor.collectorPort}
                  </div>
                </div>

                {sensor.description && (
                  <div className="col-span-2">
                    <div className="text-slate-500">Description</div>
                    <div className="text-slate-300">{sensor.description}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Lifecycle State Machine History */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-cyan-400" />
                  <span>State Machine History ({sensor.statusHistory?.length || 0})</span>
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">Immutable Log</span>
              </div>

              {!sensor.statusHistory || sensor.statusHistory.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  Belum ada riwayat transisi status.
                </div>
              ) : (
                <div className="space-y-2">
                  {sensor.statusHistory.map((h: any) => (
                    <div
                      key={h.id}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono text-[11px] uppercase">
                            {h.oldStatus}
                          </span>
                          <span className="text-slate-500">→</span>
                          <StatusPill status={h.newStatus} />
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {h.triggerReason}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                        {new Date(h.changedAt).toLocaleString("id-ID")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Footer Actions */}
        {sensor && (
          <div className="p-4 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between">
            <button
              onClick={() => onDelete(sensor)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-400 text-xs font-semibold border border-rose-800/60 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Sensor
            </button>

            <button
              onClick={() => onEdit(sensor)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              <Edit className="w-3.5 h-3.5 text-cyan-400" />
              Edit Config
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

