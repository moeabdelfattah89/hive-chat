import { useState, useEffect, useRef, useCallback } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../api';
import Message from './Message';
import MessageInput from './MessageInput';

export default function ChannelView({ channel, onOpenThread, workspace }) {
  const { user } = useAuth();
  const { emit, on, connected } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});
  const [members, setMembers] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [isMember, setIsMember] = useState(channel?.is_member);
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const shouldScrollRef = useRef(true);

  // Load messages via API
  useEffect(() => {
    if (!channel?.id) return;

    setLoading(true);
    setMessages([]);
    setHasMore(true);
    setIsMember(channel.is_member);

    api.get(`/messages/channel/${channel.id}?limit=50`)
      .then(({ data }) => {
        setMessages(data.messages);
        setHasMore(data.messages.length === 50);
        shouldScrollRef.current = true;
      })
      .finally(() => setLoading(false));
  }, [channel?.id]);

  // Join/leave channel room via socket
  useEffect(() => {
    if (!channel?.id || !connected) return;

    emit('join:channel', channel.id);

    return () => {
      emit('leave:channel', channel.id);
    };
  }, [channel?.id, connected, emit]);

  // Auto-scroll
  useEffect(() => {
    if (shouldScrollRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  // Socket listeners
  useEffect(() => {
    if (!channel?.id) return;

    const handleNewMessage = (msg) => {
      if (msg.channel_id === channel.id && !msg.parent_id) {
        setMessages(prev => [...prev, msg]);
        shouldScrollRef.current = true;
      }
    };

    const handleThreadMessage = (msg) => {
      if (msg.channel_id === channel.id) {
        setMessages(prev => prev.map(m =>
          m.id === msg.parent_id ? { ...m, reply_count: (m.reply_count || 0) + 1 } : m
        ));
      }
    };

    const handleEdited = (msg) => {
      if (msg.channel_id === channel.id) {
        setMessages(prev => prev.map(m =>
          m.id === msg.id ? { ...m, content: msg.content, is_edited: true } : m
        ));
      }
    };

    const handleDeleted = (data) => {
      if (data.channel_id === channel.id) {
        setMessages(prev => prev.filter(m => m.id !== data.message_id));
      }
    };

    const handleReaction = (data) => {
      setMessages(prev => prev.map(m =>
        m.id === data.message_id ? { ...m, reactions: data.reactions } : m
      ));
    };

    const handleTyping = (data) => {
      if (data.channel_id === channel.id && data.user_id !== user?.id) {
        if (data.is_typing) {
          setTypingUsers(prev => ({ ...prev, [data.user_id]: data.display_name }));
        } else {
          setTypingUsers(prev => {
            const next = { ...prev };
            delete next[data.user_id];
            return next;
          });
        }
      }
    };

    const unsub1 = on('message:new', handleNewMessage);
    const unsub2 = on('thread:message', handleThreadMessage);
    const unsub3 = on('message:edited', handleEdited);
    const unsub4 = on('message:deleted', handleDeleted);
    const unsub5 = on('reaction:update', handleReaction);
    const unsub6 = on('typing:update', handleTyping);

    return () => {
      unsub1?.(); unsub2?.(); unsub3?.(); unsub4?.(); unsub5?.(); unsub6?.();
    };
  }, [channel?.id, on, user?.id]);

  // Clear typing indicators on channel change
  useEffect(() => {
    setTypingUsers({});
  }, [channel?.id]);

  // Load more messages
  const loadMore = useCallback(async () => {
    if (!hasMore || loading || messages.length === 0) return;
    const oldest = messages[0]?.created_at;
    const { data } = await api.get(`/messages/channel/${channel.id}?limit=50&before=${oldest}`);
    setMessages(prev => [...data.messages, ...prev]);
    setHasMore(data.messages.length === 50);
    shouldScrollRef.current = false;
  }, [channel?.id, hasMore, loading, messages]);

  const handleScroll = (e) => {
    if (e.target.scrollTop === 0 && hasMore) {
      loadMore();
    }
    // Check if near bottom for auto-scroll
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    shouldScrollRef.current = scrollHeight - scrollTop - clientHeight < 100;
  };

  const handleJoinChannel = async () => {
    try {
      await api.post(`/channels/${channel.id}/join`);
      setIsMember(true);
      channel.is_member = true;
    } catch (err) {
      console.error('Failed to join channel:', err);
    }
  };

  // Group messages and insert date separators
  const renderMessages = () => {
    const elements = [];
    let lastDate = null;
    let lastUserId = null;
    let lastTime = null;

    messages.forEach((msg, i) => {
      const msgDate = new Date(msg.created_at);

      // Date separator
      if (!lastDate || !isSameDay(msgDate, lastDate)) {
        let label;
        if (isToday(msgDate)) label = 'Today';
        else if (isYesterday(msgDate)) label = 'Yesterday';
        else label = format(msgDate, 'EEEE, MMMM d');

        elements.push(
          <div key={`date-${msg.id}`} className="date-separator">
            <span>{label}</span>
          </div>
        );
        lastUserId = null;
      }

      // Show avatar if different user or > 5 min gap
      const timeDiff = lastTime ? (msgDate - lastTime) / 1000 / 60 : Infinity;
      const showAvatar = msg.user_id !== lastUserId || timeDiff > 5;

      elements.push(
        <Message
          key={msg.id}
          message={msg}
          onOpenThread={onOpenThread}
          showAvatar={showAvatar}
        />
      );

      lastDate = msgDate;
      lastUserId = msg.user_id;
      lastTime = msgDate;
    });

    return elements;
  };

  const typingNames = Object.values(typingUsers);

  return (
    <div className="channel-view">
      {/* Channel header */}
      <div className="channel-header">
        <div className="channel-header-info">
          <h2>
            <span className="channel-hash">{channel?.is_private ? '🔒' : '#'}</span>
            {channel?.name}
          </h2>
          {channel?.topic && <span className="channel-topic">{channel.topic}</span>}
        </div>
        <div className="channel-header-actions">
          <button className="header-action-btn" onClick={() => {
            setShowMembers(!showMembers);
            if (!showMembers && members.length === 0) {
              api.get(`/channels/${channel.id}/members`).then(({ data }) => setMembers(data.members));
            }
          }} title="Members">
            <svg width="18" height="18" viewBox="0 0 18 18"><circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M1 16c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" stroke="currentColor" strokeWidth="1.2" fill="none"/><circle cx="13" cy="6" r="2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M14 10.5c1.5.5 3 2 3 4" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
            {channel?.member_count && <span className="member-count">{channel.member_count}</span>}
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="messages-container" ref={containerRef} onScroll={handleScroll}>
        {loading ? (
          <div className="messages-loading">
            <div className="loading-spinner"></div>
          </div>
        ) : (
          <>
            {!hasMore && messages.length > 0 && (
              <div className="channel-welcome">
                <h3>Welcome to #{channel?.name}</h3>
                <p>{channel?.description || `This is the start of the #${channel?.name} channel.`}</p>
              </div>
            )}
            {renderMessages()}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Typing indicator */}
      {typingNames.length > 0 && (
        <div className="typing-indicator">
          <div className="typing-dots"><span /><span /><span /></div>
          <span>
            {typingNames.length === 1
              ? `${typingNames[0]} is typing...`
              : typingNames.length === 2
                ? `${typingNames[0]} and ${typingNames[1]} are typing...`
                : 'Several people are typing...'}
          </span>
        </div>
      )}

      {/* Join channel bar or message input */}
      {!isMember ? (
        <div className="join-channel-bar">
          <p>You're viewing <strong>#{channel?.name}</strong></p>
          <button onClick={handleJoinChannel} className="join-btn">Join Channel</button>
        </div>
      ) : (
        <MessageInput
          channelId={channel?.id}
          placeholder={`Message #${channel?.name}`}
        />
      )}

      {/* Members panel */}
      {showMembers && (
        <div className="members-panel">
          <div className="members-panel-header">
            <h3>Members ({members.length})</h3>
            <button className="close-btn" onClick={() => setShowMembers(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
          </div>
          <div className="members-list">
            {members.map(m => (
              <div key={m.id} className="member-item">
                <div className="member-avatar">
                  {m.avatar_url ? <img src={m.avatar_url} alt={m.display_name} /> : <span>{m.display_name?.charAt(0)?.toUpperCase()}</span>}
                </div>
                <div className="member-info">
                  <span className="member-name">{m.display_name}</span>
                  {m.title && <span className="member-title">{m.title}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
