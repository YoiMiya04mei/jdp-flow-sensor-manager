import React from "react";
import type { SensorStatus, DeviceStatus } from "@/types";

interface StatusPillProps {
  status: SensorStatus | DeviceStatus | string;
  className?: string;
}

export function StatusPill({ status, className = "" }: StatusPillProps) {
  const normalized = status.toLowerCase();

  switch (normalized) {
    case "active":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Active
        </span>
      );
    case "waiting_for_flow":
    case "waiting":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-500/30 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Waiting for Flow
        </span>
      );
    case "stale":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-950/80 text-orange-400 border border-orange-500/30 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
          Stale
        </span>
      );
    case "error":
    case "unreachable":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-400 border border-rose-500/30 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
          {status === "unreachable" ? "Unreachable" : "Error"}
        </span>
      );
    case "draft":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-900 text-slate-400 border border-slate-700 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          Draft
        </span>
      );
    case "disabled":
    case "maintenance":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-900 text-zinc-400 border border-zinc-700 ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
          {status}
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 ${className}`}
        >
          {status}
        </span>
      );
  }
}

