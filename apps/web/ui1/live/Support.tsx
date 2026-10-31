import { useEffect, useState } from 'react';
import { BookOpen, CircleAlert, MessageCircle, Send, X } from 'lucide-react';
import { http, apiErrorMessage } from './api';
import { useAuth } from '../app/AuthContext';
import { Button } from '../ui/Button';

interface Turn { id: number; role: 'user' | 'assistant'; text: string; sources?: Array<{ id: string; title: string }>; records?: Array<Record<string, unknown>> }
interface Knowledge { id: string; title: string; body: string; published: boolean; updated_at: string }
function recordDetails(row: Record<string, unknown>): string {
  const date = (value: unknown) => typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString() : '';
  return [row.status ? `Status · ${String(row.status)}` : '', row.next_billing_date ? `Next billing · ${date(row.next_billing_date)}` : '', row.due_date ? `Due · ${date(row.due_date)}` : '', row.outstanding ? `Outstanding · ₹${String(row.outstanding)}` : ''].filter(Boolean).join(' · ');
}

export function SupportChat() {
  const { user } = useAuth(); const [open, setOpen] = useState(false); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [turns, setTurns] = useState<Turn[]>([{ id: 0, role: 'assistant', text: 'Ask a question about your account or support information. For account records, use one of the verified lookups below.' }]);
  if (user?.role !== 'customer') return null;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); const message = text.trim(); if (!message || busy) return;
    setText(''); setError(''); setBusy(true); setTurns((t) => [...t, { id: Date.now(), role: 'user', text: message }]);
    try {
      const response = await http.post<{ data: { answer: string; sources: Array<{ id: string; title: string }> } }>('/support/chat', { message });
      setTurns((t) => [...t, { id: Date.now() + 1, role: 'assistant', text: response.data.data.answer, sources: response.data.data.sources }]);
    } catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }
  async function lookup(topic: 'subscriptions' | 'unpaid_invoices') {
    setError(''); setBusy(true);
    try {
      const response = await http.post<{ data: { message: string; items: Array<Record<string, unknown>> } }>('/support/message', { topic });
      setTurns((t) => [...t, { id: Date.now(), role: 'assistant', text: response.data.data.message, records: response.data.data.items }]);
    } catch (e) { setError(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }
  return <div className={`support-dock ${open ? 'is-open' : ''}`}>
    {open && <section className="support-panel" aria-label="Support assistant">
      <header><div><strong>Brightloop support</strong><small>Experimental · verify important details</small></div><button type="button" aria-label="Close support" onClick={() => setOpen(false)}><X size={17} /></button></header>
      <div className="support-disclaimer">Answers use published help articles and, when available, your account records. The local AI assistant can make mistakes.</div>
      <div className="support-messages" aria-live="polite">{turns.map((turn) => <div className={`support-turn ${turn.role}`} key={turn.id}><div>{turn.text}</div>{turn.records?.length ? <div className="support-records">{turn.records.map((row, i) => <div className="support-record" key={String(row.id ?? i)}><strong>{String(row.subscription_number ?? row.invoice_number ?? 'Record')}</strong><span>{recordDetails(row)}</span></div>)}</div> : null}{turn.sources?.length ? <small>Sources: {turn.sources.map((s) => s.title).join(', ')}</small> : null}</div>)}{busy && <div className="support-thinking"><span className="live-spinner" />Looking up an answer…</div>}{error && <div className="support-error"><CircleAlert size={14} />{error}</div>}</div>
      <div className="support-shortcuts"><button disabled={busy} onClick={() => void lookup('subscriptions')}>My subscriptions</button><button disabled={busy} onClick={() => void lookup('unpaid_invoices')}>Unpaid invoices</button></div>
      <form onSubmit={(e) => void submit(e)}><input className="field__input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question…" maxLength={2000} aria-label="Ask support" /><button type="submit" disabled={busy || !text.trim()} aria-label="Send question"><Send size={16} /></button></form>
    </section>}
    <button type="button" className="support-launcher" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Close support' : 'Open support'}>{open ? <X size={20} /> : <MessageCircle size={20} />}<span>{open ? '' : 'Support'}</span></button>
  </div>;
}

export function SupportKnowledgePage() {
  const [rows, setRows] = useState<Knowledge[]>([]); const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [published, setPublished] = useState(false); const [editing, setEditing] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function refresh() { setLoading(true); setError(''); try { const response = await http.get<{ data: Knowledge[] }>('/support-knowledge', { params: { page: 1, pageSize: 100 } }); setRows(response.data.data); } catch (e) { setError(apiErrorMessage(e)); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, []);
  function edit(row: Knowledge) { setEditing(row.id); setTitle(row.title); setBody(row.body); setPublished(row.published); }
  function clear() { setEditing(null); setTitle(''); setBody(''); setPublished(false); }
  async function save(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const doc = { title, body, published }; if (editing) await http.put(`/support-knowledge/${editing}`, doc); else await http.post('/support-knowledge', doc); clear(); await refresh(); } catch (err) { setError(apiErrorMessage(err)); } finally { setBusy(false); } }
  return <div className="page live-page"><div className="page__header live-header"><div><h1 className="page-title">Support knowledge</h1><span className="caption">Manage the published articles used by customer support.</span></div></div>
    <div className="support-knowledge-grid"><form className="card knowledge-form" onSubmit={(e) => void save(e)}><h2>{editing ? 'Edit article' : 'New article'}</h2><label>Title<input className="field__input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} /></label><label>Article content<textarea className="field__input" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={12000} rows={9} /></label><label className="knowledge-publish"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published and available to customer support</label>{error && <div className="support-error"><CircleAlert size={14} />{error}</div>}<div className="knowledge-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create article'}</Button>{editing && <Button type="button" variant="secondary" onClick={clear}>Cancel</Button>}</div></form>
      <section className="knowledge-list">{loading ? <div className="card live-state"><span className="live-spinner" />Loading articles…</div> : rows.length ? rows.map((row) => <article className="card knowledge-row" key={row.id}><span className="knowledge-icon"><BookOpen size={17} /></span><div><strong>{row.title}</strong><small>{row.published ? 'Published' : 'Draft'} · updated {new Date(row.updated_at).toLocaleDateString()}</small><p>{row.body}</p></div><Button size="sm" variant="secondary" onClick={() => edit(row)}>Edit</Button></article>) : <div className="card live-empty"><BookOpen /><strong>No support articles</strong><span>Create one to provide answers from verified documentation.</span></div>}</section>
    </div>
  </div>;
}
