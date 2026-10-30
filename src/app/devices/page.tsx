"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Server,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Zap,
  MoreVertical,
  Activity,
  Network,
  Shield,
  Edit,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import { DeviceFormModal } from "@/components/devices/device-form-modal";
import { DeviceDetailDrawer } from "@/components/devices/device-detail-drawer";

export default function DevicesPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal & Drawer states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<any | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // Quick Action notification
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchDevices = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (vendorFilter !== "all") params.set("vendor", vendorFilter);
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/devices?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.devices) {
          setDevices(data.data.devices);
        }
      })
      .catch((err) => console.error("Failed to load devices:", err))
      .finally(() => setLoading(false));
  }, [search, vendorFilter, roleFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDevices();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchDevices]);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleQuickTestSnmp = async (deviceId: string, hostname: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showToast(`Testing SNMP connection to ${hostname}...`);
    try {
      const res = await fetch(`/api/devices/${deviceId}/snmp-test`, {
        method: "POST",
      });
      const data = await res.json();
      if (data?.success && data?.data?.success) {
        showToast(`SNMP OK on ${hostname} (${data.data.latencyMs}ms)`, "success");
      } else {
        showToast(`SNMP Failed on ${hostname}: ${data?.error || data?.data?.error}`, "error");
      }
    } catch {
      showToast(`SNMP connection error on ${hostname}`, "error");
    }
  };

  const handleDeleteDevice = async (device: any) => {
    if (!confirm(`Hapus perangkat '${device.hostname}' dan seluruh sensor flow terkait?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/devices/${device.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        showToast(`Device '${device.hostname}' berhasil dihapus.`);
        setSelectedDeviceId(null);
        fetchDevices();
      } else {
        showToast(data?.error || "Gagal menghapus device", "error");
      }
    } catch {
      showToast("Kesalahan jaringan saat menghapus", "error");
    }
  };

  const totalInterfaces = devices.reduce((sum, d) => sum + (d.interfaceCount || 0), 0);
  const activeRouters = devices.filter((d) => d.status === "active").length;

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
              Network Device Inventory
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800/60">
              PHASE 2
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Inventori router flow exporter, status SNMP MIB-II, dan pemetaan interface.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingDevice(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition-all shadow-md self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Device
        </button>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">Total Perangkat</div>
          <div className="text-xl font-bold font-mono text-slate-100 mt-1">
            {devices.length}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">Perangkat Aktif</div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {activeRouters}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">Discovered Interfaces</div>
          <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
            {totalInterfaces}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">SNMP Security</div>
          <div className="text-xl font-bold font-mono text-purple-400 mt-1">
            AES-256 Encrypted
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari hostname, management IP, ASN, atau lokasi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Vendor Filter */}
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500 capitalize"
          >
            <option value="all">Semua Vendor</option>
            <option value="juniper">Juniper</option>
            <option value="huawei">Huawei</option>
            <option value="mikrotik">MikroTik</option>
            <option value="cisco">Cisco</option>
            <option value="nokia">Nokia</option>
            <option value="zte">ZTE</option>
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500 capitalize"
          >
            <option value="all">Semua Role</option>
            <option value="core">Core</option>
            <option value="edge">Edge</option>
            <option value="distribution">Distribution</option>
            <option value="firewall">Firewall</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500 capitalize"
          >
            <option value="all">Semua Status</option>
            <option value="active">Active</option>
            <option value="unreachable">Unreachable</option>
            <option value="maintenance">Maintenance</option>
            <option value="disabled">Disabled</option>
          </select>

          <button
            onClick={fetchDevices}
            title="Refresh"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Devices Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Memuat daftar perangkat...
          </div>
        ) : devices.length === 0 ? (
          <div className="p-12 text-center">
            <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-300">
              Tidak ada perangkat ditemukan
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {search || vendorFilter !== "all"
                ? "Coba ubah kata kunci pencarian atau filter yang dipilih."
                : "Belum ada router yang didaftarkan. Klik tombol Add Device untuk menambahkan router baru."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800/80 font-mono text-[11px]">
                  <th className="py-3 px-4 font-semibold">Device & Hostname</th>
                  <th className="py-3 px-4 font-semibold">Management IP</th>
                  <th className="py-3 px-4 font-semibold">Role</th>
                  <th className="py-3 px-4 font-semibold">ASN & Organization</th>
                  <th className="py-3 px-4 font-semibold">Location / POP</th>
                  <th className="py-3 px-4 font-semibold text-center">Interfaces</th>
                  <th className="py-3 px-4 font-semibold text-center">Sensors</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {devices.map((device) => (
                  <tr
                    key={device.id}
                    onClick={() => setSelectedDeviceId(device.id)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    {/* Device & Vendor */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
                          <Server className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-100 group-hover:text-cyan-400 transition-colors font-mono flex items-center gap-1.5">
                            <span>{device.hostname}</span>
                            {device.tags?.includes("demo") || device.tags?.includes("test") || device.hostname.toLowerCase().includes("demo") || device.hostname.toLowerCase().includes("test") || device.hostname.toLowerCase().includes("bench") ? (
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
                            {device.vendor} {device.model && `• ${device.model}`}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* IP */}
                    <td className="py-3 px-4 text-slate-300 font-semibold">
                      {device.managementIp}
                    </td>

                    {/* Role */}
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-800/80 text-slate-300 border border-slate-700">
                        {device.role}
                      </span>
                    </td>

                    {/* ASN */}
                    <td className="py-3 px-4">
                      {device.asnNumber ? (
                        <div>
                          <span className="text-cyan-400 font-bold font-mono">
                            AS{device.asnNumber}
                          </span>
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px] font-sans">
                            {device.asnName || "-"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 font-sans">Internal</span>
                      )}
                    </td>

                    {/* Location */}
                    <td className="py-3 px-4 text-slate-400 font-sans max-w-[150px] truncate">
                      {device.locationSite || "-"}
                    </td>

                    {/* Discovered Interfaces */}
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          device.interfaceCount > 0
                            ? "bg-cyan-950 text-cyan-300 border border-cyan-800/60"
                            : "bg-slate-800 text-slate-500"
                        }`}
                      >
                        {device.interfaceCount} ifaces
                      </span>
                    </td>

                    {/* Attached Sensors */}
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          device.sensorCount > 0
                            ? "bg-purple-950 text-purple-300 border border-purple-800/60"
                            : "bg-slate-800 text-slate-500"
                        }`}
                      >
                        {device.sensorCount} sensors
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <StatusPill status={device.status} />
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleQuickTestSnmp(device.id, device.hostname, e)}
                          title="Quick Test SNMP"
                          className="p-1.5 rounded-md text-amber-400 hover:bg-slate-800 transition-colors"
                        >
                          <Zap className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setSelectedDeviceId(device.id)}
                          title="View Details"
                          className="p-1.5 rounded-md text-cyan-400 hover:bg-slate-800 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            setEditingDevice(device);
                            setIsModalOpen(true);
                          }}
                          title="Edit"
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteDevice(device)}
                          title="Delete"
                          className="p-1.5 rounded-md text-rose-400 hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <DeviceFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingDevice(null);
        }}
        onSuccess={() => {
          showToast(editingDevice ? "Perangkat berhasil diperbarui." : "Perangkat baru berhasil ditambahkan.");
          fetchDevices();
        }}
        initialDevice={editingDevice}
      />

      {/* Detail Drawer */}
      <DeviceDetailDrawer
        deviceId={selectedDeviceId}
        onClose={() => setSelectedDeviceId(null)}
        onEdit={(d) => {
          setSelectedDeviceId(null);
          setEditingDevice(d);
          setIsModalOpen(true);
        }}
        onDelete={(d) => handleDeleteDevice(d)}
        onRefresh={() => fetchDevices()}
      />
    </div>
  );
}
