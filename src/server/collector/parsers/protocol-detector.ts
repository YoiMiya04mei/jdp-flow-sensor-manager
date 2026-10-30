import type { FlowProtocol } from "@/types";

export function detectProtocol(packet: Buffer): FlowProtocol | null {
  if (packet.length < 2) return null;

  // Check 32-bit sFlow header first (version 5 has bytes 0x00 0x00 0x00 0x05)
  if (packet.length >= 4 && packet.readUInt32BE(0) === 5) {
    return "sflow_v5";
  }

  // Check 16-bit NetFlow / IPFIX version
  const version16 = packet.readUInt16BE(0);
  switch (version16) {
    case 5:
      return "netflow_v5";
    case 9:
      return "netflow_v9";
    case 10:
      return "ipfix";
    default:
      return null;
  }
}

