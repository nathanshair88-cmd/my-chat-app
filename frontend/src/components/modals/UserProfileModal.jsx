import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useServer } from '../../context/ServerContext';
import { X, MessageSquare, Calendar } from 'lucide-react';

export default function UserProfileModal({ user, onClose }) {
  const { startDM, setViewMode } = useServer();

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const uid = user?.id || user?.user_id;

  const handleMessage = async () => {
    try {
      await startDM({ target_user_id: uid });
      setViewMode('dm');
    } catch (e) {
      console.error('DM error:', e);
    }
    onClose();
  };

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
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-surface-base w-full max-w-sm rounded-lg shadow-2xl border border-surface-border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
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
        <div className="px-6 pb-6 pt-16 relative bg-surface-base">
          
          {/* Avatar (overlapping banner) */}
          <div className="absolute -top-12 left-5">
            <div className="relative">
              <img
                src={avatarUrl}
                alt={user?.username}
                className="w-24 h-24 rounded-full object-cover border-[6px] border-surface-base shadow-lg bg-surface-panel"
              />
              <span className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-4 border-surface-base ${statusColor}`} />
            </div>
          </div>

          {/* User Details */}
          <div className="mt-2 bg-surface-active/50 rounded-lg border border-surface-border p-4">
            <div className="font-bold text-xl text-text-primary mb-1">
              {user?.username}
            </div>
            
            <div className="text-sm font-mono text-text-muted mb-4">
              #{uid}
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

            <button
              onClick={handleMessage}
              className="w-full flex items-center justify-center space-x-2 py-2.5 bg-accent-primary hover:bg-accent-hover text-text-primary rounded-md font-semibold transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Send Message</span>
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
