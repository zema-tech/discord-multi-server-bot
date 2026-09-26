"use client";

import { useState } from "react";
import { Switch } from "@repo/ui";

/** Toggle on/off del modulo (stile tscord maintenance-toggle): PUT { feature, enabled }. */
export function FeatureToggle({ guildId, featureId, initial }: { guildId: string; featureId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function flip(checked: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature: featureId, enabled: checked }),
      });
      if (res.ok) setOn(checked);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`ml-auto flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-bold uppercase ${
      on ? "border-[var(--success)]/40 text-[var(--success)]" : "border-white/15 text-[var(--muted)]"
    }`}>
      {on ? "Attivo" : "Spento"}
      <Switch checked={on} disabled={busy} onChange={(e) => flip(e.target.checked)} aria-label="Attiva/disattiva modulo" />
    </span>
  );
}
