import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { friendsAPI } from '../../services/api';
import { X, MessageSquare, Calendar, UserPlus, UserMinus, Check, Clock } from 'lucide-react';

export default function UserProfileModal({ user, onClose }) {
  const { fetchFriendships, startDM, setViewMode } = useServer();
  const { user: currentUser } = useAuth();
  const [relationship, setRelationship] = useState(null);
  const [friendError, setFriendError] = useState('');
  const [friendLoading, setFriendLoading] = useState(false);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const uid = user?.id || user?.user_id;
  const publicId = user?.public_id || uid;
  const isLocalUser = uid === currentUser?.id;

  const fetchRelationship = useCallback(async () => {
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
    fetchRelationship();
  }, [fetchRelationship]);

  const handleMessage = async () => {
    try {
      await startDM({ target_user_id: uid });
      setViewMode('dm');
    } catch (e) {
      console.error('DM error:', e);
    }
    onClose();
  };

  const runFriendAction = async (action) => {
    if (!uid || isLocalUser || friendLoading) return;
    setFriendLoading(true);
    setFriendError('');
    try {
      await action();
      await fetchFriendships();
      await fetchRelationship();
    } catch (err) {
      setFriendError(err.response?.data?.detail || 'Friend action failed');
    } finally {
      setFriendLoading(false);
    }
  };

  const friendAction = (() => {
    if (isLocalUser) return null;
    if (relationship?.status === 'blocked') {
      return { label: 'Unavailable', icon: <UserMinus className="w-4 h-4" />, disabled: true };
    }
    if (relationship?.status === 'accepted') {
      return {
        label: 'Remove Friend',
        icon: <UserMinus className="w-4 h-4" />,
        action: () => runFriendAction(() => friendsAPI.removeFriend(relationship.friendship_id)),
        danger: true,
      };
    }
    if (relationship?.status === 'pending' && relationship?.direction === 'incoming') {
      return {
        label: 'Accept Friend',
        icon: <Check className="w-4 h-4" />,
        action: () => runFriendAction(() => friendsAPI.acceptRequest(relationship.friendship_id)),
      };
    }
    if (relationship?.status === 'pending' && relationship?.direction === 'outgoing') {
      return {
        label: 'Cancel Request',
        icon: <Clock className="w-4 h-4" />,
        action: () => runFriendAction(() => friendsAPI.cancelRequest(relationship.friendship_id)),
        danger: true,
      };
    }
    return {
      label: 'Add Friend',
      icon: <UserPlus className="w-4 h-4" />,
      action: () => runFriendAction(() => friendsAPI.sendRequest({ target_user_id: uid })),
    };
  })();

  const statusColor = {
    online: 'bg-emerald-500',
    idle: 'bg-amber-500',
    dnd: 'bg-danger',
    offline: 'bg-slate-500',
  }[user?.status] || 'bg-slate-500';

  const avatarUrl = user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.username || 'user'}`;

  // Use created_at if available, otherwise just show a placeholder or hide
  const joinDate = user?.created_at 
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Recently joined';

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-surface-base modal-width-sm max-w-sm rounded-lg shadow-2xl border border-surface-border overflow-hidden animate-in fade-in zoom-in-95 duration-200 responsive-modal-panel overflow-y-auto responsive-safe-scroll">
        
        {/* Header / Banner Area */}
        <div className="h-24 bg-gradient-to-r from-accent-primary to-accent-hover relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Info */}
        <div className="px-4 sm:px-6 pb-5 sm:pb-6 pt-14 sm:pt-16 relative bg-surface-base">
          
          {/* Avatar (overlapping banner) */}
          <div className="absolute -top-12 left-5">
            <div className="relative">
              <img
                src={avatarUrl}
                alt={user?.username}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-[6px] border-surface-base shadow-lg bg-surface-panel"
              />
              <span className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-4 border-surface-base ${statusColor}`} />
            </div>
          </div>

          {/* User Details */}
          <div className="mt-2 bg-surface-active/50 rounded-lg border border-surface-border p-4">
            <div className="font-bold text-lg sm:text-xl text-text-primary mb-1 break-words">
              {user?.username}
            </div>
            
            <div className="text-sm font-mono text-text-muted mb-4">
              #{publicId}
            </div>

            {user?.status_message && (
              <div className="mb-4">
                <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1">Status</h4>
                <p className="text-sm text-text-primary leading-relaxed break-words">
                  {user.status_message}
                </p>
              </div>
            )}

            <div className="mb-4">
              <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1">Disco Alto Member Since</h4>
              <div className="flex items-center text-sm text-text-primary space-x-2">
                <Calendar className="w-4 h-4 text-text-muted" />
                <span>{joinDate}</span>
              </div>
            </div>

            <div className="space-y-2">
              {friendAction && (
                <button
                  onClick={friendAction.action}
                  disabled={friendLoading || friendAction.disabled}
                  className={`w-full flex items-center justify-center space-x-2 py-3 sm:py-2.5 rounded-md font-semibold transition-colors disabled:opacity-50 ${
                    friendAction.danger
                      ? 'bg-danger/20 hover:bg-danger text-danger hover:text-white'
                      : 'bg-success/20 hover:bg-success text-success hover:text-white'
                  }`}
                >
                  {friendAction.icon}
                  <span>{friendLoading ? 'Working...' : friendAction.label}</span>
                </button>
              )}

              {friendError && (
                <div className="text-xs text-danger text-center">{friendError}</div>
              )}

              {!isLocalUser && (
                <button
                  onClick={handleMessage}
                  className="w-full flex items-center justify-center space-x-2 py-3 sm:py-2.5 bg-accent-primary hover:bg-accent-hover text-text-primary rounded-md font-semibold transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Send Message</span>
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
