import { useState, useRef, useCallback, useEffect } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import EmojiPicker from './EmojiPicker';
import api from '../../api';

export default function MessageInput({ channelId, conversationId, parentId, placeholder }) {
  const { emit } = useSocket();
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [content]);

  const handleTyping = useCallback(() => {
    const data = channelId ? { channel_id: channelId } : { conversation_id: conversationId };
    emit('typing:start', data);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emit('typing:stop', data);
    }, 3000);
  }, [channelId, conversationId, emit]);

  const handleSend = async () => {
    if ((!content.trim() && files.length === 0) || uploading) return;

    const messageContent = content.trim();
    setContent('');
    setFiles([]);

    // Stop typing
    const typingData = channelId ? { channel_id: channelId } : { conversation_id: conversationId };
    emit('typing:stop', typingData);

    if (channelId) {
      // Upload files first if any
      if (files.length > 0) {
        setUploading(true);
        try {
          const { data: msgData } = await api.post(`/messages/channel/${channelId}`, {
            content: messageContent || '📎 File attachment',
            parent_id: parentId || null,
          });

          const formData = new FormData();
          files.forEach(f => formData.append('files', f));
          formData.append('message_id', msgData.message.id);
          await api.post('/files/multiple', formData);
        } catch (err) {
          console.error('Failed to send with files:', err);
        }
        setUploading(false);
      } else {
        emit('message:send', { channel_id: channelId, content: messageContent, parent_id: parentId || null });
      }
    } else if (conversationId) {
      if (files.length > 0) {
        setUploading(true);
        try {
          const { data: msgData } = await api.post(`/messages/dm/${conversationId}`, {
            content: messageContent || '📎 File attachment',
            parent_id: parentId || null,
          });

          const formData = new FormData();
          files.forEach(f => formData.append('files', f));
          formData.append('message_id', msgData.message.id);
          await api.post('/files/multiple', formData);
        } catch (err) {
          console.error('Failed to send DM with files:', err);
        }
        setUploading(false);
      } else {
        emit('dm:send', { conversation_id: conversationId, content: messageContent, parent_id: parentId || null });
      }
    }

    // Refocus
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    setFiles(prev => [...prev, ...selected]);
    e.target.value = '';
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const insertEmoji = (emoji) => {
    setContent(prev => prev + emoji);
    setShowEmoji(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="message-input-container">
      {/* File preview */}
      {files.length > 0 && (
        <div className="file-preview-bar">
          {files.map((file, idx) => (
            <div key={idx} className="file-preview-item">
              {file.type.startsWith('image/') ? (
                <img src={URL.createObjectURL(file)} alt={file.name} />
              ) : (
                <div className="file-preview-doc">
                  <svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 1h5l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
                </div>
              )}
              <span className="file-preview-name">{file.name}</span>
              <button className="file-preview-remove" onClick={() => removeFile(idx)}>
                <svg width="14" height="14" viewBox="0 0 14 14"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="message-input-bar">
        <button className="input-action-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
          <svg width="20" height="20" viewBox="0 0 20 20"><path d="M17 10l-7.5 7.5a5 5 0 0 1-7-7L10 3a3.5 3.5 0 0 1 5 5l-7.5 7.5a2 2 0 0 1-3-3L12 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => { setContent(e.target.value); handleTyping(); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Type a message...'}
          rows={1}
          className="message-textarea"
        />

        <div className="input-actions-right">
          <button className="input-action-btn" onClick={() => setShowEmoji(!showEmoji)} title="Emoji">
            <svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" fill="none"/><circle cx="7.5" cy="8.5" r="1" fill="currentColor"/><circle cx="12.5" cy="8.5" r="1" fill="currentColor"/><path d="M6.5 12.5a4 4 0 0 0 7 0" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
          </button>

          <button
            className={`send-btn ${content.trim() || files.length > 0 ? 'active' : ''}`}
            onClick={handleSend}
            disabled={!content.trim() && files.length === 0}
            title="Send message"
          >
            <svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 10l14-7-7 14v-7H3z" fill="currentColor"/></svg>
          </button>
        </div>

        {showEmoji && (
          <div className="emoji-picker-container">
            <EmojiPicker onSelect={insertEmoji} />
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
}
