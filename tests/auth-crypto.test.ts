import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  encryptSecret,
  decryptSecret,
  redactDeviceSecrets,
} from "@/server/auth/crypto";

describe("Cryptographic Security & Password Hashing", () => {
  it("should securely hash password using scrypt with unique salt", () => {
    const password = "SuperSecretNocPassword123!";
    const hash1 = hashPassword(password);
    const hash2 = hashPassword(password);

    // Formatted as scrypt:salt:hash
    expect(hash1).toMatch(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(hash2).toMatch(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    // Two hashes of the same password should differ due to distinct random salt
    expect(hash1).not.toBe(hash2);
  });

  it("should successfully verify matching password and reject mismatch", () => {
    const password = "JdpNocOperatorPassword2026!";
    const hash = hashPassword(password);

    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword("WrongPassword123!", hash)).toBe(false);
    expect(verifyPassword("", hash)).toBe(false);
    expect(verifyPassword(password, "invalid-format")).toBe(false);
  });

  it("should encrypt sensitive router credentials using AES-256-GCM and decrypt accurately", () => {
    const snmpCommunity = "public-noc-community-secret-string";
    const encrypted = encryptSecret(snmpCommunity);

    // Format: iv:authTag:ciphertext
    const parts = encrypted.split(":");
    expect(parts.length).toBe(3);
    expect(encrypted).not.toContain(snmpCommunity);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(snmpCommunity);
  });

  it("should fail decryption if auth tag or ciphertext is tampered", () => {
    const encrypted = encryptSecret("sample-secret");
    const parts = encrypted.split(":");
    // Tamper with ciphertext
    const tampered = `${parts[0]}:${parts[1]}:deadbeef`;

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("should properly redact secrets from device object before API serialization", () => {
    const rawDevice = {
      id: "dev-01",
      hostname: "router-01",
      snmpCommunityEncrypted: "iv:tag:cipher",
      snmpV3AuthPassEncrypted: "iv:tag:cipher2",
      snmpV3PrivPassEncrypted: "iv:tag:cipher3",
    };

    const redacted = redactDeviceSecrets(rawDevice);

    expect("snmpCommunityEncrypted" in redacted).toBe(false);
    expect("snmpV3AuthPassEncrypted" in redacted).toBe(false);
    expect("snmpV3PrivPassEncrypted" in redacted).toBe(false);
    expect(redacted.hasSnmpCommunity).toBe(true);
    expect(redacted.hasSnmpV3AuthPass).toBe(true);
    expect(redacted.hasSnmpV3PrivPass).toBe(true);
  });
});
