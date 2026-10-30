/**
 * CLI Parameter Sanitizer and Validator.
 * Strictly prevents CLI Command Injection across multi-vendor syntax
 * (Junos, Huawei VRP, MikroTik RouterOS, Cisco IOS).
 */

const DANGEROUS_CLI_CHARS = /[;\n\r`$|&><\\]/;
const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9_\-\.:\/]+$/;
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;

export interface SanitizeResult<T = string> {
  valid: boolean;
  sanitized?: T;
  error?: string;
}

/**
 * Validates and sanitizes a CLI identifier (e.g. interface name, device name).
 */
export function sanitizeCliIdentifier(val: string, fieldName: string = "Identifier"): SanitizeResult<string> {
  const trimmed = val.trim();
  if (!trimmed) {
    return { valid: false, error: `${fieldName} cannot be empty.` };
  }

  if (DANGEROUS_CLI_CHARS.test(trimmed)) {
    return {
      valid: false,
      error: `Security Alert: ${fieldName} contains illegal characters (;, \\n, \`, $, |, &, >, <, \\) that may allow CLI injection.`,
    };
  }

  if (!SAFE_IDENTIFIER_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: `${fieldName} contains invalid characters. Only alphanumeric, dashes, dots, underscores, slashes, and colons are permitted.`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validates an IP address (IPv4 or IPv6).
 */
export function sanitizeIpAddress(ip: string, fieldName: string = "IP Address"): SanitizeResult<string> {
  const trimmed = ip.trim();
  if (!trimmed) {
    return { valid: false, error: `${fieldName} cannot be empty.` };
  }

  if (DANGEROUS_CLI_CHARS.test(trimmed)) {
    return {
      valid: false,
      error: `Security Alert: ${fieldName} contains illegal command injection characters.`,
    };
  }

  if (!IPV4_REGEX.test(trimmed) && !IPV6_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: `${fieldName} '${trimmed}' is not a valid IPv4 or IPv6 address.`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validates a UDP or TCP port number (1-65535).
 */
export function sanitizePortNumber(port: number, fieldName: string = "Port"): SanitizeResult<number> {
  if (isNaN(port) || port < 1 || port > 65535 || !Number.isInteger(port)) {
    return {
      valid: false,
      error: `${fieldName} must be an integer between 1 and 65535.`,
    };
  }
  return { valid: true, sanitized: port };
}

/**
 * Validates a sampling rate (1-1000000).
 */
export function sanitizeSamplingRate(rate: number, fieldName: string = "Sampling Rate"): SanitizeResult<number> {
  if (isNaN(rate) || rate < 1 || rate > 1000000 || !Number.isInteger(rate)) {
    return {
      valid: false,
      error: `${fieldName} must be a positive integer between 1 and 1,000,000.`,
    };
  }
  return { valid: true, sanitized: rate };
}

/**
 * Sanitizes a generic single-line text description, escaping or removing CLI injection vectors.
 */
export function sanitizeCliComment(comment: string): string {
  return comment.replace(/[\n\r;`$|&><\\]/g, " ").trim();
}

