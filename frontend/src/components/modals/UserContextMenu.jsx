import React, { useState, useEffect, useRef } from 'react';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { voiceManager } from '../../services/webrtcVoice';
import { getSocket } from '../../services/socket';
import {
  MessageSquare, AtSign, Volume2, VolumeX, Copy, 
  UserX, Shield, ChevronRight, Check, Hash
} from 'lucide-react';

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
  const { startDM, setViewMode } = useServer();
  const { user: currentUser } = useAuth();

  const menuRef = useRef(null);
  const [pos, setPos]         = useState({ top: y, left: x });
  const [volume, setVolume]   = useState(() => voiceManager.getUserVolume(user?.id || user?.user_id));
  const [isMuted, setIsMuted] = useState(() => voiceManager.getUserVolume(user?.id || user?.user_id) === 0);
  const [copied, setCopied]   = useState('');

  const uid = user?.id || user?.user_id;

  // Clamp to viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      setPos({
        top:  y + rect.height > window.innerHeight ? Math.max(0, y - rect.height) : y,
        left: x + rect.width  > window.innerWidth  ? Math.max(0, x - rect.width)  : x
      });
    }
  }, [x, y]);

  // Close on outside click / Escape
  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleMessage = async () => {
    try {
      await startDM({ user_id: uid, username: user.username });
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

  // ── Status colour ────────────────────────────────────────────────────────────
  const statusColor = {
    online:  'bg-emerald-500',
    idle:    'bg-amber-500',
    dnd:     'bg-danger',
    offline: 'bg-slate-500',
  }[user?.status] || 'bg-slate-500';

  const avatarUrl = user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.username || 'user'}`;

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-60 bg-surface-active border border-surface-border rounded-lg shadow-2xl overflow-hidden animate-fadeIn text-[13px]"
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
            <div className="text-[10px] text-text-muted font-mono">#{uid}</div>
          </div>
        </div>
      </div>

      {/* ── Menu Sections ────────────────────────────────────────────────── */}
      <div className="p-1 space-y-0.5">

        {/* Message & Mention — only for other users */}
        {!isLocalUser && (
          <>
            <MenuItem icon={<MessageSquare className="w-3.5 h-3.5" />} label="Message" onClick={handleMessage} />
            <MenuItem icon={<AtSign className="w-3.5 h-3.5" />} label="Mention in Chat" onClick={handleMention} />
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
          onClick={() => handleCopy(String(uid), 'userid')}
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
              onClick={() => { onClose(); /* TODO: implement block */ }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MenuItem({ icon, label, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-2.5 px-2 py-1.5 rounded-md transition-colors text-left ${
        danger
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
