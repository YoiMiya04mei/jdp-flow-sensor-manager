import crypto from "crypto";
import {
  assertProductionSecrets,
  DEFAULT_DEMO_ENCRYPTION_KEY,
} from "./secret-validator";

// Enforce production secrets on initialization
assertProductionSecrets();

const ENCRYPTION_KEY_HEX =
  process.env.CREDENTIAL_ENCRYPTION_KEY || DEFAULT_DEMO_ENCRYPTION_KEY;

// Ensure 32-byte key for AES-256
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX.slice(0, 64), "hex");

/**
 * Hash a password using scrypt with a cryptographically secure random salt.
 * Output format: "scrypt:<salt_hex>:<hash_hex>"
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify a plaintext password against a stored scrypt hash.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(":");
    if (parts.length !== 3 || parts[0] !== "scrypt") {
      return false;
    }
    const salt = parts[1];
    const key = parts[2];
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(
      Buffer.from(derivedKey.toString("hex")),
      Buffer.from(key)
    );
  } catch {
    return false;
  }
}

/**
 * Encrypt sensitive router/SNMP credentials using AES-256-GCM.
 * Output format: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 * NEVER returns plaintext.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(12); // 96-bit IV standard for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt sensitive credentials using AES-256-GCM.
 * Used exclusively by backend network adapters (SNMP/SSH worker).
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return "";
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted credential format");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    ENCRYPTION_KEY,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Redact sensitive fields from any entity before returning it in an API response.
 */
export function redactDeviceSecrets<T extends Record<string, any>>(
  device: T
): Omit<
  T,
  "snmpCommunityEncrypted" | "snmpV3AuthPassEncrypted" | "snmpV3PrivPassEncrypted"
> & {
  hasSnmpCommunity?: boolean;
  hasSnmpV3AuthPass?: boolean;
  hasSnmpV3PrivPass?: boolean;
} {
  const safe: any = { ...device };
  if ("snmpCommunityEncrypted" in safe) {
    safe.hasSnmpCommunity = Boolean(safe.snmpCommunityEncrypted);
    delete safe.snmpCommunityEncrypted;
  }
  if ("snmpV3AuthPassEncrypted" in safe) {
    safe.hasSnmpV3AuthPass = Boolean(safe.snmpV3AuthPassEncrypted);
    delete safe.snmpV3AuthPassEncrypted;
  }
  if ("snmpV3PrivPassEncrypted" in safe) {
    safe.hasSnmpV3PrivPass = Boolean(safe.snmpV3PrivPassEncrypted);
    delete safe.snmpV3PrivPassEncrypted;
  }
  return safe;
}

