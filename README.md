# BuilderBoss — POC 1.0

Minimal multi-tenant construction management PWA. Code foundation only until Supabase project and Vercel team access are available.

## Setup
1. Create Supabase project in the existing BuilderBoss organization.
2. Apply `supabase/migrations/202610240001_poc_foundation.sql` through the Supabase SQL editor (or migrate with the CLI).
3. Create a Supabase Auth email/password user. Insert an organization and membership via trusted SQL (see `supabase/README.md`).
4. Set environment variables from `.env.example` in Vercel and locally. Do not commit credentials.
5. Run `npm install`, `npm run build`, then `npm run dev`.
6. Connect the repository to Vercel, configure `builderboss.sunhavengc.com` and HTTPS.

**Note:** The UI displays a configuration notice until Supabase values are supplied. All project/settings data is persisted in Supabase; no mock production data. Public self-signup is deliberately disabled.

## Stack
Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase Auth/PostgreSQL, Vercel, PWA manifest.

## Security
All public tables use RLS. App browser uses only a publishable key. Never place the service-role key into public environment variables. Tenant authorization is based on membership, not hostname. Accounts and memberships are provisioned by an administrator during POC.
