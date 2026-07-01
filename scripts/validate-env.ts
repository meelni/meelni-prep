/**
 * Environment Variable Validation Script
 * Run this before deployment to ensure all required env vars are set
 */

import { isPlaceholderEnvValue } from "./local-env.mjs";

interface EnvVarConfig {
  name: string;
  required: boolean;
  description: string;
  pattern?: RegExp;
}

const envVars: EnvVarConfig[] = [
  // Database
  {
    name: "DATABASE_URL",
    required: true,
    description: "PostgreSQL connection string (Supabase)",
    pattern: /^postgresql:\/\/.+/,
  },

  // Supabase Auth
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    description: "Supabase project URL",
    pattern: /^https:\/\/.+\.supabase\.co$/,
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    description: "Supabase anonymous key",
    pattern: /^eyJ.+/,
  },

  // LiveKit
  {
    name: "LIVEKIT_API_KEY",
    required: true,
    description: "LiveKit API key",
  },
  {
    name: "LIVEKIT_API_SECRET",
    required: true,
    description: "LiveKit API secret",
  },
  {
    name: "NEXT_PUBLIC_LIVEKIT_URL",
    required: true,
    description: "LiveKit WebSocket URL",
    pattern: /^wss:\/\/.+\.livekit\.cloud$/,
  },

  // OpenAI
  {
    name: "OPENAI_API_KEY",
    required: true,
    description: "OpenAI API key for GPT-5",
    pattern: /^sk-/,
  },

  // Deepgram (ASR)
  {
    name: "DEEPGRAM_API_KEY",
    required: false,
    description: "Deepgram API key for direct Nova-3 access outside LiveKit inference",
  },

  // Stripe (Optional - only required if billing enabled)
  {
    name: "STRIPE_SECRET_KEY",
    required: false,
    description: "Stripe secret key for billing",
    pattern: /^sk_(test|live)_/,
  },
  {
    name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    required: false,
    description: "Stripe publishable key",
    pattern: /^pk_(test|live)_/,
  },

  // PostHog Analytics
  {
    name: "NEXT_PUBLIC_POSTHOG_KEY",
    required: false,
    description: "PostHog client-side tracking key",
    pattern: /^phc_/,
  },
  {
    name: "POSTHOG_SERVER_KEY",
    required: false,
    description: "PostHog server-side tracking key",
    pattern: /^phx_/,
  },
  {
    name: "NEXT_PUBLIC_POSTHOG_HOST",
    required: false,
    description: "PostHog host URL",
    pattern: /^https:\/\/.+/,
  },

  // Application
  {
    name: "NEXT_PUBLIC_APP_URL",
    required: false,
    description: "Application URL for CORS configuration",
    pattern: /^https?:\/\/.+/,
  },

  // Inngest (Optional - only required if background jobs enabled)
  {
    name: "INNGEST_EVENT_KEY",
    required: false,
    description: "Inngest event key for background jobs",
  },
  {
    name: "INNGEST_SIGNING_KEY",
    required: false,
    description: "Inngest signing key for webhook verification",
  },
];

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const envVar of envVars) {
    const value = process.env[envVar.name];

    // Check if required variable is missing
    if (envVar.required && !value) {
      errors.push(`❌ Missing required variable: ${envVar.name} - ${envVar.description}`);
      continue;
    }

    // Check if optional variable is missing
    if (!envVar.required && !value) {
      warnings.push(`⚠️  Optional variable not set: ${envVar.name} - ${envVar.description}`);
      continue;
    }

    // Validate pattern if specified
    if (value && envVar.pattern && !envVar.pattern.test(value)) {
      errors.push(
        `❌ Invalid format for ${envVar.name}: Expected pattern ${envVar.pattern.toString()}`
      );
    }

    if (value && isPlaceholderEnvValue(value)) {
      errors.push(`❌ Placeholder value for ${envVar.name}: refresh .env.local with npm run env:pull`);
    }
  }

  // Additional security checks
  const productionChecks = process.env.NODE_ENV === "production";
  if (productionChecks) {
    // Warn if using test Stripe keys in production
    if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
      warnings.push("⚠️  Using Stripe TEST key in production environment");
    }

    // Warn if APP_URL is localhost in production
    if (process.env.NEXT_PUBLIC_APP_URL?.includes("localhost")) {
      warnings.push("⚠️  NEXT_PUBLIC_APP_URL points to localhost in production");
    }

    // Warn if using client PostHog key for server-side tracking
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY && !process.env.POSTHOG_SERVER_KEY) {
      warnings.push(
        "⚠️  Using client PostHog key for server-side tracking. Set POSTHOG_SERVER_KEY for production."
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Run validation
console.log("🔍 Validating environment variables...\n");

const result = validateEnvironment();

if (result.warnings.length > 0) {
  console.log("Warnings:");
  result.warnings.forEach((warning) => console.log(`  ${warning}`));
  console.log("");
}

if (result.errors.length > 0) {
  console.log("Errors:");
  result.errors.forEach((error) => console.log(`  ${error}`));
  console.log("");
  console.log("❌ Environment validation failed!\n");
  process.exit(1);
}

console.log("✅ All required environment variables are set and valid!\n");

if (result.warnings.length > 0) {
  console.log(`Note: ${result.warnings.length} warning(s) found. Review them before deployment.\n`);
}
