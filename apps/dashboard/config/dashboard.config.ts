/**
 * config/dashboard.config.ts — sistema Features / Options (ispirato a
 * SonMooSans/discord-bot-dashboard-2 `src/config/features.tsx`).
 *
 * Per aggiungere una feature: una voce qui + (se serve) mapping in
 * `packages/db` (FASE 1: modulo store esistente; FASE 2: colonna jsonb).
 * La pagina /dashboard/[guildId]/[feature] genera il form da sola.
 */

export type OptionType =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "channel_select"
  | "role_select"
  | "message_embed_builder";

export interface Option {
  key: string;
  label: string;
  description?: string;
  type: OptionType;
  placeholder?: string;
  default?: string | number | boolean;
  multiple?: boolean; // per role_select multipli
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji usata in sidebar (lucide in prod via packages/ui Icon)
  enabled: boolean; // default per nuove guild
  options: Option[];
}

export const features: Record<string, Feature> = {
  welcome: {
    id: "welcome",
    name: "Benvenuto",
    description: "Messaggi di benvenuto e addio personalizzati con variabili.",
    icon: "👋",
    enabled: true,
    options: [
      { key: "welcomeChannelId", label: "Canale benvenuto", type: "channel_select" },
      { key: "welcomeMessage", label: "Messaggio", description: "Variabili: {user} {username} {server} {count}", type: "text", placeholder: "Benvenuto {user} in {server}! 🎉" },
      { key: "goodbyeChannelId", label: "Canale addii", type: "channel_select" },
      { key: "goodbyeMessage", label: "Messaggio addio", type: "text", placeholder: "{username} ci ha lasciati. 👋" },
    ],
  },
  autoRole: {
    id: "autoRole",
    name: "Auto-ruolo",
    description: "Ruoli assegnati ai nuovi membri, con ritardo opzionale.",
    icon: "🎭",
    enabled: true,
    options: [
      { key: "roleIds", label: "Ruoli", type: "role_select", multiple: true },
      { key: "delaySeconds", label: "Ritardo (secondi)", type: "number", default: 0 },
    ],
  },
  moderation: {
    id: "moderation",
    name: "Moderazione",
    description: "Automod: anti-spam, anti-link, anti-invite, bad words, anti-caps.",
    icon: "🛡️",
    enabled: true,
    options: [
      { key: "antiSpam", label: "Anti-spam (5 msg / 5s)", type: "boolean", default: true },
      { key: "antiLink", label: "Anti-link", type: "boolean", default: false },
      { key: "antiInvite", label: "Anti-invite Discord", type: "boolean", default: true },
      { key: "badWords", label: "Parole vietate (virgola)", type: "string", placeholder: "parola1, parola2" },
      { key: "warnThreshold", label: "Warn prima del timeout", type: "number", default: 3 },
    ],
  },
  leveling: {
    id: "leveling",
    name: "Livelli",
    description: "XP da messaggi e vocale, ricompense ruolo per livello.",
    icon: "⭐",
    enabled: true,
    options: [
      { key: "xpPerMessageMin", label: "XP min per messaggio", type: "number", default: 10 },
      { key: "xpPerMessageMax", label: "XP max per messaggio", type: "number", default: 20 },
      { key: "levelUpChannelId", label: "Canale annunci level-up (vuoto = stesso canale)", type: "channel_select" },
      { key: "rewards", label: "Ricompense (livello → ruolo)", description: "Gestite come mappa livello:ruolo", type: "role_select" },
    ],
  },
  logs: {
    id: "logs",
    name: "Log",
    description: "Canale per log moderazione, join/leave ed errori comando.",
    icon: "🧾",
    enabled: true,
    options: [
      { key: "logChannelId", label: "Canale log", type: "channel_select" },
      { key: "logJoins", label: "Logga entrate/uscite", type: "boolean", default: true },
      { key: "logModeration", label: "Logga azioni mod", type: "boolean", default: true },
    ],
  },
};

export const featureList = Object.values(features);
