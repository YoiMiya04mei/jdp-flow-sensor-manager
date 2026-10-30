/**
 * Safe buffer reading and IP decoding utilities for Flow Decoders.
 */

export function checkBounds(buffer: Buffer, offset: number, requiredLength: number): boolean {
  return offset >= 0 && requiredLength >= 0 && offset + requiredLength <= buffer.length;
}

export function readIPv4(buffer: Buffer, offset: number): string {
  if (!checkBounds(buffer, offset, 4)) return "0.0.0.0";
  return `${buffer[offset]}.${buffer[offset + 1]}.${buffer[offset + 2]}.${buffer[offset + 3]}`;
}

export function readIPv6(buffer: Buffer, offset: number): string {
  if (!checkBounds(buffer, offset, 16)) return "::";
  const parts: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    parts.push(buffer.readUInt16BE(offset + i).toString(16));
  }
  return parts.join(":");
}

export function readMac(buffer: Buffer, offset: number): string {
  if (!checkBounds(buffer, offset, 6)) return "00:00:00:00:00:00";
  const bytes = [];
  for (let i = 0; i < 6; i++) {
    bytes.push(buffer[offset + i].toString(16).padStart(2, "0"));
  }
  return bytes.join(":");
}

/**
 * Read variable length integer (1, 2, 4, 8 bytes)
 */
export function readVariableUInt(buffer: Buffer, offset: number, length: number): number {
  if (!checkBounds(buffer, offset, length)) return 0;
  switch (length) {
    case 1:
      return buffer.readUInt8(offset);
    case 2:
      return buffer.readUInt16BE(offset);
    case 3:
      return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
    case 4:
      return buffer.readUInt32BE(offset);
    case 8: {
      const big = buffer.readBigUInt64BE(offset);
      return Number(big);
    }
    default:
      return 0;
  }
}

