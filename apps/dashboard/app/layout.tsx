import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Multi-Server Bot — Dashboard",
  description: "Comanda moderazione, ticket, livelli ed economia su tutti i tuoi server Discord.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={`${inter.variable} ${sora.variable} grain`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
