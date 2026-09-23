"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Grafico attività (Astra-style) dai conteggi analytics esistenti. */
export function ActivityChart({ data }: { data: Array<{ date: string; messages: number; joins: number }> }) {
  if (!data.length) return <p className="text-sm text-[var(--muted)]">Ancora nessun dato: il bot li raccoglie dai messaggi.</p>;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#a7a89e", fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis tick={{ fill: "#a7a89e", fontSize: 11 }} allowDecimals={false} width={40} />
          <Tooltip
            contentStyle={{ background: "#141419", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
          />
          <Area type="monotone" dataKey="messages" name="Messaggi" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.15} strokeWidth={2.5} />
          <Area type="monotone" dataKey="joins" name="Entrate" stroke="#57f287" fill="#57f287" fillOpacity={0.1} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
