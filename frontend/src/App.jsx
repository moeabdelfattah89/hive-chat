import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useSocket } from './contexts/SocketContext';
import api from './api';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import JoinWorkspace from './components/auth/JoinWorkspace';
import Sidebar from './components/layout/Sidebar';
import ChannelView from './components/chat/ChannelView';
import DMView from './components/chat/DMView';
import ThreadPanel from './components/chat/ThreadPanel';
import CreateChannelModal from './components/modals/CreateChannel';
import NewDMModal from './components/modals/NewDM';
import ProfileSettings from './components/modals/ProfileSettings';
import CreateWorkspace from './components/modals/CreateWorkspace';
import InviteModal from './components/modals/InviteModal';

export default function App() {
  const { user, loading, workspaces, setWorkspaces } = useAuth();
  const { emit, on, connected } = useSocket();

  const [authView, setAuthView] = useState('login');
  const [inviteCode, setInviteCode] = useState(null);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [channels, setChannels] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Parse invite code from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) {
      setInviteCode(code);
      setAuthView('invite');
    }
  }, []);

  // Restore active workspace from localStorage or use first
  useEffect(() => {
    if (!user || !workspaces.length) return;
    if (activeWorkspace) return;

    const savedId = localStorage.getItem('hive_workspace');
    const saved = savedId ? workspaces.find(w => w.id === savedId) : null;
    setActiveWorkspace(saved || workspaces[0]);
  }, [user, workspaces, activeWorkspace]);

  // Load workspace data when workspace changes
  useEffect(() => {
    if (!activeWorkspace) return;

    localStorage.setItem('hive_workspace', activeWorkspace.id);

    if (connected) {
      emit('join:workspace', activeWorkspace.id);
    }

    api.get(`/channels/workspace/${activeWorkspace.id}`).then(({ data }) => {
      setChannels(data.channels);
      // Auto-select general channel
      if (!activeChannel && !activeConversation) {
        const general = data.channels.find(c => c.name === 'general' && c.is_member);
        if (general) setActiveChannel(general);
        else if (data.channels.length > 0) {
          const memberChannel = data.channels.find(c => c.is_member);
          if (memberChannel) setActiveChannel(memberChannel);
        }
      }
    });

    api.get(`/users/conversations/${activeWorkspace.id}`).then(({ data }) => {
      setConversations(data.conversations);
    });
  }, [activeWorkspace, connected, emit]);

  // Search
  const handleSearch = useCallback(async (query) => {
    if (!query || query.length < 2 || !activeWorkspace) {
      setSearchResults([]);
      return;
    }
    try {
      const { data } = await api.get(`/messages/search/${activeWorkspace.id}?q=${encodeURIComponent(query)}`);
      setSearchResults(data.messages);
    } catch (err) {
      console.error('Search failed:', err);
    }
  }, [activeWorkspace]);

  const selectChannel = useCallback((channel) => {
    setActiveChannel(channel);
    setActiveConversation(null);
    setActiveThread(null);
    setShowSearch(false);
    setMobileSidebarOpen(false);
  }, []);

  const selectConversation = useCallback((conv) => {
    setActiveConversation(conv);
    setActiveChannel(null);
    setActiveThread(null);
    setShowSearch(false);
    setMobileSidebarOpen(false);
  }, []);

  const openThread = useCallback((message) => {
    setActiveThread(message);
  }, []);

  const handleChannelCreated = useCallback((channel) => {
    setChannels(prev => [...prev, { ...channel, is_member: true }].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveChannel(channel);
    setActiveConversation(null);
    setShowCreateChannel(false);
  }, []);

  const handleDMCreated = useCallback((conv) => {
    setConversations(prev => {
      const exists = prev.find(c => c.id === conv.id);
      if (exists) return prev;
      return [conv, ...prev];
    });
    setActiveConversation(conv);
    setActiveChannel(null);
    setShowNewDM(false);
  }, []);

  const refreshConversations = useCallback(() => {
    if (!activeWorkspace) return;
    api.get(`/users/conversations/${activeWorkspace.id}`).then(({ data }) => {
      setConversations(data.conversations);
    });
  }, [activeWorkspace]);

  const handleSwitchWorkspace = useCallback((ws) => {
    setActiveChannel(null);
    setActiveConversation(null);
    setActiveThread(null);
    setChannels([]);
    setConversations([]);
    setShowSearch(false);
    setActiveWorkspace(ws);
  }, []);

  const handleWorkspaceCreated = useCallback((ws) => {
    setShowCreateWorkspace(false);
    handleSwitchWorkspace(ws);
  }, [handleSwitchWorkspace]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" fill="#F59E0B" opacity="0.2"/>
            <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" stroke="#F59E0B" strokeWidth="2" fill="none"/>
            <circle cx="24" cy="20" r="4" fill="#F59E0B"/>
            <circle cx="16" cy="28" r="3" fill="#F59E0B"/>
            <circle cx="32" cy="28" r="3" fill="#F59E0B"/>
            <line x1="24" y1="20" x2="16" y2="28" stroke="#F59E0B" strokeWidth="1.5"/>
            <line x1="24" y1="20" x2="32" y2="28" stroke="#F59E0B" strokeWidth="1.5"/>
          </svg>
        </div>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (!user) {
    if (authView === 'invite' && inviteCode) {
      return (
        <JoinWorkspace
          inviteCode={inviteCode}
          onSwitch={() => { setAuthView('login'); setInviteCode(null); }}
          onBack={() => { setAuthView('login'); setInviteCode(null); }}
        />
      );
    }
    if (authView === 'register') {
      return (
        <Register
          onSwitch={() => setAuthView('login')}
          onShowInviteJoin={() => {
            const code = prompt('Enter your invite code:');
            if (code) {
              setInviteCode(code);
              setAuthView('invite');
            }
          }}
        />
      );
    }
    return <Login onSwitch={() => setAuthView('register')} />;
  }

  // Logged in but invite code present - handle joining
  if (inviteCode) {
    return (
      <JoinWorkspace
        inviteCode={inviteCode}
        onSwitch={() => { setInviteCode(null); }}
        onBack={() => { setInviteCode(null); window.history.replaceState({}, '', '/'); }}
      />
    );
  }

  // No workspaces - prompt to create one
  if (workspaces.length === 0) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" fill="#F59E0B" opacity="0.2"/>
            <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" stroke="#F59E0B" strokeWidth="2" fill="none"/>
            <circle cx="24" cy="20" r="4" fill="#F59E0B"/>
            <circle cx="16" cy="28" r="3" fill="#F59E0B"/>
            <circle cx="32" cy="28" r="3" fill="#F59E0B"/>
            <line x1="24" y1="20" x2="16" y2="28" stroke="#F59E0B" strokeWidth="1.5"/>
            <line x1="24" y1="20" x2="32" y2="28" stroke="#F59E0B" strokeWidth="1.5"/>
          </svg>
        </div>
        <h2 style={{ color: '#1a1d21', marginBottom: 8 }}>Welcome to Hive</h2>
        <p style={{ color: '#616061', marginBottom: 24 }}>Create your first workspace to get started</p>
        <button className="auth-btn" style={{ maxWidth: 300 }} onClick={() => setShowCreateWorkspace(true)}>
          Create Workspace
        </button>
        {showCreateWorkspace && (
          <CreateWorkspace
            onClose={() => setShowCreateWorkspace(false)}
            onCreate={handleWorkspaceCreated}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar
        workspace={activeWorkspace}
        workspaces={workspaces}
        channels={channels}
        conversations={conversations}
        activeChannel={activeChannel}
        activeConversation={activeConversation}
        onSelectChannel={selectChannel}
        onSelectConversation={selectConversation}
        onCreateChannel={() => setShowCreateChannel(true)}
        onNewDM={() => setShowNewDM(true)}
        onSearch={() => setShowSearch(true)}
        onSwitchWorkspace={handleSwitchWorkspace}
        onCreateWorkspace={() => setShowCreateWorkspace(true)}
        onOpenProfile={() => setShowProfileSettings(true)}
        onInvitePeople={() => setShowInvite(true)}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      <main className="main-content">
        {/* Mobile header */}
        <button className="mobile-menu-btn" onClick={() => setMobileSidebarOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 4.5h16M2 10h16M2 15.5h16" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          </svg>
        </button>

        {showSearch ? (
          <div className="search-panel">
            <div className="search-panel-header">
              <h2>Search Messages</h2>
              <button className="close-btn" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>
                <svg width="20" height="20" viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5"/></svg>
              </button>
            </div>
            <div className="search-input-wrapper">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); handleSearch(e.target.value); }}
                autoFocus
              />
            </div>
            <div className="search-results">
              {searchResults.length === 0 && searchQuery.length >= 2 && (
                <div className="search-empty">No messages found</div>
              )}
              {searchResults.map(msg => (
                <div key={msg.id} className="search-result-item" onClick={() => {
                  if (msg.channel_id) {
                    const ch = channels.find(c => c.id === msg.channel_id);
                    if (ch) selectChannel(ch);
                  }
                  setShowSearch(false);
                }}>
                  <div className="search-result-meta">
                    <span className="search-result-user">{msg.display_name}</span>
                    {msg.channel_name && <span className="search-result-channel">#{msg.channel_name}</span>}
                  </div>
                  <div className="search-result-content">{msg.content}</div>
                </div>
              ))}
            </div>
          </div>
        ) : activeChannel ? (
          <ChannelView
            channel={activeChannel}
            onOpenThread={openThread}
            workspace={activeWorkspace}
          />
        ) : activeConversation ? (
          <DMView
            conversation={activeConversation}
            onOpenThread={openThread}
            onRefresh={refreshConversations}
          />
        ) : (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 48 48" fill="none">
              <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" fill="#F59E0B" opacity="0.15"/>
              <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" stroke="#F59E0B" strokeWidth="2" fill="none"/>
              <circle cx="24" cy="20" r="4" fill="#F59E0B"/>
              <circle cx="16" cy="28" r="3" fill="#F59E0B"/>
              <circle cx="32" cy="28" r="3" fill="#F59E0B"/>
              <line x1="24" y1="20" x2="16" y2="28" stroke="#F59E0B" strokeWidth="1.5"/>
              <line x1="24" y1="20" x2="32" y2="28" stroke="#F59E0B" strokeWidth="1.5"/>
            </svg>
            <h2>Welcome to Hive</h2>
            <p>Select a channel or start a conversation</p>
          </div>
        )}
      </main>

      {activeThread && (
        <ThreadPanel
          parentMessage={activeThread}
          onClose={() => setActiveThread(null)}
          channel={activeChannel}
          conversation={activeConversation}
        />
      )}

      {showCreateChannel && (
        <CreateChannelModal
          workspaceId={activeWorkspace?.id}
          onClose={() => setShowCreateChannel(false)}
          onCreate={handleChannelCreated}
        />
      )}

      {showNewDM && (
        <NewDMModal
          workspaceId={activeWorkspace?.id}
          onClose={() => setShowNewDM(false)}
          onCreate={handleDMCreated}
        />
      )}

      {showProfileSettings && (
        <ProfileSettings onClose={() => setShowProfileSettings(false)} />
      )}

      {showCreateWorkspace && (
        <CreateWorkspace
          onClose={() => setShowCreateWorkspace(false)}
          onCreate={handleWorkspaceCreated}
        />
      )}

      {showInvite && (
        <InviteModal
          workspaceId={activeWorkspace?.id}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
}
