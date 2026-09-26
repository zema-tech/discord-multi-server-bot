import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuildAccess } from "@/lib/guilds";
import { getGuildChannels } from "@/lib/discord-rest";

const postSchema = z.object({
  channelId: z.string().min(1).max(32),
  text: z.string().trim().min(1).max(2000),
});

async function botPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method: "POST",
    headers: { Authorization: `Bot ${process.env.BOT_TOKEN!}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bot REST ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * POST /api/guilds/[id]/announce { channelId, text } — invia un messaggio
 * (stesse regole scope di MCP announce_send: canale testuale DEL server,
 * max 2000 char, @everyone/@here neutralizzati).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireGuildAccess(id);
  } catch {
    return NextResponse.json({ errore: "Accesso negato." }, { status: 403 });
  }
  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errore: "Canale o testo non validi (max 2000 caratteri)." }, { status: 400 });
  }
  const channels = await getGuildChannels(id);
  const ch = channels.find((c) => c.id === parsed.data.channelId);
  if (!ch) return NextResponse.json({ errore: "Canale non di questo server." }, { status: 403 });
  if (ch.type !== 0 && ch.type !== 5) {
    return NextResponse.json({ errore: "Solo canali testuali." }, { status: 400 });
  }
  const text = parsed.data.text.replace(/@everyone/g, "everyone").replace(/@here/g, "here");
  try {
    const sent = await botPost<{ id: string }>(`/channels/${ch.id}/messages`, { content: text });
    return NextResponse.json({ ok: true, messageId: sent.id, channel: ch.name });
  } catch {
    return NextResponse.json({ errore: "Invio fallito, riprova." }, { status: 502 });
  }
}
