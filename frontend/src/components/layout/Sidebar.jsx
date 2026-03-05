import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';

export default function Sidebar({
  workspace, workspaces, channels, conversations,
  activeChannel, activeConversation,
  onSelectChannel, onSelectConversation,
  onCreateChannel, onNewDM, onSearch,
  onSwitchWorkspace, onCreateWorkspace, onOpenProfile, onInvitePeople,
  isOpen, onClose
}) {
  const { user, logout } = useAuth();
  const { onlineUsers } = useSocket();
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [dmsExpanded, setDmsExpanded] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);

  const myChannels = channels.filter(c => c.is_member);
  const browseChannels = channels.filter(c => !c.is_member && !c.is_private);

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        {/* Workspace header */}
        <div className="sidebar-header">
          <button className="workspace-info" onClick={() => setShowWorkspaceSwitcher(!showWorkspaceSwitcher)}>
            <div className="workspace-icon">
              {workspace?.name?.charAt(0) || 'H'}
            </div>
            <div className="workspace-details">
              <h2>{workspace?.name || 'Hive'}</h2>
            </div>
            <svg width="10" height="10" viewBox="0 0 10 10" className="workspace-chevron">
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
          <button className="sidebar-search-btn" onClick={onSearch} title="Search messages">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Workspace switcher dropdown */}
          {showWorkspaceSwitcher && (
            <>
              <div className="menu-overlay" onClick={() => setShowWorkspaceSwitcher(false)} />
              <div className="workspace-switcher">
                <div className="workspace-switcher-label">Workspaces</div>
                {workspaces?.map(ws => (
                  <button
                    key={ws.id}
                    className={`workspace-switcher-item ${ws.id === workspace?.id ? 'active' : ''}`}
                    onClick={() => {
                      setShowWorkspaceSwitcher(false);
                      if (ws.id !== workspace?.id) onSwitchWorkspace?.(ws);
                    }}
                  >
                    <div className="ws-icon">{ws.name.charAt(0).toUpperCase()}</div>
                    <span className="ws-name">{ws.name}</span>
                    {ws.id === workspace?.id && (
                      <svg width="14" height="14" viewBox="0 0 14 14" className="ws-check">
                        <path d="M3 7l3 3 5-6" stroke="#F59E0B" strokeWidth="2" fill="none" />
                      </svg>
                    )}
                  </button>
                ))}
                <div className="workspace-switcher-divider" />
                {(workspace?.role === 'owner' || workspace?.role === 'admin') && (
                  <button className="workspace-switcher-action" onClick={() => { setShowWorkspaceSwitcher(false); onInvitePeople?.(); }}>
                    <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5"/></svg>
                    Invite people
                  </button>
                )}
                <button className="workspace-switcher-action" onClick={() => { setShowWorkspaceSwitcher(false); onCreateWorkspace?.(); }}>
                  <svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.2"/></svg>
                  Create a new workspace
                </button>
              </div>
            </>
          )}
        </div>

        <div className="sidebar-content">
          {/* Channels section */}
          <div className="sidebar-section">
            <button className="section-header" onClick={() => setChannelsExpanded(!channelsExpanded)}>
              <svg width="12" height="12" viewBox="0 0 12 12" className={`chevron ${channelsExpanded ? 'expanded' : ''}`}>
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              </svg>
              <span>Channels</span>
            </button>

            {channelsExpanded && (
              <div className="section-items">
                {myChannels.map(channel => (
                  <button
                    key={channel.id}
                    className={`sidebar-item ${activeChannel?.id === channel.id ? 'active' : ''}`}
                    onClick={() => onSelectChannel(channel)}
                  >
                    <span className="item-icon">{channel.is_private ? '🔒' : '#'}</span>
                    <span className="item-name">{channel.name}</span>
                  </button>
                ))}

                {browseChannels.length > 0 && (
                  <div className="browse-section">
                    <span className="browse-label">Browse</span>
                    {browseChannels.map(channel => (
                      <button
                        key={channel.id}
                        className="sidebar-item browse-item"
                        onClick={() => onSelectChannel(channel)}
                      >
                        <span className="item-icon">#</span>
                        <span className="item-name">{channel.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                <button className="sidebar-item add-item" onClick={onCreateChannel}>
                  <span className="item-icon">+</span>
                  <span className="item-name">Add channel</span>
                </button>
              </div>
            )}
          </div>

          {/* Direct Messages section */}
          <div className="sidebar-section">
            <button className="section-header" onClick={() => setDmsExpanded(!dmsExpanded)}>
              <svg width="12" height="12" viewBox="0 0 12 12" className={`chevron ${dmsExpanded ? 'expanded' : ''}`}>
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              </svg>
              <span>Direct Messages</span>
            </button>

            {dmsExpanded && (
              <div className="section-items">
                {conversations.map(conv => {
                  const other = conv.other_participants?.[0];
                  if (!other) return null;
                  const isOnline = onlineUsers[other.id] === 'online';

                  return (
                    <button
                      key={conv.id}
                      className={`sidebar-item ${activeConversation?.id === conv.id ? 'active' : ''}`}
                      onClick={() => onSelectConversation(conv)}
                    >
                      <span className={`presence-dot ${isOnline ? 'online' : 'offline'}`} />
                      <span className="item-name">{other.display_name}</span>
                    </button>
                  );
                })}

                <button className="sidebar-item add-item" onClick={onNewDM}>
                  <span className="item-icon">+</span>
                  <span className="item-name">New message</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* User footer */}
        <div className="sidebar-footer">
          <button className="user-button" onClick={() => setShowUserMenu(!showUserMenu)}>
            <div className="user-avatar-small">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name} />
              ) : (
                <span>{user?.display_name?.charAt(0)?.toUpperCase()}</span>
              )}
            </div>
            <span className="user-name">{user?.display_name}</span>
            <span className="user-presence-indicator online" />
          </button>

          {showUserMenu && (
            <>
              <div className="menu-overlay" onClick={() => setShowUserMenu(false)} />
              <div className="user-menu">
                <div className="user-menu-header">
                  <div className="user-avatar-small">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt={user.display_name} />
                    ) : (
                      <span>{user?.display_name?.charAt(0)?.toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <div className="user-menu-name">{user?.display_name}</div>
                    <div className="user-menu-email">{user?.email}</div>
                  </div>
                </div>
                <div className="user-menu-divider" />
                <button className="user-menu-item" onClick={() => { setShowUserMenu(false); onOpenProfile?.(); }}>
                  <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
                  Profile
                </button>
                <button className="user-menu-item danger" onClick={() => { setShowUserMenu(false); logout(); }}>
                  <svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 2H3v12h3M11 5l3 3-3 3M7 8h7" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
