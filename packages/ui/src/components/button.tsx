import * as React from "react";
import { cn } from "../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[var(--button-bg)] text-white shadow-[0_0_24px_var(--button-glow)] hover:brightness-110",
  secondary: "border border-white/15 bg-white/5 text-[var(--foreground)] hover:bg-white/10",
  ghost: "text-[var(--muted)] hover:bg-white/5 hover:text-white",
  danger: "bg-[var(--danger)] text-white hover:brightness-110",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
};

/** Bottone con token di componente (mai hex hardcoded). */
export function Button({ variant = "primary", size = "md", className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
