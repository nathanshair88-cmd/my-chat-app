import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import UserWidget from './UserWidget';
import { Hash, Volume2, Video, Plus, ChevronDown, Copy, Check, PhoneOff, Radio } from 'lucide-react';
import { voiceManager } from '../../services/webrtcVoice';

export default function ChannelSidebar({ onOpenCreateChannel, onOpenSettings }) {
  const { currentServer, currentChannel, selectChannel, unreadChannels, showVoiceGrid, toggleVoiceGrid } = useServer();


  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [voiceState, setVoiceState] = useState({ channel_id: null });



  // Listen to voice state updates
  React.useEffect(() => {
    return voiceManager.subscribe(setVoiceState);
  }, []);

  if (!currentServer) {
    return (
      <div className="w-60 bg-[#2b2d31] flex flex-col justify-between border-r border-[#1f2023]">
        <div className="p-4 text-[#949ba4] text-sm">Select or create a server to start chatting.</div>
        <UserWidget />
      </div>
    );
  }

  const copyInviteCode = () => {
    navigator.clipboard.writeText(currentServer.invite_code);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  // Group channels by category
  const categories = {};
  (currentServer.channels || []).forEach(ch => {
    const cat = ch.category || 'General';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(ch);
  });

  const getChannelIcon = (type) => {
    switch (type) {
      case 'voice': return <Volume2 className="w-4 h-4 text-[#949ba4] mr-1.5" />;
      case 'media': return <Video className="w-4 h-4 text-[#949ba4] mr-1.5" />;
      default: return <Hash className="w-4 h-4 text-[#949ba4] mr-1.5" />;
    }
  };

  const activeVoiceChannel = (currentServer.channels || []).find(c => c.id === voiceState.channel_id);

  return (
    <div className="w-60 bg-[#2b2d31] flex flex-col justify-between select-none z-10 border-r border-[#1f2023]">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Server Header Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setShowServerMenu(!showServerMenu)}
            className="w-full h-12 px-4 flex items-center justify-between border-b border-[#1f2023] font-bold text-white shadow-sm hover:bg-[#35373c] transition-colors"
          >
            <span className="truncate">{currentServer.name}</span>
            <ChevronDown className="w-5 h-5 text-[#949ba4]" />
          </button>

          {/* Server Options Popover */}
          {showServerMenu && (
            <div className="absolute top-13 left-2 right-2 bg-[#111214] border border-[#2b2d31] rounded-lg shadow-2xl p-1.5 z-50">
              <button 
                onClick={() => {
                  copyInviteCode();
                  setShowServerMenu(false);
                }}
                className="w-full flex items-center justify-between px-2 py-2 rounded text-xs font-semibold text-[#5865f2] hover:bg-[#5865f2] hover:text-white transition-colors"
              >
                <span>Invite People</span>
                {copiedInvite ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>

              <div className="text-[10px] text-[#949ba4] px-2 pt-1 font-mono">
                Code: {currentServer.invite_code}
              </div>

              <div className="h-[1px] bg-[#2b2d31] my-1" />

              <button 
                onClick={() => {
                  onOpenCreateChannel();
                  setShowServerMenu(false);
                }}
                className="w-full flex items-center justify-between px-2 py-2 rounded text-xs font-semibold text-[#dbdee1] hover:bg-[#35373c] transition-colors"
              >
                <span>Create Channel</span>
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Categorized Channels List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 no-scrollbar">
          {Object.entries(categories).map(([catName, chList]) => (
            <div key={catName}>
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[11px] font-bold text-[#949ba4] uppercase tracking-wider">{catName}</span>
                <button 
                  onClick={onOpenCreateChannel}
                  className="text-[#949ba4] hover:text-white transition-colors"
                  title="Create Channel"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-0.5">
                {chList.map((channel) => {
                  const isActive = currentChannel && currentChannel.id === channel.id;
                  const isVoiceConnected = voiceState.channel_id === channel.id;
                  const unreadCount = unreadChannels[channel.id] || 0;
                  const isVoiceChannel = channel.type === 'voice' || channel.type === 'media';

                  // Connected members in this voice channel — read from voiceManager's allVoiceRooms
                  const rawConnected = (voiceState.allVoiceRooms || {})[String(channel.id)] || [];
                  const uniqueUsersMap = new Map();
                  rawConnected.forEach(u => {
                    const uid = u.id || u.user_id;
                    const uname = u.username || 'Member';
                    if (uid && !uniqueUsersMap.has(uid) && !uniqueUsersMap.has(uname)) {
                      uniqueUsersMap.set(uid, u);
                    }
                  });
                  const connectedUsers = Array.from(uniqueUsersMap.values());

                  const speakingUsers = voiceState.speakingUsers || [];


                  return (
                    <div key={channel.id}>
                      <button
                        onClick={() => selectChannel(channel)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          isActive ? 'bg-[#404249] text-white font-semibold' : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]'
                        }`}
                      >
                        <div className="flex items-center min-w-0 pr-1">
                          {getChannelIcon(channel.type)}
                          <span className="truncate">{channel.name}</span>
                        </div>
                        <div className="flex items-center space-x-1 flex-shrink-0">
                          {unreadCount > 0 && !isActive && (
                            <span className="bg-[#f23f43] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                              {unreadCount}
                            </span>
                          )}
                          {isVoiceConnected && (
                            <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                          )}
                        </div>
                      </button>

                      {/* Nested Voice Channel Connected Users List */}
                      {isVoiceChannel && connectedUsers.length > 0 && (
                        <div className="ml-5 my-1 space-y-1 pl-2 border-l border-[#3f4147] animate-fadeIn">
                          {connectedUsers.map((u) => {
                            const uId = u.id || u.user_id;
                            const localUserId = String(localStorage.getItem('discord_user_id') || '');
                            const isUserSpeaking = speakingUsers.some(id => String(id) === String(uId)) ||
                              (String(uId) === localUserId && speakingUsers.includes('local'));
                            let displayUsername = u.username;
                            if (!displayUsername || displayUsername === 'You') {
                              displayUsername = localStorage.getItem('discord_username') || 'Member';
                            }
                            const avatarUrl = u.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${displayUsername}`;

                            return (
                              <div key={uId} className="flex items-center space-x-2 py-1 px-1.5 rounded-md hover:bg-[#35373c]/60 transition group cursor-pointer">
                                {/* Avatar with Real-time Discord Green Glowing Speaking Ring */}
                                <div className={`
                                  w-6 h-6 rounded-full overflow-hidden shrink-0 border-2 transition-all duration-300 relative 
                                  ${isUserSpeaking 
                                    ? 'border-[#23a559] ring-2 ring-[#23a559]/50 shadow-[0_0_8px_rgba(35,165,89,0.6)]' 
                                    : 'border-transparent'
                                  }`}>
                                  <img src={avatarUrl} alt={displayUsername} className="w-full h-full rounded-full object-cover" />
                                </div>

                                <span className={`text-xs truncate font-medium ${isUserSpeaking ? 'text-emerald-400 font-semibold' : 'text-[#949ba4] group-hover:text-white'}`}>
                                  {displayUsername}
                                </span>


                                <div className="ml-auto flex items-center space-x-1 flex-shrink-0">
                                  {u.is_screen_sharing && (
                                    <span className="bg-[#5865f2] text-[9px] text-white px-1 rounded font-mono uppercase">LIVE</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}


              </div>
            </div>
          ))}
        </div>

        {/* Active Voice Connection Status Banner */}
        {voiceState.channel_id && (
          <div className="bg-[#111214] px-3 py-2 border-t border-[#1f2023] flex items-center justify-between text-xs">
            <div className="min-w-0 pr-2">
              <div className="flex items-center text-emerald-400 font-semibold truncate">
                <Radio className="w-3.5 h-3.5 mr-1 flex-shrink-0 animate-pulse" />
                <span className="truncate">Voice Connected</span>
              </div>
              <div className="text-[11px] text-[#949ba4] truncate">
                {activeVoiceChannel ? activeVoiceChannel.name : `Channel #${voiceState.channel_id}`}
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={toggleVoiceGrid}
                className={`p-1.5 rounded transition-colors ${
                  showVoiceGrid ? 'bg-[#5865f2] text-white' : 'bg-[#2b2d31] hover:bg-[#35373c] text-[#949ba4] hover:text-white'
                }`}
                title={showVoiceGrid ? "Switch to Text Chat" : "Open Full Voice & Video Grid"}
              >
                <Video className="w-4 h-4" />
              </button>
              <button
                onClick={() => voiceManager.leaveVoiceChannel()}
                className="p-1.5 bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white rounded transition-colors"
                title="Disconnect Voice"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>

      <UserWidget onOpenSettings={onOpenSettings} />
    </div>
  );
}

