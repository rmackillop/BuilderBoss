# BuilderBoss — POC 1.0

Minimal multi-tenant construction project management proof of concept.

Stack: Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/PostgreSQL, Vercel PWA.

Planned environment:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL` (initially `https://builderboss.sunhavengc.com`)

Never commit secrets. POC users are provisioned deliberately; no public organization signup.

See `supabase/migrations/` for versioned schema. Run migration only after configuring a Supabase project, then configure Vercel environment variables and authentication redirect URLs.

Status: initial source foundation; not yet deployed.