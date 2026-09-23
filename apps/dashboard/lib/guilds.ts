import { auth } from "./auth";

export const MANAGE_GUILD = 0x20;

export interface GuildLite {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
  botPresent: boolean;
}

async function discord<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 45 }, // stessa cache 45s della dashboard Express (anti-429)
  });
  if (!res.ok) throw new Error(`Discord REST ${res.status} su ${path}`);
  return res.json() as Promise<T>;
}

async function botGuildIds(): Promise<Set<string>> {
  const token = process.env.BOT_TOKEN!;
  const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: { Authorization: `Bot ${token}` },
    next: { revalidate: 60 },
  });
  if (!res.ok) return new Set();
  const list = (await res.json()) as Array<{ id: string }>;
  return new Set(list.map((g) => g.id));
}

/** Server dove l'utente ha MANAGE_GUILD e il bot è dentro (semantica di loadAccess). */
export async function getManageableGuilds(): Promise<GuildLite[]> {
  const session = await auth();
  const token = (session as { accessToken?: string } | null)?.accessToken;
  if (!token) return [];
  const [userGuilds, botIds] = await Promise.all([
    discord<Array<{ id: string; name: string; icon: string | null; permissions: string }>>(
      "/users/@me/guilds",
      token,
    ).catch(() => []),
    botGuildIds(),
  ]);
  return userGuilds
    .filter((g) => (BigInt(g.permissions) & BigInt(MANAGE_GUILD)) !== 0n && botIds.has(g.id))
    .map((g) => ({ ...g, botPresent: true }));
}

export async function requireGuildAccess(guildId: string): Promise<GuildLite> {
  const guilds = await getManageableGuilds();
  const found = guilds.find((g) => g.id === guildId);
  if (!found) throw new Error("FORBIDDEN");
  return found;
}

export function guildIconUrl(id: string, icon: string | null): string | null {
  if (!icon) return null;
  const ext = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${id}/${icon}.${ext}?size=128`;
}
