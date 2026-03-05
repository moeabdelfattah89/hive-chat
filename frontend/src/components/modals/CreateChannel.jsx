import { useState } from 'react';
import api from '../../api';

export default function CreateChannelModal({ workspaceId, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/channels', {
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim(),
        is_private: isPrivate,
      });
      onCreate(data.channel);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create channel');
    } finally {
      setLoading(false);
    }
  };

  const previewName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-') || 'channel-name';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create a channel</h2>
          <button className="close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>

        <p className="modal-description">
          Channels are where your team communicates. They're best when organized around a topic.
        </p>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <div className="input-with-prefix">
              <span className="input-prefix">#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. marketing-team"
                maxLength={80}
                autoFocus
              />
            </div>
            <span className="form-hint">Channel will be created as: <strong>#{previewName}</strong></span>
          </div>

          <div className="form-group">
            <label>Description <span className="optional">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this channel about?"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label className="toggle-label">
              <div className="toggle-info">
                <span className="toggle-title">Make private</span>
                <span className="toggle-desc">Only specific people can view and join this channel</span>
              </div>
              <div className={`toggle-switch ${isPrivate ? 'active' : ''}`} onClick={() => setIsPrivate(!isPrivate)}>
                <div className="toggle-knob" />
              </div>
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!name.trim() || loading}>
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
