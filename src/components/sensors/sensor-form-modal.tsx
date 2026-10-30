"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Activity,
  Server,
  Network,
  Radio,
  Sliders,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import type { FlowProtocol, FlowDirection, SensorStatus } from "@/types";

interface SensorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialSensor?: any;
  defaultDeviceId?: string;
}

export function SensorFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialSensor,
  defaultDeviceId,
}: SensorFormModalProps) {
  const isEdit = Boolean(initialSensor?.id);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deviceId, setDeviceId] = useState(defaultDeviceId || "");
  const [protocol, setProtocol] = useState<FlowProtocol>("netflow_v9");
  const [collectorIp, setCollectorIp] = useState("0.0.0.0");
  const [collectorPort, setCollectorPort] = useState(2055);
  const [ifIndex, setIfIndex] = useState<string>("any");
  const [samplingRate, setSamplingRate] = useState(1000);
  const [direction, setDirection] = useState<FlowDirection>("both");
  const [status, setStatus] = useState<SensorStatus>("waiting_for_flow");

  // Device & Interface options
  const [devices, setDevices] = useState<any[]>([]);
  const [interfaces, setInterfaces] = useState<any[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [loadingInterfaces, setLoadingInterfaces] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all devices on mount/open
  useEffect(() => {
    if (!isOpen) return;
    setLoadingDevices(true);
    fetch("/api/devices")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.devices) {
          setDevices(data.data.devices);
          if (!deviceId && data.data.devices.length > 0 && !isEdit) {
            setDeviceId(data.data.devices[0].id);
          }
        }
      })
      .catch((err) => console.error("Error fetching devices:", err))
      .finally(() => setLoadingDevices(false));
  }, [isOpen, deviceId, isEdit]);

  // Fetch interfaces when selected device changes
  useEffect(() => {
    if (!deviceId) {
      setInterfaces([]);
      return;
    }

    setLoadingInterfaces(true);
    fetch(`/api/devices/${deviceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data) {
          setInterfaces(data.data.interfaces || []);
        }
      })
      .catch((err) => console.error("Error fetching device interfaces:", err))
      .finally(() => setLoadingInterfaces(false));
  }, [deviceId]);

  // Set initial form values
  useEffect(() => {
    if (initialSensor) {
      setName(initialSensor.name || "");
      setDescription(initialSensor.description || "");
      setDeviceId(initialSensor.deviceId || "");
      setProtocol(initialSensor.protocol || "netflow_v9");
      setCollectorIp(initialSensor.collectorIp || "0.0.0.0");
      setCollectorPort(initialSensor.collectorPort || 2055);
      setIfIndex(initialSensor.ifIndex !== null && initialSensor.ifIndex !== undefined ? String(initialSensor.ifIndex) : "any");
      setSamplingRate(initialSensor.samplingRate || 1000);
      setDirection(initialSensor.direction || "both");
      setStatus(initialSensor.status || "waiting_for_flow");
    } else {
      // Defaults for new sensor
      setName("");
      setDescription("");
      if (defaultDeviceId) setDeviceId(defaultDeviceId);
      setProtocol("netflow_v9");
      setCollectorIp("0.0.0.0");
      setCollectorPort(2055);
      setIfIndex("any");
      setSamplingRate(1000);
      setDirection("both");
      setStatus("waiting_for_flow");
    }
  }, [initialSensor, defaultDeviceId, isOpen]);

  // Adjust default port according to protocol
  const handleProtocolChange = (p: FlowProtocol) => {
    setProtocol(p);
    if (p === "sflow_v5" && collectorPort === 2055) {
      setCollectorPort(6343);
    } else if (p !== "sflow_v5" && collectorPort === 6343) {
      setCollectorPort(2055);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: Record<string, any> = {
      name: name.trim(),
      description: description.trim() || null,
      deviceId,
      protocol,
      collectorIp: collectorIp.trim() || "0.0.0.0",
      collectorPort: Number(collectorPort),
      ifIndex: ifIndex === "any" ? null : parseInt(ifIndex, 10),
      samplingRate: Number(samplingRate),
      direction,
      status,
    };

    try {
      const url = isEdit ? `/api/sensors/${initialSensor.id}` : "/api/sensors";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Gagal menyimpan flow sensor");
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setError("Terjadi kesalahan jaringan saat menyimpan sensor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                {isEdit ? "Edit Flow Sensor" : "Add New Flow Sensor"}
              </h2>
              <p className="text-[11px] text-slate-400">
                Konfigurasi sensor flow dinamis tanpa perlu mengedit file konfigurasi collector manual.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Sensor Name */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Sensor Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Core Transit Ingress Flow"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Device Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Router / Device <span className="text-rose-400">*</span>
              </label>
              <select
                disabled={isEdit || loadingDevices}
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono disabled:opacity-50"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.hostname} ({d.managementIp})
                  </option>
                ))}
              </select>
            </div>

            {/* Interface Selection */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Target Interface
              </label>
              <select
                value={ifIndex}
                onChange={(e) => setIfIndex(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="any">All Interfaces (Global / Router-wide)</option>
                {interfaces.map((i) => (
                  <option key={i.id} value={i.ifIndex}>
                    {i.ifName} (ifIndex {i.ifIndex}) {i.ifAlias ? `- ${i.ifAlias}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Protocol & Direction */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Flow Protocol <span className="text-rose-400">*</span>
              </label>
              <select
                value={protocol}
                onChange={(e) => handleProtocolChange(e.target.value as FlowProtocol)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono uppercase"
              >
                <option value="netflow_v9">NetFlow v9 (RFC 3954)</option>
                <option value="ipfix">IPFIX (RFC 7011)</option>
                <option value="netflow_v5">NetFlow v5 (Legacy 24-byte)</option>
                <option value="sflow_v5">sFlow v5 (RFC 3176)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Traffic Direction
              </label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as FlowDirection)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 uppercase font-mono"
              >
                <option value="both">Both (Ingress & Egress)</option>
                <option value="ingress">Ingress Only</option>
                <option value="egress">Egress Only</option>
              </select>
            </div>
          </div>

          {/* Collector & Port */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Collector Listen Address
              </label>
              <input
                type="text"
                placeholder="0.0.0.0"
                value={collectorIp}
                onChange={(e) => setCollectorIp(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                UDP Port <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                max={65535}
                value={collectorPort}
                onChange={(e) => setCollectorPort(parseInt(e.target.value, 10) || 2055)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          {/* Sampling Rate & Initial Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Sampling Rate (1:N packets)
              </label>
              <input
                type="number"
                min={1}
                max={1000000}
                value={samplingRate}
                onChange={(e) => setSamplingRate(parseInt(e.target.value, 10) || 1000)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <span className="text-[10px] text-slate-500">
                Default: 1:1000 (1 packet sampled per 1000 frames)
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Initial Status Lifecycle
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SensorStatus)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="waiting_for_flow">Waiting for Flow (Ready for exporter)</option>
                <option value="draft">Draft (Inactive)</option>
                <option value="disabled">Disabled</option>
              </select>
              <span className="text-[10px] text-slate-500">
                Sensor baru otomatis masuk Waiting for Flow.
              </span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Deskripsi / Keterangan
            </label>
            <textarea
              rows={2}
              placeholder="Keterangan interface, provider peering, atau nomor tiket NOC..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold transition-all shadow-md disabled:opacity-50"
            >
              {loading ? "Menyimpan..." : isEdit ? "Update Sensor" : "Simpan Sensor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
