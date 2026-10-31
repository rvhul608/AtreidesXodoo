import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Bot, Send } from 'lucide-react';
import { adminApi } from '../mock/api';
import { articles as seed, unanswered as seedQuestions } from '../mock/data';
import type { Article, Unanswered } from '../mock/data';
import { replyFor, SUGGESTIONS } from '../mock/chat';
import type { ChatReply } from '../mock/chat';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Field';
import { Empty, Tabs } from '../ui/Bits';
import { Pill } from '../ui/Pill';
import { useToast } from '../ui/Toast';

const TABS = [
  { id: 'articles', label: 'Articles' },
  { id: 'unanswered', label: 'Questions the bot missed' },
  { id: 'settings', label: 'Bot settings' },
];

export function SupportContentPage() {
  const [tab, setTab] = useState('articles');
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page-title">Support content</h1>
          <span className="caption">the loop between staff and customers: write, publish, measure, answer again</span>
        </div>
        <div className="row">
          <Button>Bot settings</Button>
          <Button variant="primary">New article</Button>
        </div>
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'articles' && <ArticlesTab />}
      {tab === 'unanswered' && <UnansweredTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

function ArticlesTab() {
  const [rows, setRows] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Article | null>(null);
  const toast = useToast();

  useEffect(() => {
    adminApi.articles().then((res) => {
      setRows(res.data);
      setEditing(res.data[0]);
      setLoading(false);
    });
  }, []);

  const rowsActive = rows.filter((r) => r.status === 'published');

  return (
    <div className="grid grid--side">
      <div className="card">
        <div className="table-wrap">
          <table className="ds-table">
            <thead>
              <tr><th>Title</th><th>Category</th><th>Status</th><th>Updated</th><th>Used by bot</th></tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j}><span className="skeleton" style={{ height: 16, width: '70%' }} /></td>))}</tr>))
                : rows.map((a) => (
                    <tr key={a.id} onClick={() => setEditing(a)} style={{ cursor: 'pointer' }}>
                      <td data-label="Title"><strong style={{ fontWeight: 600 }}>{a.title}</strong></td>
                      <td data-label="Category">{a.category}</td>
                      <td data-label="Status"><Pill tone={a.status === 'published' ? 'good' : 'neutral'}>{a.status === 'published' ? 'Published' : 'Draft'}</Pill></td>
                      <td data-label="Updated" className="num">{a.updated}</td>
                      <td data-label="Used" className="num">{a.used_by_bot} times</td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <Empty icon={BookOpen} title="No articles yet" body="Write the first article and the bot answers from it." />
          )}
        </div>
        <div className="row row--between" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <span className="caption">{rowsActive.length} articles the bot can cite</span>
          <Button size="sm" onClick={() => toast('New article created')}>New article</Button>
        </div>
      </div>

      <section className="card card--pad">
        {editing ? (
          <ArticleEditor article={editing} onSaved={(msg) => toast(msg)} />
        ) : (
          <Empty icon={BookOpen} title="Pick an article" body="Select an article on the left to edit it." />
        )}
        <TestBotPanel />
      </section>
    </div>
  );
}

