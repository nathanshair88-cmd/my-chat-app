import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ServerProvider, useServer } from './context/ServerContext';
import { ThemeProvider } from './context/ThemeContext';
import ServerSidebar from './components/sidebar/ServerSidebar';
import ChannelSidebar from './components/sidebar/ChannelSidebar';
import DMSidebar from './components/sidebar/DMSidebar';
import ChatArea from './components/chat/ChatArea';
import VoiceRoom from './components/voice/VoiceRoom';
import GlobalVoiceAudioPlayer from './components/voice/GlobalVoiceAudioPlayer';
import AuthModal from './components/modals/AuthModal';
import CreateServerModal from './components/modals/CreateServerModal';
import CreateChannelModal from './components/modals/CreateChannelModal';
import P2PTransferModal from './components/p2p/P2PTransferModal';
import { p2pEngine } from './services/webrtcP2PFile';
import { notificationService } from './services/NotificationService';
import UserSettingsModal from './components/modals/UserSettingsModal';

function MainDashboard() {
  const { user, loading } = useAuth();
  const { viewMode, showVoiceGrid } = useServer();

  const [serverModalMode, setServerModalMode] = useState(null); // 'create' | 'join' | null
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showP2PModal, setShowP2PModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Automatically open P2P modal on incoming transfers
  useEffect(() => {
    const seenIncoming = new Set();
    return p2pEngine.subscribe((transfers) => {
      const incoming = transfers.filter(t => t.role === 'receiver' && t.status === 'pending');
      let shouldOpen = false;
      incoming.forEach(t => {
        if (!seenIncoming.has(t.transfer_id)) {
          seenIncoming.add(t.transfer_id);
          shouldOpen = true;
          notificationService.playNotificationChime();
        }
      });
      if (shouldOpen) {
        setShowP2PModal(true);
      }
    });
  }, []);

  if (loading) {
    return (
      <div className="w-screen h-screen bg-surface-base flex items-center justify-center text-text-primary font-bold text-lg select-none">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-accent-primary border-t-transparent animate-spin" />
          <span>Connecting to Workspace...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthModal />;
  }

  return (
    <div className="flex h-screen w-screen p-0 sm:p-2 md:p-4 bg-transparent overflow-hidden select-none relative">
      {/* Background Voice Audio Player */}
      <GlobalVoiceAudioPlayer />

      {/* Main Glass App Container */}
      <div className="flex w-full h-full glass-panel sm:rounded-2xl overflow-hidden shadow-2xl relative border border-surface-border transition-all duration-300">
        
        {/* 1. Leftmost Server Rail */}
        <ServerSidebar
          onOpenCreateServer={() => setServerModalMode('create')}
          onOpenJoinServer={() => setServerModalMode('join')}
        />

        {/* 2. Channel or DM Navigation Sidebar */}
        {viewMode === 'dm' ? (
          <DMSidebar onOpenSettings={() => setShowSettingsModal(true)} />
        ) : (
          <ChannelSidebar
            onOpenCreateChannel={() => setShowChannelModal(true)}
            onOpenSettings={() => setShowSettingsModal(true)}
          />
        )}

        {/* 3. Main Center Workspace (Chat or Voice/Video Grid) */}
        <div className="flex-1 flex min-w-0 h-full relative bg-surface-base/30 backdrop-blur-md">
          {showVoiceGrid ? (
            <div className="flex-1 flex flex-col lg:flex-row h-full min-w-0">
              <VoiceRoom />
              <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-surface-border flex flex-col h-full bg-surface-panel/40">
                <ChatArea onOpenP2PModal={() => setShowP2PModal(true)} />
              </div>
            </div>
          ) : (
            <ChatArea onOpenP2PModal={() => setShowP2PModal(true)} />
          )}
        </div>
      </div>

      {/* Overlays / Modals */}
      {serverModalMode && <CreateServerModal mode={serverModalMode} onClose={() => setServerModalMode(null)} />}
      {showChannelModal && <CreateChannelModal onClose={() => setShowChannelModal(false)} />}
      {showP2PModal && <P2PTransferModal onClose={() => setShowP2PModal(false)} />}
      {showSettingsModal && <UserSettingsModal onClose={() => setShowSettingsModal(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ServerProvider>
          <MainDashboard />
        </ServerProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
