"use client";

/** Preview live stile Discord per message_embed_builder (testo con {user} {server}). */
export function EmbedPreview({ title, text }: { title: string; text: string }) {
  const rendered = (text || "Anteprima messaggio…")
    .replaceAll("{user}", "@utente")
    .replaceAll("{username}", "utente")
    .replaceAll("{server}", "Il tuo server")
    .replaceAll("{count}", "128");
  return (
    <div className="rounded-lg border-l-[3px] border-[var(--accent)] bg-[#313338] p-3 text-sm text-[#dbdee1]">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] font-bold text-[#0c0e05]">
          B
        </span>
        <span className="font-semibold text-white">Multi-Server Bot</span>
        <span className="text-xs text-[#949BA4]">oggi alle {new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      {title && <p className="font-bold text-white">{title}</p>}
      <p className="whitespace-pre-wrap">{rendered}</p>
    </div>
  );
}
