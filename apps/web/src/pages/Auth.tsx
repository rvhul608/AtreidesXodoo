import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { homeForRole } from '../lib/routes';
import type { Role } from '../lib/types';
import { Button, Field, Input, PasswordRule, useToast } from '../components/ui';
import { LoopMark } from '../components/brand';
import { roleLabel } from '../components/nav';

const demoEmails: Record<Role, string> = {
  admin: 'admin@brightloop.local',
  staff: 'staff@brightloop.local',
  customer: 'priya@northwind.test',
};

const roleBlurb: Record<Role, string> = {
  admin: 'Finance lead',
  staff: 'Account manager',
  customer: 'Northwind Labs',
};

function AuthBrand() {
  return (
    <div className="auth-brand">
      <span className="auth-orbit one" aria-hidden="true" />
      <span className="auth-orbit two" aria-hidden="true" />
      <span className="auth-orbit three" aria-hidden="true" />
      <Link to="/login" className="brand">
        <span className="brand-mark">
          <LoopMark />
        </span>
        <span className="brand-name">
          Brightloop
          <small>Subscription operations</small>
        </span>
      </Link>

      <div className="auth-brand-inner">
        <span className="auth-eyebrow">
          <Sparkles aria-hidden="true" style={{ width: 13, height: 13 }} />
          Subscription operations, in one loop
        </span>
        <h1>
          Every renewal,
          <br />
          <em>calm and accounted for.</em>
        </h1>
        <p className="lede">
          Brightloop keeps plans, invoices and support in one place. Finance sees the money, staff see the work and
          customers see exactly what happens next.
        </p>

        <div className="auth-demo-card">
          <span className="brand-mark" style={{ color: '#6b8cff' }}>
            <LoopMark size={34} />
          </span>
          <div className="demo-meta">
            <strong>Demo workspace is ready</strong>
            <span>Pick a role and explore the full product with seeded data.</span>
            <div className="demo-stats">
              <div>
                <b>24</b>
                <small>Subscriptions</small>
              </div>
              <div>
                <b>29</b>
                <small>Invoices</small>
              </div>
              <div>
                <b>9</b>
                <small>Articles</small>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-features">
          <span>
            <CheckCircle2 aria-hidden="true" /> Grounded support answers
          </span>
          <span>
            <CheckCircle2 aria-hidden="true" /> Plan-aware customer actions
          </span>
          <span>
            <CheckCircle2 aria-hidden="true" /> Print-ready invoices
          </span>
        </div>
      </div>

      <div className="auth-brand-foot">
        <span>Brightloop Software · Demo workspace</span>
        <span>Odoo × Make-A-Ton 9.0</span>
      </div>
    </div>
  );
}

