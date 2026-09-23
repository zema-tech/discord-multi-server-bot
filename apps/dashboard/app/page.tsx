import Link from "next/link";
import { Button } from "@repo/ui";

/** Landing (stile Astra: hero + CTA + feature). */
export default function Landing() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-24 text-center">
      <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-[var(--accent)]">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Commander · moduli isolati
      </p>
      <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-tight md:text-7xl">
        Comanda il tuo server.
        <br />
        <span className="text-transparent [-webkit-text-stroke:1.5px_var(--accent)]">Niente si rompe.</span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--muted)]">
        Moderazione, ticket, livelli, economia e AI — ogni modulo vive isolato.
        Gestisci tutto da questa dashboard.
      </p>
      <div className="mt-10 flex justify-center gap-4">
        <Link href="/servers"><Button>Apri i server</Button></Link>
        <a href={process.env.NEXT_PUBLIC_BOT_INVITE_URL ?? "#"}>
          <Button variant="secondary">Invita il bot</Button>
        </a>
      </div>
    </main>
  );
}
