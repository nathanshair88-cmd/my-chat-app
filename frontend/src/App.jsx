import React, { useState, useEffect, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ServerProvider, useServer } from "./context/ServerContext";
import { ThemeProvider } from "./context/ThemeContext";
import ServerSidebar from "./components/sidebar/ServerSidebar";
import NavigationDrawer from "./components/sidebar/NavigationDrawer";
import NewMessageModal from "./components/modals/NewMessageModal";
import ServerMemberList from "./components/sidebar/ServerMemberList";
import ChatArea from "./components/chat/ChatArea";
import DirectMessagesArea from "./components/chat/DirectMessagesArea";
const VoiceRoom = lazy(() => import("./components/voice/VoiceRoom"));
import GlobalVoiceAudioPlayer from "./components/voice/GlobalVoiceAudioPlayer";
import AuthModal from "./components/modals/AuthModal";
import CreateServerModal from "./components/modals/CreateServerModal";
import CreateChannelModal from "./components/modals/CreateChannelModal";
const P2PTransferModal = lazy(
  () => import("./components/p2p/P2PTransferModal"),
);
import { p2pEngine } from "./services/webrtcP2PFile";
import { notificationService } from "./services/NotificationService";
const UserSettingsModal = lazy(
  () => import("./components/modals/UserSettingsModal"),
);
import { Menu, MessageSquare, X } from "lucide-react";
import { Search, WifiOff } from "lucide-react";
import HomeDashboard from "./components/home/HomeDashboard";
import CommandPalette from "./components/CommandPalette";
import { getSocket } from "./services/socket";
import Brand from "./components/Brand";
import { voiceManager } from "./services/webrtcVoice";

