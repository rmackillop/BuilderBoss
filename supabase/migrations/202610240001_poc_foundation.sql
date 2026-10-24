-- BuilderBoss POC 1.0. Run once on a new Supabase project.
-- No anonymous read/write access; organizations are provisioned administratively.
create extension if not exists pgcrypto;
create table public.organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) > 0),
 created_at timestamptz not null default now()
);
create table public.user_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '',
 created_at timestamptz not null default now()
);
create table public.organization_members (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check (role in ('owner','admin','member')),
 created_at timestamptz not null default now(),
 primary key (organization_id,user_id)
);
create index organization_members_user_id_idx on public.organization_members(user_id);
create table public.organization_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 display_name text,
 dependency_mode text not null default 'advise' check (dependency_mode in ('advise','enforce')),
 updated_at timestamptz not null default now()
);
create table public.projects (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (length(trim(name)) > 0),
 description text,
 created_at timestamptz not null default now()
);
create index projects_organization_id_idx on public.projects(organization_id);
-- New Supabase projects don't auto-expose new public tables as of 2026.
-- Enable exposure to authenticated role explicitly, always with RLS.
grant usage on schema public to authenticated;
grant select on public.organizations,public.organization_members,public.user_profiles,public.organization_settings,public.projects to authenticated;
grant insert,update on public.user_profiles,public.projects to authenticated;
grant delete on public.projects to authenticated;
grant update on public.organization_settings to authenticated;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.user_profiles enable row level security;
alter table public.organization_settings enable row level security;
alter table public.projects enable row level security;
create policy "Read own memberships" on public.organization_members for select to authenticated
 using (user_id=(select auth.uid()));
create policy "Read member organizations" on public.organizations for select to authenticated
 using (exists(select 1 from public.organization_members m where m.organization_id=id and m.user_id=(select auth.uid())));
create policy "Read own profile" on public.user_profiles for select to authenticated
 using (id=(select auth.uid()));
create policy "Create own profile" on public.user_profiles for insert to authenticated
 with check (id=(select auth.uid()));
create policy "Update own profile" on public.user_profiles for update to authenticated
 using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy "Read organization settings" on public.organization_settings for select to authenticated
 using (exists(select 1 from public.organization_members m where m.organization_id=organization_settings.organization_id and m.user_id=(select auth.uid())));
create policy "Admins update organization settings" on public.organization_settings for update to authenticated
 using (exists(select 1 from public.organization_members m where m.organization_id=organization_settings.organization_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')))
 with check (exists(select 1 from public.organization_members m where m.organization_id=organization_settings.organization_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));
create policy "Read member projects" on public.projects for select to authenticated
 using (exists(select 1 from public.organization_members m where m.organization_id=projects.organization_id and m.user_id=(select auth.uid())));
create policy "Create member projects" on public.projects for insert to authenticated
 with check (exists(select 1 from public.organization_members m where m.organization_id=projects.organization_id and m.user_id=(select auth.uid())));
create policy "Update member projects" on public.projects for update to authenticated
 using (exists(select 1 from public.organization_members m where m.organization_id=projects.organization_id and m.user_id=(select auth.uid())))
 with check (exists(select 1 from public.organization_members m where m.organization_id=projects.organization_id and m.user_id=(select auth.uid())));
create policy "Delete member projects" on public.projects for delete to authenticated
 using (exists(select 1 from public.organization_members m where m.organization_id=projects.organization_id and m.user_id=(select auth.uid())));
