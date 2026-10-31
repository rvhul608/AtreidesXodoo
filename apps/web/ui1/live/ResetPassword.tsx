import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { http, apiErrorMessage } from './api';
import { Button } from '../ui/Button';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try { await http.post('/auth/reset-password', { token, password }); setDone(true); }
    catch (failure) { setError(apiErrorMessage(failure)); }
    finally { setBusy(false); }
  }
  return <main className="auth"><section className="auth__panel"><form className="card knowledge-form" onSubmit={(event) => void submit(event)}>
    <h1>Reset your password</h1>
    {done ? <p>Your password has been changed. <Link to="/login">Sign in</Link></p> : !token ? <p>This reset link is incomplete. <Link to="/login">Request a new link</Link></p> : <>
      <p>Use at least 9 characters, with uppercase, lowercase, and a special character.</p>
      <label>New password<input className="field__input" type="password" autoComplete="new-password" minLength={9} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Confirm password<input className="field__input" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Updating…' : 'Set new password'}</Button>
    </>}
  </form></section></main>;
}
