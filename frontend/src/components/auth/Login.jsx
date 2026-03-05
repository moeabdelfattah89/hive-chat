import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export default function Login({ onSwitch }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
            <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" fill="#F59E0B" opacity="0.2"/>
            <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" stroke="#F59E0B" strokeWidth="2" fill="none"/>
            <circle cx="24" cy="20" r="4" fill="#F59E0B"/>
            <circle cx="16" cy="28" r="3" fill="#F59E0B"/>
            <circle cx="32" cy="28" r="3" fill="#F59E0B"/>
            <line x1="24" y1="20" x2="16" y2="28" stroke="#F59E0B" strokeWidth="1.5"/>
            <line x1="24" y1="20" x2="32" y2="28" stroke="#F59E0B" strokeWidth="1.5"/>
          </svg>
          <h1>Hive</h1>
        </div>
        <h2>Sign in to your workspace</h2>
        <p className="auth-subtitle">Enter your credentials to get started</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>

        <button
          type="button"
          className="google-btn"
          onClick={() => { window.location.href = '/api/auth/google'; }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <p className="auth-switch">
          Don't have an account? <button onClick={onSwitch}>Create one</button>
        </p>
      </div>
    </div>
  );
}
