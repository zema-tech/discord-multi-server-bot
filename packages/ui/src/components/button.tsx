import * as React from "react";
import { cn } from "../lib/cn.js";

/** shadcn-style Button (API compatibile; in prod generato via `shadcn add button`). */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md";
}

export function Button({ variant = "default", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-5 py-2.5 text-sm",
        variant === "default" && "bg-[var(--accent)] text-[#0c0e05] hover:brightness-110 hover:-translate-y-px shadow-lg",
        variant === "secondary" && "bg-white/5 text-[var(--text)] border border-white/10 hover:border-[var(--accent)]",
        variant === "ghost" && "text-[var(--muted)] hover:text-[var(--text)]",
        variant === "destructive" && "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25",
        className,
      )}
      {...props}
    />
  );
}
