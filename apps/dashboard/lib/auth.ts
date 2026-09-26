import NextAuth, { type Session } from "next-auth";
import Discord from "next-auth/providers/discord";

/**
 * Auth.js v5 con Discord provider (scope identify+guilds, come l'OAuth fatto a
 * mano in src/dashboard/auth.js). L'access_token resta in sessione per le
 * chiamate REST (guilds utente) — specchio del cookie `pb_session` attuale.
 */
const { handlers, auth: baseAuth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: { params: { scope: "identify guilds" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) token.accessToken = account.access_token;
      return token;
    },
    async session({ session, token }) {
      (session as { accessToken?: unknown }).accessToken = token.accessToken;
      return session;
    },
  },
});

// Annotazione esplicita: i tipi inferiti di next-auth/beta non sono
// "portabili" (TS2742) nei workspace con strict. Usiamo solo auth().
export const auth: () => Promise<(Session & { accessToken?: string }) | null> =
  baseAuth as () => Promise<(Session & { accessToken?: string }) | null>;

export { handlers, signIn, signOut };
