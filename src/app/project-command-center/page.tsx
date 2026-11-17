'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

type Project = { id: string; name: string; description: string | null };
type Metric = { label: string; value: string; detail: string };
const unavailable: Metric[] = [
  { label: 'Tasks', value: 'N/A', detail: 'Awaiting project checklist data' },
  { label: 'Schedule', value: 'N/A', detail: 'Awaiting planned workdays' },
  { label: 'Financial', value: 'N/A', detail: 'Awaiting allocated budget and actuals' },
];
function Tiles({ metrics = unavailable }: { metrics?: Metric[] }) {
  return <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>
    {metrics.map(m => <div key={m.label} style={{background:'#eef2f6',borderRadius:10,padding:12,textAlign:'center'}}>
      <div style={{fontSize:12,color:'#425466'}}>{m.label}</div>
      <strong style={{fontSize:24}}>{m.value}</strong>
      <div style={{fontSize:11,color:'#425466'}}>{m.detail}</div>
    </div>)}
  </div>;
}
export default function ProjectCommandCenter() {
  const [projects,setProjects] = useState<Project[]>([]);
  const [selected,setSelected] = useState('');
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const sb = getSupabase();
      if (!sb) { setError('Supabase is not configured.'); setLoading(false); return; }
      const {data:{user},error:authError} = await sb.auth.getUser();
      if (!active) return;
      if (authError || !user) { setError('Sign in to BuilderBoss to view projects.'); setLoading(false); return; }
      const {data,error:queryError} = await sb.from('projects')
        .select('id,name,description').order('name');
      if (!active) return;
      if (queryError) setError(queryError.message);
      else { const rows = (data ?? []) as Project[]; setProjects(rows); setSelected(rows[0]?.id ?? ''); }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);
  const project = projects.find(p => p.id === selected);
  return <main style={{maxWidth:880,margin:'0 auto',padding:24,color:'#18334b'}}>
    <a href="/" style={{fontSize:14}}>← BuilderBoss</a>
    <h1>Project Command Center</h1>
    <p style={{color:'#526477'}}>Read-only project overview · First implementation</p>
    {loading && <p>Loading projects…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && <>
      <label htmlFor="project">Project</label>
      <select id="project" value={selected} onChange={e=>setSelected(e.target.value)}
        style={{display:'block',width:'100%',padding:12,margin:'8px 0 20px'}}>
        {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {project ? <section>
        <h2>{project.name}</h2>
        {project.description && <p>{project.description}</p>}
        <Tiles />
        <h3 style={{marginTop:28}}>Phases</h3>
        <div style={{border:'1px solid #d8e0e7',borderRadius:10,padding:20}}>
          <p>No verified phase/checklist records are connected to this view yet.</p>
          <p style={{fontSize:13,color:'#526477'}}>Phase → milestone → task expansion will use the existing project-specific hierarchy. No sample percentages or financial amounts are presented as live data.</p>
        </div>
      </section> : <p>No projects available for this account.</p>}
    </>}
  </main>;
}
