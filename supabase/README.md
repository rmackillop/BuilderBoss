# Supabase provisioning for POC

1. Create a Supabase project in the existing BuilderBoss Supabase organization.
2. Apply the versioned SQL migration.
3. Create an email/password account using Supabase Authentication -> Users (do not enable public signup).
4. With the resulting auth user UUID, run the following **trusted administrator SQL** (replace the placeholder; never expose this SQL to the browser):

```sql
with new_org as (
  insert into public.organizations(name) values ('Sun Haven Construction')
  returning id
), member as (
  insert into public.organization_members(organization_id,user_id,role)
  select id, 'REPLACE_AUTH_USER_UUID'::uuid, 'owner' from new_org
  returning organization_id
), settings as (
  insert into public.organization_settings(organization_id,display_name,dependency_mode)
  select organization_id, 'Sun Haven Construction','advise' from member
)
insert into public.projects(organization_id,name)
select organization_id, 'Mineola Lot 20' from member
union all
select organization_id, 'Canton 12-Unit Development' from member;
```

5. Configure Vercel publishable environment variables, set auth Site URL and allowed redirect URLs to the production origin.
6. Verify: user A in organization A cannot SELECT/UPDATE organization B's projects, including when explicitly filtering by organization B's UUID. Avoid trusting client-side filters alone.

**Important:** The migration is source-controlled but has not been applied to a live Supabase database. Check Data API schema exposure and JWT authorization grants when testing. No elevated service-role key belongs in the browser.
