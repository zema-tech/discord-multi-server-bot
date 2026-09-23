import { notFound } from "next/navigation";
import { getActivityDays, isFeatureEnabled } from "@repo/db";
import { requireGuildAccess } from "@/lib/guilds";
import { getGuildPreview } from "@/lib/discord-rest";
import { featureList } from "@/config/dashboard.config";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui";
import { ActivityChart } from "@/components/activity-chart";

/** Overview: stat cards + grafico settimanale Recharts (dati da analytics esistente). */
export default async function OverviewPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const guild = await requireGuildAccess(guildId).catch(() => null);
  if (!guild) return notFound();

  const [preview, days] = await Promise.all([getGuildPreview(guildId), Promise.resolve(getActivityDays(guildId, 7))]);
  const totalMessages = days.reduce((s, d) => s + d.messages, 0);
  const enabledCount = featureList.filter((f) => isFeatureEnabled(guildId, f.id)).length;

  const stats = [
    { label: "Membri", value: preview?.member_count ?? "—" },
    { label: "Messaggi (7g)", value: totalMessages },
    { label: "Moduli attivi", value: `${enabledCount}/${featureList.length}` },
  ];

  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight">Overview</h1>
      <p className="mt-1 text-[var(--muted)]">{guild.name}</p>
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
    </div>
  );
}
