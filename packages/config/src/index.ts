import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  COMPANY_ID: z.string().min(1).optional(),
  API_PORT: z.coerce.number().default(3001),
  WEB_API_PORT: z.coerce.number().default(3002),
  API_URL: z.string().url().optional(),
  INTERNAL_API_SECRET: z.string().min(8).optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  // Comma-separated browser origins allowed to call apps/api with credentials
  // (locked: cookie-scoped to .kalibrasimedika.co.id in production).
  TRUSTED_ORIGINS: z.string().optional(),
  // Cookie domain for Better Auth's session cookie — unset for localhost dev,
  // ".kalibrasimedika.co.id" in production so it's shared across subdomains.
  COOKIE_DOMAIN: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // IMAP configuration (Email → Lead Management, locked plan)
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().default(993),
  IMAP_TLS: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
  IMAP_USER: z.string().optional(),
  IMAP_PASS: z.string().optional(),
  // TLS certificate verification — enabled by default for production security.
  // Only set to "false" in controlled environments with documented justification.
  IMAP_TLS_REJECT_UNAUTHORIZED: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),

  // SMTP configuration (Email → Lead Management, locked plan)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_SECURE: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // TLS certificate verification — enabled by default for production security.
  SMTP_TLS_REJECT_UNAUTHORIZED: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),
});

export type MedcalEnv = z.infer<typeof envSchema>;

export function loadEnv(
  raw: NodeJS.ProcessEnv = process.env,
): MedcalEnv {
  return envSchema.parse(raw);
}

export function parseTrustedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const appDefaults = {
  currency: "IDR",
  uploadMaxBytes: 10 * 1024 * 1024,
} as const;
