"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";

/** shadcn-style Switch minimal (button + aria-checked, nessun Radix richiesto). */
export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? "Attiva"}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-7 w-12 flex-none rounded-full border transition-colors",
        checked ? "bg-[var(--accent)] border-[var(--accent)]" : "bg-white/10 border-white/15",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full transition-all",
          checked ? "left-[26px] bg-[#0c0e05]" : "left-0.5 bg-white/70",
        )}
      />
    </button>
  );
}