function MobileBrand() {
  return (
    <Link to="/login" className="brand mobile-brand">
      <span className="brand-mark">
        <LoopMark />
      </span>
      <span className="brand-name">
        Brightloop
        <small>Subscription operations</small>
      </span>
    </Link>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder = 'Enter your password',
  autoComplete = 'current-password',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-affix" style={{ position: 'relative' }}>
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{ paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          border: 0,
          background: 'transparent',
          color: 'var(--ink-muted)',
          padding: 4,
        }}
      >
        {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const { login } = useStore();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>('admin');
  const [email, setEmail] = useState(demoEmails.admin);
  const [password, setPassword] = useState('brightloop');
  const [error, setError] = useState<string | null>(null);

  const pickRole = (next: Role) => {
    setRole(next);
    setEmail(demoEmails[next]);
    setError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password to continue.');
      return;
    }
    login(role);
    navigate(homeForRole(role));
  };

  return (
    <div className="auth">
      <AuthBrand />
      <div className="auth-panel">
        <div className="auth-form">
          <MobileBrand />
          <h2>Sign in</h2>
          <p className="auth-sub">Choose a role to explore the demo workspace. Data stays in this browser.</p>

          <form onSubmit={submit}>
            <div>
              <span className="label">Demo role</span>
              <div className="auth-role-picker">
                {(['admin', 'staff', 'customer'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="role-card"
                    aria-pressed={role === item}
                    onClick={() => pickRole(item)}
                  >
                    <strong>{roleLabel[item]}</strong>
                    <span>{roleBlurb[item]}</span>
                  </button>
                ))}
              </div>
            </div>

            <Field label="Email" htmlFor="login-email">
              <div className="input-icon">
                <Mail aria-hidden="true" />
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </div>
            </Field>

            <Field label="Password" error={error} htmlFor="login-password">
              <PasswordInput id="login-password" value={password} onChange={setPassword} />
            </Field>

            <div className="auth-links">
              <label className="checkline" style={{ gap: 7 }}>
                <input type="checkbox" defaultChecked /> Keep me signed in
              </label>
              <Link to="/forgot">Forgot password?</Link>
            </div>

            <Button type="submit" size="lg" block iconRight={ArrowRight}>
              Sign in as {roleLabel[role]}
            </Button>
          </form>

          <div className="auth-divider">New to Brightloop?</div>
          <Button variant="secondary" size="lg" block onClick={() => navigate('/signup')}>
            Create an account
          </Button>

          <div className="auth-note">
            <strong>Demo credentials</strong> are prefilled. The customer role signs in as Priya Menon at Northwind
            Labs and only sees Northwind data.
          </div>

          <p className="auth-foot">
            By continuing you agree to the demo terms. <Link to="/forgot">Need help?</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function SignupPage() {
  const { login } = useStore();
  const navigate = useNavigate();
  const { push } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rules = {
    length: password.length > 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const valid = rules.length && rules.upper && rules.lower && rules.special;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !company.trim()) {
      setError('Add your name, work email and company to continue.');
      return;
    }
    if (!valid) {
      setError('Password needs more than 8 characters, an uppercase letter, a lowercase letter and a special character.');
      return;
    }
    login('customer');
    push({
      title: 'Account created',
      description: 'Signed in to the demo customer portal. Data stays in this browser.',
    });
    navigate('/portal');
  };

  return (
    <div className="auth">
      <AuthBrand />
      <div className="auth-panel">
        <div className="auth-form">
          <MobileBrand />
          <h2>Create your account</h2>
          <p className="auth-sub">Start with the customer portal. An admin can invite staff later.</p>

          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="Full name" htmlFor="signup-name">
                <Input
                  id="signup-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Priya Menon"
                  autoComplete="name"
                />
              </Field>
              <Field label="Company" htmlFor="signup-company">
                <Input
                  id="signup-company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Northwind Labs"
                  autoComplete="organization"
                />
              </Field>
              <Field label="Work email" htmlFor="signup-email" className="span-2">
                <div className="input-icon">
                  <Mail aria-hidden="true" />
                  <Input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                  />
                </div>
              </Field>
              <Field label="Password" error={error} htmlFor="signup-password" className="span-2">
                <PasswordInput
                  id="signup-password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Choose a strong password"
                  autoComplete="new-password"
                />
              </Field>
            </div>

            <div className="password-rules">
              <PasswordRule ok={rules.length}>More than 8 characters</PasswordRule>
              <PasswordRule ok={rules.upper}>One uppercase letter</PasswordRule>
              <PasswordRule ok={rules.lower}>One lowercase letter</PasswordRule>
              <PasswordRule ok={rules.special}>One special character</PasswordRule>
            </div>

            <Button type="submit" size="lg" block iconRight={ArrowRight}>
              Create account
            </Button>
          </form>

          <p className="auth-foot">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { push } = useToast();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setSent(true);
    push({ title: 'Reset link queued', description: `A reset link would be sent to ${email}.` });
  };

  return (
    <div className="auth">
      <AuthBrand />
      <div className="auth-panel">
        <div className="auth-form">
          <MobileBrand />
          <h2>Reset your password</h2>
          <p className="auth-sub">We will email a reset link that expires in 30 minutes.</p>

          {sent ? (
            <div className="stack" style={{ marginTop: 26 }}>
              <div className="notice good">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <strong>Check your inbox</strong>
                  <div>If {email} matches an account, a reset link is on its way.</div>
                </div>
              </div>
              <Button size="lg" block onClick={() => setSent(false)} variant="secondary">
                Send another link
              </Button>
              <Link to="/login" className="btn btn-ghost btn-block">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <Field label="Work email" htmlFor="forgot-email">
                <div className="input-icon">
                  <Mail aria-hidden="true" />
                  <Input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                  />
                </div>
              </Field>
              <Button type="submit" size="lg" block icon={Mail}>
                Send reset link
              </Button>
            </form>
          )}

          <p className="auth-foot">
            Remembered it? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function ResetPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rules = {
    length: password.length > 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const valid = rules.length && rules.upper && rules.lower && rules.special;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) {
      setError('Password needs more than 8 characters, an uppercase letter, a lowercase letter and a special character.');
      return;
    }
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }
    push({ title: 'Password updated', description: 'Sign in with your new password.' });
    navigate('/login');
  };

  return (
    <div className="auth">
      <AuthBrand />
      <div className="auth-panel">
        <div className="auth-form">
          <MobileBrand />
          <h2>Choose a new password</h2>
          <p className="auth-sub">Use at least 9 characters with upper and lower case and a special character.</p>

          <form onSubmit={submit}>
            <Field label="New password" error={error} htmlFor="reset-password">
              <PasswordInput
                id="reset-password"
                value={password}
                onChange={setPassword}
                placeholder="New password"
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm password" htmlFor="reset-confirm">
              <PasswordInput
                id="reset-confirm"
                value={confirm}
                onChange={setConfirm}
                placeholder="Repeat the password"
                autoComplete="new-password"
              />
            </Field>

            <div className="password-rules">
              <PasswordRule ok={rules.length}>More than 8 characters</PasswordRule>
              <PasswordRule ok={rules.upper}>One uppercase letter</PasswordRule>
              <PasswordRule ok={rules.lower}>One lowercase letter</PasswordRule>
              <PasswordRule ok={rules.special}>One special character</PasswordRule>
            </div>

            <Button type="submit" size="lg" block icon={LockKeyhole}>
              Update password
            </Button>
          </form>

          <div className="auth-note">
            <strong>Demo note.</strong> This flow is visual only. Use the sign-in page to enter the workspace.
          </div>

          <p className="auth-foot">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function AuthRolesLegend() {
  return (
    <div className="auth-features">
      {(['admin', 'staff', 'customer'] as const).map((role) => (
        <span key={role}>
          <Users aria-hidden="true" />
          {roleLabel[role]} · {roleBlurb[role]}
        </span>
      ))}
    </div>
  );
}
