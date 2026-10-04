import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useServer } from "../../context/ServerContext";
import UserContextMenu from "../modals/UserContextMenu";

export default function DMSidebar({ onNavigate, onNewMessage }) {
  const { conversations, currentDM, selectDM, unreadDMs } = useServer();
  const [contextMenu, setContextMenu] = useState(null);
  return (
    <section
      className="conversation-navigation"
      aria-label="Recent conversations"
    >
      <div className="nav-section-title">
        <span>Conversations</span>
        <button
          onClick={onNewMessage}
          title="New message"
          aria-label="New message"
        >
          <Plus size={17} />
        </button>
      </div>
      {conversations.slice(0, 8).map((conv) => (
        <button
          key={conv.id}
          className={`nav-conversation ${currentDM?.id === conv.id ? "selected" : ""}`}
          aria-current={currentDM?.id === conv.id ? "page" : undefined}
          onClick={() => {
            selectDM(conv);
            onNavigate?.();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              user: conv.other_user,
            });
          }}
        >
          <img
            src={conv.other_user?.avatar_url || "/avatars/willow.svg"}
            alt=""
          />
          <span>{conv.other_user?.username || "Member"}</span>
          {unreadDMs[conv.id] > 0 && (
            <b className="nav-count">{unreadDMs[conv.id]}</b>
          )}
        </button>
      ))}
      {!conversations.length && (
        <button className="nav-empty-action" onClick={onNewMessage}>
          Start your first conversation
        </button>
      )}
      {contextMenu && (
        <UserContextMenu
          {...contextMenu}
          contextType="dm"
          isLocalUser={false}
          onClose={() => setContextMenu(null)}
        />
      )}
    </section>
  );
}
