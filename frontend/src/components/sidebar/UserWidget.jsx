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
    { id: 'online', label: 'Online', color: 'bg-emerald-500' },
    { id: 'idle', label: 'Idle', color: 'bg-amber-500' },
    { id: 'dnd', label: 'Do Not Disturb', color: 'bg-rose-500' },
    { id: 'offline', label: 'Invisible', color: 'bg-zinc-500' },
  ];

  return (
    <div className="relative bg-[#232428] px-2 py-2.5 flex items-center justify-between border-t border-[#1f2023]">
      {/* User Info & Status Dropdown */}
      <div 
        onClick={() => setShowStatusMenu(!showStatusMenu)}
        className="flex items-center space-x-2 px-1.5 py-1 rounded-md hover:bg-[#35373c] cursor-pointer flex-1 min-w-0 mr-1 transition-colors"
      >
        <div className="relative flex-shrink-0">
          <img 
            src={user.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`} 
            alt={user.username} 
            className="w-8 h-8 rounded-full bg-[#1e1f22] object-cover"
          />
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#232428] ${
            user.status === 'online' ? 'bg-emerald-500' :
            user.status === 'idle' ? 'bg-amber-500' :
            user.status === 'dnd' ? 'bg-rose-500' : 'bg-zinc-500'
          }`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-white truncate leading-tight">{user.username}</div>
          <div className="text-[11px] text-[#949ba4] truncate leading-none mt-0.5">
            {user.status_message || `#${user.id}`}
          </div>
        </div>
      </div>

      {/* Mic, Deafen & User Settings Controls */}
      <div className="flex items-center space-x-0.5 text-[#b5bac1]">
        <button 
          onClick={handleToggleMute} 
          className={`p-1.5 rounded hover:bg-[#35373c] hover:text-white transition-colors ${isMuted ? 'text-rose-500 hover:text-rose-400' : ''}`}
          title={isMuted ? "Unmute Mic" : "Mute Mic"}
        >
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <button 
          onClick={handleToggleDeafen} 
          className={`p-1.5 rounded hover:bg-[#35373c] hover:text-white transition-colors ${isDeafened ? 'text-rose-500 hover:text-rose-400' : ''}`}
          title={isDeafened ? "Undeafen Audio" : "Deafen Audio"}
        >
          {isDeafened ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded hover:bg-[#35373c] hover:text-white transition-colors"
          title="User Settings (Voice, Video & Profile)"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>


      {/* Status Picker Menu Overlay */}
      {showStatusMenu && (
        <div className="absolute bottom-14 left-2 w-52 bg-[#111214] border border-[#2b2d31] rounded-lg shadow-2xl p-1.5 z-50">
          <div className="text-[11px] font-bold text-[#949ba4] px-2 py-1 uppercase tracking-wider">Set Status</div>
          {statuses.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                updateStatus(s.id, user.status_message);
                setShowStatusMenu(false);
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-medium text-[#dbdee1] hover:bg-[#5865f2] hover:text-white transition-colors"
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
