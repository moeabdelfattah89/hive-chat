import { useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
  'Australia/Sydney', 'Pacific/Auckland',
];

export default function ProfileSettings({ onClose }) {
  const { user, updateProfile, uploadAvatar } = useAuth();
  const fileInputRef = useRef(null);

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [title, setTitle] = useState(user?.title || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [timezone, setTimezone] = useState(user?.timezone || 'UTC');
  const [statusEmoji, setStatusEmoji] = useState(user?.status_emoji || '');
  const [statusText, setStatusText] = useState(user?.status_text || '');

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const initials = user?.display_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    setUploadingAvatar(true);
    setError('');
    try {
      await uploadAvatar(file);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setSaving(true);
    try {
      await updateProfile({ avatar_url: null });
    } catch (err) {
      setError('Failed to remove avatar');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');

    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }

    if (showPasswordSection && newPassword) {
      if (!currentPassword) {
        setError('Current password is required');
        return;
      }
      if (newPassword.length < 6) {
        setError('New password must be at least 6 characters');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('New passwords do not match');
        return;
      }
    }

    setSaving(true);
    try {
      const updates = {
        display_name: displayName.trim(),
        title: title.trim(),
        phone: phone.trim(),
        timezone,
        status_emoji: statusEmoji,
        status_text: statusText.trim(),
      };

      if (showPasswordSection && newPassword && currentPassword) {
        updates.current_password = currentPassword;
        updates.new_password = newPassword;
      }

      const result = await updateProfile(updates);

      if (result.passwordChanged) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordSection(false);
      }

      setSuccess('Profile updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal profile-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Profile</h2>
          <button className="close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>

        <div className="modal-body profile-body">
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="profile-success">{success}</div>}

          {/* Avatar */}
          <div className="profile-avatar-section">
            <div className="profile-avatar-large">
              {uploadingAvatar ? (
                <div className="loading-spinner" />
              ) : user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name} />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div className="profile-avatar-actions">
              <button className="btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
                Upload Photo
              </button>
              {user?.avatar_url && (
                <button className="btn-text btn-sm" onClick={handleRemoveAvatar}>Remove</button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* Profile Fields */}
          <div className="profile-form">
            <div className="form-group">
              <label>Display Name</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="What you do" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
              </div>
              <div className="form-group">
                <label>Timezone</label>
                <select value={timezone} onChange={e => setTimezone(e.target.value)}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Status</label>
              <div className="profile-status-row">
                <input
                  type="text"
                  className="status-emoji-input"
                  value={statusEmoji}
                  onChange={e => setStatusEmoji(e.target.value)}
                  placeholder="😊"
                  maxLength={4}
                />
                <input
                  type="text"
                  value={statusText}
                  onChange={e => setStatusText(e.target.value)}
                  placeholder="What's your status?"
                  className="status-text-input"
                />
              </div>
            </div>

            {/* Password Section */}
            <div className="profile-password-section">
              <button
                className="btn-text"
                onClick={() => setShowPasswordSection(!showPasswordSection)}
              >
                {showPasswordSection ? 'Cancel password change' : 'Change password'}
              </button>

              {showPasswordSection && (
                <div className="password-fields">
                  <div className="form-group">
                    <label>Current Password</label>
                    <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>New Password</label>
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
                  </div>
                  <div className="form-group">
                    <label>Confirm New Password</label>
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
