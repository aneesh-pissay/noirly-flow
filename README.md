# Noirly Flow

Task and project management for individuals and teams — part of the Noirly ecosystem.

## Docs

- **[Features (web)](./docs/FEATURES.md)** — what is implemented in the web app today
- **[Architecture](./docs/ARCHITECTURE.md)** — target design and locked stack decisions
- **[Roadmap](./docs/ROADMAP.md)** — what to build next, ticked off as each task ships

## Auth (current)

Flow authenticates with **Noirly Identity** (OIDC). The login screen has a **Noirly Login** button.

Google sign-in is configured on Identity, not in Flow. After Noirly Login, Identity can show **Continue with Google**.

### Local setup

1. In Identity, add Google OAuth credentials (optional) to `.env.local`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`

2. Seed the Flow OAuth client:

```bash
cd ../noirly-identity
npm run db:seed
```

3. Copy the printed `AUTH_NOIRLY_CLIENT_*` values into `noirly-flow/.env.local` (see `.env.example`).

4. Run Identity on port 3000 and Flow on port 3002.
