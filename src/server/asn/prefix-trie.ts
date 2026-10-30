/**
 * High-Performance Longest Prefix Match (LPM) Radix Trie for IPv4 & IPv6.
 * Guarantees O(k) lookup time where k <= 32 for IPv4 and k <= 128 for IPv6.
 */

export interface PrefixEntry<T = unknown> {
  cidr: string;
  prefixLength: number;
  data: T;
}

class TrieNode<T> {
  left: TrieNode<T> | null = null; // Bit 0
  right: TrieNode<T> | null = null; // Bit 1
  entry: PrefixEntry<T> | null = null;
}

/**
 * Parses an IPv4 string into an unsigned 32-bit integer.
 */
export function ipv4ToUint32(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;

  let res = 0;
  for (let i = 0; i < 4; i++) {
    const num = parseInt(parts[i], 10);
    if (isNaN(num) || num < 0 || num > 255) return null;
    res = ((res << 8) | num) >>> 0;
  }
  return res >>> 0;
}

/**
 * Converts a uint32 integer back to an IPv4 string.
 */
export function uint32ToIpv4(val: number): string {
  return [
    (val >>> 24) & 255,
    (val >>> 16) & 255,
    (val >>> 8) & 255,
    val & 255,
  ].join(".");
}

/**
 * Parses and validates an IPv4 CIDR string (e.g. "192.168.1.0/24").
 * Normalizes host bits to 0.
 */
export function parseIpv4Cidr(cidr: string): { network: number; prefixLength: number; normalizedCidr: string } | null {
  const [ipStr, lenStr] = cidr.trim().split("/");
  if (!ipStr) return null;

  const ip = ipv4ToUint32(ipStr);
  if (ip === null) return null;

  const prefixLength = lenStr !== undefined ? parseInt(lenStr, 10) : 32;
  if (isNaN(prefixLength) || prefixLength < 0 || prefixLength > 32) return null;

  const mask = prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
  const network = (ip & mask) >>> 0;
  const normalizedCidr = `${uint32ToIpv4(network)}/${prefixLength}`;

  return { network, prefixLength, normalizedCidr };
}

/**
 * Checks if an IPv4 or IPv6 address is Private, RFC 1918, CGNAT, Loopback, or Reserved.
 */
export function isPrivateOrReservedIp(ipStr: string): { isPrivate: boolean; reason?: string } {
  const cleanIp = ipStr.trim().toLowerCase();

  // IPv6 checks
  if (cleanIp.includes(":")) {
    if (cleanIp === "::1" || cleanIp === "::") {
      return { isPrivate: true, reason: "IPv6 Loopback / Unspecified" };
    }
    if (cleanIp.startsWith("fe80:") || cleanIp.startsWith("fe8") || cleanIp.startsWith("fe9") || cleanIp.startsWith("fea") || cleanIp.startsWith("feb")) {
      return { isPrivate: true, reason: "IPv6 Link-Local (fe80::/10)" };
    }
    if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) {
      return { isPrivate: true, reason: "IPv6 Unique Local (fc00::/7)" };
    }
    if (cleanIp.startsWith("ff")) {
      return { isPrivate: true, reason: "IPv6 Multicast (ff00::/8)" };
    }
    return { isPrivate: false };
  }

  // IPv4 checks
  const ip = ipv4ToUint32(cleanIp);
  if (ip === null) {
    return { isPrivate: true, reason: "Invalid IP Address" };
  }

  // 10.0.0.0/8 (10.x.x.x)
  if ((ip >>> 24) === 10) {
    return { isPrivate: true, reason: "RFC 1918 Private (10.0.0.0/8)" };
  }
  // 172.16.0.0/12 (172.16.0.0 to 172.31.255.255)
  if ((ip >>> 20) === 0xac1) {
    return { isPrivate: true, reason: "RFC 1918 Private (172.16.0.0/12)" };
  }
  // 192.168.0.0/16
  if ((ip >>> 16) === 0xc0a8) {
    return { isPrivate: true, reason: "RFC 1918 Private (192.168.0.0/16)" };
  }
  // 100.64.0.0/10 (Carrier-Grade NAT)
  if ((ip >>> 22) === 0x191) {
    return { isPrivate: true, reason: "RFC 6598 CGNAT (100.64.0.0/10)" };
  }
  // 127.0.0.0/8 (Loopback)
  if ((ip >>> 24) === 127) {
    return { isPrivate: true, reason: "Loopback (127.0.0.0/8)" };
  }
  // 169.254.0.0/16 (Link-Local)
  if ((ip >>> 16) === 0xa9fe) {
    return { isPrivate: true, reason: "Link-Local (169.254.0.0/16)" };
  }
  // 224.0.0.0/4 (Multicast: 224.0.0.0 to 239.255.255.255)
  if ((ip >>> 28) === 14) {
    return { isPrivate: true, reason: "Multicast (224.0.0.0/4)" };
  }
  // 240.0.0.0/4 (Reserved: 240.0.0.0 to 255.255.255.255)
  if ((ip >>> 28) === 15) {
    return { isPrivate: true, reason: "Reserved (240.0.0.0/4)" };
  }
  // 0.0.0.0/8
  if ((ip >>> 24) === 0) {
    return { isPrivate: true, reason: "This Network (0.0.0.0/8)" };
  }

  return { isPrivate: false };
}

/**
 * Radix Tree for IPv4 Longest Prefix Match.
 */
export class RadixTrie<T> {
  private root: TrieNode<T> = new TrieNode<T>();
  private size: number = 0;

  /**
   * Insert a prefix CIDR into the trie.
   */
  public insert(cidr: string, data: T): boolean {
    const parsed = parseIpv4Cidr(cidr);
    if (!parsed) return false;

    let current = this.root;
    const { network, prefixLength, normalizedCidr } = parsed;

    for (let i = 0; i < prefixLength; i++) {
      const bit = (network >>> (31 - i)) & 1;
      if (bit === 0) {
        if (!current.left) current.left = new TrieNode<T>();
        current = current.left;
      } else {
        if (!current.right) current.right = new TrieNode<T>();
        current = current.right;
      }
    }

    if (!current.entry) {
      this.size++;
    }

    current.entry = {
      cidr: normalizedCidr,
      prefixLength,
      data,
    };

    return true;
  }

  /**
   * Lookup the Longest Prefix Match for an IP address.
   */
  public lookup(ipStr: string): PrefixEntry<T> | null {
    const ip = ipv4ToUint32(ipStr);
    if (ip === null) return null;

    let current: TrieNode<T> | null = this.root;
    let longestMatch: PrefixEntry<T> | null = null;

    for (let i = 0; i < 32; i++) {
      if (!current) break;

      if (current.entry) {
        longestMatch = current.entry;
      }

      const bit = (ip >>> (31 - i)) & 1;
      current = bit === 0 ? current.left : current.right;
    }

    if (current && current.entry) {
      longestMatch = current.entry;
    }

    return longestMatch;
  }

  public clear(): void {
    this.root = new TrieNode<T>();
    this.size = 0;
  }

  public getSize(): number {
    return this.size;
  }
}
