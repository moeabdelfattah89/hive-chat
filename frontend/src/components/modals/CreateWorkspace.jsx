import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';

export default function CreateWorkspace({ onClose, onCreate }) {
  const { addWorkspace } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/workspaces', { name: name.trim(), description: description.trim() });
      addWorkspace(data.workspace);
      onCreate?.(data.workspace);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create a workspace</h2>
          <button className="close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-description">Workspaces are where your team communicates. Create one for each team or project.</p>

            {error && <div className="auth-error">{error}</div>}

            <div className="form-group">
              <label>Workspace name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Marketing Team" autoFocus required />
              {slug && <span className="form-hint">hive.app/{slug}</span>}
            </div>

            <div className="form-group">
              <label>Description <span className="form-optional">(optional)</span></label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this workspace about?" rows={3} />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading || !name.trim()}>
              {loading ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
