"use client";

import React from "react";
import type { TopTalkersResult, TopTalkerEntry } from "@/server/analytics/types";
import { formatBytes } from "./traffic-chart";
import { ArrowUpRight, ArrowDownLeft, Shuffle, Radio, Globe } from "lucide-react";

interface TopTalkersCardProps {
  data: TopTalkersResult | null;
  loading?: boolean;
}

function TalkerList({
  title,
  icon: Icon,
  entries,
  emptyText,
}: {
  title: string;
  icon: React.ElementType;
  entries: TopTalkerEntry[];
  emptyText: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-bold text-slate-200">{title}</span>
      </div>

      {entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-slate-500 py-6 font-mono">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2.5 flex-1">
          {entries.map((item, idx) => (
            <div key={item.key} className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                  <span className="font-mono text-slate-500 text-[10px] w-4">
                    #{idx + 1}
                  </span>
                  <span className="font-mono text-slate-200 font-semibold truncate">
                    {item.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-slate-300">
                    {formatBytes(item.adjustedBytes)}
                  </span>
                  <span className="text-cyan-400 font-bold text-[10px] w-9 text-right">
                    {item.percentage}%
                  </span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full"
                  style={{ width: `${Math.max(2, item.percentage)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopTalkersCard({ data, loading }: TopTalkersCardProps) {
  if (loading) {
    return (
      <div className="p-8 rounded-xl bg-slate-900/60 border border-slate-800/80 text-center text-slate-500 text-xs font-mono">
        Memuat data agregasi Top Talkers...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* IP Version Distribution Bar */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80">
        <div className="flex items-center justify-between text-xs mb-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-slate-200">
              IP Version Distribution
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            IPv4:{" "}
            <span className="text-cyan-400 font-bold">
              {data.ipVersionDistribution.ipv4Percent}%
            </span>{" "}
            ({formatBytes(data.ipVersionDistribution.ipv4Bytes)}) | IPv6:{" "}
            <span className="text-indigo-400 font-bold">
              {data.ipVersionDistribution.ipv6Percent}%
            </span>{" "}
            ({formatBytes(data.ipVersionDistribution.ipv6Bytes)})
          </div>
        </div>

        <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden flex">
          <div
            className="bg-cyan-500 h-full transition-all"
            style={{ width: `${data.ipVersionDistribution.ipv4Percent}%` }}
          />
          <div
            className="bg-indigo-500 h-full transition-all"
            style={{ width: `${data.ipVersionDistribution.ipv6Percent}%` }}
          />
        </div>
      </div>

      {/* Grid of 4 Top Talkers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TalkerList
          title="Top Source IPs (Origin)"
          icon={ArrowUpRight}
          entries={data.topSourceIps}
          emptyText="Belum ada data Source IP"
        />
        <TalkerList
          title="Top Destination IPs (Target)"
          icon={ArrowDownLeft}
          entries={data.topDestinationIps}
          emptyText="Belum ada data Destination IP"
        />
        <TalkerList
          title="Top Flow Conversations"
          icon={Shuffle}
          entries={data.topConversations}
          emptyText="Belum ada data percakapan flow"
        />
        <TalkerList
          title="Top Applications / L4 Ports"
          icon={Radio}
          entries={data.topPorts}
          emptyText="Belum ada data port aplikasi"
        />
      </div>
    </div>
  );
}

