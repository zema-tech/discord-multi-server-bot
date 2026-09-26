import Link from "next/link";
import { Button } from "@repo/ui";

/** Landing neon (direzione 2): griglia tecnica + glow blurple su dark Discord. */
export default function Landing() {
  return (
    <main className="relative overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute -left-36 -top-40 h-[480px] w-[480px] rounded-full bg-[var(--accent)] opacity-40 blur-[110px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-48 right-[6%] h-[380px] w-[380px] rounded-full bg-[var(--success)] opacity-20 blur-[110px]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl px-6 py-28 text-center">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--success)]/40 bg-[var(--success)]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[var(--success)]">
          <span className="h-2 w-2 rounded-full bg-[var(--success)] shadow-[0_0_12px_var(--success)]" />
          Online — Discord Bot Dashboard
        </p>
        <h1 className="font-display text-6xl font-black uppercase leading-[0.98] tracking-tight md:text-8xl">
          <span className="text-stroke">Comanda</span>
          <br />
          <span className="text-neon">il tuo server</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--muted)]">
          Ticket, livelli, automod e AI in un pannello unico. Accendi i moduli,
          cambia la config, invia annunci — senza toccare il codice.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link href="/servers"><Button>Apri la dashboard →</Button></Link>
          <a href={process.env.NEXT_PUBLIC_BOT_INVITE_URL ?? "#"}>
            <Button variant="secondary">Invita il bot</Button>
          </a>
        </div>
        <div className="mx-auto mt-14 flex max-w-xl items-center justify-center gap-8 text-sm text-[var(--muted)]">
          <span><strong className="text-white">88</strong> comandi</span>
          <span><strong className="text-white">15</strong> moduli</span>
          <span><strong className="text-white">20</strong> tool MCP</span>
        </div>
      </div>
    </main>
  );
}
