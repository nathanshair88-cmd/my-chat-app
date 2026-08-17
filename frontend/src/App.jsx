import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ServerProvider, useServer } from './context/ServerContext';
import { ThemeProvider } from './context/ThemeContext';
import ServerSidebar from './components/sidebar/ServerSidebar';
import ChannelSidebar from './components/sidebar/ChannelSidebar';
import DMSidebar from './components/sidebar/DMSidebar';
import ChatArea from './components/chat/ChatArea';
import DirectMessagesArea from './components/chat/DirectMessagesArea';
import VoiceRoom from './components/voice/VoiceRoom';
import GlobalVoiceAudioPlayer from './components/voice/GlobalVoiceAudioPlayer';
import AuthModal from './components/modals/AuthModal';
import CreateServerModal from './components/modals/CreateServerModal';
import CreateChannelModal from './components/modals/CreateChannelModal';
import P2PTransferModal from './components/p2p/P2PTransferModal';
import { p2pEngine } from './services/webrtcP2PFile';
import { notificationService } from './services/NotificationService';
import UserSettingsModal from './components/modals/UserSettingsModal';
import { Menu } from 'lucide-react';

function MainDashboard() {
  const { user, loading } = useAuth();
  const { viewMode, showVoiceGrid } = useServer();

  const [serverModalMode, setServerModalMode] = useState(null); // 'create' | 'join' | null
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showP2PModal, setShowP2PModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = () => setMobileNavOpen(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [viewMode]);

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
      <div className="w-screen app-shell-height bg-surface-base flex items-center justify-center text-text-primary font-bold text-lg select-none">
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
    <div className="flex app-shell-height w-screen p-0 bg-transparent overflow-hidden select-none relative">
      {/* Background Voice Audio Player */}
      <GlobalVoiceAudioPlayer />

      {/* Main Glass App Container */}
      <div className="flex w-full h-full glass-panel rounded-none overflow-hidden relative transition-all duration-300">
        
        {/* 1. Leftmost Server Rail */}
        <ServerSidebar
          onOpenCreateServer={() => setServerModalMode('create')}
          onOpenJoinServer={() => setServerModalMode('join')}
          onNavigate={closeMobileNav}
        />

        {/* 2. Channel or DM Navigation Sidebar */}
        {mobileNavOpen && (
          <button
            aria-label="Close navigation"
            className="fixed inset-y-0 left-14 right-0 z-20 bg-black/50 md:hidden"
            onClick={closeMobileNav}
          />
        )}

        <div className={`fixed md:relative left-14 md:left-auto top-0 bottom-0 md:top-auto md:bottom-auto z-30 md:z-10 h-dvh md:h-full shrink-0 transition-transform duration-200 ease-out ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-[120%] md:translate-x-0'
        }`}>
          {viewMode === 'dm' ? (
            <DMSidebar onOpenSettings={() => setShowSettingsModal(true)} onNavigate={closeMobileNav} />
          ) : (
            <ChannelSidebar
              onOpenCreateChannel={() => setShowChannelModal(true)}
              onOpenSettings={() => setShowSettingsModal(true)}
              onNavigate={closeMobileNav}
            />
          )}
        </div>

        {!mobileNavOpen && (
          <button
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden absolute top-2 left-[4.25rem] z-40 mobile-touch-target rounded-md border border-surface-border bg-surface-active/90 text-text-primary shadow-lg backdrop-blur flex items-center justify-center"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* 3. Main Center Workspace (Chat or Voice/Video Grid) */}
        <div className="flex-1 flex min-w-0 h-full relative bg-surface-base/30 backdrop-blur-md">
          {showVoiceGrid && viewMode !== 'dm' ? (
            <div className="flex-1 flex flex-col xl:flex-row h-full min-w-0">
              <VoiceRoom />
              <div className="w-full xl:w-96 border-t xl:border-t-0 xl:border-l border-surface-border flex flex-col h-[42%] xl:h-full min-h-0 bg-surface-panel/40">
                <ChatArea onOpenP2PModal={() => setShowP2PModal(true)} />
              </div>
            </div>
          ) : viewMode === 'dm' ? (
            <DirectMessagesArea onOpenP2PModal={() => setShowP2PModal(true)} />
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
