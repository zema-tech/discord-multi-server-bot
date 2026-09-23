import { NextResponse } from "next/server";
import { z } from "zod";
import { getFeatureSettings, isFeatureEnabled, setFeatureEnabled, updateFeatureSettings } from "@repo/db";
import { features } from "@/config/dashboard.config";
import { requireGuildAccess } from "@/lib/guilds";

const putSchema = z.object({
  feature: z.string(),
  patch: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

/**
 * Route handler che specchia il contratto Express esistente:
 * - PUT /api/guilds/:gid/modules/controller { id, enabled }  → toggle
 * - PUT /api/guilds/:gid/modules/:mod (body patch)            → salvataggio
 * Qui unificati in PUT /api/guilds/[id]/settings { feature, patch?, enabled? }.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireGuildAccess(id).catch(() => null).then((g) => {
    if (!g) throw Response.json({ errore: "Accesso negato." }, { status: 403 });
  });
  const out: Record<string, unknown> = {};
  for (const fid of Object.keys(features)) {
    out[fid] = { settings: getFeatureSettings(id, fid as "welcome"), enabled: isFeatureEnabled(id, fid) };
  }
  return NextResponse.json({ ok: true, guildId: id, features: out });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireGuildAccess(id).catch(() => null).then((g) => {
    if (!g) throw Response.json({ errore: "Accesso negato." }, { status: 403 });
  });
  const body = putSchema.parse(await req.json().catch(() => ({})));
  if (!features[body.feature]) {
    return NextResponse.json({ errore: `Feature sconosciuta: ${body.feature}.` }, { status: 400 });
  }
  if (typeof body.enabled === "boolean") {
    try {
      setFeatureEnabled(id, body.feature, body.enabled);
    } catch (e) {
      return NextResponse.json({ errore: (e as Error).message }, { status: 400 });
    }
  }
  const settings = body.patch
    ? updateFeatureSettings(id, body.feature as "welcome", body.patch as Record<string, unknown>)
    : getFeatureSettings(id, body.feature as "welcome");
  return NextResponse.json({ ok: true, feature: body.feature, enabled: isFeatureEnabled(id, body.feature), settings });
}
