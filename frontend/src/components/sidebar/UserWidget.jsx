import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { voiceManager } from '../../services/webrtcVoice';
import { Mic, MicOff, Volume2, VolumeX, Settings, ChevronUp, Check } from 'lucide-react';

export default function UserWidget({ onOpenSettings }) {
  const { user, updateStatus } = useAuth();
  
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  if (!user) return null;

  const handleToggleMute = () => {
    voiceManager.toggleMute();
    setIsMuted(!isMuted);
  };

  const handleToggleDeafen = () => {
    voiceManager.toggleDeafen();
    setIsDeafened(!isDeafened);
  };

  const statuses = [
    { id: 'online', label: 'Online', color: 'bg-success' },
    { id: 'idle', label: 'Idle', color: 'bg-amber-500' },
    { id: 'dnd', label: 'Do Not Disturb', color: 'bg-danger' },
    { id: 'offline', label: 'Invisible', color: 'bg-slate-500' },
  ];

  return (
    <div className="relative bg-surface-active/50 backdrop-blur-lg px-2 py-2.5 flex items-center justify-between border-t border-surface-border">
      {/* User Info & Status Dropdown */}
      <div 
        onClick={() => setShowStatusMenu(!showStatusMenu)}
        className="flex items-center space-x-2 px-1.5 py-1 rounded-md hover:bg-surface-hover cursor-pointer flex-1 min-w-0 mr-1 transition-colors"
      >
        <div className="relative flex-shrink-0">
          <img 
            src={user.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`} 
            alt={user.username} 
            className="w-8 h-8 rounded-full bg-surface-panel object-cover shadow-sm"
          />
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-active ${
            user.status === 'online' ? 'bg-success' :
            user.status === 'idle' ? 'bg-amber-500' :
            user.status === 'dnd' ? 'bg-danger' : 'bg-slate-500'
          }`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-text-primary truncate leading-tight">{user.username}</div>
          <div className="text-[11px] text-text-muted truncate leading-none mt-0.5">
            {user.status_message || `#${user.id}`}
          </div>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center space-x-0.5 text-text-muted">
        <button 
          onClick={handleToggleMute} 
          className={`p-1.5 rounded hover:bg-surface-hover hover:text-text-primary transition-colors ${isMuted ? 'text-danger hover:text-danger-hover' : ''}`}
          title={isMuted ? "Unmute Mic" : "Mute Mic"}
        >
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <button 
          onClick={handleToggleDeafen} 
          className={`p-1.5 rounded hover:bg-surface-hover hover:text-text-primary transition-colors ${isDeafened ? 'text-danger hover:text-danger-hover' : ''}`}
          title={isDeafened ? "Undeafen Audio" : "Deafen Audio"}
        >
          {isDeafened ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded hover:bg-surface-hover hover:text-text-primary transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>


      {/* Status Picker Menu Overlay */}
      {showStatusMenu && (
        <div className="absolute bottom-14 left-2 w-52 bg-surface-active border border-surface-border rounded-sm shadow-2xl p-1.5 z-50">
          <div className="text-[11px] font-bold text-text-muted px-2 py-1 uppercase tracking-wider">Set Status</div>
          {statuses.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                updateStatus(s.id, user.status_message);
                setShowStatusMenu(false);
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium text-text-primary hover:bg-accent-primary hover:text-text-primary transition-colors"
            >
              <div className="flex items-center space-x-2">
                <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                <span>{s.label}</span>
              </div>
              {user.status === s.id && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
