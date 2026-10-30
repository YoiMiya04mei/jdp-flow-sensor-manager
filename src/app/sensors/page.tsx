"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Radio,
  Sliders,
  MoreVertical,
  Server,
  Network,
  Power,
  Edit,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
} from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import { SensorFormModal } from "@/components/sensors/sensor-form-modal";
import { SensorDetailDrawer } from "@/components/sensors/sensor-detail-drawer";

export default function SensorsPage() {
  const [sensors, setSensors] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [registryStatus, setRegistryStatus] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [search, setSearch] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [protocolFilter, setProtocolFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");

  // Modal & Drawer states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSensor, setEditingSensor] = useState<any | null>(null);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchSensors = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (deviceFilter !== "all") params.set("deviceId", deviceFilter);
    if (protocolFilter !== "all") params.set("protocol", protocolFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (directionFilter !== "all") params.set("direction", directionFilter);

    fetch(`/api/sensors?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.sensors) {
          setSensors(data.data.sensors);
        }
      })
      .catch((err) => console.error("Failed to load sensors:", err))
      .finally(() => setLoading(false));
  }, [search, deviceFilter, protocolFilter, statusFilter, directionFilter]);

  const fetchMetadata = () => {
    fetch("/api/devices")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.devices) {
          setDevices(data.data.devices);
        }
      })
      .catch((err) => console.error("Failed to load devices for filter:", err));

    fetch("/api/sensors/registry")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.status) {
          setRegistryStatus(data.data.status);
        }
      })
      .catch((err) => console.error("Failed to load registry status:", err));
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSensors();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchSensors]);

  const handleToggleState = async (sensor: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const willEnable = sensor.status === "disabled";
    showToast(willEnable ? `Enabling sensor ${sensor.name}...` : `Disabling sensor ${sensor.name}...`);

    try {
      const res = await fetch(`/api/sensors/${sensor.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable: willEnable }),
      });
      const data = await res.json();
      if (data?.success) {
        showToast(`Sensor '${sensor.name}' ${willEnable ? "diaktifkan (Waiting for Flow)" : "dinonaktifkan"}.`);
        fetchSensors();
        fetchMetadata();
      } else {
        showToast(data?.error || "Gagal mengubah status sensor", "error");
      }
    } catch {
      showToast("Kesalahan jaringan saat toggle sensor", "error");
    }
  };

  const handleDeleteSensor = async (sensor: any) => {
    if (!confirm(`Hapus flow sensor '${sensor.name}'?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/sensors/${sensor.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        showToast(`Sensor '${sensor.name}' berhasil dihapus.`);
        setSelectedSensorId(null);
        fetchSensors();
        fetchMetadata();
      } else {
        showToast(data?.error || "Gagal menghapus sensor", "error");
      }
    } catch {
      showToast("Kesalahan jaringan saat menghapus sensor", "error");
    }
  };

  // Stats calculation
  const totalSensors = sensors.length;
  const activeSensors = sensors.filter((s) => s.status === "active").length;
  const waitingSensors = sensors.filter((s) => s.status === "waiting_for_flow").length;
  const staleSensors = sensors.filter((s) => s.status === "stale").length;
  const disabledSensors = sensors.filter((s) => s.status === "disabled").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs flex items-center gap-2 animate-in slide-in-from-bottom duration-200 ${
            toast.type === "success"
              ? "bg-slate-900 border-cyan-800 text-cyan-300"
              : "bg-rose-950 border-rose-800 text-rose-300"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-100">
              Flow Sensor Manager
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800/60">
              PHASE 3
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pendaftaran & manajemen sensor NetFlow v5/v9, IPFIX, sFlow v5 tanpa edit file collector manual.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingSensor(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition-all shadow-md self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Flow Sensor
        </button>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">Total Sensor Flow</div>
          <div className="text-xl font-bold font-mono text-slate-100 mt-1">
            {totalSensors}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">Sensor Aktif</div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {activeSensors}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">Waiting for Flow</div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {waitingSensors}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">Stale Sensors</div>
          <div className="text-xl font-bold font-mono text-orange-400 mt-1">
            {staleSensors}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 col-span-2 sm:col-span-1">
          <div className="text-[11px] text-slate-400 font-medium">Dynamic Registry</div>
          <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
            {registryStatus?.activeInRegistry ?? 0} bound
          </div>
        </div>
      </div>

      {/* Collector Dynamic Registry Banner */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800/60 flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="font-semibold text-slate-200">
              Collector Dynamic Registry: Zero Manual Config
            </div>
            <div className="text-[11px] text-slate-400">
              Penambahan sensor di Web UI langsung memperbarui dynamic memory table ({registryStatus?.activeInRegistry ?? 0} sensor aktif). Pipeline Ingestion UDP Phase 4 mendukung NetFlow v5/v9, IPFIX, dan sFlow v5.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <span
            className={`font-mono text-[10px] px-2.5 py-1 rounded font-semibold border ${
              registryStatus?.collectorState === "RUNNING"
                ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/80"
                : "bg-slate-950 text-cyan-400 border-cyan-900/60"
            }`}
          >
            {registryStatus?.collectorState === "RUNNING"
              ? "● INGESTION ACTIVE"
              : "STANDBY (npm run collector)"}
          </span>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari sensor, router hostname, IP, atau nama interface..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Device Filter */}
          <select
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-mono"
          >
            <option value="all">Semua Perangkat</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.hostname}
              </option>
            ))}
          </select>

          {/* Protocol Filter */}
          <select
            value={protocolFilter}
            onChange={(e) => setProtocolFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-mono uppercase"
          >
            <option value="all">Semua Protokol</option>
            <option value="netflow_v9">NetFlow v9</option>
            <option value="ipfix">IPFIX</option>
            <option value="netflow_v5">NetFlow v5</option>
            <option value="sflow_v5">sFlow v5</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500 capitalize"
          >
            <option value="all">Semua Status</option>
            <option value="waiting_for_flow">Waiting for Flow</option>
            <option value="active">Active</option>
            <option value="stale">Stale</option>
            <option value="disabled">Disabled</option>
            <option value="draft">Draft</option>
            <option value="error">Error</option>
          </select>

          {/* Direction Filter */}
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500 uppercase font-mono"
          >
            <option value="all">Semua Arah</option>
            <option value="both">Both</option>
            <option value="ingress">Ingress</option>
            <option value="egress">Egress</option>
          </select>

          <button
            onClick={() => {
              fetchSensors();
              fetchMetadata();
            }}
            title="Refresh"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sensors Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Memuat daftar sensor flow...
          </div>
        ) : sensors.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-300">
              Tidak ada flow sensor ditemukan
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {search || protocolFilter !== "all" || statusFilter !== "all"
                ? "Coba ubah kata kunci pencarian atau filter yang dipilih."
                : "Belum ada flow sensor terpasang. Klik tombol Add Flow Sensor untuk menambahkan sensor baru."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800/80 font-mono text-[11px]">
                  <th className="py-3 px-4 font-semibold">Sensor Name & Protocol</th>
                  <th className="py-3 px-4 font-semibold">Router & Management IP</th>
                  <th className="py-3 px-4 font-semibold">Bound Interface</th>
                  <th className="py-3 px-4 font-semibold">Collector Target</th>
                  <th className="py-3 px-4 font-semibold">Sampling & Direction</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Last Flow</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {sensors.map((sensor) => {
                  const isEnabled = sensor.status !== "disabled";
                  return (
                    <tr
                      key={sensor.id}
                      onClick={() => setSelectedSensorId(sensor.id)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* Name & Protocol */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
                            <Activity className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-100 group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                              <span>{sensor.name}</span>
                              {sensor.name.toLowerCase().includes("demo") || sensor.name.toLowerCase().includes("test") || sensor.name.toLowerCase().includes("bench") || sensor.deviceHostname?.toLowerCase().includes("demo") || sensor.deviceHostname?.toLowerCase().includes("test") ? (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-bold bg-amber-950/80 text-amber-400 border border-amber-800/60">
                                  TEST FIXTURE
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                                  OPERATIONAL
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">
                              {sensor.protocol.replace("_", " ").toUpperCase()}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Device & IP */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-200">
                          {sensor.deviceHostname}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {sensor.deviceManagementIp}
                        </div>
                      </td>

                      {/* Interface */}
                      <td className="py-3 px-4">
                        <div className="text-slate-200 font-semibold">
                          {sensor.interfaceName}
                        </div>
                        {sensor.interfaceAlias && (
                          <div className="text-[10px] text-slate-500 truncate max-w-[150px]">
                            {sensor.interfaceAlias}
                          </div>
                        )}
                      </td>

                      {/* Collector Endpoint */}
                      <td className="py-3 px-4 text-slate-300">
                        UDP {sensor.collectorIp}:{sensor.collectorPort}
                      </td>

                      {/* Sampling & Direction */}
                      <td className="py-3 px-4">
                        <span className="text-cyan-400 font-bold">1:{sensor.samplingRate}</span>
                        <span className="text-slate-500 ml-1 uppercase">({sensor.direction})</span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <StatusPill status={sensor.status} />
                      </td>

                      {/* Last Flow */}
                      <td className="py-3 px-4 text-slate-400">
                        {sensor.lastFlowAt
                          ? new Date(sensor.lastFlowAt).toLocaleTimeString("id-ID")
                          : "-"}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => handleToggleState(sensor, e)}
                            title={isEnabled ? "Disable Sensor" : "Enable Sensor"}
                            className={`p-1.5 rounded-md transition-colors ${
                              isEnabled
                                ? "text-emerald-400 hover:bg-slate-800"
                                : "text-slate-500 hover:bg-slate-800"
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setSelectedSensorId(sensor.id)}
                            title="View Detail & History"
                            className="p-1.5 rounded-md text-cyan-400 hover:bg-slate-800 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setEditingSensor(sensor);
                              setIsModalOpen(true);
                            }}
                            title="Edit Sensor"
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteSensor(sensor)}
                            title="Delete Sensor"
                            className="p-1.5 rounded-md text-rose-400 hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Sensor Modal */}
      <SensorFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSensor(null);
        }}
        onSuccess={() => {
          showToast(editingSensor ? "Sensor berhasil diperbarui." : "Flow sensor baru berhasil ditambahkan.");
          fetchSensors();
          fetchMetadata();
        }}
        initialSensor={editingSensor}
      />

      {/* Sensor Detail Drawer */}
      <SensorDetailDrawer
        sensorId={selectedSensorId}
        onClose={() => setSelectedSensorId(null)}
        onEdit={(s) => {
          setSelectedSensorId(null);
          setEditingSensor(s);
          setIsModalOpen(true);
        }}
        onDelete={(s) => handleDeleteSensor(s)}
        onRefresh={() => {
          fetchSensors();
          fetchMetadata();
        }}
      />
    </div>
  );
}
