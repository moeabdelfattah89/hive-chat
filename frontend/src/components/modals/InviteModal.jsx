import { useState, useEffect } from 'react';
import api from '../../api';

export default function InviteModal({ workspaceId, onClose }) {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!workspaceId) return;
    api.get(`/workspaces/${workspaceId}/invites`)
      .then(({ data }) => setInvites(data.invites))
      .catch(() => setError('Failed to load invites'))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const generateInvite = async () => {
    setGenerating(true);
    setError('');
    try {
      const { data } = await api.post(`/workspaces/${workspaceId}/invites`, {});
      setInvites(prev => [data.invite, ...prev]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate invite');
    } finally {
      setGenerating(false);
    }
  };

  const revokeInvite = async (inviteId) => {
    try {
      await api.delete(`/workspaces/${workspaceId}/invites/${inviteId}`);
      setInvites(prev => prev.filter(i => i.id !== inviteId));
    } catch (err) {
      setError('Failed to revoke invite');
    }
  };

  const copyLink = (code) => {
    const url = `${window.location.origin}?invite=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const getInviteUrl = (code) => `${window.location.origin}?invite=${code}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Invite People</h2>
          <button className="close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">Share an invite link with people you'd like to join this workspace.</p>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn-primary" onClick={generateInvite} disabled={generating} style={{ width: '100%', marginBottom: 16 }}>
            {generating ? 'Generating...' : 'Generate New Invite Link'}
          </button>

          {loading ? (
            <div className="loading-spinner" />
          ) : invites.length === 0 ? (
            <p className="invite-empty">No active invite links. Generate one above.</p>
          ) : (
            <div className="invite-list">
              {invites.map(invite => (
                <div key={invite.id} className="invite-item">
                  <div className="invite-link-row">
                    <input
                      type="text"
                      className="invite-link-url"
                      value={getInviteUrl(invite.code)}
                      readOnly
                      onClick={e => e.target.select()}
                    />
                    <button
                      className={`btn-secondary btn-sm invite-copy-btn ${copied === invite.code ? 'copied' : ''}`}
                      onClick={() => copyLink(invite.code)}
                    >
                      {copied === invite.code ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="invite-meta">
                    <span>Used {invite.use_count} time{invite.use_count !== 1 ? 's' : ''}</span>
                    {invite.max_uses && <span> / {invite.max_uses} max</span>}
                    {invite.expires_at && (
                      <span> &middot; Expires {new Date(invite.expires_at).toLocaleDateString()}</span>
                    )}
                    <button className="btn-text btn-sm invite-revoke" onClick={() => revokeInvite(invite.id)}>
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
