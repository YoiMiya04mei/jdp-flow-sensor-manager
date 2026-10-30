import { z } from "zod";

// Helper regex for IPv4 and IPv6
const IPV4_REGEX =
  /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

export const isValidIpAddress = (ip: string): boolean => {
  return IPV4_REGEX.test(ip) || IPV6_REGEX.test(ip);
};

export const createDeviceSchema = z.object({
  hostname: z
    .string()
    .min(1, "Hostname wajib diisi")
    .max(128, "Hostname maksimal 128 karakter")
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
      "Hostname hanya boleh berisi huruf, angka, titik, minus, dan underscore"
    ),
  managementIp: z
    .string()
    .min(1, "Management IP wajib diisi")
    .refine(isValidIpAddress, {
      message: "Format Management IP tidak valid (harus IPv4 atau IPv6 valid)",
    }),
  vendor: z.enum(
    ["juniper", "huawei", "mikrotik", "cisco", "nokia", "zte", "other"],
    {
      required_error: "Vendor wajib dipilih",
    }
  ),
  model: z.string().max(64).optional().nullable(),
  role: z
    .enum(["core", "edge", "distribution", "access", "firewall", "other"])
    .default("edge"),
  asnNumber: z
    .number()
    .int()
    .min(1, "ASN minimal 1")
    .max(4294967295, "ASN maksimal 4294967295 (32-bit)")
    .optional()
    .nullable(),
  asnName: z.string().max(128).optional().nullable(),
  locationSite: z.string().max(128).optional().nullable(),
  tags: z.string().max(255).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  status: z
    .enum(["active", "unreachable", "maintenance", "disabled"])
    .default("active"),

  // SNMP Configuration
  snmpEnabled: z.boolean().default(false),
  snmpVersion: z.enum(["v2c", "v3"]).default("v3"),
  snmpPort: z.number().int().min(1).max(65535).default(161),

  // SNMPv2c
  snmpCommunity: z.string().max(128).optional().nullable(),

  // SNMPv3
  snmpV3User: z.string().max(64).optional().nullable(),
  snmpV3AuthProto: z.enum(["MD5", "SHA", "SHA256"]).optional().nullable(),
  snmpV3AuthPass: z.string().max(128).optional().nullable(),
  snmpV3PrivProto: z
    .enum(["DES", "AES", "AES128", "AES256"])
    .optional()
    .nullable(),
  snmpV3PrivPass: z.string().max(128).optional().nullable(),
});

export const updateDeviceSchema = createDeviceSchema.partial().extend({
  // When updating, password fields can be omitted if not changing
  changeSnmpCredentials: z.boolean().optional(),
});

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

