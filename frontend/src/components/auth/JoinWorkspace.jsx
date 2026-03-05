import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';

export default function JoinWorkspace({ inviteCode, onSwitch, onBack }) {
  const { user, registerWithInvite, addWorkspace } = useAuth();
  const [workspaceInfo, setWorkspaceInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [error, setError] = useState('');

  // Registration fields (for non-logged-in users)
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!inviteCode) return;

    api.get(`/workspaces/invite/${inviteCode}`)
      .then(({ data }) => {
        setWorkspaceInfo(data);
        if (data.already_member) {
          setJoined(true);
          window.history.replaceState({}, '', '/');
          setTimeout(() => window.location.reload(), 1500);
        }
      })
      .catch(err => {
        setError(err.response?.data?.error || 'Invalid invite link');
      })
      .finally(() => setLoadingInfo(false));
  }, [inviteCode]);

  const handleJoinExisting = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/workspaces/invite/${inviteCode}/join`);
      addWorkspace(data.workspace);
      setJoined(true);
      // Clean URL and reload after brief delay
      window.history.replaceState({}, '', '/');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to join workspace');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterAndJoin = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await registerWithInvite(email, password, displayName, inviteCode);
      window.history.replaceState({}, '', '/');
      // Clear invite code in parent so App renders the main view
      onBack?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  if (loadingInfo) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

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

        {error && !workspaceInfo ? (
          <>
            <div className="auth-error">{error}</div>
            <p className="auth-switch">
              <button onClick={onBack}>Go back</button>
            </p>
          </>
        ) : joined ? (
          <>
            <h2>You're in!</h2>
            <p className="auth-subtitle">You've joined {workspaceInfo?.workspace_name}. Redirecting...</p>
          </>
        ) : (
          <>
            {/* Workspace preview */}
            <div className="invite-workspace-preview">
              <div className="invite-workspace-icon">
                {workspaceInfo?.workspace_name?.charAt(0)?.toUpperCase()}
              </div>
              <h2>Join {workspaceInfo?.workspace_name}</h2>
              {workspaceInfo?.workspace_description && (
                <p className="auth-subtitle">{workspaceInfo.workspace_description}</p>
              )}
            </div>

            {error && <div className="auth-error">{error}</div>}

            {user ? (
              /* Logged-in user - just show join button */
              <div className="auth-form">
                <p className="auth-subtitle">You're signed in as <strong>{user.display_name}</strong></p>
                <button className="auth-btn" onClick={handleJoinExisting} disabled={loading}>
                  {loading ? 'Joining...' : 'Join Workspace'}
                </button>
              </div>
            ) : (
              /* New user - registration form */
              <form onSubmit={handleRegisterAndJoin} className="auth-form">
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
                <button type="submit" className="auth-btn" disabled={loading}>
                  {loading ? 'Creating account...' : 'Create Account & Join'}
                </button>
              </form>
            )}

            <p className="auth-switch">
              Already have an account? <button onClick={onSwitch}>Sign in</button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
