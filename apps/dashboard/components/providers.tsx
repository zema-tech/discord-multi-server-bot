"use client";

import { ThemeProvider } from "next-themes";

/** Dark di default + toggle Light/Dark (come Astra Bot). */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {children}
    </ThemeProvider>
  );
}
