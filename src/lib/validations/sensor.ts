import { z } from "zod";
import { isValidIpAddress } from "./device";

export const createSensorSchema = z.object({
  name: z
    .string()
    .min(1, "Sensor name wajib diisi")
    .max(128, "Sensor name maksimal 128 karakter"),
  deviceId: z.string().min(1, "Perangkat wajib dipilih"),
  description: z.string().max(500, "Deskripsi maksimal 500 karakter").optional().nullable(),
  protocol: z.enum(["netflow_v5", "netflow_v9", "ipfix", "sflow_v5"], {
    required_error: "Protokol flow wajib dipilih",
  }),
  collectorIp: z
    .string()
    .default("0.0.0.0")
    .refine((ip) => ip === "0.0.0.0" || isValidIpAddress(ip), {
      message: "Format IP Collector tidak valid",
    }),
  collectorPort: z
    .number()
    .int("Port UDP harus berupa angka bulat")
    .min(1, "Port UDP minimal 1")
    .max(65535, "Port UDP maksimal 65535")
    .default(2055),
  ifIndex: z.number().int().optional().nullable(),
  samplingRate: z
    .number()
    .int("Sampling rate harus berupa angka bulat")
    .min(1, "Sampling rate minimal 1:1")
    .max(1000000, "Sampling rate maksimal 1:1.000.000")
    .default(1000),
  direction: z.enum(["ingress", "egress", "both"]).default("both"),
  status: z
    .enum(["draft", "waiting_for_flow", "disabled"])
    .default("waiting_for_flow"),
});

export const updateSensorSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(500).optional().nullable(),
  protocol: z.enum(["netflow_v5", "netflow_v9", "ipfix", "sflow_v5"]).optional(),
  collectorIp: z
    .string()
    .refine((ip) => ip === "0.0.0.0" || isValidIpAddress(ip), {
      message: "Format IP Collector tidak valid",
    })
    .optional(),
  collectorPort: z.number().int().min(1).max(65535).optional(),
  ifIndex: z.number().int().optional().nullable(),
  samplingRate: z.number().int().min(1).max(1000000).optional(),
  direction: z.enum(["ingress", "egress", "both"]).optional(),
  status: z
    .enum(["draft", "waiting_for_flow", "active", "stale", "error", "disabled"])
    .optional(),
});

export type CreateSensorInput = z.infer<typeof createSensorSchema>;
export type UpdateSensorInput = z.infer<typeof updateSensorSchema>;

