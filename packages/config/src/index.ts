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
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type MedcalEnv = z.infer<typeof envSchema>;

export function loadEnv(
  raw: NodeJS.ProcessEnv = process.env,
): MedcalEnv {
  return envSchema.parse(raw);
}

export const appDefaults = {
  currency: "IDR",
  uploadMaxBytes: 10 * 1024 * 1024,
} as const;
