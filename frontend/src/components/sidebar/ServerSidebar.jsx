import React, { useState } from "react";
import {
  Home,
  MessageCircle,
  Users,
  Bookmark,
  Plus,
  Compass,
  Search,
  ChevronDown,
  X,
} from "lucide-react";
import { useServer } from "../../context/ServerContext";
import Brand from "../Brand";
import UserWidget from "./UserWidget";
import ChannelSidebar from "./ChannelSidebar";
import DMSidebar from "./DMSidebar";

export default function ServerSidebar({
  onOpenCreateServer,
  onOpenJoinServer,
  onOpenCreateChannel,
  onOpenSettings,
  onSearch,
  onNewMessage,
  onNavigate,
  onClose,
}) {
  const {
    servers,
    currentServer,
    selectServer,
    viewMode,
    setViewMode,
    openDirectMessages,
    openDMHome,
    unreadDMs,
    unreadFriendRequests,
    currentDM,
    dmHomeTab,
  } = useServer();
  const [collapsedSpace, setCollapsedSpace] = useState(null);
  const unread = Object.values(unreadDMs || {}).reduce((a, b) => a + b, 0);
  const go = (action) => {
    action();
    onNavigate?.();
  };
  const links = [
    {
      label: "Home",
      icon: Home,
      active: viewMode === "home",
      action: () => setViewMode("home"),
    },
    {
      label: "Messages",
      icon: MessageCircle,
      active: viewMode === "dm" && (!!currentDM || dmHomeTab === "messages"),
      action: openDirectMessages,
      count: unread,
    },
    {
      label: "Friends",
      icon: Users,
      active: viewMode === "dm" && !currentDM && dmHomeTab !== "messages",
      action: () => openDMHome("friends"),
      count: unreadFriendRequests,
    },
    {
      label: "Saved",
      icon: Bookmark,
      active: viewMode === "saved",
      action: () => setViewMode("saved"),
    },
  ];
  return (
    <aside className="primary-nav unified-nav" aria-label="Main navigation">
      <div className="nav-brand-row">
        <button
          className="brand-button"
          aria-label="Alto home"
          onClick={() => go(() => setViewMode("home"))}
        >
          <Brand />
        </button>
        {onClose && (
          <button
            className="icon-button nav-close"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        )}
      </div>
      <button
        className="nav-search"
        onClick={onSearch}
        title="Search or jump to (Ctrl+K)"
      >
        <Search size={17} />
        <span>Search everything</span>
        <kbd>Ctrl K</kbd>
      </button>
      <nav className="main-links" aria-label="Your workspace">
        {links.map(({ label, icon: Icon, action, active, count }) => (
          <button
            key={label}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`nav-link ${active ? "active" : ""}`}
            onClick={() => go(action)}
          >
            <Icon size={19} />
            <span>{label}</span>
            {count > 0 && <b className="nav-count">{count}</b>}
          </button>
        ))}
      </nav>
      <div className="navigation-scroll">
        {viewMode === "dm" && (
          <DMSidebar onNavigate={onNavigate} onNewMessage={onNewMessage} />
        )}
        <div className="nav-section-title">
          <span>Your spaces</span>
          <button
            aria-label="Create a space"
            title="Create a space"
            onClick={onOpenCreateServer}
          >
            <Plus size={17} />
          </button>
        </div>
        <nav className="space-tree" aria-label="Your spaces">
          {servers.map((server, i) => {
            const active =
              viewMode === "server" && currentServer?.id === server.id;
            const expanded = active && collapsedSpace !== server.id;
            return (
              <div
                className={`space-branch ${expanded ? "expanded" : ""}`}
                key={server.id}
              >
                <button
                  title={server.name}
                  aria-label={server.name}
                  aria-expanded={expanded}
                  className={`nav-link space-switch ${expanded ? "space-active" : ""}`}
                  onClick={() => {
                    if (active) setCollapsedSpace(expanded ? server.id : null);
                    else {
                      setCollapsedSpace(null);
                      selectServer(server);
                    }
                  }}
                >
                  <span className={`nav-space-icon tint-${i % 4}`}>
                    {server.icon_url ? (
                      <img src={server.icon_url} alt="" />
                    ) : (
                      server.name.slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <span>{server.name}</span>
                  <ChevronDown size={15} className="space-chevron" />
                </button>
                {expanded && (
                  <ChannelSidebar
                    onOpenCreateChannel={onOpenCreateChannel}
                    onNavigate={onNavigate}
                  />
                )}
              </div>
            );
          })}
          {!servers.length && (
            <p className="nav-empty">
              Spaces bring group chats and voice rooms together. Create one, or
              join with an invite.
            </p>
          )}
        </nav>
        <button className="nav-link join-link" onClick={onOpenJoinServer}>
          <Compass size={18} />
          <span>Join a space</span>
        </button>
      </div>
      <div className="nav-bottom">
        <UserWidget onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}
