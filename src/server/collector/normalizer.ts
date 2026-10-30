import crypto from "crypto";
import type { RawFlowRecord } from "./types";
import type { NormalizedFlowRecord } from "../analytics/types";
import type { FlowProtocol } from "@/types";
import { sensorRegistry } from "../sensors/sensor-registry";

export interface NormalizationResult {
  records: NormalizedFlowRecord[];
  matchedFlows: number;
  unmatchedFlows: number;
  isKnownExporter: boolean;
  sensorUpdates: Map<
    string,
    {
      sensorId: string;
      packets: number;
      bytes: number;
      flows: number;
      lastSeenMs: number;
    }
  >;
}

export function normalizeFlowRecords(
  rawRecords: RawFlowRecord[],
  exporterIp: string,
  exporterPort: number,
  collectorPort: number,
  protocol: FlowProtocol,
  receivedAt: string = new Date().toISOString()
): NormalizationResult {
  const normalizedList: NormalizedFlowRecord[] = [];
  let matchedFlows = 0;
  let unmatchedFlows = 0;
  let isKnownExporter = false;

  const sensorUpdates = new Map<
    string,
    {
      sensorId: string;
      packets: number;
      bytes: number;
      flows: number;
      lastSeenMs: number;
    }
  >();

  for (const raw of rawRecords) {
    const match = sensorRegistry.matchFlowRecord({
      exporterIp,
      collectorPort,
      protocol,
      inIfIndex: raw.inIfIndex,
      outIfIndex: raw.outIfIndex,
    });

    if (match.isKnownExporter) {
      isKnownExporter = true;
    }

    const matchedSensor = match.sensor;
    const sensorId = matchedSensor ? matchedSensor.id : null;
    const deviceId = match.deviceId;

    // Determine sampling rate: packet field > sensor configuration > default 1
    let effectiveSamplingRate = 1;
    if (raw.samplingRate && raw.samplingRate > 0) {
      effectiveSamplingRate = raw.samplingRate;
    } else if (matchedSensor && matchedSensor.samplingRate > 0) {
      effectiveSamplingRate = matchedSensor.samplingRate;
    }

    const samplingAdjustedPackets = raw.packetCount * effectiveSamplingRate;
    const samplingAdjustedBytes = raw.byteCount * effectiveSamplingRate;
    const timestamp = raw.flowEndMs ?? raw.flowStartMs ?? Date.now();

    const normalized: NormalizedFlowRecord = {
      id: crypto.randomUUID(),
      timestamp,
      receivedAt,
      exporterIp,
      exporterPort,
      collectorPort,
      sensorId,
      deviceId,
      protocol,
      ipVersion: raw.ipVersion,
      srcIp: raw.srcIp,
      dstIp: raw.dstIp,
      srcPort: raw.srcPort,
      dstPort: raw.dstPort,
      ipProtocol: raw.ipProtocol,
      tcpFlags: raw.tcpFlags,
      inIfIndex: raw.inIfIndex,
      outIfIndex: raw.outIfIndex,
      packetCount: raw.packetCount,
      byteCount: raw.byteCount,
      samplingRate: effectiveSamplingRate,
      samplingAdjustedPackets,
      samplingAdjustedBytes,
      srcAsn: raw.srcAsn,
      dstAsn: raw.dstAsn,
      completeness:
        raw.srcIp !== "0.0.0.0" && raw.dstIp !== "0.0.0.0" ? "complete" : "partial",
    };

    normalizedList.push(normalized);

    if (sensorId) {
      matchedFlows++;
      const current = sensorUpdates.get(sensorId) || {
        sensorId,
        packets: 0,
        bytes: 0,
        flows: 0,
        lastSeenMs: timestamp,
      };
      current.packets += raw.packetCount;
      current.bytes += raw.byteCount;
      current.flows += 1;
      current.lastSeenMs = Math.max(current.lastSeenMs, timestamp);
      sensorUpdates.set(sensorId, current);
    } else {
      unmatchedFlows++;
    }
  }

  return {
    records: normalizedList,
    matchedFlows,
    unmatchedFlows,
    isKnownExporter,
    sensorUpdates,
  };
}

