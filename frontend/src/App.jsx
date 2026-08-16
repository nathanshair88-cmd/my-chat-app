import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ServerProvider, useServer } from './context/ServerContext';
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
  const { viewMode, currentChannel, showVoiceGrid } = useServer();

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
      <div className="w-screen h-screen bg-[#1e1f22] flex items-center justify-center text-white font-bold text-lg select-none">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-[#5865f2] border-t-transparent animate-spin" />
          <span>Connecting to Discord Clone...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthModal />;
  }

  const renderVoiceGrid = showVoiceGrid;

  return (
    <div className="flex h-screen w-screen bg-[#1e1f22] overflow-hidden select-none">
      {/* Background Voice Audio Player */}
      <GlobalVoiceAudioPlayer />

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
      <div className="flex-1 flex min-w-0 h-full relative">
        {renderVoiceGrid ? (
          <div className="flex-1 flex flex-col lg:flex-row h-full min-w-0">
            <VoiceRoom />
            <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-[#1f2023] flex flex-col h-full">
              <ChatArea onOpenP2PModal={() => setShowP2PModal(true)} />
            </div>
          </div>
        ) : (
          <ChatArea onOpenP2PModal={() => setShowP2PModal(true)} />
        )}
      </div>

      {/* Overlays / Modals */}
      {serverModalMode && (
        <CreateServerModal
          mode={serverModalMode}
          onClose={() => setServerModalMode(null)}
        />
      )}

      {showChannelModal && (
        <CreateChannelModal
          onClose={() => setShowChannelModal(false)}
        />
      )}

      {showP2PModal && (
        <P2PTransferModal
          onClose={() => setShowP2PModal(false)}
        />
      )}

      {showSettingsModal && (
        <UserSettingsModal
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ServerProvider>
        <MainDashboard />
      </ServerProvider>
    </AuthProvider>
  );
}
