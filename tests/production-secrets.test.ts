import { describe, it, expect } from "vitest";
import {
  validateProductionSecrets,
  assertProductionSecrets,
  DEFAULT_DEMO_ENCRYPTION_KEY,
  DEFAULT_DEMO_JWT_SECRET,
} from "@/server/auth/secret-validator";

describe("Pre-Staging Remediation: Production Secrets Guardrail", () => {
  const validHexKey = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
  const validJwtSecret = "super-secure-production-jwt-token-key-with-high-entropy-64-bytes!";

  describe("A. Production Mode (NODE_ENV=production)", () => {
    it("passes validation when both secrets are secure and properly formatted", () => {
      const result = validateProductionSecrets({
        NODE_ENV: "production",
        CREDENTIAL_ENCRYPTION_KEY: validHexKey,
        JWT_SECRET: validJwtSecret,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(() => {
        assertProductionSecrets({
          NODE_ENV: "production",
          CREDENTIAL_ENCRYPTION_KEY: validHexKey,
          JWT_SECRET: validJwtSecret,
        });
      }).not.toThrow();
    });

    it("rejects startup when CREDENTIAL_ENCRYPTION_KEY is empty or missing", () => {
      const result = validateProductionSecrets({
        NODE_ENV: "production",
        CREDENTIAL_ENCRYPTION_KEY: "",
        JWT_SECRET: validJwtSecret,
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("CREDENTIAL_ENCRYPTION_KEY is required in production");

      expect(() => {
        assertProductionSecrets({
          NODE_ENV: "production",
          CREDENTIAL_ENCRYPTION_KEY: "",
          JWT_SECRET: validJwtSecret,
        });
      }).toThrow(/PRODUCTION SECRETS VALIDATION FAILED/);
    });

    it("rejects startup when CREDENTIAL_ENCRYPTION_KEY is the default demo placeholder", () => {
      const result = validateProductionSecrets({
        NODE_ENV: "production",
        CREDENTIAL_ENCRYPTION_KEY: DEFAULT_DEMO_ENCRYPTION_KEY,
        JWT_SECRET: validJwtSecret,
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("cannot use the default demo placeholder");

      expect(() => {
        assertProductionSecrets({
          NODE_ENV: "production",
          CREDENTIAL_ENCRYPTION_KEY: DEFAULT_DEMO_ENCRYPTION_KEY,
          JWT_SECRET: validJwtSecret,
        });
      }).toThrow(/default demo placeholder/);
    });

    it("rejects startup when CREDENTIAL_ENCRYPTION_KEY is not a valid 64-character hex string", () => {
      const result = validateProductionSecrets({
        NODE_ENV: "production",
        CREDENTIAL_ENCRYPTION_KEY: "too-short-or-invalid-hex-chars-not-32-bytes",
        JWT_SECRET: validJwtSecret,
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("must be exactly 64 hexadecimal characters");
    });

    it("rejects startup when JWT_SECRET is empty or missing", () => {
      const result = validateProductionSecrets({
        NODE_ENV: "production",
        CREDENTIAL_ENCRYPTION_KEY: validHexKey,
        JWT_SECRET: "",
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("JWT_SECRET is required in production");
    });

    it("rejects startup when JWT_SECRET is the default demo placeholder", () => {
      const result = validateProductionSecrets({
        NODE_ENV: "production",
        CREDENTIAL_ENCRYPTION_KEY: validHexKey,
        JWT_SECRET: DEFAULT_DEMO_JWT_SECRET,
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("cannot use default or placeholder values in production");
    });

    it("rejects startup when JWT_SECRET is too short (< 32 characters)", () => {
      const result = validateProductionSecrets({
        NODE_ENV: "production",
        CREDENTIAL_ENCRYPTION_KEY: validHexKey,
        JWT_SECRET: "short-secret-under-32-chars",
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("must be at least 32 characters long");
    });

    it("never leaks raw secret values into error messages", () => {
      try {
        assertProductionSecrets({
          NODE_ENV: "production",
          CREDENTIAL_ENCRYPTION_KEY: "invalid-key-value",
          JWT_SECRET: "short",
        });
      } catch (err: any) {
        expect(err.message).not.toContain("invalid-key-value");
        expect(err.message).not.toContain("short");
      }
    });
  });

  describe("B. Development / Test Mode (NODE_ENV != production)", () => {
    it("allows default fallback keys without throwing error in development mode", () => {
      const result = validateProductionSecrets({
        NODE_ENV: "development",
        CREDENTIAL_ENCRYPTION_KEY: DEFAULT_DEMO_ENCRYPTION_KEY,
        JWT_SECRET: DEFAULT_DEMO_JWT_SECRET,
      });

      expect(result.valid).toBe(true);
      expect(() => {
        assertProductionSecrets({
          NODE_ENV: "development",
          CREDENTIAL_ENCRYPTION_KEY: DEFAULT_DEMO_ENCRYPTION_KEY,
          JWT_SECRET: DEFAULT_DEMO_JWT_SECRET,
        });
      }).not.toThrow();
    });
  });
});

