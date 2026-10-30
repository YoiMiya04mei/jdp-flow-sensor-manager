"use client";

import React, { useEffect, useState } from "react";
import { FileText, Shield, Clock, Terminal, User } from "lucide-react";

interface AuditLogEntry {
  id: string;
  userId: string | null;
  username: string;
  action: string;
  targetEntity: string;
  targetId: string | null;
  diffJson: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/audit-logs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data?.data?.logs) {
          setLogs(data.data.logs);
        }
      })
      .catch((err) => console.error("Failed to load audit logs:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-100">
              Security & Audit Trail
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800/60">
              IMMUTABLE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Riwayat lengkap autentikasi, perubahan konfigurasi, dan aktivitas operasional NOC.
          </p>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-slate-200">Activity Log Events</span>
          </div>
          <span className="font-mono text-[11px] text-slate-500">
            Total tercatat: {logs.length}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Memuat audit logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Belum ada aktivitas tercatat.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800/80 font-mono text-[11px]">
                  <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                  <th className="py-2.5 px-4 font-semibold">User</th>
                  <th className="py-2.5 px-4 font-semibold">Action</th>
                  <th className="py-2.5 px-4 font-semibold">Entity</th>
                  <th className="py-2.5 px-4 font-semibold">IP Address</th>
                  <th className="py-2.5 px-4 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-800/30 transition-colors font-mono text-[11px]"
                  >
                    <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("id-ID")}
                    </td>
                    <td className="py-2.5 px-4 text-slate-200 font-semibold">
                      <span className="inline-flex items-center gap-1.5 font-sans">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        {log.username}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-800 text-cyan-400 border border-slate-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">
                      {log.targetEntity} {log.targetId ? `(${log.targetId})` : ""}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {log.ipAddress || "127.0.0.1"}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 max-w-xs truncate">
                      {log.diffJson || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

