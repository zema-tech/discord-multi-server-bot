import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireGuildAccess } from "@/lib/guilds";
import { featureList } from "@/config/dashboard.config";

/** Layout per-guild: sidebar icone + topbar profilo (specchio della vecchia app.html). */
const BASE_NAV = [
  { href: "", label: "Overview", icon: "📊" },
  { href: "logs", label: "Log", icon: "🧾" },
];

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await auth();
  if (!session) return notFound();
  const guild = await requireGuildAccess(guildId).catch(() => null);
  if (!guild) return notFound();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-64 flex-none flex-col gap-1 border-r border-white/10 bg-black/30 p-4 backdrop-blur-xl">
        <Link href="/servers" className="font-display mb-4 text-lg font-bold">
          Multi-Server Bot
        </Link>
        <p className="truncate px-2 text-sm text-[var(--muted)]">{guild.name}</p>
        {BASE_NAV.slice(0, 1).map((n) => (
          <GuildLink key={n.label} guildId={guildId} href={n.href} icon={n.icon} label={n.label} />
        ))}
        <p className="px-2 pt-4 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Moduli</p>
        {featureList.map((f) => (
          <GuildLink key={f.id} guildId={guildId} href={f.id} icon={f.icon} label={f.name} />
        ))}
        <div className="mt-auto flex items-center gap-3 border-t border-white/10 pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {session.user?.image && <img src={session.user.image} alt="" className="h-9 w-9 rounded-full" />}
          <span className="truncate text-sm">{session.user?.name}</span>
        </div>
      </aside>
      <div className="min-w-0 flex-1 p-8">{children}</div>
    </div>
  );
}

function GuildLink({ guildId, href, icon, label }: { guildId: string; href: string; icon: string; label: string }) {
  return (
    <Link
      href={`/dashboard/${guildId}${href ? `/${href}` : ""}`}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-white"
    >
      <span aria-hidden>{icon}</span> {label}
    </Link>
  );
}
