import { db } from "../db";
import { asnDirectory, prefixMapping, customerNetworks } from "../db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export interface SeedAsn {
  asn: number;
  name: string;
  country: string;
  organizationType: "tier1" | "transit" | "content_cdn" | "eyeball_isp" | "enterprise";
  prefixes: string[];
}

export const BASELINE_ASN_DATA: SeedAsn[] = [
  // Indonesian ISPs & Telcos
  {
    asn: 7713,
    name: "PT Telekomunikasi Indonesia (Telkom)",
    country: "ID",
    organizationType: "eyeball_isp",
    prefixes: ["180.240.0.0/13", "125.160.0.0/12", "36.64.0.0/10", "118.96.0.0/11"],
  },
  {
    asn: 17974,
    name: "PT Telekomunikasi Selular (Telkomsel)",
    country: "ID",
    organizationType: "eyeball_isp",
    prefixes: ["114.120.0.0/14", "182.0.0.0/11", "27.111.32.0/20", "110.136.0.0/13"],
  },
  {
    asn: 4761,
    name: "PT Indosat Tbk (Indosat Ooredoo Hutchison)",
    country: "ID",
    organizationType: "eyeball_isp",
    prefixes: ["114.4.0.0/14", "202.155.0.0/16", "124.81.0.0/16", "182.253.0.0/16"],
  },
  {
    asn: 23700,
    name: "PT Mega Akses Persada (Biznet Networks)",
    country: "ID",
    organizationType: "eyeball_isp",
    prefixes: ["182.253.96.0/19", "103.111.140.0/22", "103.16.200.0/22"],
  },
  {
    asn: 24203,
    name: "PT Cyberindo Aditama (CBN)",
    country: "ID",
    organizationType: "eyeball_isp",
    prefixes: ["202.158.0.0/19", "103.18.104.0/22", "116.197.128.0/19"],
  },
  {
    asn: 9272,
    name: "PT Mora Telematika Indonesia (Moratelindo)",
    country: "ID",
    organizationType: "transit",
    prefixes: ["103.28.160.0/22", "103.20.12.0/22"],
  },
  {
    asn: 136052,
    name: "PT Jala Lintas Media (JLM / JDP Network)",
    country: "ID",
    organizationType: "eyeball_isp",
    prefixes: ["103.150.10.0/23", "103.150.12.0/23"],
  },

  // Global Content Providers & CDNs
  {
    asn: 15169,
    name: "Google LLC",
    country: "US",
    organizationType: "content_cdn",
    prefixes: ["8.8.8.0/24", "8.8.4.0/24", "142.250.0.0/15", "172.217.0.0/16"],
  },
  {
    asn: 13335,
    name: "Cloudflare, Inc.",
    country: "US",
    organizationType: "content_cdn",
    prefixes: ["1.1.1.0/24", "1.0.0.0/24", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13"],
  },
  {
    asn: 32934,
    name: "Meta Platforms, Inc. (Facebook)",
    country: "US",
    organizationType: "content_cdn",
    prefixes: ["157.240.0.0/16", "31.13.64.0/18", "69.171.224.0/19"],
  },
  {
    asn: 16509,
    name: "Amazon.com, Inc. (AWS)",
    country: "US",
    organizationType: "content_cdn",
    prefixes: ["13.32.0.0/15", "52.84.0.0/15", "54.239.0.0/16"],
  },
  {
    asn: 8075,
    name: "Microsoft Corporation",
    country: "US",
    organizationType: "content_cdn",
    prefixes: ["13.104.0.0/14", "20.190.128.0/18", "40.126.0.0/18"],
  },
  {
    asn: 20940,
    name: "Akamai Technologies, Inc.",
    country: "US",
    organizationType: "content_cdn",
    prefixes: ["23.32.0.0/11", "104.64.0.0/10"],
  },

  // Tier 1 Upstreams
  {
    asn: 174,
    name: "Cogent Communications",
    country: "US",
    organizationType: "tier1",
    prefixes: ["38.0.0.0/8", "154.0.0.0/16"],
  },
  {
    asn: 3356,
    name: "Lumen / Level 3",
    country: "US",
    organizationType: "tier1",
    prefixes: ["4.0.0.0/9", "8.0.0.0/10"],
  },
  {
    asn: 2914,
    name: "NTT Communications Corporation",
    country: "JP",
    organizationType: "tier1",
    prefixes: ["129.250.0.0/16"],
  },
];

export const BASELINE_CUSTOMER_NETWORKS = [
  {
    name: "JDP NOC Core Infrastructure",
    cidr: "10.200.0.0/16",
    networkType: "internal" as const,
    asn: 136052,
    description: "Internal router management and flow collector infrastructure",
  },
  {
    name: "Corporate Client - Bank Mandiri",
    cidr: "103.10.20.0/24",
    networkType: "customer" as const,
    asn: 136052,
    description: "Dedicated leased-line banking connection",
  },
  {
    name: "Corporate Client - BCA Finance",
    cidr: "103.11.30.0/24",
    networkType: "customer" as const,
    asn: 136052,
    description: "Financial enterprise connection",
  },
  {
    name: "Broadband FTTH - Cyber Building POP",
    cidr: "103.150.10.0/24",
    networkType: "customer" as const,
    asn: 136052,
    description: "Residential GPON subscriber pool Jakarta",
  },
  {
    name: "Direct Peering - Telkomsel IXP",
    cidr: "103.150.11.0/24",
    networkType: "partner" as const,
    asn: 17974,
    description: "Local peering exchange link",
  },
];

/**
 * Seeds baseline ASN directory, prefixes, and customer networks into database.
 */
export async function seedBaselineAsnData(): Promise<{
  asnsSeeded: number;
  prefixesSeeded: number;
  customersSeeded: number;
}> {
  const now = new Date().toISOString();
  let asnsSeeded = 0;
  let prefixesSeeded = 0;
  let customersSeeded = 0;

  for (const item of BASELINE_ASN_DATA) {
    // 1. Insert or update ASN Directory
    const [existingAsn] = await db
      .select()
      .from(asnDirectory)
      .where(eq(asnDirectory.asn, item.asn))
      .limit(1);

    if (!existingAsn) {
      await db.insert(asnDirectory).values({
        asn: item.asn,
        name: item.name,
        country: item.country,
        organizationType: item.organizationType,
        updatedAt: now,
      });
      asnsSeeded++;
    }

    // 2. Insert Prefix Mappings
    for (const cidr of item.prefixes) {
      const [existingPfx] = await db
        .select()
        .from(prefixMapping)
        .where(eq(prefixMapping.cidr, cidr))
        .limit(1);

      if (!existingPfx) {
        await db.insert(prefixMapping).values({
          id: crypto.randomUUID(),
          cidr,
          family: cidr.includes(":") ? "ipv6" : "ipv4",
          asn: item.asn,
          source: "baseline_registry",
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        prefixesSeeded++;
      }
    }
  }

  // 3. Insert Customer Networks
  for (const cust of BASELINE_CUSTOMER_NETWORKS) {
    const [existingCust] = await db
      .select()
      .from(customerNetworks)
      .where(eq(customerNetworks.cidr, cust.cidr))
      .limit(1);

    if (!existingCust) {
      await db.insert(customerNetworks).values({
        id: crypto.randomUUID(),
        name: cust.name,
        cidr: cust.cidr,
        family: cust.cidr.includes(":") ? "ipv6" : "ipv4",
        networkType: cust.networkType,
        asn: cust.asn,
        description: cust.description,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      customersSeeded++;
    }
  }

  return { asnsSeeded, prefixesSeeded, customersSeeded };
}

