import { useState, useEffect, useRef, useCallback } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../api';
import Message from './Message';
import MessageInput from './MessageInput';

export default function DMView({ conversation, onOpenThread, onRefresh }) {
  const { user } = useAuth();
  const { emit, on, connected } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});
  const messagesEndRef = useRef(null);
  const shouldScrollRef = useRef(true);

  const otherUser = conversation?.other_participants?.[0];

  useEffect(() => {
    if (!conversation?.id) return;

    setLoading(true);
    setMessages([]);
    setHasMore(true);

    api.get(`/messages/dm/${conversation.id}?limit=50`)
      .then(({ data }) => {
        setMessages(data.messages);
        setHasMore(data.messages.length === 50);
        shouldScrollRef.current = true;
      })
      .finally(() => setLoading(false));
  }, [conversation?.id]);

  useEffect(() => {
    if (!conversation?.id || !connected) return;
    emit('join:conversation', conversation.id);
  }, [conversation?.id, connected, emit]);

  useEffect(() => {
    if (shouldScrollRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  useEffect(() => {
    if (!conversation?.id) return;

    const handleDM = (msg) => {
      if (msg.conversation_id === conversation.id && !msg.parent_id) {
        setMessages(prev => [...prev, msg]);
        shouldScrollRef.current = true;
        onRefresh?.();
      }
    };

    const handleThread = (msg) => {
      if (msg.conversation_id === conversation.id) {
        setMessages(prev => prev.map(m =>
          m.id === msg.parent_id ? { ...m, reply_count: (m.reply_count || 0) + 1 } : m
        ));
      }
    };

    const handleEdited = (msg) => {
      if (msg.conversation_id === conversation.id) {
        setMessages(prev => prev.map(m =>
          m.id === msg.id ? { ...m, content: msg.content, is_edited: true } : m
        ));
      }
    };

    const handleDeleted = (data) => {
      if (data.conversation_id === conversation.id) {
        setMessages(prev => prev.filter(m => m.id !== data.message_id));
      }
    };

    const handleReaction = (data) => {
      setMessages(prev => prev.map(m =>
        m.id === data.message_id ? { ...m, reactions: data.reactions } : m
      ));
    };

    const handleTyping = (data) => {
      if (data.conversation_id === conversation.id && data.user_id !== user?.id) {
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

    const unsub1 = on('dm:message', handleDM);
    const unsub2 = on('thread:message', handleThread);
    const unsub3 = on('message:edited', handleEdited);
    const unsub4 = on('message:deleted', handleDeleted);
    const unsub5 = on('reaction:update', handleReaction);
    const unsub6 = on('typing:update', handleTyping);

    return () => {
      unsub1?.(); unsub2?.(); unsub3?.(); unsub4?.(); unsub5?.(); unsub6?.();
    };
  }, [conversation?.id, on, user?.id]);

  useEffect(() => { setTypingUsers({}); }, [conversation?.id]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || messages.length === 0) return;
    const oldest = messages[0]?.created_at;
    const { data } = await api.get(`/messages/dm/${conversation.id}?limit=50&before=${oldest}`);
    setMessages(prev => [...data.messages, ...prev]);
    setHasMore(data.messages.length === 50);
    shouldScrollRef.current = false;
  }, [conversation?.id, hasMore, loading, messages]);

  const handleScroll = (e) => {
    if (e.target.scrollTop === 0 && hasMore) loadMore();
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    shouldScrollRef.current = scrollHeight - scrollTop - clientHeight < 100;
  };

  const renderMessages = () => {
    const elements = [];
    let lastDate = null;
    let lastUserId = null;
    let lastTime = null;

    messages.forEach((msg) => {
      const msgDate = new Date(msg.created_at);

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

      const timeDiff = lastTime ? (msgDate - lastTime) / 1000 / 60 : Infinity;
      const showAvatar = msg.user_id !== lastUserId || timeDiff > 5;

      elements.push(
        <Message key={msg.id} message={msg} onOpenThread={onOpenThread} showAvatar={showAvatar} />
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
      <div className="channel-header">
        <div className="channel-header-info">
          <h2>
            <span className={`dm-status-dot ${otherUser?.presence === 'online' ? 'online' : 'offline'}`} />
            {otherUser?.display_name || 'Direct Message'}
          </h2>
        </div>
      </div>

      <div className="messages-container" onScroll={handleScroll}>
        {loading ? (
          <div className="messages-loading"><div className="loading-spinner" /></div>
        ) : (
          <>
            {!hasMore && (
              <div className="channel-welcome">
                <div className="dm-welcome-avatar">
                  {otherUser?.avatar_url ? (
                    <img src={otherUser.avatar_url} alt={otherUser.display_name} />
                  ) : (
                    <span>{otherUser?.display_name?.charAt(0)?.toUpperCase()}</span>
                  )}
                </div>
                <h3>{otherUser?.display_name}</h3>
                <p>This is the beginning of your conversation with {otherUser?.display_name}.</p>
              </div>
            )}
            {renderMessages()}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {typingNames.length > 0 && (
        <div className="typing-indicator">
          <div className="typing-dots"><span /><span /><span /></div>
          <span>{typingNames[0]} is typing...</span>
        </div>
      )}

      <MessageInput
        conversationId={conversation?.id}
        placeholder={`Message ${otherUser?.display_name || ''}`}
      />
    </div>
  );
}
