import * as React from "react";
import { cn } from "../lib/cn";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

/** Toggle switch accessibile (checkbox nativa stilizzata, token di componente). */
export function Switch({ label, className, ...rest }: SwitchProps) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2", className)}>
      <input type="checkbox" className="peer sr-only" {...rest} />
      <span
        aria-hidden
        className="relative h-6 w-11 rounded-full bg-white/15 transition-colors
          peer-checked:bg-[var(--switch-on)] peer-focus-visible:outline peer-focus-visible:outline-2
          peer-focus-visible:outline-[var(--accent)] peer-disabled:opacity-50
          after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full
          after:bg-white after:transition-transform peer-checked:after:translate-x-5"
      />
      {label && <span className="text-sm font-medium">{label}</span>}
    </label>
  );
}
