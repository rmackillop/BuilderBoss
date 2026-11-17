-- Read-only Project Command Center RPCs. Review and apply as a migration after tests.
-- SECURITY INVOKER preserves table RLS; explicit membership checks prevent cross-tenant identifiers.
create or replace function public.get_project_overview(p_project_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
with permitted as (
 select p.id,p.name,p.description,p.organization_id
 from public.projects p
 where p.id=p_project_id and exists (
  select 1 from public.organization_members m
  where m.organization_id=p.organization_id and m.user_id=(select auth.uid()))
), phase_rows as (
 select ph.id,ph.name,ph.sequence,ph.status,ph.planned_start,ph.planned_finish,
 count(t.id)::int as task_total,
 count(t.id) filter (where t.status='complete')::int as task_complete
 from public.component_phases ph
 join public.project_components pc on pc.id=ph.component_id and pc.organization_id=ph.organization_id
 join permitted p on p.id=pc.project_id and p.organization_id=pc.organization_id
 left join public.tasks t on t.phase_id=ph.id and t.organization_id=ph.organization_id
 group by ph.id,ph.name,ph.sequence,ph.status,ph.planned_start,ph.planned_finish
), phases as (
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'name',name,'sequence',sequence,'status',status,
  'planned_start',planned_start,'planned_finish',planned_finish,
  'task_total',task_total,'task_complete',task_complete
 ) order by sequence,name),'[]'::jsonb) as items,
 coalesce(sum(task_total),0)::int as total,coalesce(sum(task_complete),0)::int as complete
 from phase_rows
)
select jsonb_build_object('project',jsonb_build_object('id',p.id,'name',p.name,'description',p.description),
 'task_total',ph.total,'task_complete',ph.complete,'phases',ph.items,
 'schedule_elapsed',null,'financial_consumption',null,
 'metric_note','Schedule and financial metrics require verified calculation rules and approved budget mapping')
from permitted p cross join phases ph
$$;

create or replace function public.get_project_phase_details(p_phase_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
with permitted as (
 select ph.id,ph.name,ph.status,ph.planned_start,ph.planned_finish,ph.organization_id
 from public.component_phases ph
 join public.project_components pc on pc.id=ph.component_id and pc.organization_id=ph.organization_id
 join public.projects p on p.id=pc.project_id and p.organization_id=pc.organization_id
 where ph.id=p_phase_id and exists (
 select 1 from public.organization_members m where m.organization_id=p.organization_id and m.user_id=(select auth.uid()))
), grouped as (
 select coalesce(nullif(trim(t.milestone),''),'Unassigned') as milestone,
 count(*)::int as task_total,
 count(*) filter (where t.status='complete')::int as task_complete,
 min(t.planned_start) as planned_start,max(t.planned_finish) as planned_finish
 from public.tasks t join permitted p on p.id=t.phase_id and p.organization_id=t.organization_id
 group by coalesce(nullif(trim(t.milestone),''),'Unassigned')
)
select jsonb_build_object('phase',jsonb_build_object('id',p.id,'name',p.name,'status',p.status),
 'milestones',coalesce((select jsonb_agg(to_jsonb(g) order by g.milestone) from grouped g),'[]'::jsonb))
from permitted p
$$;

create or replace function public.get_project_milestone_details(p_phase_id uuid,p_milestone text)
returns jsonb language sql stable security invoker set search_path = '' as $$
with permitted as (
 select ph.id,ph.organization_id from public.component_phases ph
 join public.project_components pc on pc.id=ph.component_id and pc.organization_id=ph.organization_id
 join public.projects p on p.id=pc.project_id and p.organization_id=pc.organization_id
 where ph.id=p_phase_id and exists (
 select 1 from public.organization_members m where m.organization_id=p.organization_id and m.user_id=(select auth.uid()))
)
select jsonb_build_object('phase_id',p.id,'milestone',p_milestone,
 'tasks',coalesce((select jsonb_agg(jsonb_build_object(
 'id',t.id,'title',t.title,'description',t.description,'status',t.status,
 'planned_start',t.planned_start,'planned_finish',t.planned_finish,
 'actual_start',t.actual_start,'actual_finish',t.actual_finish,
 'assignee',t.assignee_label,'notes',t.notes,
 'budget',null,'actual_cost',null,'payments',null
 ) order by t.planned_start nulls last,t.title)
 from public.tasks t where t.phase_id=p.id and t.organization_id=p.organization_id
 and coalesce(nullif(trim(t.milestone),''),'Unassigned')=p_milestone),'[]'::jsonb))
from permitted p
$$;
revoke all on function public.get_project_overview(uuid) from public,anon;
revoke all on function public.get_project_phase_details(uuid) from public,anon;
revoke all on function public.get_project_milestone_details(uuid,text) from public,anon;
grant execute on function public.get_project_overview(uuid) to authenticated;
grant execute on function public.get_project_phase_details(uuid) to authenticated;
grant execute on function public.get_project_milestone_details(uuid,text) to authenticated;
