import { useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import EmojiPicker from './EmojiPicker';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🚀', '👀'];

export default function Message({ message, onOpenThread, showAvatar = true, isThread = false }) {
  const { user } = useAuth();
  const { emit } = useSocket();
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const isOwn = message.user_id === user?.id;
  const time = format(new Date(message.created_at), 'h:mm a');

  const handleReaction = (emoji) => {
    emit('reaction:toggle', { message_id: message.id, emoji });
    setShowEmojiPicker(false);
    setShowActions(false);
  };

  const handleEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      emit('message:edit', { message_id: message.id, content: editContent });
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm('Delete this message? This cannot be undone.')) {
      emit('message:delete', { message_id: message.id });
    }
    setShowActions(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEdit();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditContent(message.content);
    }
  };

  // Group reactions by emoji
  const groupedReactions = {};
  if (message.reactions && Array.isArray(message.reactions)) {
    message.reactions.forEach(r => {
      if (!groupedReactions[r.emoji]) {
        groupedReactions[r.emoji] = { emoji: r.emoji, users: [], hasReacted: false };
      }
      groupedReactions[r.emoji].users.push(r.display_name);
      if (r.user_id === user?.id) {
        groupedReactions[r.emoji].hasReacted = true;
      }
    });
  }

  const initials = message.display_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Format message content - basic markdown support
  const formatContent = (text) => {
    if (!text) return '';
    // Bold: *text*
    let formatted = text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    // Italic: _text_
    formatted = formatted.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>');
    // Code: `text`
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Links
    formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return formatted;
  };

  return (
    <div
      className={`message ${!showAvatar ? 'message-continuation' : ''} ${isOwn ? 'message-own' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false); }}
    >
      {showAvatar ? (
        <div className="message-avatar">
          {message.avatar_url ? (
            <img src={message.avatar_url} alt={message.display_name} />
          ) : (
            <div className="avatar-fallback">{initials}</div>
          )}
        </div>
      ) : (
        <div className="message-time-gutter">
          <span className="hover-time">{time}</span>
        </div>
      )}

      <div className="message-body">
        {showAvatar && (
          <div className="message-header">
            <span className="message-author">{message.display_name}</span>
            <span className="message-time">{time}</span>
            {message.is_edited && <span className="message-edited">(edited)</span>}
          </div>
        )}

        {isEditing ? (
          <div className="message-edit-form">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              rows={2}
            />
            <div className="edit-actions">
              <button onClick={() => { setIsEditing(false); setEditContent(message.content); }} className="btn-cancel">Cancel</button>
              <button onClick={handleEdit} className="btn-save">Save</button>
            </div>
          </div>
        ) : (
          <div className="message-content" dangerouslySetInnerHTML={{ __html: formatContent(message.content) }} />
        )}

        {/* File attachments */}
        {message.files && Array.isArray(message.files) && message.files.length > 0 && (
          <div className="message-files">
            {message.files.map(file => (
              <div key={file.id} className="file-attachment">
                {file.mime_type?.startsWith('image/') ? (
                  <a href={file.url} target="_blank" rel="noopener noreferrer">
                    <img src={file.url} alt={file.original_name} className="file-image" />
                  </a>
                ) : (
                  <a href={file.url} className="file-doc" target="_blank" rel="noopener noreferrer">
                    <svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 1h5l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
                    <span>{file.original_name}</span>
                    <span className="file-size">{(file.size / 1024).toFixed(0)} KB</span>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reactions */}
        {Object.keys(groupedReactions).length > 0 && (
          <div className="message-reactions">
            {Object.values(groupedReactions).map(reaction => (
              <button
                key={reaction.emoji}
                className={`reaction-badge ${reaction.hasReacted ? 'reacted' : ''}`}
                onClick={() => handleReaction(reaction.emoji)}
                title={reaction.users.join(', ')}
              >
                <span>{reaction.emoji}</span>
                <span className="reaction-count">{reaction.users.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread link */}
        {!isThread && message.reply_count > 0 && (
          <button className="thread-link" onClick={() => onOpenThread?.(message)}>
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 3h10v6H5l-3 3V3z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
            {message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {/* Hover actions */}
      {showActions && !isEditing && (
        <div className="message-actions">
          {QUICK_REACTIONS.slice(0, 3).map(emoji => (
            <button key={emoji} className="action-btn" onClick={() => handleReaction(emoji)} title={`React with ${emoji}`}>
              {emoji}
            </button>
          ))}
          <button className="action-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Add reaction">
            <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" fill="none"/><circle cx="6" cy="7" r="0.8" fill="currentColor"/><circle cx="10" cy="7" r="0.8" fill="currentColor"/><path d="M5.5 10a3 3 0 0 0 5 0" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
          </button>
          {!isThread && (
            <button className="action-btn" onClick={() => onOpenThread?.(message)} title="Reply in thread">
              <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 3h12v8H5l-3 3V3z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
            </button>
          )}
          {isOwn && (
            <>
              <button className="action-btn" onClick={() => { setIsEditing(true); setShowActions(false); }} title="Edit">
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M11.5 1.5l3 3L5 14H2v-3l9.5-9.5z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
              </button>
              <button className="action-btn danger" onClick={handleDelete} title="Delete">
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l1 10h6l1-10" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
              </button>
            </>
          )}

          {showEmojiPicker && (
            <div className="emoji-picker-popover">
              <EmojiPicker onSelect={handleReaction} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
