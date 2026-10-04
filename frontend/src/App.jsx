import React, { useState, useEffect, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ServerProvider, useServer } from "./context/ServerContext";
import { ThemeProvider } from "./context/ThemeContext";
import ServerSidebar from "./components/sidebar/ServerSidebar";
import ChannelSidebar from "./components/sidebar/ChannelSidebar";
import DMSidebar from "./components/sidebar/DMSidebar";
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
import { Search, Sparkles, ArrowUpRight, WifiOff } from "lucide-react";
import HomeDashboard from "./components/home/HomeDashboard";
import CommandPalette from "./components/CommandPalette";
import { getSocket } from "./services/socket";
import Brand from "./components/Brand";

function MainDashboard() {
  const { user, loading, sessionError, retrySession } = useAuth();
  const {
    viewMode,
    showVoiceGrid,
    membersListOpen,
    toggleMembersList,
    currentServer,
  } = useServer();
  const [showSearch, setShowSearch] = useState(false);
  const [toast, setToast] = useState("");
  const [connected, setConnected] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [wideVoiceLayout, setWideVoiceLayout] = useState(() => window.innerWidth >= 1800);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const adapt = () => setIsMobile(query.matches);
    query.addEventListener("change", adapt);
    return () => query.removeEventListener("change", adapt);
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1800px)");
    const adapt = () => setWideVoiceLayout(query.matches);
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [voiceTextChatOpen, setVoiceTextChatOpen] = useState(false);

  const closeMobileNav = () => setMobileNavOpen(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [viewMode]);

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

  return (
    <div className="flex app-shell-height w-screen p-0 bg-transparent overflow-hidden select-none relative">
      {/* Background Voice Audio Player */}
      <GlobalVoiceAudioPlayer />

      {/* Main Glass App Container */}
      <div className="alto-shell flex w-full h-full overflow-hidden relative">
        {/* 1. Leftmost Server Rail */}
        <ServerSidebar
          onOpenCreateServer={() => setServerModalMode("create")}
          onOpenJoinServer={() => setServerModalMode("join")}
          onNavigate={closeMobileNav}
          onOpenSettings={() => setShowSettingsModal(true)}
          onSearch={() => setShowSearch(true)}
        />

        <div className="workspace-frame">
          <header className="workspace-topbar">
            <div className="workspace-breadcrumb">
              <span>YOUR WORKSPACE</span>
              <span>/</span>
              <strong>
                {viewMode === "home"
                  ? "Home"
                  : viewMode === "saved"
                    ? "Saved"
                    : viewMode === "dm"
                      ? "Your people"
                      : currentServer?.name || "Spaces"}
              </strong>
            </div>
            <div className="topbar-actions">
              <button
                onClick={() => setShowSearch(true)}
                title="Quick search"
                aria-label="Quick search"
              >
                <Search size={18} />
              </button>
              <span className="topbar-divider" />
              <button
                className="topbar-create"
                onClick={() => setServerModalMode("create")}
              >
                Create a space <ArrowUpRight size={15} />
              </button>
              <Sparkles className="topbar-spark" size={18} />
            </div>
          </header>
          {!connected && (
            <div className="connection-banner" role="status">
              <WifiOff size={15} /> Reconnecting… Your drafts are safe. Messages
              will be available when you’re back online.
            </div>
          )}
          <div className="workspace-body">
            {/* 2. Channel or DM Navigation Sidebar */}
            {mobileNavOpen && (
              <button
                aria-label="Close navigation"
                className="fixed inset-y-0 left-14 right-0 z-20 bg-black/50 md:hidden"
                onClick={closeMobileNav}
              />
            )}

            {!isHome && (!isMobile || mobileNavOpen) && (
              <div
                className={`secondary-nav fixed md:relative left-14 md:left-auto top-0 bottom-0 md:top-auto md:bottom-auto z-30 md:z-10 h-dvh md:h-full shrink-0 transition-transform duration-200 ease-out ${
                  mobileNavOpen
                    ? "translate-x-0"
                    : "-translate-x-[120%] md:translate-x-0"
                }`}
              >
                {viewMode === "dm" ? (
                  <DMSidebar
                    onOpenSettings={() => setShowSettingsModal(true)}
                    onNavigate={closeMobileNav}
                  />
                ) : (
                  <ChannelSidebar
                    onOpenCreateChannel={() => setShowChannelModal(true)}
                    onOpenSettings={() => setShowSettingsModal(true)}
                    onNavigate={closeMobileNav}
                  />
                )}
              </div>
            )}

            {!isHome && !mobileNavOpen && (
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
                    <VoiceRoom onOpenTextChat={!wideVoiceLayout && !voiceTextChatOpen ? () => setVoiceTextChatOpen(true) : null} />
                  </Suspense>

                  {voiceTextChatOpen && (
                    <button
                      aria-label="Close voice text chat"
                      className="fixed inset-0 z-[55] bg-black/50 min-[1800px]:hidden"
                      onClick={() => setVoiceTextChatOpen(false)}
                    />
                  )}

                  {(voiceTextChatOpen || wideVoiceLayout) && <div
                    className={`fixed min-[1800px]:relative inset-y-0 ${voiceTextChatOpen && membersListOpen ? "right-0 lg:right-56 xl:right-60" : "right-0"} min-[1800px]:inset-y-auto min-[1800px]:right-auto z-[60] min-[1800px]:z-10 w-[min(92vw,28rem)] sm:w-[28rem] min-[1800px]:w-[30rem] min-[1800px]:min-w-[30rem] min-[2200px]:w-[34rem] min-[2200px]:min-w-[34rem] border-l border-surface-border flex flex-col h-dvh min-[1800px]:h-full min-h-0 bg-surface-panel shadow-2xl min-[1800px]:shadow-none transition-transform duration-200 ease-out shrink-0 ${
                      voiceTextChatOpen
                        ? "translate-x-0"
                        : "translate-x-full min-[1800px]:translate-x-0"
                    }`}
                  >
                    <div className="min-[1800px]:hidden min-h-12 px-3 border-b border-surface-border bg-surface-panel/95 flex items-center justify-between gap-3">
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
                  </div>}

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
      {showSearch && (
        <CommandPalette
          onClose={() => setShowSearch(false)}
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
          onClose={() => setServerModalMode(null)}
        />
      )}
      {showChannelModal && (
        <CreateChannelModal onClose={() => setShowChannelModal(false)} />
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
