import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CircleAlert } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, PasswordChecklist, passwordRules } from '../ui/Field';
import { LoopMark } from '../ui/Logo';
import { useAuth } from '../app/AuthContext';
import { apiErrorMessage, authApi } from '../live/api';

type Mode = 'login' | 'signup';

const VIRTUES = [
  {
    title: 'Every number is exact.',
    body: 'Money moves in decimal strings with tabular numerals, so totals line up and nothing drifts.',
  },
  {
    title: 'Renewals run in a loop.',
    body: 'One renewal ring tells you exactly where every subscription stands in its billing period.',
  },
  {
    title: 'Answers come from your own articles.',
    body: 'Invoices, plans and subscription records load from your connected account.',
  },
];

export function LoginPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rules = useMemo(() => passwordRules(password), [password]);
  const signupBlocked = rules.some((r) => !r.met);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!name.trim()) throw new Error('Please enter your name.');
        if (signupBlocked) {
          throw new Error('Password needs an uppercase letter, a lowercase letter and a special character.');
        }
        await signup(name, email, password);
      }
        navigate('/');
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'WRONG_CREDENTIALS'
          ? 'Email or password is incorrect.'
          : apiErrorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__brand">
        <span className="row" style={{ color: 'var(--loop)' }}>
          <LoopMark size={30} />
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>Brightloop</span>
        </span>
        <h1 className="page-title" style={{ maxWidth: 520 }}>
          Subscriptions that run themselves, exactly the way you wrote them.
        </h1>
        {VIRTUES.map((v) => (
          <div className="virtue" key={v.title}>
            <span style={{ color: 'var(--loop)', display: 'flex', marginTop: 5 }}>
              <LoopMark size={18} />
            </span>
            <div>
              <strong style={{ fontWeight: 600 }}>{v.title}</strong>
              <p className="muted" style={{ fontSize: 14, maxWidth: 460 }}>{v.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="auth__panel">
        <div className="auth__card">
          <div className="tabs" role="tablist">
            {(['login', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={`tabs__tab${mode === m ? ' is-active' : ''}`}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
              >
                {m === 'login' ? 'Log in' : 'Create account'}
              </button>
            ))}
          </div>

          <form className="stack" style={{ gap: 'var(--s3)' }} onSubmit={submit}>
            {mode === 'signup' && (
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            )}
            <Input
              label="Work email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.local"
              autoComplete="email"
              required
            />
            <div className="field">
              <label className="field__label" htmlFor="pw">Password</label>
              <input
                id="pw"
                type="password"
                className="field__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
              {mode === 'signup' && <PasswordChecklist rules={rules} />}
            </div>

            {error && (
              <div className="field__error" role="alert">
                <CircleAlert size={14} />
                {error}
              </div>
            )}

            <Button variant="primary" size="lg" type="submit" disabled={busy || (mode === 'signup' && signupBlocked)}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
              <ArrowRight size={16} />
            </Button>
          </form>

          <button
            className="chat-footer-link"
            onClick={async () => {
              if (!email.trim()) { setError('Enter your email address first.'); return; }
              setBusy(true); setError(null);
              try { const result = await authApi.requestReset(email); setError(result.message); }
              catch (err) { setError(apiErrorMessage(err)); }
              finally { setBusy(false); }
            }}
          >
            Forgot password?
          </button>
        </div>
      </div>
    </div>
  );
}
