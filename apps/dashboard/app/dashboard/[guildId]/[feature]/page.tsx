import { notFound } from "next/navigation";
import { getFeatureSettings, isFeatureEnabled } from "@repo/db";
import { features } from "@/config/dashboard.config";
import { requireGuildAccess } from "@/lib/guilds";
import { getGuildChannels, getGuildRoles } from "@/lib/discord-rest";
import { DynamicForm } from "@/components/dynamic-form";
import { Card } from "@repo/ui";

/** Pagina per-feature: form auto-generato + preview live (route dinamica). */
export default async function FeaturePage({
  params,
}: {
  params: Promise<{ guildId: string; feature: string }>;
}) {
  const { guildId, feature: featureId } = await params;
  const feature = features[featureId];
  if (!feature) return notFound();
  await requireGuildAccess(guildId).catch(() => notFound());

  const [initial, channels, roles] = await Promise.all([
    Promise.resolve(getFeatureSettings(guildId, featureId as "welcome")),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
  ]);
  const enabled = isFeatureEnabled(guildId, featureId);

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden>{feature.icon}</span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{feature.name}</h1>
          <p className="text-[var(--muted)]">{feature.description}</p>
        </div>
        <span className={`ml-auto rounded-full border px-3 py-1 text-xs font-bold uppercase ${enabled ? "border-emerald-400/40 text-emerald-300" : "border-white/15 text-[var(--muted)]"}`}>
          {enabled ? "Attivo" : "Spento"}
        </span>
      </div>
      {!enabled && (
        <Card className="mt-4"><p className="text-sm text-[var(--muted)]">Modulo spento: riattivalo con <code>/modulo on {featureId}</code> o dal toggle Controller.</p></Card>
      )}
      <div className="mt-6">
        <DynamicForm feature={feature} initial={{ ...initial, _gid: guildId }} channels={channels} roles={roles} />
      </div>
    </div>
  );
}
