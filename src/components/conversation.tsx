'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSupabase } from '@/lib/supabase';

type Row = Record<string, unknown>;
type Result = { message: string; project_id?: string; view?: string; records?: Record<string, Row[] | Row | string>; retrieved_at?: string; actor_id?: string };
type Message = { role: 'user' | 'assistant'; text: string; result?: Result };
const dollars = (value: unknown) => typeof value === 'number' || typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value)) : '—';

function FinancialResult({ result }: { result: Result }) {
  const records = result.records!;
  const vendors = Array.isArray(records.vendors) ? records.vendors : [];
  const vendorName = (id: unknown) => vendors.find(v => v.id === id)?.name as string || String(id ?? '—');
  const sections = result.view === 'commitments' ? ['commitments'] : result.view === 'invoices' ? ['bills'] : result.view === 'transactions' ? ['transactions'] : ['commitments', 'bills', 'transactions', ...(records.legacy_payments ? ['legacy_payments'] : [])];
  const commitments = Array.isArray(records.commitments) ? records.commitments : [];
  const transactions = Array.isArray(records.transactions) ? records.transactions : [];
  const sum = (rows: Row[]) => rows.reduce((cents, row) => cents + Math.round(Number(row.amount) * 100), 0) / 100;
  return <div className="financial-result">
    <p className="muted">Retrieved {new Date(result.retrieved_at!).toLocaleString()} · Live database records</p>
    <p className="message">Commitments, invoices, and payments are separate ledgers. These records do not establish an outstanding balance, approved budget, or variance. Legacy payments must be reconciled before reporting totals.</p>
    {result.view === 'summary' && <div className="cards"><div><strong>Approved commitments</strong><p>{dollars(sum(commitments.filter(r => r.status === 'approved')))}</p></div><div><strong>Recorded cash payments</strong><p>{dollars(sum(transactions.filter(r => r.transaction_kind === 'payment' && r.cash_effect === true && !r.voided_at)))}</p><small>Financial transaction ledger only</small></div></div>}
    {sections.map(section => {
      const rows = Array.isArray(records[section]) ? records[section] as Row[] : [];
      return <div key={section}><h3>{section === 'bills' ? 'Invoices' : section.replaceAll('_', ' ')} ({rows.length})</h3>
        {!rows.length ? <p>No records found in this ledger.</p> : <div className="table-scroll"><table><thead><tr><th>Vendor / reference</th><th>Amount</th><th>Status / type</th></tr></thead><tbody>{rows.map((row, i) => <tr key={String(row.id ?? i)}><td>{vendorName(row.vendor_id)}<small className="record-detail">{String(row.invoice_number ?? row.external_ref ?? row.source_key ?? row.id ?? '')}</small></td><td>{dollars(row.amount)}</td><td>{String(row.voided_at ? 'Voided' : row.status ?? row.transaction_kind ?? 'Recorded')}<small className="record-detail">{String(row.transaction_date ?? row.invoice_date ?? '')}</small></td></tr>)}</tbody></table></div>}
      </div>;
    })}
    <details><summary>Source records and verification details</summary><pre>{JSON.stringify({ actor_id: result.actor_id, project_id: result.project_id, records }, null, 2)}</pre></details>
  </div>;
}

