'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase, isConfigured } from '@/lib/supabase';

type Tab = 'dashboard'|'projects'|'settings'|'status';
type Org = { id:string; name:string };
type Project = { id:string; name:string; description:string|null };
type Settings = { dependency_mode:'advise'|'enforce'; display_name:string|null };
type Membership = { organization_id:string; role:string; organizations:Org | Org[] | null };

const sb = getSupabase();
export default function Home() {
  const [user,setUser] = useState<User|null>(null);
  const [ready,setReady] = useState(false);
  const [tab,setTab] = useState<Tab>('dashboard');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [org,setOrg] = useState<Org|null>(null);
  const [role,setRole] = useState('');
  const [projects,setProjects] = useState<Project[]>([]);
  const [settings,setSettings] = useState<Settings>({dependency_mode:'advise',display_name:''});
  const [newProject,setNewProject] = useState('');
  const [userName,setUserName] = useState('');
  const [dbStatus,setDbStatus] = useState('Not tested');
  const [notice,setNotice] = useState('');

  useEffect(()=>{
    if (!sb) { setReady(true); return; }
    void sb.auth.getUser().then(({data})=>{ setUser(data.user); setReady(true); });
    const {data:{subscription}} = sb.auth.onAuthStateChange((_event,session)=>{ setUser(session?.user ?? null); });
    return ()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if (!sb || !user) { setOrg(null); setProjects([]); return; }
    let canceled=false;
    const load=async()=>{
      const members=await sb.from('organization_members').select('organization_id,role,organizations(id,name)').eq('user_id',user.id).limit(1);
      if(canceled) return;
      if(members.error) { setDbStatus('Error: '+members.error.message); return; }
      const m=(members.data?.[0]??null) as Membership|null;
      const o=Array.isArray(m?.organizations)?m?.organizations[0]:m?.organizations;
      if(!o) { setDbStatus('No organization membership'); return; }
      setOrg(o); setRole(m?.role??'member');
      const [ps,ss,profile]=await Promise.all([
        sb.from('projects').select('id,name,description').eq('organization_id',o.id).order('created_at',{ascending:false}),
        sb.from('organization_settings').select('dependency_mode,display_name').eq('organization_id',o.id).maybeSingle(),
        sb.from('user_profiles').select('display_name').eq('id',user.id).maybeSingle()
      ]);
      if(canceled) return;
      if(ps.error || ss.error || profile.error) setDbStatus('Error: '+(ps.error?.message||ss.error?.message||profile.error?.message));
      else setDbStatus('Connected · RLS query passed');
      setProjects((ps.data??[]) as Project[]);
      if(ss.data) setSettings({dependency_mode:ss.data.dependency_mode,display_name:ss.data.display_name??''});
      setUserName(profile.data?.display_name??'');
    };
    void load();
    return ()=>{canceled=true;};
  },[user]);

  async function login(e:FormEvent) {
    e.preventDefault(); if(!sb)return; setBusy(true);setError('');
    const {error:authError}=await sb.auth.signInWithPassword({email,password});
    if(authError)setError(authError.message);
    setBusy(false);setPassword('');
  }
  async function createProject(e:FormEvent) {
    e.preventDefault(); if(!sb||!org||!newProject.trim())return;
    setBusy(true);setNotice('');
    const {data,error:q}=await sb.from('projects').insert({organization_id:org.id,name:newProject.trim()}).select('id,name,description').single();
    if(q)setNotice('Error: '+q.message);else {setProjects(p=>[data as Project,...p]);setNewProject('');setNotice('Project saved');}
    setBusy(false);
  }
  async function editProject(p:Project) {
    if(!sb||!org)return;
    const name=window.prompt('Project name',p.name);
    if(name===null)return;
    const nextName=name.trim();
    if(!nextName){setNotice('Project name cannot be empty');return;}
    const description=window.prompt('Project description (optional)',p.description??'');
    if(description===null)return;
    setBusy(true);setNotice('');
    const {data,error:q}=await sb.from('projects')
      .update({name:nextName,description:description.trim()||null})
      .eq('organization_id',org.id).eq('id',p.id)
      .select('id,name,description').single();
    if(q)setNotice('Error: '+q.message);
    else {setProjects(xs=>xs.map(x=>x.id===p.id?data as Project:x));setNotice('Project updated');}
    setBusy(false);
  }
  async function deleteProject(p:Project) {
    if(!sb||!org||busy)return;
    if(!window.confirm(`Delete project "${p.name}"? This cannot be undone.`))return;
    setBusy(true);setNotice('');
    const {data,error:q}=await sb.from('projects').delete()
      .eq('organization_id',org.id).eq('id',p.id).select('id');
    if(q)setNotice('Error: '+q.message);
    else if(!data?.length)setNotice('Project was not deleted. Refresh and try again.');
    else {setProjects(xs=>xs.filter(x=>x.id!==p.id));setNotice('Project deleted');}
    setBusy(false);
  }
  async function saveSettings(e:FormEvent) {
    e.preventDefault();if(!sb||!org||!user)return;setBusy(true);setNotice('');
    const [a,b]=await Promise.all([
      sb.from('organization_settings').update({dependency_mode:settings.dependency_mode,display_name:settings.display_name}).eq('organization_id',org.id),
      sb.from('user_profiles').upsert({id:user.id,display_name:userName})
    ]);
    setNotice(a.error||b.error?'Error: '+(a.error?.message||b.error?.message):'Settings saved to Supabase');
    setBusy(false);
  }
  if(!ready)return <main className="center"><p>Loading BuilderBoss…</p></main>;
  if(!isConfigured())return <main className="center"><div className="panel narrow"><span className="brand">BuilderBoss</span><h1>POC foundation ready</h1><p>Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the deployment environment.</p><p className="muted">No database connection or sign-in is available until configured.</p></div></main>;
  if(!user)return <main className="center login-page"><form onSubmit={login} className="panel narrow stack"><img className="login-logo" src="/brand-login.webp" alt="BuilderBoss — AI Construction Management" width={620} height={430} /><h1>Sign in</h1><p className="muted">POC 1.0 · Invitation-only accounts</p><label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="error">{error}</p>}<button disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form></main>;
  return <div className="shell">
    <header><div className="brand-lockup"><img src="/brand-header.webp" alt="BuilderBoss — AI Construction Management" width={570} height={128} /><small>POC 1.0</small></div><button className="ghost" onClick={()=>void sb?.auth.signOut()}>Sign out</button></header>
    <div className="layout"><nav aria-label="Main navigation">{(['dashboard','projects','settings','status'] as Tab[]).map(t=><button key={t} className={t===tab?'nav active':'nav'} onClick={()=>{setTab(t);setNotice('');}}>{t[0].toUpperCase()+t.slice(1)}</button>)}</nav>
    <main className="content">
      {notice&&<p className="message" role="status">{notice}</p>}
      {tab==='dashboard'&&<section><h1>Welcome to BuilderBoss</h1><p className="muted">{user.email}</p><div className="cards"><article className="panel"><h2>Organization</h2><p>{org?.name??'No organization assigned'}</p><small>{role||'Contact an administrator'}</small></article><article className="panel"><h2>Projects</h2><p className="stat">{projects.length}</p><button className="link" onClick={()=>setTab('projects')}>View projects →</button></article><article className="panel"><h2>Database</h2><p>{dbStatus}</p></article></div></section>}
      {tab==='projects'&&<section><h1>Projects</h1><p className="muted">Projects for {org?.name??'your organization'}</p><div className="panel"><form className="inline" onSubmit={createProject}><input aria-label="Project name" placeholder="New project name" required value={newProject} onChange={e=>setNewProject(e.target.value)} disabled={!org}/><button disabled={busy||!org}>Add project</button></form></div><div className="stack">{projects.map(p=><article className="panel item" key={p.id}><div><strong>{p.name}</strong><p className="muted">{p.description||'No description yet'}</p></div><div className="item-actions"><button className="secondary" disabled={busy} onClick={()=>void editProject(p)}>Edit</button><button className="secondary" disabled={busy} onClick={()=>void deleteProject(p)}>Delete</button></div></article>)}{!projects.length&&<p className="muted">No projects yet. Add your first one above.</p>}</div></section>}
      {tab==='settings'&&<section><h1>Settings</h1><form onSubmit={saveSettings} className="panel stack"><label>Your display name<input value={userName} onChange={e=>setUserName(e.target.value)}/></label><label>Company display name<input value={settings.display_name??''} disabled={role!=='owner'&&role!=='admin'} onChange={e=>setSettings(s=>({...s,display_name:e.target.value}))}/></label><label>Dependency mode<select disabled={role!=='owner'&&role!=='admin'} value={settings.dependency_mode} onChange={e=>setSettings(s=>({...s,dependency_mode:e.target.value as Settings['dependency_mode']}))}><option value="advise">Advise</option><option value="enforce">Enforce</option></select></label><p className="muted">This setting is stored now; task dependency logic will be implemented later.</p><button disabled={busy||!org}>Save settings</button></form></section>}
      {tab==='status'&&<section><h1>System status</h1><div className="panel stack"><p><b>Application:</b> BuilderBoss POC 1.0</p><p><b>Authentication:</b> Signed in</p><p><b>Database:</b> {dbStatus}</p><p><b>Organization:</b> {org?.name??'Not assigned'}</p><p><b>Build environment:</b> {process.env.NODE_ENV}</p><p><b>App URL:</b> {typeof window!=='undefined'?window.location.origin:'—'}</p><button className="secondary" onClick={()=>window.location.reload()}>Rerun diagnostics</button></div></section>}
    </main></div>
  </div>;
}
