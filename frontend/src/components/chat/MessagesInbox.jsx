import React, { useState } from "react";
import { MessageCircle, Plus, Search, ArrowRight, Inbox } from "lucide-react";
import { useServer } from "../../context/ServerContext";

export default function MessagesInbox({ onNewMessage }) {
  const { conversations, selectDM, unreadDMs, openDMHome } = useServer();
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const unread = Object.values(unreadDMs).reduce((a, b) => a + b, 0);
  const visible = conversations.filter(
    (c) =>
      (!unreadOnly || unreadDMs[c.id] > 0) &&
      c.other_user?.username?.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <main className="messages-inbox">
      <div className="inbox-heading">
        <div>
          <h1>Messages</h1>
          <p>Your conversations, all in one place.</p>
        </div>
        <button className="alto-button" onClick={onNewMessage}>
          <Plus size={18} />
          New message
        </button>
      </div>
      <div className="inbox-filters">
        <label className="inbox-search">
          <Search size={18} />
          <input
            aria-label="Search conversations"
            placeholder="Find a conversation"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="inbox-tabs" aria-label="Conversation filters">
          <button
            aria-pressed={!unreadOnly}
            onClick={() => setUnreadOnly(false)}
          >
            All
          </button>
          <button aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
            Unread{unread > 0 && <span>{unread}</span>}
          </button>
        </div>
      </div>
      <div className="inbox-list">
        {visible.map((conversation) => (
          <button
            className="inbox-conversation"
            key={conversation.id}
            onClick={() => selectDM(conversation)}
          >
            <span className="person-avatar">
              <img
                src={
                  conversation.other_user?.avatar_url || "/avatars/willow.svg"
                }
                alt=""
              />
              <i
                className={
                  conversation.other_user?.status === "online"
                    ? "online"
                    : "offline"
                }
              />
            </span>
            <span className="inbox-person">
              <strong>{conversation.other_user?.username}</strong>
              <small>
                {conversation.other_user?.status_message ||
                  (unreadDMs[conversation.id]
                    ? "New messages waiting for you"
                    : "Open conversation")}
              </small>
            </span>
            {unreadDMs[conversation.id] > 0 && (
              <span className="nav-count">{unreadDMs[conversation.id]}</span>
            )}
            <ArrowRight size={18} />
          </button>
        ))}
      </div>
      {!visible.length && (
        <div className="inbox-empty">
          <Inbox size={36} />
          <h2>
            {unreadOnly
              ? "You’re all caught up"
              : query
                ? "No conversations found"
                : "Start with a hello"}
          </h2>
          <p>
            {unreadOnly
              ? "Your other conversations are still in All."
              : query
                ? "Try another name, or start a new message."
                : "Message a friend, or find someone by their name or Alto ID."}
          </p>
          <button
            className="alto-button secondary"
            onClick={unreadOnly ? () => setUnreadOnly(false) : onNewMessage}
          >
            {unreadOnly ? "View all messages" : "New message"}
            <MessageCircle size={16} />
          </button>
        </div>
      )}
      <div className="inbox-friends-link">
        <span>Looking for a friend request?</span>
        <button onClick={() => openDMHome("requests")}>
          View requests <ArrowRight size={15} />
        </button>
      </div>
    </main>
  );
}
