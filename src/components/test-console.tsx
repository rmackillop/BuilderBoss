'use client';
import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
type Project={id:string;name:string};
type Outcome={status:'PASS'|'FAIL'|'BLOCKED';detail:string;actual?:unknown};
const tests=[
 {id:'project',label:'Retrieve selected project',group:'Projects'},
 {id:'context',label:'Retrieve financial context',group:'Commitments'},
 {id:'septic',label:'Find All-Pro Septic commitment',group:'Commitments'},
 {id:'invoices',label:'Retrieve invoices',group:'Invoices'},
 {id:'payments',label:'Retrieve transactions',group:'Payments'},
 {id:'isolation',label:'Reject access to another project',group:'Security'},
];
export default function TestConsole({projects,role,userEmail}:{projects:Project[];role:string;userEmail:string}) {
 const [projectId,setProjectId]=useState('');
 const [results,setResults]=useState<Record<string,Outcome>>({});
 const [running,setRunning]=useState<string|null>(null);
 const [showDetails,setShowDetails]=useState<string|null>(null);
 async function run(id:string){
  if(!projectId)return;
  setRunning(id);
  try{
   const sb=getSupabase();
   const {data:session,error}=await sb!.auth.getSession();
   if(error||!session.session)throw Error('Sign in again.');
   const fetchContext=async(pid:string)=>{
    const response=await fetch('/api/v1/financial/context?project_id='+encodeURIComponent(pid),{headers:{Authorization:'Bearer '+session.session!.access_token},cache:'no-store'});
    const payload=await response.json();
    return {response,payload};
   };
   let outcome:Outcome;
   if(id==='isolation'){
    // A nonexistent project must never be disclosed to the caller.
    const {response,payload}=await fetchContext('00000000-0000-4000-8000-000000000001');
    outcome={status:response.status===403||response.status===404?'PASS':'FAIL',detail:'Expected access denial (403 or 404); received HTTP '+response.status,actual:payload};
   }else{
    const {response,payload}=await fetchContext(projectId);
    if(!response.ok)outcome={status:'FAIL',detail:'HTTP '+response.status,actual:payload};
    else{
     const data=payload.data??{};
     const rows=(key:string)=>Array.isArray(data[key])?data[key]:[];
     if(id==='project')outcome={status:data.project?.id===projectId?'PASS':'FAIL',detail:'Project ID matches selected project: '+String(data.project?.name??'missing'),actual:data.project};
     else if(id==='context')outcome={status:Array.isArray(data.commitments)?'PASS':'FAIL',detail:'Returned '+rows('commitments').length+' commitments',actual:rows('commitments')};
     else if(id==='invoices')outcome={status:Array.isArray(data.bills)?'PASS':'FAIL',detail:'Returned '+rows('bills').length+' invoices',actual:rows('bills')};
     else if(id==='payments')outcome={status:Array.isArray(data.transactions)?'PASS':'FAIL',detail:'Returned '+rows('transactions').length+' transactions',actual:rows('transactions')};
     else {
      const vendors=rows('vendors').filter((v:any)=>/all[ -]?pro septic/i.test(String(v.name??'')));
      const matches=rows('commitments').filter((c:any)=>vendors.some((v:any)=>v.id===c.vendor_id));
      outcome={status:vendors.length===1&&matches.length===1?'PASS':'FAIL',detail:'Matched '+vendors.length+' vendor(s) and '+matches.length+' commitment(s). '+(matches.length===1?'Recorded amount: $'+Number(matches[0].amount).toLocaleString('en-US'):'Review source records.'),actual:{vendors,commitments:matches}};
     }
    }
   }
   setResults(prev=>({...prev,[id]:outcome}));
  }catch(e){setResults(prev=>({...prev,[id]:{status:'BLOCKED',detail:e instanceof Error?e.message:String(e)}]}));}
  finally{setRunning(null);}
 }
 return <section><h1>Developer Testing</h1><p className="muted">Preview-only test console · API requests use your signed-in account, not a service role. No AI or voice calls.</p><div className="panel stack"><p><b>Signed in:</b> {userEmail} · <b>Role:</b> {role}</p><label>Test project<select value={projectId} onChange={e=>{setProjectId(e.target.value);setResults({});}}><option value="">Select a project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
 {['Projects','Commitments','Invoices','Payments','Security'].map(group=><div key={group}><h2>{group}</h2><div className="stack">{tests.filter(t=>t.group===group).map(t=><article key={t.id} className="panel"><strong>{t.label}</strong><p className="muted">{results[t.id]?.status??'NOT RUN'}{results[t.id]?' — '+results[t.id].detail:''}</p><button disabled={!projectId||running!==null} onClick={()=>void run(t.id)}>{running===t.id?'Running…':'Run Test'}</button>{results[t.id]&&<button className="secondary" onClick={()=>setShowDetails(showDetails===t.id?null:t.id)}>Details</button>}{showDetails===t.id&&results[t.id]&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(results[t.id].actual??results[t.id].detail,null,2)}</pre>}</article>)}</div></div>)}
 <div className="panel"><h2>Write tests — not enabled</h2><p>Invoice creation, payments, amendments, and permission-denial write tests require isolated fixtures and idempotency checks. They are intentionally blocked to protect existing financial data.</p></div></section>;
}
