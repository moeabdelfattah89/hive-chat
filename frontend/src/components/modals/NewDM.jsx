import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../api';

export default function NewDMModal({ workspaceId, onClose, onCreate }) {
  const { user } = useAuth();
  const { onlineUsers } = useSocket();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    api.get(`/users/workspace/${workspaceId}`)
      .then(({ data }) => {
        setUsers(data.users.filter(u => u.id !== user?.id));
      })
      .finally(() => setLoading(false));
  }, [workspaceId, user?.id]);

  const filteredUsers = users.filter(u =>
    u.display_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const startDM = async (otherUser) => {
    setCreating(true);
    try {
      const { data } = await api.post('/users/conversations', {
        workspace_id: workspaceId,
        user_id: otherUser.id,
      });
      const conv = data.conversation;
      if (!conv.other_participants) {
        conv.other_participants = [otherUser];
      }
      onCreate(conv);
    } catch (err) {
      console.error('Failed to create DM:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New message</h2>
          <button className="close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>

        <div className="dm-search">
          <input
            type="text"
            placeholder="Search for a person..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="dm-user-list">
          {loading ? (
            <div className="modal-loading"><div className="loading-spinner" /></div>
          ) : filteredUsers.length === 0 ? (
            <div className="dm-empty">No users found</div>
          ) : (
            filteredUsers.map(u => {
              const isOnline = onlineUsers[u.id] === 'online';
              return (
                <button
                  key={u.id}
                  className="dm-user-item"
                  onClick={() => startDM(u)}
                  disabled={creating}
                >
                  <div className="dm-user-avatar">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt={u.display_name} />
                    ) : (
                      <span>{u.display_name?.charAt(0)?.toUpperCase()}</span>
                    )}
                    <span className={`dm-presence ${isOnline ? 'online' : 'offline'}`} />
                  </div>
                  <div className="dm-user-info">
                    <span className="dm-user-name">{u.display_name}</span>
                    {u.title && <span className="dm-user-title">{u.title}</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
