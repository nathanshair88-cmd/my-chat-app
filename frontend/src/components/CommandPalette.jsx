import useDialog from "../hooks/useDialog";
import React, { useEffect, useRef, useState } from "react";
import {
  Search,
  Hash,
  MessageCircle,
  Home,
  Bookmark,
  Settings,
  Plus,
  ArrowUpRight,
  X,
} from "lucide-react";
import { useServer } from "../context/ServerContext";

export default function CommandPalette({ onClose, onSettings, onCreate }) {
  const {
    servers,
    conversations,
    selectServer,
    selectChannel,
    selectDM,
    setViewMode,
  } = useServer();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef(null);
  const dialogRef = useDialog(onClose);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const items = [
    {
      id: "home",
      label: "Go home",
      group: "Navigation",
      icon: Home,
      action: () => setViewMode("home"),
    },
    {
      id: "saved",
      label: "Saved messages",
      group: "Navigation",
      icon: Bookmark,
      action: () => setViewMode("saved"),
    },
    {
      id: "settings",
      label: "Settings & preferences",
      group: "Actions",
      icon: Settings,
      action: onSettings,
    },
    {
      id: "create",
      label: "Create a space",
      group: "Actions",
      icon: Plus,
      action: onCreate,
    },
    ...servers.flatMap((s) =>
      (s.channels || []).map((c) => ({
        id: `ch-${c.id}`,
        label: c.name,
        group: s.name,
        icon: Hash,
        action: () => {
          selectServer(s);
          selectChannel(c, false);
        },
      })),
    ),
    ...conversations.map((c) => ({
      id: `dm-${c.id}`,
      label: c.other_user?.username || "Conversation",
      group: "Messages",
      icon: MessageCircle,
      action: () => selectDM(c),
    })),
  ]
    .filter((item) =>
      `${item.label} ${item.group}`.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 16);
  const run = (item) => {
    if (item) {
      item.action();
      onClose();
    }
  };
  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a conversation"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, items.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(i - 1, 0));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            run(items[index]);
          }
        }}
      >
        <div className="palette-input">
          <Search size={21} />
          <input
            ref={input}
            aria-label="Search spaces, channels, and people"
            placeholder="Where would you like to go?"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
          />
          <button
            className="icon-button"
            aria-label="Close search"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="palette-results">
          {items.map((item, i) => (
            <button
              className={i === index ? "selected" : ""}
              key={item.id}
              onClick={() => run(item)}
            >
              <span className="palette-result-icon">
                <item.icon size={19} />
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.group}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
          {items.length === 0 && (
            <div className="empty-note">
              No matches for “{query}”. Try a person, channel, or space.
            </div>
          )}
        </div>
        <footer>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to navigate
          </span>
          <span>
            <kbd>↵</kbd> to open
          </span>
          <span>
            <kbd>esc</kbd> to close
          </span>
        </footer>
      </section>
    </div>
  );
}
