"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, LogOut, Radio, Shield } from "lucide-react";
import type { SessionUser } from "@/types";

export function Header() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.user) {
          setUser(data.data.user);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case "admin":
        return "bg-purple-950/80 text-purple-400 border-purple-500/30";
      case "neteng":
        return "bg-blue-950/80 text-blue-400 border-blue-500/30";
      case "operator":
        return "bg-emerald-950/80 text-emerald-400 border-emerald-500/30";
      case "analyst":
        return "bg-amber-950/80 text-amber-400 border-amber-500/30";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#060911]/80 backdrop-blur-md px-6 flex items-center justify-between z-10 sticky top-0">
      {/* Left: Environment & System Status Badges */}
      <div className="flex items-center gap-3">
        {/* Staging Badge */}
        <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-950/80 text-amber-400 border border-amber-500/50 font-mono shadow-sm">
          STAGING
        </span>

        {/* Collector Status Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs font-mono">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="text-slate-400">Collector:</span>
          <span className="text-slate-200 font-semibold">UDP 2055/6343/9995</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-sans">
            Active
          </span>
        </div>

        {/* Storage Badge */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 font-mono bg-slate-900/60 px-2 py-1 rounded border border-slate-800">
          <span>Storage:</span>
          <span className="text-cyan-300 font-medium">SQLite WAL (100k FIFO)</span>
        </div>

        {/* Provisioning Mode */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 font-mono bg-slate-900/60 px-2 py-1 rounded border border-slate-800">
          <span>Provisioning:</span>
          <span className="text-amber-400/90 font-medium">Simulated Mock (Live Locked)</span>
        </div>
      </div>

      {/* Right: Auth User info & actions */}
      <div className="flex items-center gap-3">
        {loading ? (
          <div className="w-24 h-7 rounded bg-slate-800/50 animate-pulse" />
        ) : user ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-slate-200 font-semibold leading-tight">
                  {user.username}
                </div>
                <div className="text-[10px] text-slate-500">{user.email}</div>
              </div>
            </div>

            <span
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase border ${getRoleBadgeColor(
                user.role
              )}`}
            >
              {user.role}
            </span>

            <button
              onClick={handleLogout}
              title="Logout"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => router.push("/login")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-900 font-semibold text-xs transition-colors shadow-sm"
          >
            <Shield className="w-3.5 h-3.5" />
            Sign In
          </button>
        )}
      </div>
    </header>
  );
}

