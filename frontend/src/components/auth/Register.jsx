import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export default function Register({ onSwitch, onShowInviteJoin }) {
  const { register } = useAuth();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const slug = workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const handleNext = (e) => {
    e.preventDefault();
    setError('');

    if (!displayName.trim() || !email.trim() || !password) {
      setError('All fields are required');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!workspaceName.trim()) {
      setError('Workspace name is required');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, displayName, workspaceName.trim());
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account');
      if (err.response?.status === 409) {
        setStep(1); // Go back if email exists
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
            <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" fill="#F59E0B" opacity="0.2" />
            <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" stroke="#F59E0B" strokeWidth="2" fill="none" />
            <circle cx="24" cy="20" r="4" fill="#F59E0B" />
            <circle cx="16" cy="28" r="3" fill="#F59E0B" />
            <circle cx="32" cy="28" r="3" fill="#F59E0B" />
            <line x1="24" y1="20" x2="16" y2="28" stroke="#F59E0B" strokeWidth="1.5" />
            <line x1="24" y1="20" x2="32" y2="28" stroke="#F59E0B" strokeWidth="1.5" />
          </svg>
          <h1>Hive</h1>
        </div>

        <h2>{step === 1 ? 'Create your account' : 'Name your workspace'}</h2>
        <p className="auth-subtitle">
          {step === 1 ? 'Get started with Hive' : 'This is where your team will collaborate'}
        </p>

        {/* Step indicator */}
        <div className="auth-steps">
          <span className={`auth-step-dot ${step >= 1 ? 'active' : ''}`} />
          <span className={`auth-step-dot ${step >= 2 ? 'active' : ''}`} />
        </div>

        {error && <div className="auth-error">{error}</div>}

        {step === 1 ? (
          <form onSubmit={handleNext} className="auth-form">
            <div className="form-group">
              <label htmlFor="displayName">Full name</label>
              <input id="displayName" type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your full name" required autoFocus />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required minLength={6} />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm your password" required />
            </div>
            <button type="submit" className="auth-btn">Next</button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="workspaceName">Workspace name</label>
              <input
                id="workspaceName"
                type="text"
                value={workspaceName}
                onChange={e => setWorkspaceName(e.target.value)}
                placeholder="e.g. Acme Inc."
                required
                autoFocus
              />
              {slug && <span className="form-hint">Your workspace URL: hive.app/{slug}</span>}
            </div>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? 'Creating workspace...' : 'Create Workspace'}
            </button>
            <button type="button" className="btn-text" onClick={() => setStep(1)} style={{ marginTop: 8 }}>
              Back
            </button>
          </form>
        )}

        <div className="auth-divider"><span>or</span></div>

        <p className="auth-switch">
          Have an invite link? <button onClick={onShowInviteJoin}>Join a workspace</button>
        </p>

        <p className="auth-switch">
          Already have an account? <button onClick={onSwitch}>Sign in</button>
        </p>
      </div>
    </div>
  );
}
