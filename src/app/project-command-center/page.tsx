'use client';
import {useEffect,useState} from 'react';
import {getSupabase} from '@/lib/supabase';
type Project={id:string;name:string;description:string|null};
type Phase={id:string;name:string;sequence:number;status:string;task_total:number;task_complete:number;schedule_elapsed:number|null};
type Milestone={milestone:string;task_total:number;task_complete:number;planned_start:string|null;planned_finish:string|null;schedule_elapsed:number|null};
type Task={id:string;title:string;status:string;assignee:string|null;planned_start:string|null;planned_finish:string|null;actual_start:string|null;actual_finish:string|null;notes:string|null};
type Overview={project:Project;task_total:number;task_complete:number;phases:Phase[];schedule_elapsed:number|null;financial_consumption:number|null};
type PhaseDetail={milestones:Milestone[]};
type MilestoneDetail={tasks:Task[]};
function Tiles({done,total,schedule,financial}:{done:number;total:number;schedule?:number|null;financial?:number|null}){
 const pct=(n:number|null|undefined)=>n==null?'N/A':`${Number(n).toFixed(1).replace(/\.0$/,'')}%`;
 const tiles=[['Tasks',total?Math.round(done/total*100)+'%':'N/A'],['Schedule elapsed',pct(schedule)],['Financial',pct(financial)]];
 return <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>
 {tiles.map(([label,value])=><div key={label} style={{padding:10,borderRadius:9,background:'#eef2f6',textAlign:'center'}}><small>{label}</small><div style={{fontSize:22,fontWeight:700}}>{value}</div></div>)}
 </div>;
}
export default function ProjectCommandCenter(){
 const [projects,setProjects]=useState<Project[]>([]);
 const [selected,setSelected]=useState('');
 const [overview,setOverview]=useState<Overview|null>(null);
 const [phases,setPhases]=useState<Record<string,PhaseDetail>>({});
 const [milestones,setMilestones]=useState<Record<string,MilestoneDetail>>({});
 const [expandedPhases,setExpandedPhases]=useState<Record<string,boolean>>({});
 const [expandedMilestones,setExpandedMilestones]=useState<Record<string,boolean>>({});
 const [busy,setBusy]=useState<Record<string,boolean>>({});
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{
 const sb=getSupabase();if(!sb){setError('Supabase is not configured');return;}
 const {data:{user}}=await sb.auth.getUser();if(!active)return;
 if(!user){setError('Sign in to BuilderBoss first');return;}
 const {data,error:e}=await sb.from('projects').select('id,name,description').order('name');
 if(!active)return;if(e)setError(e.message);else{const ps=(data??[]) as Project[];setProjects(ps);setSelected(ps[0]?.id??'');}
 })();return()=>{active=false};},[]);
 useEffect(()=>{let active=true;setOverview(null);setPhases({});setMilestones({});setExpandedPhases({});setExpandedMilestones({});
 if(!selected)return;
 (async()=>{const {data,error:e}=await getSupabase()!.rpc('get_project_overview',{p_project_id:selected});if(!active)return;
 if(e)setError('Project overview unavailable: '+e.message);else{setError('');setOverview(data as Overview);}
 })();return()=>{active=false};},[selected]);
 async function expandPhase(id:string){
 setExpandedPhases(v=>({...v,[id]:!v[id]}));if(phases[id]||busy[id])return;
 setBusy(v=>({...v,[id]:true}));const {data,error:e}=await getSupabase()!.rpc('get_project_phase_details',{p_phase_id:id});
 if(e)setError(e.message);else setPhases(v=>({...v,[id]:data as PhaseDetail}));setBusy(v=>({...v,[id]:false}));
 }
 async function expandMilestone(phaseId:string,key:string){
 const id=JSON.stringify([phaseId,key]);setExpandedMilestones(v=>({...v,[id]:!v[id]}));if(milestones[id]||busy[id])return;
 setBusy(v=>({...v,[id]:true}));const {data,error:e}=await getSupabase()!.rpc('get_project_milestone_details',{p_phase_id:phaseId,p_milestone:key});
 if(e)setError(e.message);else setMilestones(v=>({...v,[id]:data as MilestoneDetail}));setBusy(v=>({...v,[id]:false}));
 }
 return <main style={{maxWidth:900,margin:'auto',padding:24,color:'#18334b'}}>
 <a href="/">← BuilderBoss</a><h1>Project Command Center</h1><p>Read-only · Project-specific checklist</p>
 <label htmlFor="project">Project</label><select id="project" value={selected} onChange={e=>setSelected(e.target.value)} style={{display:'block',width:'100%',padding:12,margin:'8px 0 20px'}}>
 {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
 {error&&<p role="alert" style={{color:'#a32222'}}>{error}</p>}
 {overview&&<><h2>{overview.project.name}</h2><Tiles done={overview.task_complete} total={overview.task_total} schedule={overview.schedule_elapsed} financial={overview.financial_consumption}/>
 <h3>Phases</h3>{overview.phases.map(p=><section key={p.id} style={{border:'1px solid #ccd5df',borderRadius:12,padding:14,marginBottom:12}}>
 <button type="button" onClick={()=>void expandPhase(p.id)} aria-expanded={!!expandedPhases[p.id]} style={{fontWeight:700,padding:8,width:'100%',textAlign:'left'}}>{expandedPhases[p.id]?'▾':'▸'} {p.name}</button>
 <Tiles done={p.task_complete} total={p.task_total} schedule={p.schedule_elapsed}/>
 {expandedPhases[p.id]&&<div style={{padding:'12px 0 0 16px'}}>
 {busy[p.id]&&<p>Loading milestones…</p>}
 {phases[p.id]?.milestones.map(m=>{const key=JSON.stringify([p.id,m.milestone]);return <section key={key} style={{borderTop:'1px solid #ccd5df',padding:12}}>
 <button type="button" aria-expanded={!!expandedMilestones[key]} onClick={()=>void expandMilestone(p.id,m.milestone)} style={{fontWeight:600,padding:8,width:'100%',textAlign:'left'}}>{expandedMilestones[key]?'▾':'▸'} {m.milestone}</button>
 <Tiles done={m.task_complete} total={m.task_total} schedule={m.schedule_elapsed}/>
 {expandedMilestones[key]&&<div>{busy[key]&&<p>Loading tasks…</p>}
 {milestones[key]?.tasks.map(t=><article key={t.id} style={{borderBottom:'1px solid #e2e7eb',padding:10}}>
 <strong>{t.title}</strong> · {t.status}<div>Planned: {t.planned_start??'—'} to {t.planned_finish??'—'}</div>
 <div>Actual: {t.actual_start??'—'} to {t.actual_finish??'—'}</div>
 <div>Assigned: {t.assignee??'—'} · Budget / actual / payments: not yet mapped</div>
 {t.notes&&<p>{t.notes}</p>}</article>)}</div>}
 </section>})}</div>}
 </section>)}</>}
 </main>;
}
