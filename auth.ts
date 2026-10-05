import { randomUUID } from "node:crypto";
import NextAuth from "next-auth";
import { isSessionRevoked, revokeSession } from "@/src/server/auth/revoked-sessions";

const issuer = process.env.AUTH_NOIRLY_ISSUER ?? "http://localhost:3000";

/**
 * Localhost cookies are not port-scoped. Sibling Noirly apps (Ledger, Pulse, …)
 * all default to `authjs.session-token`, so Flow would try to decrypt another
 * app's JWT (`JWTSessionError` / "no matching decryption secret"). Unique names
 * in development keep sessions isolated; production uses Auth.js defaults.
 */
const localCookies =
  process.env.NODE_ENV === "development"
    ? {
        sessionToken: { name: "authjs.flow.session-token" },
        callbackUrl: { name: "authjs.flow.callback-url" },
        csrfToken: { name: "authjs.flow.csrf-token" },
        pkceCodeVerifier: { name: "authjs.flow.pkce.code_verifier" },
        state: { name: "authjs.flow.state" },
        nonce: { name: "authjs.flow.nonce" },
      }
    : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  ...(localCookies ? { cookies: localCookies } : {}),
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    {
      id: "noirly",
      name: "Noirly",
      type: "oidc",
      issuer,
      clientId: process.env.AUTH_NOIRLY_CLIENT_ID,
      clientSecret: process.env.AUTH_NOIRLY_CLIENT_SECRET,
      // Auth.js defaults to ["pkce"] only; Identity requires `state`.
      checks: ["pkce", "state", "nonce"],
      client: {
        token_endpoint_auth_method: "client_secret_post",
      },
      authorization: {
        params: {
          scope: "openid profile email offline_access",
        },
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: typeof profile.name === "string" ? profile.name : null,
          email: typeof profile.email === "string" ? profile.email : null,
          image: typeof profile.picture === "string" ? profile.picture : null,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, user, profile }) {
      if (user?.id) {
        token.identitySub = user.id;
        // A fresh id per sign-in, so sign-out can end exactly this session.
        token.sid = randomUUID();
      }
      if (profile && "sub" in profile && typeof profile.sub === "string") {
        token.identitySub = profile.sub;
      }
      // Sessions issued before `sid` existed get one on their next refresh.
      const sid = typeof token.sid === "string" ? token.sid : randomUUID();
      token.sid = sid;

      // JWT sessions are stateless and the cookie is re-issued on every
      // response — a prefetch that lands after sign-out sets it again. Reject
      // sessions that signed out; returning null makes Auth.js clear the cookie.
      if (await isSessionRevoked(sid)) return null;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.identitySub ?? token.sub ?? "");
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && typeof message.token?.sid === "string") {
        await revokeSession(message.token.sid);
      }
    },
  },
});
