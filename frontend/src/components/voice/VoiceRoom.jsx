import React, { useState, useEffect, useRef } from 'react';
import { voiceManager } from '../../services/webrtcVoice';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { Mic, MicOff, Volume2, VolumeX, Monitor, MonitorOff, PhoneOff, Radio, ShieldAlert, Maximize, Minimize, X } from 'lucide-react';

export default function VoiceRoom() {
  const { currentChannel } = useServer();
  const { user } = useAuth();
  const [fullscreenItem, setFullscreenItem] = useState(null);

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

  const isConnected = voiceState.channel_id && currentChannel && voiceState.channel_id === currentChannel.id;

  if (!currentChannel || (currentChannel.type !== 'voice' && currentChannel.type !== 'media')) {
    return null;
  }

  if (!isConnected) {
    return (
      <div className="flex-1 bg-[#1e1f22] flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="w-20 h-20 rounded-full bg-[#2b2d31] flex items-center justify-center mb-4 border border-[#3f4147]">
          <Radio className="w-10 h-10 text-[#5865f2]" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Voice & Video Room: #{currentChannel.name}</h3>
        <p className="text-sm text-[#949ba4] max-w-md mb-6">
          Connect to start crystal-clear audio chat, active speaker detection, and full 60FPS screen sharing.
        </p>
        <button
          onClick={() => voiceManager.joinVoiceChannel(currentChannel.id, user)}
          className="px-6 py-3 bg-[#23a55a] hover:bg-[#1db853] text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105 flex items-center space-x-2"
        >
          <Radio className="w-5 h-5 animate-pulse" />
          <span>Connect to Voice</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#111214] flex flex-col justify-between p-4 relative min-h-0 overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between bg-[#1e1f22]/80 backdrop-blur px-4 py-2.5 rounded-xl border border-[#2b2d31] mb-4 z-10">
        <div className="flex items-center space-x-2 text-white font-bold text-sm">
          <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>#{currentChannel.name}</span>
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md font-mono">
            {voiceState.streams.length} Connected
          </span>
        </div>

        {voiceState.isScreenSharing && (
          <div className="flex items-center space-x-1.5 bg-[#5865f2]/20 border border-[#5865f2]/40 px-2.5 py-1 rounded-md text-xs font-mono text-[#5865f2] font-semibold">
            <span>LIVE 60FPS</span>
          </div>
        )}
      </div>

      {/* Multi-Stream Video Tile Grid */}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto no-scrollbar p-1">
        {voiceState.streams.map((item) => (
          <StreamTile 
            key={item.user_id} 
            item={item} 
            speakingUsers={voiceState.speakingUsers} 
            onOpenFullscreen={(streamItem) => setFullscreenItem(streamItem)}
          />
        ))}
      </div>

      {/* Control Action Toolbar */}
      <div className="flex items-center justify-center space-x-4 bg-[#1e1f22]/90 backdrop-blur py-3 px-6 rounded-2xl border border-[#2b2d31] mt-4 self-center shadow-2xl z-10">
        {/* Mute Mic */}
        <button
          onClick={() => voiceManager.toggleMute()}
          className={`p-3.5 rounded-full transition-all transform active:scale-95 ${
            voiceState.isMuted ? 'bg-rose-500 text-white shadow-rose-500/30' : 'bg-[#2b2d31] hover:bg-[#35373c] text-white'
          }`}
          title={voiceState.isMuted ? "Unmute Mic" : "Mute Mic"}
        >
          {voiceState.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Deafen Audio */}
        <button
          onClick={() => voiceManager.toggleDeafen()}
          className={`p-3.5 rounded-full transition-all transform active:scale-95 ${
            voiceState.isDeafened ? 'bg-rose-500 text-white shadow-rose-500/30' : 'bg-[#2b2d31] hover:bg-[#35373c] text-white'
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
          className={`p-3.5 rounded-full transition-all transform active:scale-95 ${
            voiceState.isScreenSharing ? 'bg-[#5865f2] text-white shadow-indigo-500/30' : 'bg-[#2b2d31] hover:bg-[#35373c] text-white'
          }`}
          title={voiceState.isScreenSharing ? "Stop Screen Share" : "Share Screen (Full Res @ 60FPS)"}
        >
          {voiceState.isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        {/* Disconnect Voice */}
        <button
          onClick={() => voiceManager.leaveVoiceChannel()}
          className="p-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full transition-all transform active:scale-95 shadow-lg shadow-rose-600/30"
          title="Disconnect Voice"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>

      {/* Fullscreen React Theater Overlay */}
      {fullscreenItem && (
        <div className="fixed inset-0 z-50 bg-[#0b0c0e]/95 backdrop-blur-md flex flex-col justify-between p-6 animate-fadeIn">
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center space-x-3 bg-[#1e1f22]/90 border border-[#2b2d31] px-4 py-2 rounded-xl">
              <span className="font-bold text-white text-sm">{fullscreenItem.username}'s Stream</span>
              {fullscreenItem.isScreenSharing && (
                <span className="bg-[#5865f2] text-xs text-white px-2 py-0.5 rounded font-mono uppercase font-semibold">LIVE 60FPS</span>
              )}
            </div>

            <button
              onClick={() => setFullscreenItem(null)}
              className="p-2.5 bg-[#1e1f22] hover:bg-[#35373c] text-white rounded-full border border-[#3f4147] transition shadow-lg"
              title="Exit Fullscreen View (ESC)"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* High-Resolution Enlarged Video Viewport */}
          <div className="flex-1 my-4 flex items-center justify-center relative min-h-0 overflow-hidden">
            <video
              ref={(el) => {
                if (el && fullscreenItem.stream) {
                  el.srcObject = fullscreenItem.stream;
                }
              }}
              autoPlay
              playsInline
              muted={fullscreenItem.user_id === 'local'}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border border-[#2b2d31] bg-black"
            />
          </div>

          <div className="flex items-center justify-center space-x-4 z-10">
            <button
              onClick={() => setFullscreenItem(null)}
              className="px-6 py-2.5 bg-[#5865f2] hover:bg-[#4752c4] text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center space-x-2"
            >
              <Minimize className="w-4 h-4" />
              <span>Exit Fullscreen</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function StreamTile({ item, speakingUsers, onOpenFullscreen }) {
  const videoRef = useRef(null);
  const isSpeaking = speakingUsers.some(id => String(id) === String(item.user_id));
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [userVol, setUserVol] = useState(item.volume !== undefined ? item.volume : 100);

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
    <div className={`relative bg-[#1e1f22] rounded-2xl overflow-hidden border-2 flex flex-col items-center justify-center shadow-xl transition-all duration-200 aspect-video ${
      isSpeaking ? 'speaker-active border-emerald-500' : 'border-[#2b2d31]'
    }`}>

      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={item.user_id === 'local'}
          className="w-full h-full object-contain bg-black cursor-pointer"
          onClick={handleToggleFullscreen}
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-6">
          <div className={`w-20 h-20 rounded-full bg-[#2b2d31] border-4 flex items-center justify-center transition-all duration-300 ${
            isSpeaking ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-[#3f4147]'
          }`}>
            <span className="text-2xl font-bold text-white">{item.username.substring(0, 2).toUpperCase()}</span>
          </div>
        </div>
      )}

      {/* Participant Name Badge Overlay & Volume / Fullscreen Controls */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-auto">
        <div className="bg-[#111214]/80 backdrop-blur px-2.5 py-1 rounded-md text-xs font-semibold text-white flex items-center space-x-1.5 border border-[#2b2d31]">
          <span>{item.username}</span>
          {item.isScreenSharing && (
            <span className="bg-[#5865f2] text-[10px] px-1.5 py-0.5 rounded font-mono uppercase">Screen</span>
          )}
          {item.isMuted && <MicOff className="w-3 h-3 text-rose-500" />}
        </div>

        <div className="flex items-center space-x-1">
          {/* Fullscreen Video Stream Toggle */}
          {hasVideo && (
            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 bg-[#111214]/80 hover:bg-[#2b2d31] text-white rounded-md border border-[#2b2d31] transition"
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
                className="p-1.5 bg-[#111214]/80 hover:bg-[#2b2d31] text-white rounded-md border border-[#2b2d31] transition"
                title="User Volume Settings"
              >
                {userVol === 0 ? <VolumeX className="w-3.5 h-3.5 text-rose-500" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              </button>

              {showVolumeSlider && (
                <div className="absolute bottom-9 right-0 bg-[#111214] border border-[#2b2d31] rounded-lg p-3 w-44 shadow-2xl z-50 animate-fadeIn">
                  <div className="flex justify-between text-[11px] font-bold text-white mb-1.5">
                    <span>User Volume</span>
                    <span className="font-mono text-emerald-400">{userVol}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={userVol}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="w-full accent-[#5865f2]"
                  />
                  <button
                    onClick={() => handleVolumeChange(userVol === 0 ? 100 : 0)}
                    className="mt-2 w-full py-1 text-[10px] font-bold rounded bg-[#2b2d31] hover:bg-rose-500/20 text-white transition"
                  >
                    {userVol === 0 ? 'Unmute User' : 'Mute User'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


