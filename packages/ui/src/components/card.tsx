import * as React from "react";
import { cn } from "../lib/cn.js";

/** shadcn-style Card con glassmorphism + gradient-border quando `active`. */
export function Card({ className, active, ...props }: React.HTMLAttributes<HTMLDivElement> & { active?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 shadow-xl transition-all",
        active && "border-transparent [background:linear-gradient(var(--card),var(--card))_padding-box,linear-gradient(135deg,var(--accent),transparent_60%)_border-box]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-lg font-semibold tracking-tight", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-[var(--muted)]", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} {...props} />;
}
