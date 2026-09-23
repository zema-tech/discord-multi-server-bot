"use client";

import { useState } from "react";
import { Button, Card, CardContent, Switch } from "@repo/ui";
import type { Feature, Option } from "@/config/dashboard.config";
import { EmbedPreview } from "./embed-preview";

/**
 * Form auto-generato dalle options della feature (concetto di
 * discord-bot-dashboard-2 `useRender`, ma dichiarativo: basta
 * aggiungere voci in dashboard.config.ts).
 */
export function DynamicForm({
  feature,
  initial,
  channels,
  roles,
}: {
  feature: Feature;
  initial: Record<string, unknown>;
  channels: Array<{ id: string; name: string }>;
  roles: Array<{ id: string; name: string }>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (key: string, v: unknown) => {
    setValues((p) => ({ ...p, [key]: v }));
    setSaved(false);
  };

  async function onSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/guilds/${(values as { _gid?: string })._gid ?? ""}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature: feature.id, patch: values }),
      });
      setSaved(res.ok);
    } finally {
      setSaving(false);
    }
  }

  const previewText = String(values.welcomeMessage ?? values.goodbyeMessage ?? "");

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardContent>
          <div className="flex flex-col gap-5">
            {feature.options.map((opt) => (
              <Field key={opt.key} opt={opt} value={values[opt.key]} onChange={(v) => set(opt.key, v)} channels={channels} roles={roles} />
            ))}
            <div>
              <Button onClick={onSave} disabled={saving}>{saving ? "Salvataggio…" : saved ? "Salvato ✓" : "Salva"}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">Preview live</p>
        <EmbedPreview title={feature.name} text={previewText} />
      </div>
    </div>
  );
}

function Field({ opt, value, onChange, channels, roles }: {
  opt: Option;
  value: unknown;
  onChange: (v: unknown) => void;
  channels: Array<{ id: string; name: string }>;
  roles: Array<{ id: string; name: string }>;
}) {
  const inputCls = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]";
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{opt.label}</span>
      {opt.description && <span className="mb-1.5 block text-xs text-[var(--muted)]">{opt.description}</span>}
      {opt.type === "boolean" ? (
        <Switch checked={Boolean(value ?? opt.default)} onCheckedChange={onChange} label={opt.label} />
      ) : opt.type === "number" ? (
        <input type="number" className={inputCls} value={Number(value ?? opt.default ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />
      ) : opt.type === "text" || opt.type === "message_embed_builder" ? (
        <textarea className={inputCls} rows={3} placeholder={opt.placeholder} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      ) : opt.type === "channel_select" ? (
        <select className={inputCls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Nessuno —</option>
          {channels.filter((c) => c.type === 0).map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
        </select>
      ) : opt.type === "role_select" ? (
        <select className={inputCls} multiple={opt.multiple} value={Array.isArray(value) ? value.map(String) : value ? [String(value)] : []}
          onChange={(e) => onChange(opt.multiple ? Array.from(e.target.selectedOptions, (o) => o.value) : e.target.value)}>
          {roles.filter((r) => r.name !== "@everyone").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      ) : (
        <input type="text" className={inputCls} placeholder={opt.placeholder} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
