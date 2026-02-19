/**
 * Environment Variable Validation
 * Validates required environment variables on startup
 */

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
  "SCOPES",
] as const;

const OPTIONAL_BUT_RECOMMENDED = [
  "REDIS_URL", // Required for queue processing
  "ANTHROPIC_API_KEY", // Required for AI analysis
] as const;

export interface EnvConfig {
  DATABASE_URL: string;
  REDIS_URL?: string;
  ANTHROPIC_API_KEY?: string;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SCOPES: string;
  NODE_ENV: string;
}

/**
 * Validate that all required environment variables are set
 * Call this on server startup
 */
export function validateEnv(): EnvConfig {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required vars
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // Check optional but recommended vars
  for (const key of OPTIONAL_BUT_RECOMMENDED) {
    if (!process.env[key]) {
      warnings.push(key);
    }
  }

  // Throw if required vars are missing
  if (missing.length > 0) {
    throw new Error(
      `[VisionTags] Missing required environment variables: ${missing.join(", ")}`
    );
  }

  // Warn about optional vars
  if (warnings.length > 0) {
    console.warn(
      `[VisionTags] Missing optional environment variables (some features may not work): ${warnings.join(", ")}`
    );
  }

  // Return typed config
  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    REDIS_URL: process.env.REDIS_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY!,
    SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET!,
    SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL!,
    SCOPES: process.env.SCOPES!,
    NODE_ENV: process.env.NODE_ENV || "development",
  };
}

/**
 * Get validated environment config
 * Caches the result after first call
 */
let cachedConfig: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!cachedConfig) {
    cachedConfig = validateEnv();
  }
  return cachedConfig;
}
