"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Shield,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Radio,
  Server,
  Terminal,
  ShieldCheck,
  Cpu,
} from "lucide-react";

interface RolePreset {
  id: string;
  username: string;
  role: string;
  label: string;
  description: string;
  color: string;
  borderHover: string;
  badgeBg: string;
}

const PRESET_ACCOUNTS: RolePreset[] = [
  {
    id: "admin",
    username: "demo_admin",
    role: "Admin",
    label: "NOC Administrator",
    description: "Full RBAC, router provisioning, & system controls",
    color: "text-purple-400",
    borderHover: "hover:border-purple-500/50 hover:bg-purple-950/20",
    badgeBg: "bg-purple-950/80 text-purple-300 border-purple-500/40",
  },
  {
    id: "neteng",
    username: "demo_neteng",
    role: "NetEng",
    label: "Network Engineer",
    description: "Sensor configs, prefix mappings, & flow filters",
    color: "text-blue-400",
    borderHover: "hover:border-blue-500/50 hover:bg-blue-950/20",
    badgeBg: "bg-blue-950/80 text-blue-300 border-blue-500/40",
  },
  {
    id: "operator",
    username: "demo_operator",
    role: "Operator",
    label: "NOC Operator",
    description: "Real-time topology, alarms, & collector status",
    color: "text-emerald-400",
    borderHover: "hover:border-emerald-500/50 hover:bg-emerald-950/20",
    badgeBg: "bg-emerald-950/80 text-emerald-300 border-emerald-500/40",
  },
  {
    id: "analyst",
    username: "demo_analyst",
    role: "Analyst",
    label: "Traffic Analyst",
    description: "ASN flow matrices, Sankey graphs, & query exports",
    color: "text-amber-400",
    borderHover: "hover:border-amber-500/50 hover:bg-amber-950/20",
    badgeBg: "bg-amber-950/80 text-amber-300 border-amber-500/40",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("redirect");
      if (p && p.startsWith("/")) {
        setRedirectPath(p);
      }
    }
  }, []);

  const handleSelectRole = (preset: RolePreset) => {
    setSelectedRole(preset.id);
    setUsername(preset.username);
    setPassword("JdpDemoPassword2026!");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Mohon isi username dan password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Autentikasi gagal. Periksa kembali kredensial Anda.");
        setLoading(false);
      } else {
        const target = redirectPath || "/";
        window.location.href = target;
      }
    } catch {
      setError("Terjadi kesalahan jaringan saat menghubungi gateway autentikasi.");
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#050811] text-[#f1f5f9]">
      {/* Background Ambience: Cyber Grid & Radial Glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Radial Gradient Glows */}
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-cyan-600/15 blur-[120px]" />
        <div className="absolute top-1/2 -right-40 w-[30rem] h-[30rem] rounded-full bg-blue-600/15 blur-[140px]" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 rounded-full bg-indigo-600/15 blur-[120px]" />

        {/* Cyber Network Grid Overlay */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `linear-gradient(#06b6d4 1px, transparent 1px), linear-gradient(90deg, #06b6d4 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Top Floating Telemetry Status Bar */}
      <header className="absolute top-4 sm:top-6 inset-x-4 sm:inset-x-8 max-w-5xl mx-auto flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800/80 backdrop-blur-md shadow-lg pointer-events-auto">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-mono text-slate-300 font-medium tracking-tight">
            NOC Gateway: <span className="text-emerald-400 font-semibold">Online</span>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-[10px] font-mono text-slate-400">Port 2055/6343</span>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800/80 backdrop-blur-md text-[11px] font-mono text-slate-400 pointer-events-auto">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>RBAC & TLS 1.3 Enforced</span>
        </div>
      </header>

      {/* Main Glassmorphic Authentication Card */}
      <div className="relative z-10 w-full max-w-lg">
        {/* Subtle decorative glowing border effect */}
        <div className="relative rounded-2xl bg-gradient-to-b from-cyan-500/20 via-slate-800/40 to-slate-900/80 p-[1px] shadow-2xl shadow-cyan-950/40">
          <div className="rounded-2xl bg-[#090d18]/90 backdrop-blur-2xl p-6 sm:p-8 border border-slate-800/60">
            {/* Header / Brand Title */}
            <div className="text-center mb-6">
              <div className="relative inline-flex items-center justify-center mb-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-[1.5px] shadow-lg shadow-cyan-500/20">
                  <div className="w-full h-full bg-[#070b14] rounded-2xl flex items-center justify-center">
                    <Activity className="w-7 h-7 text-cyan-400 animate-pulse" />
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-[9px] font-mono font-bold text-cyan-300">
                  NOC
                </div>
              </div>

              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
                JDP FLOW SENSOR
              </h1>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <span className="text-[11px] font-mono font-semibold tracking-wider text-cyan-400 uppercase">
                  ISP Traffic Analyzer
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  Access Portal
                </span>
              </div>
            </div>

            {/* Redirect Notice Alert */}
            {redirectPath && (
              <div className="mb-5 p-3 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-200 text-xs flex items-center gap-2.5 shadow-inner">
                <Lock className="w-4 h-4 shrink-0 text-amber-400" />
                <div className="flex-1">
                  <span className="font-semibold">Akses Terlindungi: </span>
                  Sesi login diperlukan untuk mengakses fitur NOC. Silakan login.
                </div>
              </div>
            )}

            {/* Error Message Alert */}
            {error && (
              <div className="mb-5 p-3 rounded-xl bg-rose-950/40 border border-rose-600/40 text-rose-200 text-xs flex items-center gap-2.5 shadow-inner animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            {/* Authentication Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  NOC Operator / Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setSelectedRole(null);
                    }}
                    placeholder="e.g. demo_admin atau staging_admin"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all font-sans"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Password
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Enkripsi SHA-256
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setSelectedRole(null);
                    }}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full group relative mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-cyan-600 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-950/60 transition-all duration-200 disabled:opacity-50 cursor-pointer overflow-hidden"
              >
                <div className="flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Verifikasi Kredensial...</span>
                    </>
                  ) : (
                    <>
                      <span>Masuk ke Konsol NOC</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </div>
              </button>
            </form>

            {/* Quick Demo Roles Section */}
            <div className="mt-7 pt-5 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 tracking-wide uppercase font-mono">
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Akun Demo Evaluasi (1-Klik):</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  RBAC Mode
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {PRESET_ACCOUNTS.map((preset) => {
                  const isSelected = selectedRole === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectRole(preset)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative group ${
                        isSelected
                          ? "bg-slate-900 border-cyan-500 shadow-md shadow-cyan-950/50"
                          : `bg-slate-950/60 border-slate-800/80 ${preset.borderHover}`
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-mono text-xs font-bold ${preset.color}`}>
                          {preset.username}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold uppercase border ${preset.badgeBg}`}
                        >
                          {preset.role}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight truncate">
                        {preset.label}
                      </p>
                      {isSelected && (
                        <div className="absolute top-1 right-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer Security Watermark */}
            <div className="mt-6 pt-4 border-t border-slate-800/60 text-center">
              <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500 font-mono">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-slate-600" />
                  Flow Ingestion v4.0
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Server className="w-3 h-3 text-slate-600" />
                  Multi-Tenant NOC
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Terminal className="w-3 h-3 text-slate-600" />
                  Audit Trail
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
