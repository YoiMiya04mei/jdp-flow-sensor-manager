"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileCode2,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Copy,
  Download,
  Eye,
  Play,
  RotateCcw,
  Check,
  ExternalLink,
  ChevronRight,
  Server,
  Layers,
  Info,
  X,
  FileText,
} from "lucide-react";
import type { ProvisioningJobDetail } from "@/server/provisioning/types";

export default function ConfigGeneratorPage() {
  const [configs, setConfigs] = useState<ProvisioningJobDetail[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<ProvisioningJobDetail | null>(null);
  const [activeTab, setActiveTab] = useState<"cli" | "verif" | "rollback" | "approvals">("cli");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form states for creation
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [deviceSensors, setDeviceSensors] = useState<any[]>([]);
  const [selectedSensorIds, setSelectedSensorIds] = useState<string[]>([]);
  const [deviceInterfaces, setDeviceInterfaces] = useState<any[]>([]);
  const [selectedInterfaceNames, setSelectedInterfaceNames] = useState<string[]>([]);
  const [customTitle, setCustomTitle] = useState("");
  const [exporterIp, setExporterIp] = useState("");
  const [collectorIp, setCollectorIp] = useState("10.200.0.1");
  const [collectorPort, setCollectorPort] = useState(2055);
  const [protocol, setProtocol] = useState<"netflow_v9" | "ipfix" | "netflow_v5" | "sflow_v5">("netflow_v9");
  const [samplingRate, setSamplingRate] = useState(1000);
  const [direction, setDirection] = useState<"both" | "ingress" | "egress">("both");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Action status states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionNotes, setActionNotes] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    showToast("Copied to clipboard!");
  };

  const downloadTextFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename}`);
  };

  const fetchConfigs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (vendorFilter !== "all") params.set("vendor", vendorFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/provisioning/configs?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data) {
          setConfigs(data.data);
        }
      })
      .catch((err) => console.error("Failed to load configs:", err))
      .finally(() => setLoading(false));
  }, [search, vendorFilter, statusFilter]);

  const fetchMetadata = () => {
    fetch("/api/devices")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.devices) {
          setDevices(data.data.devices);
        }
      });

    fetch("/api/provisioning/templates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data) {
          setTemplates(data.data);
        }
      });
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchConfigs();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchConfigs]);

  // When selected device changes in create modal, load its sensors and interfaces
  useEffect(() => {
    if (!selectedDeviceId) {
      setDeviceSensors([]);
      setDeviceInterfaces([]);
      setSelectedSensorIds([]);
      setSelectedInterfaceNames([]);
      return;
    }

    const dev = devices.find((d) => d.id === selectedDeviceId);
    if (dev) {
      setExporterIp(dev.managementIp);
      // Auto select matching vendor template
      const matchedTmpl = templates.find((t) => t.vendor === dev.vendor);
      if (matchedTmpl) setSelectedTemplateId(matchedTmpl.id);
    }

    // Fetch device sensors
    fetch(`/api/sensors?deviceId=${selectedDeviceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.sensors) {
          setDeviceSensors(data.data.sensors);
        }
      });

    // Fetch device detail to get interfaces
    fetch(`/api/devices/${selectedDeviceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.interfaces) {
          setDeviceInterfaces(data.data.interfaces);
        }
      });
  }, [selectedDeviceId, devices, templates]);

  const handleCreateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeviceId) {
      setFormError("Please select a target device.");
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch("/api/provisioning/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDeviceId,
          title: customTitle || undefined,
          sensorIds: selectedSensorIds,
          targetInterfaceNames: selectedInterfaceNames,
          templateId: selectedTemplateId || undefined,
          exporterIp,
          collectorIp,
          collectorPort: Number(collectorPort),
          protocol,
          samplingRate: Number(samplingRate),
          direction,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to create configuration.");
      }

      showToast("Configuration generated successfully!");
      setIsCreateModalOpen(false);
      fetchConfigs();
      setSelectedJob(json.data);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleSubmitForApproval = async (jobId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/provisioning/configs/${jobId}/submit`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Submission failed.");
      showToast("Configuration submitted for review & approval.");
      setSelectedJob(json.data);
      fetchConfigs();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (jobId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/provisioning/configs/${jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", notes: actionNotes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Approval failed.");
      showToast("Configuration approved successfully!");
      setSelectedJob(json.data);
      setActionNotes("");
      fetchConfigs();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (jobId: string) => {
    if (!actionNotes.trim()) {
      showToast("Please provide a rejection reason in the notes field.", "error");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/provisioning/configs/${jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", notes: actionNotes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Rejection failed.");
      showToast("Configuration rejected.");
      setSelectedJob(json.data);
      setActionNotes("");
      fetchConfigs();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDryRun = async (jobId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/provisioning/configs/${jobId}/dry-run`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Dry-run failed.");
      showToast("Dry-Run Simulation executed successfully! (0 router changes)");
      // Refresh job detail
      const updated = await fetch(`/api/provisioning/configs/${jobId}`).then((r) => r.json());
      if (updated?.data) setSelectedJob(updated.data);
      setActiveTab("approvals");
      fetchConfigs();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteLive = async (jobId: string) => {
    if (!confirm("Are you sure you want to execute live provisioning on this production router?")) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/provisioning/configs/${jobId}/execute`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Live execution failed.");
      showToast("Live provisioning applied successfully!");
      const updated = await fetch(`/api/provisioning/configs/${jobId}`).then((r) => r.json());
      if (updated?.data) setSelectedJob(updated.data);
      fetchConfigs();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRollback = async (jobId: string) => {
    if (!confirm("Confirm rollback: this will reverse the flow configuration on the router.")) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/provisioning/configs/${jobId}/rollback`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Rollback failed.");
      showToast("Configuration rolled back successfully.");
      const updated = await fetch(`/api/provisioning/configs/${jobId}`).then((r) => r.json());
      if (updated?.data) setSelectedJob(updated.data);
      fetchConfigs();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/provisioning/configs/${jobId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Cancellation failed.");
      showToast("Configuration request cancelled.");
      setSelectedJob(json.data);
      fetchConfigs();
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Status badge styling helper
  const renderStatusBadge = (status: string) => {
    const configMap: Record<string, { label: string; bg: string; text: string; icon: any }> = {
      draft: { label: "Draft", bg: "bg-slate-800", text: "text-slate-300", icon: Clock },
      validated: { label: "Validated", bg: "bg-blue-900/40", text: "text-blue-400", icon: CheckCircle2 },
      pending_approval: { label: "Pending Approval", bg: "bg-amber-900/40", text: "text-amber-400", icon: AlertTriangle },
      approved: { label: "Approved", bg: "bg-purple-900/40", text: "text-purple-400", icon: ShieldCheck },
      executing: { label: "Executing...", bg: "bg-cyan-900/40", text: "text-cyan-400", icon: RefreshCw },
      applied: { label: "Applied Live", bg: "bg-emerald-900/40", text: "text-emerald-400", icon: CheckCircle2 },
      failed: { label: "Failed", bg: "bg-red-900/40", text: "text-red-400", icon: XCircle },
      rejected: { label: "Rejected", bg: "bg-rose-900/40", text: "text-rose-400", icon: XCircle },
      rolled_back: { label: "Rolled Back", bg: "bg-orange-900/40", text: "text-orange-400", icon: RotateCcw },
      cancelled: { label: "Cancelled", bg: "bg-zinc-800", text: "text-zinc-400", icon: XCircle },
    };

    const cfg = configMap[status] || { label: status, bg: "bg-slate-800", text: "text-slate-400", icon: Info };
    const IconComponent = cfg.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text} border border-current/20`}>
        <IconComponent className="w-3.5 h-3.5" />
        {cfg.label}
      </span>
    );
  };

  // Metrics counts
  const totalCount = configs.length;
  const pendingCount = configs.filter((c) => c.status === "pending_approval").length;
  const approvedCount = configs.filter((c) => c.status === "approved").length;
  const appliedCount = configs.filter((c) => c.status === "applied").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 animate-fade-in ${
            toast.type === "success"
              ? "bg-emerald-950/90 border-emerald-500 text-emerald-200"
              : "bg-red-950/90 border-red-500 text-red-200"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/10 border border-blue-500/20 rounded-xl text-blue-400">
              <Terminal className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Router Config Generator & Provisioning
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  Phase 7 Active
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Golden template engine multi-vendor (MikroTik, Juniper, Huawei, Cisco) dengan guardrail keamanan, validasi, approval gate, dan rollback plan.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedDeviceId("");
              setCustomTitle("");
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Generate Configuration
          </button>
        </div>
      </div>

      {/* Staging Provisioning Safety Banner */}
      <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs font-mono flex flex-col md:flex-row md:items-center justify-between gap-2 text-amber-300">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>PROVISIONING SAFETY GATE:</strong> Live Router Execution is <span className="underline font-bold">LOCKED</span> (ROUTER_LIVE_EXECUTION_ENABLED=false). Safe Dry-Run simulation active.
          </span>
        </div>
        <div className="text-[11px] text-amber-400/80 shrink-0">
          Adapter: <span className="font-semibold text-amber-200">MockRouterAdapter (Simulation Only)</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Configs</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{totalCount}</div>
          <div className="text-xs text-slate-400 mt-1">Generated router scripts</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-amber-400 text-xs font-medium">
            <span>Pending Approval</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2">{pendingCount}</div>
          <div className="text-xs text-slate-400 mt-1">Awaiting NetEng/Admin review</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-purple-400 text-xs font-medium">
            <span>Approved & Ready</span>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 mt-2">{approvedCount}</div>
          <div className="text-xs text-slate-400 mt-1">Dual-verified configuration</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-medium">
            <span>Applied Live</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">{appliedCount}</div>
          <div className="text-xs text-slate-400 mt-1">Active on router hardware</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by title, device, IP address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Vendors</option>
              <option value="mikrotik">MikroTik</option>
              <option value="juniper">Juniper</option>
              <option value="huawei">Huawei</option>
              <option value="cisco">Cisco</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="validated">Validated</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="applied">Applied</option>
              <option value="failed">Failed</option>
              <option value="rolled_back">Rolled Back</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <button
          onClick={fetchConfigs}
          className="p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Refresh table"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Configurations Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="py-3 px-4">Configuration Title & Target</th>
                <th className="py-3 px-4">Vendor & Template</th>
                <th className="py-3 px-4">Exporter & Collector Target</th>
                <th className="py-3 px-4">Protocol & Sampling</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Snapshot SHA-256</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {loading && configs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading router configurations...
                  </td>
                </tr>
              ) : configs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Terminal className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                    No router configurations found matching criteria.
                  </td>
                </tr>
              ) : (
                configs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                        {job.title}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <Server className="w-3 h-3 text-slate-400" />
                        <span>{job.deviceHostname}</span>
                        <span>•</span>
                        <span>Mgmt: {job.managementIp}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="capitalize font-medium text-slate-200">{job.vendor}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                        {job.templateName}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-mono text-slate-300">
                        {job.collectorIp}:{job.collectorPort}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Src: {job.exporterIp}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="uppercase font-mono text-blue-400 font-semibold">
                        {job.protocol.replace("_", " ")}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Rate: 1:{job.samplingRate} ({job.direction})
                      </div>
                    </td>

                    <td className="py-3.5 px-4">{renderStatusBadge(job.status)}</td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                        <span>{job.configHash.slice(0, 10)}...</span>
                        <button
                          onClick={() => copyToClipboard(job.configHash, `hash-${job.id}`)}
                          className="hover:text-white p-1 text-slate-400 cursor-pointer"
                          title="Copy full hash"
                        >
                          {copiedKey === `hash-${job.id}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedJob(job);
                            setActiveTab("cli");
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Review & Action
                        </button>

                        <button
                          onClick={() =>
                            downloadTextFile(
                              job.generatedConfig,
                              `${job.deviceHostname || "router"}_${job.vendor}_flow_config.txt`
                            )
                          }
                          className="p-1.5 bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white rounded cursor-pointer transition-colors"
                          title="Download CLI script"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE CONFIG MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Generate Router Configuration</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateConfig} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              {formError && (
                <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-lg text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Step 1: Device Selection */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  1. Target Network Device <span className="text-red-400">*</span>
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-blue-500"
                  required
                >
                  <option value="">-- Choose a registered device from Device Manager --</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.hostname} ({d.managementIp}) - {d.vendor.toUpperCase()} {d.model || ""} [{d.role}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Sensors associated */}
              {selectedDeviceId && deviceSensors.length > 0 && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    2. Bind Registered Flow Sensor(s) (Optional)
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    {deviceSensors.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSensorIds.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSensorIds([...selectedSensorIds, s.id]);
                            } else {
                              setSelectedSensorIds(selectedSensorIds.filter((id) => id !== s.id));
                            }
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                        />
                        <span className="truncate">
                          {s.name} ({s.protocol})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Target Interfaces */}
              {selectedDeviceId && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    3. Target Interfaces for Sampling Attachment
                  </label>
                  {deviceInterfaces.length > 0 ? (
                    <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                      {deviceInterfaces.map((iface) => {
                        const isChecked = selectedInterfaceNames.includes(iface.ifName);
                        return (
                          <button
                            type="button"
                            key={iface.id}
                            onClick={() => {
                              if (isChecked) {
                                setSelectedInterfaceNames(selectedInterfaceNames.filter((n) => n !== iface.ifName));
                              } else {
                                setSelectedInterfaceNames([...selectedInterfaceNames, iface.ifName]);
                              }
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                              isChecked
                                ? "bg-blue-600/30 border-blue-500 text-blue-300 font-semibold"
                                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                            }`}
                          >
                            {iface.ifName} {iface.ifAlias ? `(${iface.ifAlias})` : ""}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. ether1, ether2 (comma-separated)"
                      onChange={(e) =>
                        setSelectedInterfaceNames(
                          e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        )
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                    />
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">
                    Selected: {selectedInterfaceNames.join(", ") || "All Interfaces (Global)"}
                  </p>
                </div>
              )}

              {/* Step 4: Exporter & Collector Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Exporter Source IP</label>
                  <input
                    type="text"
                    value={exporterIp}
                    onChange={(e) => setExporterIp(e.target.value)}
                    placeholder="e.g. 10.0.0.1"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                    required
                  />
                  <span className="text-[10px] text-slate-400">Router loopback or egress interface IP</span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Collector Destination IP</label>
                  <input
                    type="text"
                    value={collectorIp}
                    onChange={(e) => setCollectorIp(e.target.value)}
                    placeholder="e.g. 10.200.0.1"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                    required
                  />
                  <span className="text-[10px] text-slate-400">JDP collector listener IP</span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Collector UDP Port</label>
                  <input
                    type="number"
                    value={collectorPort}
                    onChange={(e) => setCollectorPort(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Flow Protocol</label>
                  <select
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 uppercase"
                  >
                    <option value="netflow_v9">NetFlow v9 (Recommended)</option>
                    <option value="ipfix">IPFIX (RFC 7011)</option>
                    <option value="netflow_v5">NetFlow v5 (Legacy)</option>
                    <option value="sflow_v5">sFlow v5</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Packet Sampling Rate</label>
                  <input
                    type="number"
                    value={samplingRate}
                    onChange={(e) => setSamplingRate(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                    min={1}
                    max={100000}
                    required
                  />
                  <span className="text-[10px] text-slate-400">1:1000 means 1 in every 1000 packets</span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Direction</label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  >
                    <option value="both">Both (Ingress & Egress)</option>
                    <option value="ingress">Ingress Only</option>
                    <option value="egress">Egress Only</option>
                  </select>
                </div>
              </div>

              {/* Step 5: Vendor Template */}
              <div className="pt-2 border-t border-slate-800">
                <label className="block text-slate-300 font-semibold mb-1">Vendor Golden Template</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.compatibilityStatus.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {formSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                  Generate & Validate Config
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIG DETAIL & WORKFLOW MODAL */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {selectedJob.title}
                    {renderStatusBadge(selectedJob.status)}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Device: <span className="text-slate-200">{selectedJob.deviceHostname}</span> ({selectedJob.managementIp}) • Template: {selectedJob.templateName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Snapshot Info Box */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                <div>
                  <div className="text-[11px] text-slate-400">Exporter Source IP</div>
                  <div className="font-mono text-slate-200">{selectedJob.exporterIp}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Collector Destination</div>
                  <div className="font-mono text-slate-200">
                    {selectedJob.collectorIp}:{selectedJob.collectorPort}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Protocol & Sampling</div>
                  <div className="font-mono text-blue-400 uppercase">
                    {selectedJob.protocol} (1:{selectedJob.samplingRate})
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Snapshot SHA-256</div>
                  <div className="font-mono text-slate-300 truncate" title={selectedJob.configHash}>
                    {selectedJob.configHash.slice(0, 14)}...
                  </div>
                </div>
              </div>

              {/* Warnings if any */}
              {selectedJob.validationWarnings && selectedJob.validationWarnings.length > 0 && (
                <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-1 text-amber-300">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Compatibility & Operational Warnings:
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-200/90 pl-1">
                    {selectedJob.validationWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tabs */}
              <div className="flex border-b border-slate-800 gap-2">
                <button
                  onClick={() => setActiveTab("cli")}
                  className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    activeTab === "cli"
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  Generated CLI Commands
                </button>
                <button
                  onClick={() => setActiveTab("verif")}
                  className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    activeTab === "verif"
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  Verification Commands
                </button>
                <button
                  onClick={() => setActiveTab("rollback")}
                  className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    activeTab === "rollback"
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  Rollback Plan
                </button>
                <button
                  onClick={() => setActiveTab("approvals")}
                  className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    activeTab === "approvals"
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  Approvals Trail & Logs
                </button>
              </div>

              {/* Tab Contents */}
              {activeTab === "cli" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      Copy or download CLI commands for manual application or terminal injection:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyToClipboard(selectedJob.generatedConfig, "cli-content")}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === "cli-content" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy Commands
                      </button>
                      <button
                        onClick={() =>
                          downloadTextFile(
                            selectedJob.generatedConfig,
                            `${selectedJob.deviceHostname || "router"}_flow_config.txt`
                          )
                        }
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download .txt
                      </button>
                    </div>
                  </div>
                  <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-72 leading-relaxed">
                    {selectedJob.generatedConfig}
                  </pre>
                </div>
              )}

              {activeTab === "verif" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      Run these operational commands on the router terminal to confirm flow export state:
                    </span>
                    <button
                      onClick={() => copyToClipboard(selectedJob.verificationCommands || "", "verif-content")}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === "verif-content" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy Commands
                    </button>
                  </div>
                  <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-blue-300 overflow-x-auto max-h-72 leading-relaxed">
                    {selectedJob.verificationCommands || "# No specific verification commands provided."}
                  </pre>
                </div>
              )}

              {activeTab === "rollback" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      Reversal configuration commands to remove flow monitoring and restore prior state:
                    </span>
                    <button
                      onClick={() => copyToClipboard(selectedJob.rollbackConfig || "", "rollback-content")}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === "rollback-content" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy Rollback Script
                    </button>
                  </div>
                  <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-amber-300 overflow-x-auto max-h-72 leading-relaxed">
                    {selectedJob.rollbackConfig || "# No rollback script available."}
                  </pre>
                </div>
              )}

              {activeTab === "approvals" && (
                <div className="space-y-4">
                  {/* Approvals history */}
                  <div>
                    <h4 className="font-semibold text-slate-300 mb-2">Approval History & Decision Log</h4>
                    {selectedJob.approvals && selectedJob.approvals.length > 0 ? (
                      <div className="space-y-2">
                        {selectedJob.approvals.map((a) => (
                          <div
                            key={a.id}
                            className={`p-3 rounded-lg border flex items-start justify-between ${
                              a.action === "approve"
                                ? "bg-purple-950/20 border-purple-500/30 text-purple-200"
                                : "bg-red-950/20 border-red-500/30 text-red-200"
                            }`}
                          >
                            <div>
                              <div className="font-semibold flex items-center gap-2">
                                <span>{a.username}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                                  {a.userRole.toUpperCase()}
                                </span>
                                <span className="uppercase text-[10px] font-bold">
                                  {a.action === "approve" ? `Approved (Level ${a.approvalLevel})` : "Rejected"}
                                </span>
                              </div>
                              {a.notes && <div className="text-xs text-slate-400 mt-1">&ldquo;{a.notes}&rdquo;</div>}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(a.createdAt).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-950 rounded-lg text-slate-400 text-center">
                        No approval actions recorded yet.
                      </div>
                    )}
                  </div>

                  {/* Execution Log */}
                  {selectedJob.executionLog && (
                    <div>
                      <h4 className="font-semibold text-slate-300 mb-1">Execution / Simulation Output</h4>
                      <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-56 leading-relaxed">
                        {selectedJob.executionLog}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Review / Notes Input (for Approve/Reject) */}
              {selectedJob.status === "pending_approval" && (
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <label className="block text-slate-300 font-semibold">Reviewer Notes / Rejection Reason</label>
                  <input
                    type="text"
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Enter approval notes or rejection rationale..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer / Actions */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span>Default-Deny Provisioning Protection Active</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Submit for Approval */}
                {(selectedJob.status === "draft" || selectedJob.status === "validated") && (
                  <button
                    onClick={() => handleSubmitForApproval(selectedJob.id)}
                    disabled={actionLoading}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    Submit for Approval
                  </button>
                )}

                {/* Approve / Reject */}
                {selectedJob.status === "pending_approval" && (
                  <>
                    <button
                      onClick={() => handleReject(selectedJob.id)}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                    <button
                      onClick={() => handleApprove(selectedJob.id)}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve Request
                    </button>
                  </>
                )}

                {/* Dry-Run Simulation */}
                <button
                  onClick={() => handleDryRun(selectedJob.id)}
                  disabled={actionLoading}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 text-blue-400" />
                  Dry-Run Simulation
                </button>

                {/* Apply Live */}
                {selectedJob.status === "approved" && (
                  <button
                    onClick={() => handleExecuteLive(selectedJob.id)}
                    disabled={actionLoading}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-lg shadow-emerald-600/20"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Apply Live to Router
                  </button>
                )}

                {/* Rollback */}
                {selectedJob.status === "applied" && (
                  <button
                    onClick={() => handleRollback(selectedJob.id)}
                    disabled={actionLoading}
                    className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Execute Rollback
                  </button>
                )}

                {/* Cancel */}
                {(selectedJob.status === "draft" ||
                  selectedJob.status === "validated" ||
                  selectedJob.status === "pending_approval") && (
                  <button
                    onClick={() => handleCancel(selectedJob.id)}
                    disabled={actionLoading}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
