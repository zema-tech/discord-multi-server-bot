import Image from "next/image";
import { notFound } from "next/navigation";
import { getActivityDays, isFeatureEnabled } from "@repo/db";
import { guildIconUrl, requireGuildAccess } from "@/lib/guilds";
import { getGuildChannels, getGuildPreview } from "@/lib/discord-rest";
import { featureList } from "@/config/dashboard.config";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import { ActivityChart } from "@/components/activity-chart";
import { AnnounceCard } from "@/components/announce-card";

/** Overview: anteprima guild (stile tscord) + stat cards + grafico + annunci. */
export default async function OverviewPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const guild = await requireGuildAccess(guildId).catch(() => null);
  if (!guild) return notFound();

  const [preview, days, channels] = await Promise.all([
    getGuildPreview(guildId),
    Promise.resolve(getActivityDays(guildId, 7)),
    getGuildChannels(guildId),
  ]);
  const totalMessages = days.reduce((s, d) => s + d.messages, 0);
  const enabledCount = featureList.filter((f) => isFeatureEnabled(guildId, f.id)).length;
  const icon = guildIconUrl(guild.id, guild.icon);

  const stats = [
    { label: "Membri", value: preview?.member_count ?? "—" },
    { label: "Messaggi (7g)", value: totalMessages },
    { label: "Moduli attivi", value: `${enabledCount}/${featureList.length}` },
  ];

  return (
    <div>
      <div className="flex items-center gap-4">
        {icon ? (
          <Image src={icon} alt="" width={56} height={56} className="rounded-2xl ring-2 ring-[var(--accent)]/50" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]/20 font-display text-2xl font-bold text-[var(--accent)]">
            {guild.name.slice(0, 1)}
          </span>
        )}
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{guild.name}</h1>
          <p className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
            <span className="h-2 w-2 rounded-full bg-[var(--success)] shadow-[0_0_10px_var(--success)]" /> Bot online
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} active>
            <CardHeader><CardTitle>{s.label}</CardTitle></CardHeader>
            <CardContent><p className="font-display text-4xl font-bold">{s.value}</p></CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>Attività settimanale</CardTitle></CardHeader>
        <CardContent><ActivityChart data={days} /></CardContent>
      </Card>
      <AnnounceCard guildId={guildId} channels={channels} />
    </div>
  );
}
