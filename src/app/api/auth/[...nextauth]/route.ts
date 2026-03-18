import NextAuth, { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      authorization: {
        params: { scope: "read:user user:email repo" }, // Need repo scope to list user repositories + write webhooks
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.githubAccessToken = account.access_token;

        const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
        try {
          const res = await fetch(`${backendUrl}/api/v1/auth/github`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: account.access_token }),
          });

          if (!res.ok) {
            const message = await res.text();
            throw new Error(`Backend auth exchange failed (${res.status}): ${message}`);
          }

          const data = await res.json();
          token.backendAccessToken = data?.backendToken;
        } catch (e) {
          console.error("Failed to store github token in backend", e);
          token.backendAccessToken = undefined;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session as any).backendToken = token.backendAccessToken ?? null;
        (session as any).githubAccessToken = token.githubAccessToken ?? null;
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
