import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ServerProvider, useServer } from './context/ServerContext';
import { ThemeProvider } from './context/ThemeContext';
import ServerSidebar from './components/sidebar/ServerSidebar';
import ChannelSidebar from './components/sidebar/ChannelSidebar';
import DMSidebar from './components/sidebar/DMSidebar';
import ServerMemberList from './components/sidebar/ServerMemberList';
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
import { Menu, MessageSquare, X } from 'lucide-react';

function MainDashboard() {
  const { user, loading } = useAuth();
  const { viewMode, showVoiceGrid, membersListOpen, toggleMembersList } = useServer();

  const [serverModalMode, setServerModalMode] = useState(null); // 'create' | 'join' | null
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showP2PModal, setShowP2PModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [voiceTextChatOpen, setVoiceTextChatOpen] = useState(false);

  const closeMobileNav = () => setMobileNavOpen(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [viewMode]);

  useEffect(() => {
    if (!showVoiceGrid || viewMode === 'dm') {
      setVoiceTextChatOpen(false);
    }
  }, [showVoiceGrid, viewMode]);

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
            <div className="flex-1 flex h-full min-w-0 relative overflow-hidden">
              <VoiceRoom />

              {!voiceTextChatOpen && (
                <button
                  aria-label="Open voice text chat"
                  onClick={() => setVoiceTextChatOpen(true)}
                  className={`xl:hidden absolute top-3 z-20 mobile-touch-target rounded-md border border-surface-border bg-accent-primary text-text-primary shadow-lg shadow-indigo-500/20 backdrop-blur flex items-center gap-2 px-3 text-sm font-semibold ${
                    membersListOpen ? 'right-3 lg:right-60' : 'right-3'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">Text Chat</span>
                </button>
              )}

              {voiceTextChatOpen && (
                <button
                  aria-label="Close voice text chat"
                  className="fixed inset-0 z-[55] bg-black/50 xl:hidden"
                  onClick={() => setVoiceTextChatOpen(false)}
                />
              )}

              <div className={`fixed xl:relative inset-y-0 right-0 z-[60] xl:z-10 w-[min(92vw,28rem)] sm:w-[28rem] xl:w-[30rem] xl:min-w-[30rem] 2xl:w-[34rem] 2xl:min-w-[34rem] border-l border-surface-border flex flex-col h-dvh xl:h-full min-h-0 bg-surface-panel shadow-2xl xl:shadow-none transition-transform duration-200 ease-out shrink-0 ${
                voiceTextChatOpen ? 'translate-x-0' : 'translate-x-full xl:translate-x-0'
              }`}>
                <div className="xl:hidden min-h-12 px-3 border-b border-surface-border bg-surface-panel/95 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 text-text-primary font-semibold">
                    <MessageSquare className="w-4 h-4 text-accent-primary shrink-0" />
                    <span className="truncate">Voice Text Chat</span>
                  </div>
                  <button
                    aria-label="Close voice text chat"
                    onClick={() => setVoiceTextChatOpen(false)}
                    className="mobile-touch-target rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <ChatArea
                  onOpenP2PModal={() => setShowP2PModal(true)}
                  showMemberList={false}
                  compact
                />
              </div>

              {membersListOpen && (
                <>
                  <button
                    aria-label="Hide members"
                    className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    onClick={toggleMembersList}
                  />
                  <ServerMemberList onClose={toggleMembersList} />
                </>
              )}
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