function ArticleEditor({ article, onSaved }: { article: Article; onSaved: (msg: string) => void }) {
  const [title, setTitle] = useState(article.title);
  const [category, setCategory] = useState(article.category);
  const [body, setBody] = useState(article.body);
  const [published, setPublished] = useState(article.status === 'published');

  // Re-seed the form when a different row is opened (edits stay local until saved).
  useEffect(() => {
    setTitle(article.title);
    setCategory(article.category);
    setBody(article.body);
    setPublished(article.status === 'published');
  }, [article]);

  return (
    <form
      className="stack"
      style={{ gap: 12, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}
      onSubmit={(e) => {
        e.preventDefault();
        onSaved(`Article "${title}" ${published ? 'published' : 'saved as draft'}`);
      }}
    >
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as Article['category'])}>
        {['Plan', 'Billing', 'Subscription management', 'Payments'].map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </Select>
      <Textarea label="Body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
      <div className="row row--between">
        <label className="row" style={{ gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Active — the bot may answer from this article
        </label>
        <Button variant="primary" type="submit">Save article</Button>
      </div>
    </form>
  );
}

function TestBotPanel() {
  const [q, setQ] = useState('');
  const [thread, setThread] = useState<{ you?: string; reply?: ChatReply }[]>([]);

  const suggestions = useMemo(() => SUGGESTIONS, []);

  function ask(question: string) {
    if (!question.trim()) return;
    const reply = replyFor(question);
    setThread((prev) => [...prev, { you: question, reply }]);
    setQ('');
  }

  return (
    <section style={{ marginTop: 16 }}>
      <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Bot size={18} aria-hidden="true" /> Test the bot
      </h3>
      <div className="stack" style={{ gap: 8, background: 'var(--surface-2)', borderRadius: 'var(--radius-card)', padding: 12 }}>
        {thread.map((t, i) => (
          <div key={i} className="stack" style={{ gap: 6 }}>
            {t.you && <div className="msg msg--you">{t.you}</div>}
            {t.reply && <div className="msg msg--bot">{t.reply.text}</div>}
            {t.reply?.source && (
              <span className="caption">Source: {t.reply.source.title} — {t.reply.source.used_by_bot} uses</span>
            )}
          </div>
        ))}
        {thread.length === 0 && (
          <span className="caption">Ask a question to see the answer and its source before you publish.</span>
        )}
      </div>
      <form
        className="row"
        style={{ marginTop: 10, gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input className="field__input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try a customer question…" aria-label="Test question" />
        <Button variant="primary" type="submit" aria-label="Ask"><Send size={15} /></Button>
      </form>
      <div className="chips" style={{ marginTop: 10 }}>
        {suggestions.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => ask(s)}>{s}</button>
        ))}
      </div>
    </section>
  );
}

function UnansweredTab() {
  const [rows, setRows] = useState<Unanswered[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    adminApi.unanswered().then((res) => {
      setRows(res.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="card card--pad">
      <h2 className="section-title" style={{ marginBottom: 4 }}>Questions the bot couldn't answer</h2>
      <span className="caption">each one is a chance to close the loop — write the article and the bot handles it next time</span>
      <div className="stack" style={{ gap: 10, marginTop: 16 }}>
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 56 }} />)
          : rows.map((u) => (
              <div key={u.question} className="row row--between" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', padding: '10px 14px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15 }}>“{u.question}”</span>
                <div className="row">
                  <Pill tone="warn">{u.asks} asks</Pill>
                  <Button size="sm" variant="primary" onClick={() => toast(`Editor opened with "${u.question}" prefilled`)}>
                    Write article
                  </Button>
                </div>
              </div>
            ))}
        {!loading && rows.length === 0 && (
          <Empty icon={BookOpen} title="Nothing unanswered" body="The bot handled every question this week." />
        )}
      </div>
      <span className="caption" style={{ marginTop: 16 }}>
        Seed: {seedQuestions.length} known questions · articles seeded: {seed.length}
      </span>
    </div>
  );
}

function SettingsTab() {
  const toast = useToast();
  const [instructions, setInstructions] = useState('Answer only from the published articles. Keep sentences short. State what you cannot do. Escalate to a person when unsure.');
  const [on, setOn] = useState(true);

  return (
    <div className="card card--pad" style={{ maxWidth: 640 }}>
      <div className="row row--between" style={{ marginBottom: 12 }}>
        <h2 className="section-title" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Bot size={20} aria-hidden="true" /> Assistant
        </h2>
        <div className="row" style={{ gap: 10 }}>
          <span className="muted" style={{ fontSize: 14 }}>{on ? 'On' : 'Off'}</span>
          <input
            type="checkbox"
            className="switch"
            checked={on}
            onChange={(e) => {
              setOn(e.target.checked);
              toast(e.target.checked ? 'Assistant on — it answers from published articles' : 'Assistant off — chat routes to tickets');
            }}
            aria-label="Assistant on/off"
          />
        </div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="bot-instructions">Instructions</label>
        <textarea id="bot-instructions" className="field__textarea" style={{ minHeight: 120 }} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        <span className="field__help">One place for tone and rules. The bot quotes the article it used under every reply.</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <Button variant="primary" onClick={() => toast('Bot settings saved')}>Save settings</Button>
      </div>
    </div>
  );
}
