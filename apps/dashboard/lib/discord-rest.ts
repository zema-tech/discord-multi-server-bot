/** Letture live via Bot token (specchio di src/dashboard/discordRest.js). */
export interface RestChannel { id: string; name: string; type: number; }
export interface RestRole { id: string; name: string; color: number; }

async function botGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${process.env.BOT_TOKEN!}` },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Bot REST ${res.status} su ${path}`);
  return res.json() as Promise<T>;
}

export const getGuildChannels = (gid: string) =>
  botGet<RestChannel[]>(`/guilds/${gid}/channels`).catch(() => []);

export const getGuildRoles = (gid: string) =>
  botGet<RestRole[]>(`/guilds/${gid}/roles`).catch(() => []);

export const getGuildPreview = (gid: string) =>
  botGet<{ member_count: number; name: string }>(`/guilds/${gid}/preview`).catch(() => null);
