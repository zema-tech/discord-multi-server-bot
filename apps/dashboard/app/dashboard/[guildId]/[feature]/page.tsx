import { notFound } from "next/navigation";
import { getFeatureSettings, isFeatureEnabled } from "@repo/db";
import { features } from "@/config/dashboard.config";
import { requireGuildAccess } from "@/lib/guilds";
import { getGuildChannels, getGuildRoles } from "@/lib/discord-rest";
import { DynamicForm } from "@/components/dynamic-form";
import { FeatureToggle } from "@/components/feature-toggle";

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
        <FeatureToggle guildId={guildId} featureId={feature.id} initial={enabled} />
      </div>
      {!enabled && (
        <p className="mt-4 text-sm text-[var(--muted)]">Modulo spento: riattivalo dal toggle qui sopra. I salvataggi restano in bozza finché è spento.</p>
      )}
      <div className="mt-6">
        <DynamicForm feature={feature} initial={{ ...initial, _gid: guildId }} channels={channels} roles={roles} />
      </div>
    </div>
  );
}
