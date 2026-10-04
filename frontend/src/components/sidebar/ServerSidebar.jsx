import React from "react";
import {
  Home,
  MessageCircle,
  Users,
  Bookmark,
  Plus,
  Compass,
  Search,
  ArrowUpRight,
} from "lucide-react";
import { useServer } from "../../context/ServerContext";
import Brand from "../Brand";
import UserWidget from "./UserWidget";

export default function ServerSidebar({
  onOpenCreateServer,
  onOpenJoinServer,
  onOpenSettings,
  onSearch,
  onNavigate,
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
  } = useServer();
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
      active: viewMode === "dm" && !!currentDM,
      action: openDirectMessages,
      count: unread,
    },
    {
      label: "Friends",
      icon: Users,
      active: viewMode === "dm" && !currentDM,
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
    <aside className="primary-nav" aria-label="Main navigation">
      <button
        className="brand-button"
        aria-label="Alto home"
        onClick={() => go(() => setViewMode("home"))}
      >
        <Brand />
      </button>
      <button
        className="nav-search"
        onClick={onSearch}
        title="Search or jump to (Ctrl+K)"
      >
        <Search size={17} />
        <span>Jump to…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <nav className="main-links">
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
      <div className="nav-section-title">
        <span>YOUR SPACES</span>
        <button
          aria-label="Create a space"
          title="Create a space"
          onClick={onOpenCreateServer}
        >
          <Plus size={16} />
        </button>
      </div>
      <nav className="space-nav">
        {servers.map((server, i) => (
          <button
            key={server.id}
            title={server.name}
            aria-label={server.name}
            aria-current={
              viewMode === "server" && currentServer?.id === server.id
                ? "page"
                : undefined
            }
            className={`nav-link ${viewMode === "server" && currentServer?.id === server.id ? "active space-active" : ""}`}
            onClick={() => go(() => selectServer(server))}
          >
            <span className={`nav-space-icon tint-${i % 4}`}>
              {server.icon_url ? (
                <img src={server.icon_url} alt="" />
              ) : (
                server.name.slice(0, 2).toUpperCase()
              )}
            </span>
            <span>{server.name}</span>
          </button>
        ))}
        <button
          className="nav-link join-link"
          title="Join a space"
          onClick={onOpenJoinServer}
        >
          <Compass size={19} />
          <span>Join a space</span>
        </button>
      </nav>
      <div className="nav-bottom">
        <div className="nav-invite-card">
          <span className="invite-spark">✳</span>
          <strong>Your people. Your space.</strong>
          <p>Build a corner of the internet that feels like you.</p>
          <button onClick={onOpenCreateServer}>
            Make it yours <ArrowUpRight size={15} />
          </button>
        </div>
        <UserWidget onOpenSettings={onOpenSettings} />
      </div>
    </aside>
  );
}