function MainDashboard() {
  const { user, loading, sessionError, retrySession } = useAuth();
  const {
    viewMode,
    showVoiceGrid,
    membersListOpen,
    toggleMembersList,
    currentServer,
    currentDM,
    dmHomeTab,
    voiceState,
    currentChannel,
    servers,
    selectServer,
    selectChannel,
  } = useServer();
  const [showSearch, setShowSearch] = useState(false);
  const [toast, setToast] = useState("");
  const [connected, setConnected] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const adapt = () => setIsMobile(query.matches);
    query.addEventListener("change", adapt);
    return () => query.removeEventListener("change", adapt);
  }, []);
  useEffect(() => {
    const keyboard = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
    };
    const toastHandler = (e) => setToast(e.detail);
    window.addEventListener("keydown", keyboard);
    window.addEventListener("alto-toast", toastHandler);
    const timer = setInterval(
      () => setConnected(Boolean(getSocket()?.connected)),
      2000,
    );
    return () => {
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("alto-toast", toastHandler);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const isHome = viewMode === "home" || viewMode === "saved";

  const [serverModalMode, setServerModalMode] = useState(null); // 'create' | 'join' | null
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showP2PModal, setShowP2PModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [voiceTextChatOpen, setVoiceTextChatOpen] = useState(false);

  const closeMobileNav = () => setMobileNavOpen(false);

  useEffect(() => {
    if (!showVoiceGrid || viewMode === "dm") {
      setVoiceTextChatOpen(false);
    }
  }, [showVoiceGrid, viewMode]);

  // Automatically open P2P modal on incoming transfers
  useEffect(() => {
    const seenIncoming = new Set();
    return p2pEngine.subscribe((transfers) => {
      const incoming = transfers.filter(
        (t) => t.role === "receiver" && t.status === "pending",
      );
      let shouldOpen = false;
      incoming.forEach((t) => {
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

  if (sessionError)
    return (
      <main className="recovery-page">
        <Brand />
        <h1>A moment to reconnect.</h1>
        <p>
          We couldn’t reach your workspace. Your session and drafts are safe.
        </p>
        <button className="alto-button" onClick={retrySession}>
          Try again
        </button>
      </main>
    );

  if (!user) {
    return <AuthModal />;
  }

  const openNewMessage = () => {
    closeMobileNav();
    setShowNewMessage(true);
  };
  const navigation = (
    <ServerSidebar
      onOpenCreateServer={() => setServerModalMode("create")}
      onOpenJoinServer={() => setServerModalMode("join")}
      onOpenCreateChannel={() => setShowChannelModal(true)}
      onNavigate={closeMobileNav}
      onClose={isMobile ? closeMobileNav : undefined}
      onOpenSettings={() => setShowSettingsModal(true)}
      onNewMessage={openNewMessage}
      onSearch={() => {
        closeMobileNav();
        setShowSearch(true);
      }}
    />
  );

  return (
    <div className="flex app-shell-height w-screen p-0 bg-transparent overflow-hidden select-none relative">
      {/* Background Voice Audio Player */}
      <GlobalVoiceAudioPlayer />

      {/* Main Glass App Container */}
      <div className="alto-shell flex w-full h-full overflow-hidden relative">
        {(!isMobile || mobileNavOpen) &&
          (isMobile ? (
            <NavigationDrawer onClose={closeMobileNav}>
              {navigation}
            </NavigationDrawer>
          ) : (
            navigation
          ))}
        <div
          className={`workspace-frame ${!isHome && (viewMode !== "dm" || currentDM) ? "conversation-workspace" : ""}`}
        >
          <header className="workspace-topbar">
            <button
              className="browse-button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
              <span>Browse</span>
            </button>
            <div className="workspace-location">
              {viewMode === "home"
                ? "Home"
                : viewMode === "saved"
                  ? "Saved messages"
                  : viewMode === "dm"
                    ? currentDM
                      ? "Messages"
                      : dmHomeTab === "messages"
                        ? "Messages"
                        : "Friends"
                    : currentServer?.name}
            </div>
            <button
              className="topbar-search"
              onClick={() => setShowSearch(true)}
              aria-label="Quick search"
            >
              <Search size={18} />
              <span>Search</span>
            </button>
          </header>
          {isMobile && voiceState.channel_id && !(viewMode === 'server' && showVoiceGrid && currentChannel?.id === voiceState.channel_id) && <aside className="mobile-call-strip" aria-label="Active call">
            <button onClick={() => {
              const server = servers.find(s => s.channels?.some(c => c.id === voiceState.channel_id));
              if (server) { selectServer(server); selectChannel(server.channels.find(c => c.id === voiceState.channel_id), false); }
            }}>Call in progress <strong>Return to call</strong></button>
            <button onClick={() => voiceManager.leaveVoiceChannel()} aria-label="Leave active call">Leave</button>
          </aside>}
          {!connected && (
            <div className="connection-banner" role="status">
              <WifiOff size={15} /> Reconnecting… Your drafts are safe. Messages
              will be available when you’re back online.
            </div>
          )}
          <div className="workspace-body">
            {/* 3. Main Center Workspace (Chat or Voice/Video Grid) */}
            <div className="flex-1 flex min-w-0 h-full relative bg-surface-base/30 backdrop-blur-md">
              {isHome ? (
                <HomeDashboard
                  saved={viewMode === "saved"}
                  onCreate={() => setServerModalMode("create")}
                  onJoin={() => setServerModalMode("join")}
                  onSearch={() => setShowSearch(true)}
                />
              ) : showVoiceGrid && viewMode !== "dm" ? (
                <div className="flex-1 flex h-full min-w-0 relative overflow-hidden">
                  <Suspense
                    fallback={
                      <div className="empty-note">Opening your room...</div>
                    }
                  >
                    <VoiceRoom
                      onOpenTextChat={
                        !voiceTextChatOpen
                          ? () => setVoiceTextChatOpen(true)
                          : null
                      }
                    />
                  </Suspense>

                  {voiceTextChatOpen && (
                    <button
                      aria-label="Close voice text chat"
                      className="fixed inset-0 z-[55] bg-black/50 min-[1200px]:hidden"
                      onClick={() => setVoiceTextChatOpen(false)}
                    />
                  )}

                  {voiceTextChatOpen && (
                    <div
                      className={`fixed min-[1200px]:relative inset-y-0 ${voiceTextChatOpen && membersListOpen ? "right-0 lg:right-56 xl:right-60" : "right-0"} min-[1200px]:inset-y-auto min-[1200px]:right-auto z-[60] min-[1200px]:z-10 w-[min(92vw,28rem)] sm:w-[28rem] min-[1200px]:w-[30rem] min-[1200px]:min-w-[30rem] min-[2200px]:w-[34rem] min-[2200px]:min-w-[34rem] border-l border-surface-border flex flex-col h-dvh min-[1200px]:h-full min-h-0 bg-surface-panel shadow-2xl min-[1200px]:shadow-none transition-transform duration-200 ease-out shrink-0 ${
                        voiceTextChatOpen
                          ? "translate-x-0"
                          : "translate-x-full min-[1200px]:translate-x-0"
                      }`}
                    >
                      <div className="min-h-12 px-3 border-b border-surface-border bg-surface-panel/95 flex items-center justify-between gap-3">
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
                  )}

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
              ) : viewMode === "dm" ? (
                <DirectMessagesArea
                  onNewMessage={openNewMessage}
                  onOpenP2PModal={() => setShowP2PModal(true)}
                />
              ) : (
                <ChatArea onOpenP2PModal={() => setShowP2PModal(true)} />
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Overlays / Modals */}
      {showNewMessage && (
        <NewMessageModal onClose={() => setShowNewMessage(false)} />
      )}
      {showSearch && (
        <CommandPalette
          onClose={() => { setShowSearch(false); closeMobileNav(); }}
          onSettings={() => setShowSettingsModal(true)}
          onCreate={() => setServerModalMode("create")}
        />
      )}
      {toast && (
        <div className="alto-toast" role="status">
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {serverModalMode && (
        <CreateServerModal
          mode={serverModalMode}
          onClose={() => { setServerModalMode(null); closeMobileNav(); }}
        />
      )}
      {showChannelModal && (
        <CreateChannelModal onClose={() => { setShowChannelModal(false); closeMobileNav(); }} />
      )}
      {showP2PModal && (
        <Suspense
          fallback={
            <div className="alto-toast" role="status">
              Opening transfers...
            </div>
          }
        >
          <P2PTransferModal onClose={() => setShowP2PModal(false)} />
        </Suspense>
      )}
      {showSettingsModal && (
        <Suspense
          fallback={
            <div className="alto-toast" role="status">
              Opening settings...
            </div>
          }
        >
          <UserSettingsModal onClose={() => setShowSettingsModal(false)} />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthenticatedWorkspace />
      </AuthProvider>
    </ThemeProvider>
  );
}

function AuthenticatedWorkspace() {
  const { user } = useAuth();
  return (
    <ServerProvider key={user?.id || "signed-out"}>
      <MainDashboard />
    </ServerProvider>
  );
}
