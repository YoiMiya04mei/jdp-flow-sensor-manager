"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  Activity,
  Compass,
  Network,
  GitBranch,
  Terminal,
  FileText,
  Settings,
  Shield,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Devices", href: "/devices", icon: Server },
  { label: "Flow Sensors", href: "/sensors", icon: Activity },
  { label: "Traffic Explorer", href: "/traffic/explorer", icon: Compass },
  { label: "Top ASNs", href: "/traffic/top-asns", icon: Network },
  { label: "Sankey Analysis", href: "/analytics/sankey", icon: GitBranch },
  { label: "Config Generator", href: "/config-generator", icon: Terminal },
  { label: "Audit Logs", href: "/audit-logs", icon: FileText },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#060911] border-r border-slate-800/80 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800/80 gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-cyan-950/50">
          <Activity className="w-4 h-4" />
        </div>
        <div>
          <div className="text-sm font-bold text-slate-100 tracking-tight leading-none">
            JDP FLOW SENSOR
          </div>
          <div className="text-[10px] text-cyan-400 font-mono tracking-wider mt-1">
            NOC TRAFFIC ANALYZER
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
          NOC Operations
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname ? pathname.startsWith(item.href) : false;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "bg-cyan-950/60 text-cyan-400 border border-cyan-800/50 font-semibold shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-500"}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* System Indicator */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Shield className="w-4 h-4 text-emerald-400" />
          <div className="truncate">
            <div className="text-[11px] font-medium text-slate-300">RBAC Enforced</div>
            <div className="text-[10px] text-slate-500 font-mono">Phase 1 Foundation</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

