import { z } from "zod";

/** Single source of truth per le env (stile bromso packages/config). Lancia sulla prima variabile mancante/malformata. */
const envSchema = z.object({
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(16).optional(),
  AUTH_SECRET: z.string().min(16).optional(),
  DATABASE_URL: z.string().url().optional(),
  BOT_TOKEN: z.string().min(1),
  STORE_DIR: z.string().default("./src/database"),
  DB_ADAPTER: z.enum(["file", "postgres"]).default("file"),
  NEXT_PUBLIC_BOT_INVITE_URL: z.string().url().optional(),
}).refine((v) => v.NEXTAUTH_SECRET || v.AUTH_SECRET, {
  message: "Serve NEXTAUTH_SECRET o AUTH_SECRET (openssl rand -base64 32)",
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  cached = envSchema.parse(process.env);
  return cached;
}
