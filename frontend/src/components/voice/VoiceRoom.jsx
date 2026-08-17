import React, { useState, useEffect, useRef } from 'react';
import { voiceManager } from '../../services/webrtcVoice';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { watchTogetherService } from '../../services/watchTogetherService';
import WatchTogetherPlayer from './WatchTogetherPlayer';
import UserContextMenu from '../modals/UserContextMenu';
import { Mic, MicOff, Volume2, VolumeX, Monitor, MonitorOff, Video, VideoOff, PhoneOff, Radio, ShieldAlert, Maximize, Minimize, X, Tv2 } from 'lucide-react';

export default function VoiceRoom() {
  const { currentChannel } = useServer();
  const { user } = useAuth();
  const [fullscreenItem, setFullscreenItem] = useState(null);
  const [showWatchTogether, setShowWatchTogether] = useState(false);
  const [watchState, setWatchState] = useState(watchTogetherService.getCurrentState());

  const [voiceState, setVoiceState] = useState({
    channel_id: null,
    isMuted: false,
    isDeafened: false,
    isScreenSharing: false,
    streams: [],
    speakingUsers: []
  });

  useEffect(() => {
    return voiceManager.subscribe(setVoiceState);
  }, []);

  // Subscribe to watch together state for the activity indicator
  useEffect(() => {
    return watchTogetherService.subscribe(setWatchState);
  }, []);

  // Attach/detach socket listener when voice channel changes
  useEffect(() => {
    if (voiceState.channel_id) {
      watchTogetherService.attachSocketListener(voiceState.channel_id);
      // If the channel already has an active watch session, show the player
      if (watchState.isActive) setShowWatchTogether(true);
    } else {
      watchTogetherService.detachSocketListener();
      setShowWatchTogether(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState.channel_id]);

  // Auto-show player when a remote user sets a video
  useEffect(() => {
    if (watchState.isActive && voiceState.channel_id) {
      setShowWatchTogether(true);
    }
  }, [watchState.isActive, voiceState.channel_id]);

  const isConnected = voiceState.channel_id && currentChannel && voiceState.channel_id === currentChannel.id;

  if (!currentChannel || (currentChannel.type !== 'voice' && currentChannel.type !== 'media')) {
    return null;
  }

  if (!isConnected) {
    return (
      <div className="flex-1 bg-surface-base flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="w-20 h-20 rounded-full bg-surface-panel flex items-center justify-center mb-4 border border-surface-border shadow-md">
          <Radio className="w-10 h-10 text-accent-primary" />
        </div>
        <h3 className="text-xl font-bold text-text-primary mb-2">Voice & Video Room: #{currentChannel.name}</h3>
        <p className="text-sm text-text-muted max-w-md mb-6">
          Connect to start crystal-clear audio chat, active speaker detection, and full 60FPS screen sharing.
        </p>
        <button
          onClick={() => voiceManager.joinVoiceChannel(currentChannel.id, user)}
          className="px-6 py-3 bg-success hover:bg-success/80 text-text-primary font-bold rounded-md shadow-lg transition-all transform hover:scale-105 flex items-center space-x-2"
        >
          <Radio className="w-5 h-5 animate-pulse" />
          <span>Connect to Voice</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-transparent flex flex-col justify-between p-4 relative min-h-0 overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between bg-surface-active/80 backdrop-blur-md px-4 py-2.5 rounded-md border border-surface-border mb-4 z-10 shadow-sm">
        <div className="flex items-center space-x-2 text-text-primary font-bold text-sm">
          <Radio className="w-4 h-4 text-success animate-pulse" />
          <span>#{currentChannel.name}</span>
          <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-md font-mono border border-success/30">
            {voiceState.streams.length} Connected
          </span>
        </div>

        {voiceState.isScreenSharing && (
          <div className="flex items-center space-x-1.5 bg-accent-primary/20 border border-accent-primary/40 px-2.5 py-1 rounded-md text-xs font-mono text-accent-primary font-semibold">
            <span>LIVE 60FPS</span>
          </div>
        )}
      </div>

      {/* Multi-Stream Video Tile Grid + Watch Together Theater Mode */}
      <div className="flex-1 flex min-h-0 gap-3 overflow-hidden">
        {/* Watch Together Player — takes 70% when active */}
        {showWatchTogether && (
          <div className="flex-1 min-w-0 min-h-0">
            <WatchTogetherPlayer
              channelId={voiceState.channel_id || currentChannel?.id}
              onClose={() => setShowWatchTogether(false)}
            />
          </div>
        )}

        {/* Voice tiles — full width normally, 30% sidebar in theater mode */}
        <div className={`${showWatchTogether ? 'w-64 flex-shrink-0' : 'flex-1'} grid ${showWatchTogether ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'} gap-3 overflow-y-auto no-scrollbar p-1 auto-rows-max`}>
          {voiceState.streams.map((item) => (
            <StreamTile 
              key={item.user_id} 
              item={item} 
              speakingUsers={voiceState.speakingUsers} 
              channelId={voiceState.channel_id}
              onOpenFullscreen={(streamItem) => setFullscreenItem(streamItem)}
            />
          ))}
        </div>
      </div>

      {/* Control Action Toolbar */}
      <div className="flex items-center justify-center space-x-4 bg-surface-active/80 backdrop-blur-md py-3 px-6 rounded-md border border-surface-border mt-4 self-center shadow-2xl z-10">
        {/* Watch Together / Activities Button */}
        <button
          onClick={() => setShowWatchTogether(v => !v)}
          className={`p-3.5 rounded-full transition-all transform active:scale-95 shadow-sm relative ${
            showWatchTogether ? 'bg-red-600 text-white shadow-red-600/30' : 'bg-surface-panel hover:bg-surface-hover text-text-primary'
          }`}
          title={showWatchTogether ? 'Hide Watch Together' : 'Watch Together (YouTube Sync)'}
        >
          <Tv2 className="w-5 h-5" />
          {watchState.isActive && !showWatchTogether && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-surface-base animate-pulse" />
          )}
        </button>

        {/* Mute Mic */}
        <button
          onClick={() => voiceManager.toggleMute()}
          className={`p-3.5 rounded-full transition-all transform active:scale-95 shadow-sm ${
            voiceState.isMuted ? 'bg-danger text-text-primary shadow-danger/30' : 'bg-surface-panel hover:bg-surface-hover text-text-primary'
          }`}
          title={voiceState.isMuted ? "Unmute Mic" : "Mute Mic"}
        >
          {voiceState.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Deafen Audio */}
        <button
          onClick={() => voiceManager.toggleDeafen()}
          className={`p-3.5 rounded-full transition-all transform active:scale-95 shadow-sm ${
            voiceState.isDeafened ? 'bg-danger text-text-primary shadow-danger/30' : 'bg-surface-panel hover:bg-surface-hover text-text-primary'
          }`}
          title={voiceState.isDeafened ? "Undeafen Audio" : "Deafen Audio"}
        >
          {voiceState.isDeafened ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>

        {/* Screen Share Button */}
        <button
          onClick={() => {
            if (voiceState.isScreenSharing) {
              voiceManager.stopScreenShare();
            } else {
              voiceManager.startScreenShare();
            }
          }}
          className={`p-3.5 rounded-full transition-all transform active:scale-95 shadow-sm ${
            voiceState.isScreenSharing ? 'bg-accent-primary text-text-primary shadow-accent-primary/30' : 'bg-surface-panel hover:bg-surface-hover text-text-primary'
          }`}
          title={voiceState.isScreenSharing ? "Stop Screen Share" : "Share Screen (Full Res @ 60FPS)"}
        >
          {voiceState.isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        {/* Camera (Webcam) Button */}
        <button
          onClick={() => voiceManager.toggleCamera()}
          className={`p-3.5 rounded-full transition-all transform active:scale-95 shadow-sm ${
            voiceState.isCameraOn ? 'bg-success text-text-primary shadow-success/30' : 'bg-surface-panel hover:bg-surface-hover text-text-primary'
          }`}
          title={voiceState.isCameraOn ? "Turn Off Camera" : "Turn On Camera"}
        >
          {voiceState.isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        {/* Disconnect Voice */}
        <button
          onClick={() => voiceManager.leaveVoiceChannel()}
          className="p-3.5 bg-danger hover:bg-danger-hover text-text-primary rounded-full transition-all transform active:scale-95 shadow-lg shadow-danger/30"
          title="Disconnect Voice"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>

      {/* Fullscreen React Theater Overlay */}
      {fullscreenItem && (
        <div 
          ref={(el) => {
            if (el && !document.fullscreenElement) {
              el.requestFullscreen().catch(err => {
                console.warn("Native fullscreen refused:", err);
              });
            }
          }}
          className="fixed inset-0 z-50 bg-black/90 flex flex-col justify-between p-6 animate-fadeIn"
        >
          <div className="flex items-center justify-between z-10 absolute top-6 left-6 right-6">
            <div className="flex items-center space-x-3 bg-surface-active/80 border border-surface-border px-4 py-2 rounded-md backdrop-blur-md">
              <span className="font-bold text-text-primary text-sm">{fullscreenItem.username}'s Stream</span>
              {fullscreenItem.isScreenSharing && (
                <span className="bg-accent-primary text-xs text-text-primary px-2 py-0.5 rounded font-mono uppercase font-semibold">LIVE 60FPS</span>
              )}
            </div>

            <button
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
                setFullscreenItem(null);
              }}
              className="p-2.5 bg-surface-active hover:bg-surface-hover text-text-primary rounded-full border border-surface-border transition shadow-lg opacity-50 hover:opacity-100"
              title="Exit Fullscreen View (ESC)"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* High-Resolution Enlarged Video Viewport */}
          <div className="flex-1 flex items-center justify-center w-full h-full relative">
            <FullscreenVideoNode stream={fullscreenItem.stream} />
          </div>
        </div>
      )}
    </div>
  );
}


function StreamTile({ item, speakingUsers, onOpenFullscreen, channelId }) {
  const videoRef = useRef(null);
  const { user: currentUser } = useAuth();
  const isSpeaking = speakingUsers.some(id => String(id) === String(item.user_id));
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [userVol, setUserVol] = useState(item.volume !== undefined ? item.volume : 100);
  const [contextMenu, setContextMenu] = useState(null);
  const isLocalUser = item.user_id === 'local' || item.user_id === currentUser?.id;

  useEffect(() => {
    if (videoRef.current && item.stream) {
      videoRef.current.srcObject = item.stream;
    }
  }, [item.stream]);

  const handleVolumeChange = (v) => {
    setUserVol(v);
    if (item.user_id !== 'local') {
      voiceManager.setUserVolume(item.user_id, v);
    }
  };

  const handleToggleFullscreen = () => {
    if (onOpenFullscreen) {
      onOpenFullscreen(item);
    }
  };

  const hasVideo = item.stream && item.stream.getVideoTracks().length > 0;

  return (
    <div
      className={`relative bg-surface-active/50 rounded-md overflow-hidden border-2 flex flex-col items-center justify-center shadow-xl transition-all duration-200 aspect-video backdrop-blur-sm ${
        isSpeaking ? 'speaker-active' : 'border-surface-border'
      }`}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >

      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={true}
          className="w-full h-full object-contain bg-black cursor-pointer"
          onClick={handleToggleFullscreen}
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-6">
          <div className={`w-20 h-20 rounded-full bg-surface-panel border-4 flex items-center justify-center transition-all duration-300 ${
            isSpeaking ? 'border-success shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-surface-border'
          }`}>
            <span className="text-2xl font-bold text-text-primary">{item.username.substring(0, 2).toUpperCase()}</span>
          </div>
        </div>
      )}

      {/* Participant Name Badge Overlay & Volume / Fullscreen Controls */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-auto">
        <div className="bg-surface-active/80 backdrop-blur px-2.5 py-1 rounded-md text-xs font-semibold text-text-primary flex items-center space-x-1.5 border border-surface-border shadow-sm">
          <span>{item.username}</span>
          {item.isScreenSharing && (
            <span className="bg-accent-primary text-[10px] text-text-primary px-1.5 py-0.5 rounded font-mono uppercase shadow-sm">Screen</span>
          )}
          {item.isMuted && <MicOff className="w-3 h-3 text-danger" />}
        </div>

        <div className="flex items-center space-x-1">
          {/* Fullscreen Video Stream Toggle */}
          {hasVideo && (
            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 bg-surface-active/80 hover:bg-surface-hover text-text-primary rounded-md border border-surface-border transition shadow-sm backdrop-blur"
              title="Fullscreen Video Stream"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Per-User Volume Controls Button */}
          {item.user_id !== 'local' && (
            <div className="relative">
              <button
                onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                className="p-1.5 bg-surface-active/80 hover:bg-surface-hover text-text-primary rounded-md border border-surface-border transition shadow-sm backdrop-blur"
                title="User Volume Settings"
              >
                {userVol === 0 ? <VolumeX className="w-3.5 h-3.5 text-danger" /> : <Volume2 className="w-3.5 h-3.5 text-success" />}
              </button>

              {showVolumeSlider && (
                <div className="absolute bottom-9 right-0 bg-surface-active border border-surface-border rounded-sm p-3 w-44 shadow-2xl z-50 animate-fadeIn backdrop-blur-md">
                  <div className="flex justify-between text-[11px] font-bold text-text-primary mb-1.5">
                    <span>User Volume</span>
                    <span className="font-mono text-success">{userVol}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={userVol}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="w-full accent-accent-primary"
                  />
                  <button
                    onClick={() => handleVolumeChange(userVol === 0 ? 100 : 0)}
                    className="mt-2 w-full py-1 text-[10px] font-bold rounded bg-surface-panel hover:bg-danger text-text-primary hover:text-text-primary transition shadow-sm"
                  >
                    {userVol === 0 ? 'Unmute User' : 'Mute User'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* User Context Menu on right-click */}
      {contextMenu && (
        <UserContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          user={{ id: item.user_id, username: item.username, avatar_url: item.avatar_url }}
          contextType="voice"
          isLocalUser={isLocalUser}
          channelId={channelId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

function FullscreenVideoNode({ stream }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={true}
      className="w-full h-full object-contain bg-black"
    />
  );
}
