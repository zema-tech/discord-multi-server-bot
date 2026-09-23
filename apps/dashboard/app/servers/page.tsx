import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getManageableGuilds, guildIconUrl } from "@/lib/guilds";
import { Card } from "@repo/ui";

/** /servers — solo server con MANAGE_GUILD + bot presente (specchio di GET /api/guilds). */
export default async function ServersPage() {
  const session = await auth();
  if (!session) redirect("/api/auth/signin");
  const guilds = await getManageableGuilds();

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="font-display text-4xl font-bold tracking-tight">I tuoi server</h1>
      <p className="mt-2 text-[var(--muted)]">Solo dove hai Gestisci Server e il bot è dentro.</p>
      {guilds.length === 0 ? (
        <Card className="mt-8">
          <p className="text-[var(--muted)]">Nessun server gestibile trovato. Invita prima il bot.</p>
        </Card>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guilds.map((g) => {
            const icon = guildIconUrl(g.id, g.icon);
            return (
              <Link key={g.id} href={`/dashboard/${g.id}`}>
                <Card className="flex items-center gap-4 transition-all hover:-translate-y-1 hover:border-[var(--accent)]/60">
                  {icon ? (
                    <Image src={icon} alt="" width={48} height={48} className="rounded-full" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 font-display text-lg font-bold">
                      {g.name.slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{g.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" /> Bot online
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
