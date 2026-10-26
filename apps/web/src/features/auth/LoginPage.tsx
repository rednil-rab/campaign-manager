import { useState, type FormEvent } from 'react';
import { DomainError } from '@questkeeper/domain';
import { Panel } from '../../components/Panel';
import { useAuthStore } from '../../store/authStore';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await (mode === 'login' ? login : register)(email.trim(), password);
    } catch (err) {
      if (err instanceof DomainError) setError(err.message);
      else throw err;
    } finally {
      setBusy(false);
    }
  };

  const registering = mode === 'register';

  return (
    <div className="picker">
      <h1 className="page-title">Questkeeper</h1>
      <p className="page-sub">Sign in to open your campaigns.</p>
      <Panel title={registering ? 'Create account' : 'Sign in'}>
        <form className="form" onSubmit={submit}>
          <label className="field">
            Email
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            Password
            <input
              className="input"
              type="password"
              autoComplete={registering ? 'new-password' : 'current-password'}
              minLength={registering ? 8 : undefined}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {registering && <p className="muted">Use at least 8 characters.</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-row">
            <button className="button" type="submit" disabled={busy}>
              {registering ? 'Create account' : 'Sign in'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => {
                setMode(registering ? 'login' : 'register');
                setError('');
              }}
            >
              {registering ? 'I already have an account' : 'Create an account'}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
