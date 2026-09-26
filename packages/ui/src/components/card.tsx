import * as React from "react";
import { cn } from "../lib/cn";

/** Card scura con bordo neon sottile quando `active`. */
export function Card({ active, className, ...rest }: React.HTMLAttributes<HTMLDivElement> & { active?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-[var(--card)] p-5",
        active && "border-[var(--accent)]/40 shadow-[0_0_40px_-12px_var(--accent)]",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-2 text-xs font-bold uppercase tracking-widest text-[var(--muted)]", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-xs font-bold uppercase tracking-widest text-[var(--muted)]", className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-[var(--muted)]", className)} {...rest} />;
}

export function CardContent({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} {...rest} />;
}
