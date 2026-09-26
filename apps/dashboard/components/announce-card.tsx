"use client";

import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@repo/ui";

/** Invia un annuncio in un canale testuale (pattern DisPanel/NexusBD messaging). */
export function AnnounceCard({ guildId, channels }: {
  guildId: string;
  channels: Array<{ id: string; name: string; type: number }>;
}) {
  const textChannels = channels.filter((c) => c.type === 0 || c.type === 5);
  const [channelId, setChannelId] = useState(textChannels[0]?.id ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    if (!channelId || !text.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/guilds/${guildId}/announce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, text: text.trim().slice(0, 2000) }),
      });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Inviato in #${data.channel ?? "?"} ✓` : `Errore: ${data.errore ?? res.status}`);
      if (res.ok) setText("");
    } finally {
      setBusy(false);
    }
  }

  if (!textChannels.length) return null;

  return (
    <Card className="mt-4">
      <CardHeader><CardTitle>📣 Annuncio rapido</CardTitle></CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <select
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              aria-label="Canale"
            >
              {textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
            <input
              className="grow rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="Scrivi l'annuncio… (max 2000)"
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
            />
            <Button onClick={send} disabled={busy || !text.trim()}>Invia</Button>
          </div>
          {msg && <p className="text-sm text-[var(--muted)]">{msg}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
