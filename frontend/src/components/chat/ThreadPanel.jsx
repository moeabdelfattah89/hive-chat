import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../api';
import Message from './Message';
import MessageInput from './MessageInput';

export default function ThreadPanel({ parentMessage, onClose, channel, conversation }) {
  const { on } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!parentMessage?.id) return;

    setLoading(true);
    api.get(`/messages/thread/${parentMessage.id}`)
      .then(({ data }) => {
        setMessages(data.messages);
      })
      .finally(() => setLoading(false));
  }, [parentMessage?.id]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  useEffect(() => {
    if (!parentMessage?.id) return;

    const handleThread = (msg) => {
      if (msg.parent_id === parentMessage.id) {
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };

    const handleEdited = (msg) => {
      setMessages(prev => prev.map(m =>
        m.id === msg.id ? { ...m, content: msg.content, is_edited: true } : m
      ));
    };

    const handleDeleted = (data) => {
      setMessages(prev => prev.filter(m => m.id !== data.message_id));
    };

    const handleReaction = (data) => {
      setMessages(prev => prev.map(m =>
        m.id === data.message_id ? { ...m, reactions: data.reactions } : m
      ));
    };

    const unsub1 = on('thread:message', handleThread);
    const unsub2 = on('message:new', handleThread);
    const unsub3 = on('dm:message', handleThread);
    const unsub4 = on('message:edited', handleEdited);
    const unsub5 = on('message:deleted', handleDeleted);
    const unsub6 = on('reaction:update', handleReaction);

    return () => {
      unsub1?.(); unsub2?.(); unsub3?.(); unsub4?.(); unsub5?.(); unsub6?.();
    };
  }, [parentMessage?.id, on]);

  return (
    <div className="thread-panel">
      <div className="thread-header">
        <h3>Thread</h3>
        <span className="thread-channel">
          {channel ? `#${channel.name}` : 'Direct Message'}
        </span>
        <button className="close-btn" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
      </div>

      <div className="thread-messages">
        {loading ? (
          <div className="messages-loading"><div className="loading-spinner" /></div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <Message
                key={msg.id}
                message={msg}
                showAvatar={true}
                isThread={true}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <MessageInput
        channelId={channel?.id}
        conversationId={conversation?.id}
        parentId={parentMessage?.id}
        placeholder="Reply..."
      />
    </div>
  );
}
