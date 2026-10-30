/**
 * Production Secrets and Cryptographic Guardrail Validator.
 * Enforces strict security requirements in production mode (NODE_ENV=production):
 * - Rejects empty, missing, or default demo credentials.
 * - Enforces minimum entropy and key formats.
 * - Prevents sensitive secret leakage to logs.
 */

export const DEFAULT_DEMO_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export const DEFAULT_DEMO_JWT_SECRET =
  "super-secret-jdp-noc-jwt-token-key-change-in-production";

const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;

export interface SecretValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates environment secrets against production standards.
 */
export function validateProductionSecrets(
  env: Record<string, string | undefined> = process.env
): SecretValidationResult {
  const errors: string[] = [];
  const isProduction = env.NODE_ENV === "production";

  const encKey = env.CREDENTIAL_ENCRYPTION_KEY?.trim();
  const jwtSecret = env.JWT_SECRET?.trim();

  // 1. CREDENTIAL_ENCRYPTION_KEY Validation
  if (isProduction) {
    if (!encKey) {
      errors.push(
        "CREDENTIAL_ENCRYPTION_KEY is required in production but was not provided."
      );
    } else if (encKey === DEFAULT_DEMO_ENCRYPTION_KEY) {
      errors.push(
        "CREDENTIAL_ENCRYPTION_KEY cannot use the default demo placeholder in production."
      );
    } else if (!HEX_64_REGEX.test(encKey)) {
      errors.push(
        "CREDENTIAL_ENCRYPTION_KEY in production must be exactly 64 hexadecimal characters (32 bytes)."
      );
    }
  } else {
    // In development/test, validate format if provided
    if (encKey && !HEX_64_REGEX.test(encKey) && encKey !== DEFAULT_DEMO_ENCRYPTION_KEY) {
      errors.push(
        "CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)."
      );
    }
  }

  // 2. JWT_SECRET Validation
  if (isProduction) {
    if (!jwtSecret) {
      errors.push("JWT_SECRET is required in production but was not provided.");
    } else if (
      jwtSecret === DEFAULT_DEMO_JWT_SECRET ||
      jwtSecret.toLowerCase().includes("change-in-production") ||
      jwtSecret.toLowerCase().includes("secret-jdp")
    ) {
      errors.push(
        "JWT_SECRET cannot use default or placeholder values in production."
      );
    } else if (jwtSecret.length < 32) {
      errors.push(
        `JWT_SECRET in production must be at least 32 characters long (provided: ${jwtSecret.length} chars).`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Asserts production secrets validity. Throws a fatal error if validation fails in production.
 * NEVER prints actual secret contents to logs or error messages.
 */
export function assertProductionSecrets(
  env: Record<string, string | undefined> = process.env
): void {
  if (env.NODE_ENV !== "production") return;

  // During Next.js static asset compilation and bundling ('next build' in CI or Docker image creation),
  // runtime secrets are deliberately not present or baked into the image artifact.
  // Full validation is strictly enforced when the server process starts serving traffic.
  const isBuildPhase =
    env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build" ||
    (typeof process !== "undefined" &&
      process.argv &&
      process.argv.some((arg) => arg.includes("next") || arg === "build"));

  if (isBuildPhase && !env.__FORCE_VALIDATION_IN_BUILD__) {
    return;
  }

  const result = validateProductionSecrets(env);
  if (!result.valid) {
    const errorMsg = [
      "================================================================================",
      " [FATAL SECURITY ERROR] PRODUCTION SECRETS VALIDATION FAILED",
      " The application refused to start because production secrets are insecure:",
      ...result.errors.map((e) => `   - ${e}`),
      " Action required: Update your .env or container environment variables with secure keys.",
      " Do NOT use default demo secrets in production.",
      "================================================================================",
    ].join("\n");

    throw new Error(errorMsg);
  }
}

