import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useServer } from '../../context/ServerContext';
import { voiceManager } from '../../services/webrtcVoice';
import { getSocket } from '../../services/socket';
import { friendsAPI } from '../../services/api';
import {
  MessageSquare, AtSign, Volume2, VolumeX, Copy, 
  UserX, Shield, Check, Hash, User as UserIcon, UserPlus, UserMinus, Clock
} from 'lucide-react';
import UserProfileModal from './UserProfileModal';

/**
 * Global User Context Menu — right-click any user avatar/name to open.
 *
 * Props:
 *   x, y         — screen coordinates (from mouse event)
 *   user         — { id, user_id, username, avatar_url, status, status_message }
 *   contextType  — 'voice' | 'chat' | 'dm'  (adjusts which sections show)
 *   isLocalUser  — boolean
 *   channelId    — current channel id (used for voice actions)
 *   onClose      — callback to close
 */
export default function UserContextMenu({
  x, y,
  user,
  contextType = 'chat',
  isLocalUser = false,
  channelId,
  onClose
}) {
  const { fetchFriendships, startDM, setViewMode } = useServer();

  const menuRef = useRef(null);
  const [volume, setVolume]   = useState(() => voiceManager.getUserVolume(user?.id || user?.user_id));
  const [isMuted, setIsMuted] = useState(() => voiceManager.getUserVolume(user?.id || user?.user_id) === 0);
  const [copied, setCopied]   = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [relationship, setRelationship] = useState(null);
  const [actionError, setActionError] = useState('');

  const uid = user?.id || user?.user_id;
  const publicId = user?.public_id || uid;

  const refreshRelationship = useCallback(async () => {
    if (!uid || isLocalUser) return;
    try {
      const res = await friendsAPI.getRelationship(uid);
      setRelationship(res.data);
    } catch (err) {
      console.error('Relationship lookup failed:', err);
      setRelationship(null);
    }
  }, [uid, isLocalUser]);

  useEffect(() => {
    refreshRelationship();
  }, [refreshRelationship]);

  // Pre-calculate to avoid edge clipping before layout effect runs
  const MENU_WIDTH = Math.min(240, window.innerWidth - 16); // w-60 = 240px
  const MENU_HEIGHT = 380; // Approximate max height

  const [pos, setPos] = useState({ 
    top: y + MENU_HEIGHT > window.innerHeight ? Math.max(0, window.innerHeight - MENU_HEIGHT - 20) : y, 
    left: x + MENU_WIDTH > window.innerWidth ? Math.max(0, x - MENU_WIDTH) : x 
  });

  // Clamp to viewport robustly on resize or if height changes significantly
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      setPos({
        top:  y + rect.height > window.innerHeight ? Math.max(0, window.innerHeight - rect.height - 10) : y,
        left: x + rect.width  > window.innerWidth  ? Math.max(8, window.innerWidth - rect.width - 8, x - rect.width)  : Math.max(8, x)
      });
    }
  }, [x, y]);

  // Close on outside click / Escape
  useEffect(() => {
    const onClick = (e) => {
      // Don't close if profile modal is open, let the modal handle it
      if (showProfile) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { 
      if (e.key === 'Escape' && !showProfile) onClose(); 
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, showProfile]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleMessage = async () => {
    try {
      await startDM({ target_user_id: uid });
      setViewMode('dm');
    } catch (e) { console.error('DM error:', e); }
    onClose();
  };

  const handleMention = () => {
    window.dispatchEvent(new CustomEvent('mention-user', { detail: { username: user.username } }));
    onClose();
  };

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  };

  const handleVolumeChange = (v) => {
    const val = parseInt(v);
    setVolume(val);
    setIsMuted(val === 0);
    voiceManager.setUserVolume(uid, val);
  };

  const handleToggleMute = () => {
    if (isMuted) {
      voiceManager.setUserVolume(uid, 100);
      setVolume(100);
      setIsMuted(false);
    } else {
      voiceManager.setUserVolume(uid, 0);
      setVolume(0);
      setIsMuted(true);
    }
  };

  const handleKickFromVoice = () => {
    const socket = getSocket();
    if (socket && channelId) {
      socket.emit('kick_from_voice', { target_user_id: uid, channel_id: channelId });
    }
    onClose();
  };

  const handleFriendAction = async (action) => {
    setActionError('');
    try {
      await action();
      await fetchFriendships();
      onClose();
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Friend action failed');
    }
  };

  const handleBlockUser = async () => {
    setActionError('');
    try {
      await friendsAPI.blockUser(uid);
      await fetchFriendships();
      onClose();
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Block failed');
    }
  };

  // ── Status colour ────────────────────────────────────────────────────────────
  const statusColor = {
    online:  'bg-emerald-500',
    idle:    'bg-amber-500',
    dnd:     'bg-danger',
    offline: 'bg-slate-500',
  }[user?.status] || 'bg-slate-500';

  const avatarUrl = user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.username || 'user'}`;

  if (showProfile) {
    return <UserProfileModal user={user} onClose={onClose} />;
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] w-[min(15rem,calc(100vw-1rem))] bg-surface-active border border-surface-border rounded-lg shadow-2xl overflow-hidden animate-fadeIn text-[13px]"
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ── Profile Header Card ──────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 bg-gradient-to-br from-accent-primary/20 to-transparent border-b border-surface-border">
        <div className="flex items-center space-x-3">
          <div className="relative flex-shrink-0">
            <img
              src={avatarUrl}
              alt={user?.username}
              className="w-12 h-12 rounded-full object-cover border-2 border-surface-border shadow"
            />
            <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-surface-active ${statusColor}`} />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-text-primary truncate">{user?.username}</div>
            {user?.status_message && (
              <div className="text-[11px] text-text-muted truncate">{user.status_message}</div>
            )}
            <div className="text-[10px] text-text-muted font-mono">#{publicId}</div>
          </div>
        </div>
      </div>

      {/* ── Menu Sections ────────────────────────────────────────────────── */}
      <div className="p-1 space-y-0.5">

        <MenuItem icon={<UserIcon className="w-3.5 h-3.5" />} label="Profile" onClick={() => setShowProfile(true)} />
        <Divider />

        {/* Message & Mention — only for other users */}
        {!isLocalUser && (
          <>
            <MenuItem icon={<MessageSquare className="w-3.5 h-3.5" />} label="Message" onClick={handleMessage} />
            <MenuItem icon={<AtSign className="w-3.5 h-3.5" />} label="Mention in Chat" onClick={handleMention} />
            {relationship?.status === 'accepted' ? (
              <MenuItem
                icon={<UserMinus className="w-3.5 h-3.5" />}
                label="Remove Friend"
                danger
                onClick={() => handleFriendAction(() => friendsAPI.removeFriend(relationship.friendship_id))}
              />
            ) : relationship?.status === 'pending' && relationship?.direction === 'incoming' ? (
              <MenuItem
                icon={<Check className="w-3.5 h-3.5" />}
                label="Accept Friend"
                onClick={() => handleFriendAction(() => friendsAPI.acceptRequest(relationship.friendship_id))}
              />
            ) : relationship?.status === 'pending' && relationship?.direction === 'outgoing' ? (
              <MenuItem
                icon={<Clock className="w-3.5 h-3.5" />}
                label="Cancel Friend Request"
                danger
                onClick={() => handleFriendAction(() => friendsAPI.cancelRequest(relationship.friendship_id))}
              />
            ) : relationship?.status === 'blocked' ? (
              <MenuItem
                icon={<UserX className="w-3.5 h-3.5" />}
                label="Friend Unavailable"
                disabled
              />
            ) : (
              <MenuItem
                icon={<UserPlus className="w-3.5 h-3.5" />}
                label="Add Friend"
                onClick={() => handleFriendAction(() => friendsAPI.sendRequest({ target_user_id: uid }))}
              />
            )}
            {actionError && (
              <div className="px-2 py-1 text-[11px] text-danger leading-snug">
                {actionError}
              </div>
            )}
            <Divider />
          </>
        )}

        {/* Copy actions */}
        <MenuItem
          icon={copied === 'username' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          label={copied === 'username' ? 'Copied!' : 'Copy Username'}
          onClick={() => handleCopy(user.username, 'username')}
        />
        <MenuItem
          icon={copied === 'userid' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Hash className="w-3.5 h-3.5" />}
          label={copied === 'userid' ? 'Copied!' : 'Copy User ID'}
          onClick={() => handleCopy(`#${publicId}`, 'userid')}
        />

        {/* Voice-specific actions */}
        {contextType === 'voice' && !isLocalUser && (
          <>
            <Divider />
            <div className="px-2 py-1.5">
              <div className="flex justify-between items-center mb-1.5 text-text-muted text-[11px] font-bold uppercase tracking-wide">
                <span className="flex items-center space-x-1">
                  <Volume2 className="w-3 h-3" />
                  <span>User Volume</span>
                </span>
                <span className="text-text-primary font-mono">{volume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={volume}
                onChange={(e) => handleVolumeChange(e.target.value)}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-accent-primary"
              />
            </div>

            <button
              onClick={handleToggleMute}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors text-left ${
                isMuted
                  ? 'bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <span className="flex items-center space-x-2">
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
              </span>
              {isMuted && <Check className="w-3.5 h-3.5" />}
            </button>

            {/* Kick from voice — only server admins / channel owner would see this in a real system */}
            <MenuItem
              icon={<Shield className="w-3.5 h-3.5" />}
              label="Kick from Voice"
              danger
              onClick={handleKickFromVoice}
            />
          </>
        )}

        {/* Block */}
        {!isLocalUser && (
          <>
            <Divider />
            <MenuItem
              icon={<UserX className="w-3.5 h-3.5" />}
              label="Block User"
              danger
              onClick={handleBlockUser}
            />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MenuItem({ icon, label, onClick, danger = false, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center space-x-2.5 px-2 py-1.5 rounded-md transition-colors text-left ${
        disabled
          ? 'text-text-muted opacity-60 cursor-not-allowed'
          : danger
          ? 'text-danger hover:bg-danger hover:text-white'
          : 'text-text-primary hover:bg-accent-primary hover:text-white'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="my-1 border-t border-surface-border mx-1" />;
}