export default function Conversation({ organizationId, projects }: { organizationId: string; projects: { id: string; name: string }[] }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; request.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current) { recorder.current.onstop = null; if (recorder.current.state !== 'inactive') recorder.current.stop(); }
      stream.current?.getTracks().forEach(t => t.stop());
    };
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy]);

  async function call(path: string, payload: FormData | Record<string, unknown>) {
    const sb = getSupabase();
    const { data, error } = await sb!.auth.getSession();
    if (error || !data.session) throw new Error('Your session expired. Please sign in again.');
    const controller = new AbortController(); request.current = controller;
    const headers: Record<string, string> = { Authorization: `Bearer ${data.session.access_token}` };
    if (!(payload instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, { method: 'POST', headers, body: payload instanceof FormData ? payload : JSON.stringify(payload), signal: controller.signal });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || 'Request failed. Please try again.');
    return json.data;
  }
  async function send(e: FormEvent) {
    e.preventDefault(); if (busy || recording || !text.trim()) return;
    const instruction = text.trim(); setText(''); setError(''); setBusy(true);
    setMessages(m => [...m, { role: 'user', text: instruction }]);
    try {
      const result: Result = await call('/api/conversation', { message: instruction, organization_id: organizationId, project_id: projectId || null });
      if (!mounted.current) return;
      if (result.project_id) setProjectId(result.project_id);
      setMessages(m => [...m, { role: 'assistant', text: result.message, result }]);
    } catch (e) { if (mounted.current) { setError(e instanceof Error ? e.message : 'Request failed'); setText(instruction); } }
    finally { if (mounted.current) setBusy(false); }
  }
  async function microphone() {
    if (recording) { recorder.current?.stop(); return; }
    if (busy) return;
    setError(''); setBusy(true);
    let captured: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Microphone recording is unavailable in this browser. Please type your instruction.');
      captured = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { captured.getTracks().forEach(t => t.stop()); return; }
      stream.current = captured;
      const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(captured, mimeType ? { mimeType } : undefined); recorder.current = rec;
      const chunks: Blob[] = []; let total = 0;
      rec.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); total += event.data.size; if (total > 2500000 && rec.state === 'recording') rec.stop(); } };
      rec.onerror = () => { setError('Recording failed. Please try again or type your instruction.'); if (rec.state !== 'inactive') rec.stop(); };
      rec.onstop = async () => {
        if (timer.current) clearTimeout(timer.current);
        captured?.getTracks().forEach(t => t.stop());
        if (!mounted.current) return;
        setRecording(false); setBusy(true);
        try {
          if (!total || total > 2500000) throw new Error('Please record a shorter instruction.');
          const form = new FormData(); form.set('audio', new Blob(chunks, { type: rec.mimeType }), rec.mimeType.includes('mp4') ? 'instruction.m4a' : 'instruction.webm');
          const data = await call('/api/transcription', form);
          if (mounted.current) setText(data.text);
        } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Transcription failed'); }
        finally { if (mounted.current) setBusy(false); }
      };
      rec.start(1000); setRecording(true); setBusy(false);
      timer.current = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 30000);
    } catch (e) { captured?.getTracks().forEach(t => t.stop()); if (mounted.current) { setError(e instanceof Error ? e.message : 'Microphone unavailable'); setBusy(false); } }
  }
  return <section className="conversation"><h1>Ask BuilderBoss</h1><p className="muted">Read-only financial lookups · {organizationId ? 'Signed-in account permissions apply' : ''}</p>
    <div className="panel stack"><label>Project context<select value={projectId} onChange={e => setProjectId(e.target.value)} disabled={busy || recording}><option value="">Name a project in your instruction</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <p>Try: “BuilderBoss, show me the financial summary for Mineola Lot 20.”</p>
      <div className="conversation-log" role="log" aria-label="Conversation history" aria-live="polite">{messages.length === 0 && <p className="muted">Ask by voice or type below. Review the transcription, then send.</p>}{messages.map((m, i) => <article key={i} className={`chat-message ${m.role}`}><strong>{m.role === 'user' ? 'You' : 'BuilderBoss'}</strong><p>{m.text}</p>{m.result?.records && <FinancialResult result={m.result}/>}</article>)}<div ref={end}/></div>
      {error && <p className="error" role="alert">{error}</p>}
      <p role="status">{recording ? 'Recording… Tap Stop when finished (30-second limit).' : busy ? 'Working…' : 'Audio is sent for transcription. Conversation clears when you leave this screen or sign out.'}</p>
      <form className="stack" onSubmit={send}><label>Your instruction<textarea rows={3} maxLength={2000} value={text} onChange={e => setText(e.target.value)} disabled={busy || recording} placeholder="Ask about project finances…"/></label><div className="conversation-actions"><button type="button" aria-pressed={recording} onClick={() => void microphone()} disabled={busy}>{recording ? '■ Stop recording' : '🎤 Microphone'}</button><button disabled={busy || recording || !text.trim()}>Send</button><button type="button" className="secondary" disabled={busy || recording} onClick={() => { setMessages([]); setText(''); setError(''); setProjectId(''); }}>Clear</button></div></form>
    </div></section>;
}
