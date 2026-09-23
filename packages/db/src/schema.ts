import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * FASE 2 (Postgres). Una riga per guild, settings tipizzati per feature in jsonb
 * (come bromso: nessun ALTER per aggiungere un'opzione).
 * FASE 1: inutilizzato — @repo/db usa il file-adapter su STORE_DIR (vedi index.ts).
 */
export const guildSettings = pgTable("guild_settings", {
  guildId: text("guild_id").primaryKey(),
  welcome: jsonb("welcome").$type<Record<string, unknown>>().default({}),
  autoRole: jsonb("auto_role").$type<Record<string, unknown>>().default({}),
  moderation: jsonb("moderation").$type<Record<string, unknown>>().default({}),
  leveling: jsonb("leveling").$type<Record<string, unknown>>().default({}),
  logs: jsonb("logs").$type<Record<string, unknown>>().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GuildSettingsRow = typeof guildSettings.$inferSelect;
