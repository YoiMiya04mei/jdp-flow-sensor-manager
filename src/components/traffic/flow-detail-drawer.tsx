"use client";

import React from "react";
import type { EnrichedFlowRecord } from "@/server/analytics/traffic-query-service";
import { formatBytes } from "./traffic-chart";
import { X, ArrowRight, ShieldCheck, Server, Network, Cpu, Clock, Layers } from "lucide-react";

interface FlowDetailDrawerProps {
  flow: EnrichedFlowRecord | null;
  onClose: () => void;
}

export function decodeTcpFlags(flags: number | null): string[] {
  if (flags === null || flags === undefined) return [];
  const decoded: string[] = [];
  if (flags & 0x01) decoded.push("FIN");
  if (flags & 0x02) decoded.push("SYN");
  if (flags & 0x04) decoded.push("RST");
  if (flags & 0x08) decoded.push("PSH");
  if (flags & 0x10) decoded.push("ACK");
  if (flags & 0x20) decoded.push("URG");
  if (flags & 0x40) decoded.push("ECE");
  if (flags & 0x80) decoded.push("CWR");
  return decoded;
}

export function FlowDetailDrawer({ flow, onClose }: FlowDetailDrawerProps) {
  if (!flow) return null;

  const tcpFlagList = decodeTcpFlags(flow.tcpFlags);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800/60 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                Flow Record Detail
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                  {flow.protocol.toUpperCase()}
                </span>
                <span
                  className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                    flow.completeness === "complete"
                      ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/80"
                      : "bg-amber-950/80 text-amber-400 border-amber-800/80"
                  }`}
                >
                  {flow.completeness}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                ID: {flow.id}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="p-5 space-y-5 text-xs flex-1">
          {/* Conversation Visualizer */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="text-[11px] font-semibold text-slate-400 mb-2.5">
              Flow Conversation Path
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="flex-1">
                <div className="font-mono font-bold text-slate-200">
                  {flow.srcIp}
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  Port: {flow.srcPort ?? "—"}
                </div>
                {flow.srcAsn && (
                  <div className="text-[11px] text-cyan-400 font-mono mt-0.5">
                    AS{flow.srcAsn}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center px-2">
                <span className="text-[10px] font-mono text-cyan-400 font-bold mb-0.5">
                  {flow.protocolName}
                </span>
                <ArrowRight className="w-5 h-5 text-slate-500" />
              </div>

              <div className="flex-1 text-right">
                <div className="font-mono font-bold text-slate-200">
                  {flow.dstIp}
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  Port: {flow.dstPort ?? "—"}
                </div>
                {flow.dstAsn && (
                  <div className="text-[11px] text-cyan-400 font-mono mt-0.5">
                    AS{flow.dstAsn}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Volume & Sampling Statistics */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Cpu className="w-4 h-4 text-cyan-400" />
              Volume & Sampling Correction
            </div>
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <div>
                <div className="text-slate-500 text-[11px]">Raw Byte Count</div>
                <div className="font-mono text-slate-200 font-bold mt-0.5">
                  {formatBytes(flow.byteCount)}{" "}
                  <span className="text-[10px] text-slate-500">
                    ({flow.byteCount.toLocaleString()} B)
                  </span>
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">Raw Packet Count</div>
                <div className="font-mono text-slate-200 font-bold mt-0.5">
                  {flow.packetCount.toLocaleString()} pkts
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">Sampling Rate</div>
                <div className="font-mono text-amber-400 font-bold mt-0.5">
                  1 : {flow.samplingRate.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">
                  Sampling-Adjusted Bytes
                </div>
                <div className="font-mono text-emerald-400 font-bold mt-0.5">
                  {formatBytes(flow.samplingAdjustedBytes)}
                </div>
              </div>
              <div className="col-span-2 text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                Koreksi sampling dihitung otomatis: <code className="text-cyan-400">adjustedBytes = rawBytes × samplingRate</code>.
              </div>
            </div>
          </div>

          {/* Transport Layer Details */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              Transport & Protocol Attributes
            </div>
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <div>
                <div className="text-slate-500 text-[11px]">IP Protocol Number</div>
                <div className="font-mono text-slate-200 mt-0.5">
                  {flow.ipProtocol} ({flow.protocolName})
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">IP Family</div>
                <div className="font-mono text-slate-200 mt-0.5">
                  IPv{flow.ipVersion}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-slate-500 text-[11px]">TCP Control Flags</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {tcpFlagList.length > 0 ? (
                    tcpFlagList.map((flag) => (
                      <span
                        key={flag}
                        className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700"
                      >
                        {flag}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 font-mono text-[11px]">
                      {flow.tcpFlags !== null ? `Raw 0x${flow.tcpFlags.toString(16)}` : "None / Non-TCP"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Device & Interface Association */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Server className="w-4 h-4 text-cyan-400" />
              Network & Device Attribution
            </div>
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <div>
                <div className="text-slate-500 text-[11px]">Router Device</div>
                <div className="font-mono text-slate-200 font-medium mt-0.5">
                  {flow.deviceHostname || "Unassociated Router"}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">Exporter IP</div>
                <div className="font-mono text-slate-200 mt-0.5">
                  {flow.exporterIp}:{flow.exporterPort}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">Associated Sensor</div>
                <div className="font-mono text-cyan-400 mt-0.5">
                  {flow.sensorName || "Global / Unassigned Sensor"}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">Collector Port</div>
                <div className="font-mono text-slate-200 mt-0.5">
                  UDP {flow.collectorPort}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">Ingress Interface</div>
                <div className="font-mono text-slate-300 mt-0.5">
                  {flow.interfaceName || (flow.inIfIndex ? `ifIndex ${flow.inIfIndex}` : "—")}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-[11px]">Egress Interface</div>
                <div className="font-mono text-slate-300 mt-0.5">
                  {flow.outIfIndex ? `ifIndex ${flow.outIfIndex}` : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Timestamps */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Clock className="w-4 h-4 text-cyan-400" />
              Timestamps & Traceability
            </div>
            <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Flow Event Timestamp:</span>
                <span className="text-slate-200">
                  {new Date(flow.timestamp).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Collector Ingestion Time:</span>
                <span className="text-slate-200">
                  {new Date(flow.receivedAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

