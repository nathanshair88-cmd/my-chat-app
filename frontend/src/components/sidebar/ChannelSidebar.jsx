import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import UserWidget from './UserWidget';
import UserContextMenu from '../modals/UserContextMenu';
import { Hash, Volume2, Video, Plus, ChevronDown, Copy, Check, Radio, PhoneOff, Settings } from 'lucide-react';
import { voiceManager } from '../../services/webrtcVoice';
import ServerSettingsModal from '../modals/ServerSettingsModal';

export default function ChannelSidebar({ onOpenCreateChannel, onOpenSettings, onNavigate }) {
  const { currentServer, currentChannel, selectChannel, unreadChannels, showVoiceGrid, toggleVoiceGrid } = useServer();


  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [voiceState, setVoiceState] = useState(voiceManager.getCurrentState());
  const [contextMenu, setContextMenu] = useState(null);



  // Listen to voice state updates
  React.useEffect(() => {
    return voiceManager.subscribe(setVoiceState);
  }, []);

  if (!currentServer) {
    return (
      <div className="w-[min(82vw,18rem)] md:w-60 bg-surface-panel/30 backdrop-blur-md flex flex-col justify-between border-r border-surface-border h-full">
        <div className="p-4 text-text-muted text-sm font-medium">Select or create a workspace to start collaborating.</div>
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
      case 'voice': return <Volume2 className="w-4 h-4 text-text-muted mr-1.5" />;
      case 'media': return <Video className="w-4 h-4 text-text-muted mr-1.5" />;
      default: return <Hash className="w-4 h-4 text-text-muted mr-1.5" />;
    }
  };

  const currentUserId = Number(localStorage.getItem('discoalto_user_id'));
  const currentMember = currentServer.members?.find(m => Number(m.user_id) === currentUserId);
  const isOwner = String(currentServer.owner_id) === String(currentUserId);
  const canManageServer = isOwner || currentMember?.role === 'admin';
  const activeVoiceChannel = (currentServer.channels || []).find(c => c.id === voiceState.channel_id);

  return (
    <div className="w-[min(82vw,18rem)] md:w-60 bg-surface-panel/30 backdrop-blur-md flex flex-col justify-between select-none z-10 border-r border-surface-border h-full">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Server Header Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setShowServerMenu(!showServerMenu)}
            className="w-full min-h-12 px-4 flex items-center justify-between border-b border-surface-border font-bold text-text-primary shadow-sm hover:bg-surface-hover transition-colors"
          >
            <span className="truncate">{currentServer.name}</span>
            <ChevronDown className="w-5 h-5 text-text-muted" />
          </button>

          {/* Server Options Popover */}
          {showServerMenu && (
            <div className="absolute top-full mt-1 left-2 right-2 bg-surface-active border border-surface-border rounded-sm shadow-2xl p-1.5 z-50">
              <button 
                onClick={() => {
                  copyInviteCode();
                  setShowServerMenu(false);
                }}
                className="w-full flex items-center justify-between px-2 py-2 rounded text-xs font-semibold text-accent-primary hover:bg-accent-primary hover:text-text-primary transition-colors"
              >
                <span>Invite People</span>
                {copiedInvite ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>

              <div className="text-[10px] text-text-muted px-2 pt-1 font-mono">
                Code: {currentServer.invite_code}
              </div>

              <div className="h-[1px] bg-surface-border my-1" />

              {canManageServer && (
                <>
                  <button 
                    onClick={() => {
                      setShowServerSettings(true);
                      setShowServerMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-2 py-2 rounded text-xs font-semibold text-text-primary hover:bg-surface-hover transition-colors"
                  >
                    <span>Server Settings</span>
                    <Settings className="w-4 h-4" />
                  </button>
                  <div className="h-[1px] bg-surface-border my-1" />
                </>
              )}

              {canManageServer && (
                <button
                  onClick={() => {
                    onOpenCreateChannel();
                    setShowServerMenu(false);
                  }}
                  className="w-full flex items-center justify-between px-2 py-2 rounded text-xs font-semibold text-text-primary hover:bg-surface-hover transition-colors"
                >
                  <span>Create Channel</span>
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Categorized Channels List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 no-scrollbar">
          {Object.entries(categories).map(([catName, chList]) => (
            <div key={catName}>
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{catName}</span>
                {canManageServer && (
                  <button
                    onClick={onOpenCreateChannel}
                    className="text-text-muted hover:text-text-primary transition-colors p-1 rounded mobile-touch-target md:min-w-0 md:min-h-0"
                    title="Create Channel"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
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
                        onClick={() => {
                          if (!isVoiceChannel) {
                            selectChannel(channel);
                          } else {
                            selectChannel(channel, false); // Single click (preview)
                          }
                          onNavigate?.();
                        }}
                        onDoubleClick={() => {
                          if (isVoiceChannel) {
                            selectChannel(channel, true); // Double click (join)
                          }
                        }}
                        title={isVoiceChannel && !isVoiceConnected ? 'Single-click to preview · Double-click to join voice' : undefined}
                        className={`w-full flex items-center justify-between px-2 py-2 md:py-1.5 rounded-md text-sm font-medium transition-colors ${
                          isActive ? 'bg-surface-active text-text-primary font-semibold shadow-sm' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
                        }`}
                      >
                        <div className="flex items-center min-w-0 pr-1">
                          {getChannelIcon(channel.type)}
                          <span className="truncate">{channel.name}</span>
                        </div>
                        <div className="flex items-center space-x-1 flex-shrink-0">
                          {unreadCount > 0 && !isActive && (
                            <span className="bg-danger text-text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
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
                        <div className="ml-5 my-1 space-y-1 pl-2 border-l border-surface-border animate-fadeIn">
                          {connectedUsers.map((u) => {
                            const uId = u.id || u.user_id;
                            const localUserId = String(localStorage.getItem('discoalto_user_id') || '');
                            const isUserSpeaking = speakingUsers.some(id => String(id) === String(uId)) ||
                              (String(uId) === localUserId && speakingUsers.includes('local'));
                            let displayUsername = u.username;
                            if (!displayUsername || displayUsername === 'You') {
                              displayUsername = localStorage.getItem('discoalto_username') || 'Member';
                            }
                            const avatarUrl = u.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${displayUsername}`;

                            const member = currentServer.members?.find(m => m.user_id === parseInt(uId));
                            let roleColor = null;
                            if (member && member.custom_role_id) {
                              const role = currentServer.roles?.find(r => r.id === member.custom_role_id);
                              if (role) roleColor = role.color;
                            }

                            return (
                              <div 
                                key={uId} 
                                className="flex items-center space-x-2 py-1 px-1.5 rounded-md hover:bg-surface-hover transition group cursor-pointer"
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  setContextMenu({ x: e.clientX, y: e.clientY, user: u });
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  setContextMenu({ x: e.clientX, y: e.clientY, user: u });
                                }}
                              >
                                {/* Avatar with Real-time Disco Alto Green Glowing Speaking Ring */}
                                <div className={`
                                  w-6 h-6 rounded-full overflow-hidden shrink-0 border-2 transition-all duration-300 relative 
                                  ${isUserSpeaking 
                                    ? 'border-success ring-2 ring-success/50 shadow-success/50' 
                                    : 'border-transparent'
                                  }`}>
                                  <img src={avatarUrl} alt={displayUsername} className="w-full h-full rounded-full object-cover" />
                                </div>

                                <span 
                                  className={`text-xs truncate font-medium ${isUserSpeaking ? 'text-emerald-400 font-semibold' : 'text-text-muted group-hover:brightness-125'}`}
                                  style={roleColor && !isUserSpeaking ? { color: roleColor } : {}}
                                >
                                  {displayUsername}
                                </span>


                                <div className="ml-auto flex items-center space-x-1 flex-shrink-0">
                                  {u.is_screen_sharing && (
                                    <span className="bg-accent-primary text-[9px] text-text-primary px-1 rounded font-mono uppercase shadow-sm">LIVE</span>
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
          <div className="bg-surface-active/80 px-3 py-2 border-t border-surface-border flex items-center justify-between text-xs backdrop-blur-md">
            <div className="min-w-0 pr-2">
              <div className="flex items-center text-success font-semibold truncate">
                <Radio className="w-3.5 h-3.5 mr-1 flex-shrink-0 animate-pulse" />
                <span className="truncate">Voice Connected</span>
              </div>
              <div className="text-[11px] text-text-muted truncate">
                {activeVoiceChannel ? activeVoiceChannel.name : `Channel #${voiceState.channel_id}`}
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={toggleVoiceGrid}
                className={`p-2 md:p-1.5 rounded transition-colors shadow-sm mobile-touch-target md:min-w-0 md:min-h-0 ${
                  showVoiceGrid ? 'bg-accent-primary text-text-primary' : 'bg-surface-hover text-text-muted hover:text-text-primary'
                }`}
                title={showVoiceGrid ? "Switch to Text Chat" : "Open Full Voice & Video Grid"}
              >
                <Video className="w-4 h-4" />
              </button>
              <button
                onClick={() => voiceManager.leaveVoiceChannel()}
                className="p-2 md:p-1.5 bg-danger/10 hover:bg-danger text-danger hover:text-text-primary rounded transition-colors shadow-sm mobile-touch-target md:min-w-0 md:min-h-0"
                title="Disconnect Voice"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>

      <UserWidget onOpenSettings={onOpenSettings} />

      {contextMenu && (
        <UserContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          user={contextMenu.user} 
          contextType="voice"
          isLocalUser={String(contextMenu.user.id || contextMenu.user.user_id) === String(localStorage.getItem('discoalto_user_id'))}
          onClose={() => setContextMenu(null)} 
        />
      )}

      {showServerSettings && (
        <ServerSettingsModal 
          server={currentServer} 
          onClose={() => setShowServerSettings(false)}
          onServerUpdated={() => {
            // Can reload or just let context know via window.location.reload() for a hard refresh, or ideally update state via context
            window.location.reload(); 
          }}
          onServerDeleted={() => {
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

