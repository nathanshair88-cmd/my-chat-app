import React, { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Users,
  MessageCircle,
  Headphones,
  Bookmark,
  Compass,
  Sparkles,
  Check,
  Copy,
  Trash2,
  Search,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useServer } from "../../context/ServerContext";
import {
  useLocalCollection,
  savedKey,
  notify,
} from "../../services/localWorkspace";

export default function HomeDashboard({
  onCreate,
  onJoin,
  onSearch,
  saved = false,
}) {
  const { user } = useAuth();
  const {
    servers,
    selectServer,
    selectChannel,
    conversations,
    selectDM,
    openDMHome,
    unreadChannels,
    unreadDMs,
    friendships,
    setViewMode,
    spacesLoading,
    spacesError,
    fetchServers,
  } = useServer();
  const [bookmarks, setBookmarks] = useLocalCollection(savedKey(user.id));
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const friends = friendships.filter((f) => f.status === "accepted");
  const unread =
    Object.values(unreadChannels).reduce((a, b) => a + b, 0) +
    Object.values(unreadDMs).reduce((a, b) => a + b, 0);
  const rooms = servers.flatMap((server) =>
    (server.channels || [])
      .filter((c) => c.type === "voice" || c.type === "media")
      .map((channel) => ({ server, channel })),
  );
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(user.public_id || String(user.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify("Could not copy your ID. You can find it in your profile.");
    }
  };

  if (saved)
    return (
      <div className="home-scroll">
        <div className="home-page saved-page">
          <div className="eyebrow">YOUR PERSONAL COLLECTION</div>
          <h1>
            Worth keeping<span className="accent-dot">.</span>
          </h1>
          <p className="page-subtitle">
            Good ideas, useful links, and the messages you want to come back to.
          </p>
          <label className="collection-search">
            <Search size={18} />
            <input
              aria-label="Search saved messages"
              placeholder="Find something you saved…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="saved-list">
            {bookmarks
              .filter((b) =>
                `${b.content} ${b.author} ${b.location}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((b) => (
                <article className="saved-card" key={b.key}>
                  <div className="section-heading">
                    <span>
                      <Bookmark size={15} /> {b.location}
                    </span>
                    <button
                      className="icon-button"
                      aria-label={`Remove saved message from ${b.author}`}
                      onClick={() =>
                        setBookmarks(
                          bookmarks.filter((item) => item.key !== b.key),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="saved-content">
                    {b.content || "Attachment message"}
                  </p>
                  <div className="saved-meta">
                    <strong>{b.author}</strong>
                    <span>{new Date(b.created_at).toLocaleDateString()}</span>
                  </div>
                </article>
              ))}
          </div>
          {bookmarks.length === 0 && (
            <div className="large-empty">
              <Bookmark size={34} />
              <h2>A little space for the good stuff.</h2>
              <p>Use the bookmark button on any message to keep it here.</p>
              <button
                className="alto-button secondary"
                onClick={() => setViewMode("home")}
              >
                Back to home <ArrowRight size={16} />
              </button>
            </div>
          )}
          {bookmarks.length > 0 &&
            !bookmarks.some((b) =>
              `${b.content} ${b.author} ${b.location}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            ) && (
              <p className="empty-note">
                No saved messages match “{query}”. Try a different search.
              </p>
            )}
          <p className="local-note">
            Your collection is saved in this browser, for this account.
          </p>
        </div>
      </div>
    );

  return (
    <div className="home-scroll">
      <div className="home-page">
        <div className="home-greeting">
          <div>
            <div className="eyebrow">YOUR DAILY DOSE OF CONNECTION</div>
            <h1>
              {greeting}, <span>{user.username}</span>
              <span className="accent-dot">.</span>
            </h1>
            <p className="page-subtitle">
              A little less noise. A little more together.
            </p>
          </div>
          <span className="date-pill">
            {new Date().toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        {spacesError && (
          <div className="inline-error" role="alert">
            {spacesError}
            <button onClick={fetchServers}>Try again</button>
          </div>
        )}
        {spacesLoading && (
          <div className="empty-note" role="status">
            Finding your spaces...
          </div>
        )}
        <div className="home-columns">
          <div className="home-main">
            <section className="welcome-card">
              <div className="welcome-copy">
                <span className="feature-pill">
                  <span /> MAKE ROOM FOR YOUR PEOPLE
                </span>
                <h2>
                  Great things start
                  <br />
                  with a hello.
                </h2>
                <p>
                  Your next late-night conversation, big idea,
                  <br className="desktop-break" /> or just-one-more game starts
                  here.
                </p>
                <button className="alto-button dark-button" onClick={onCreate}>
                  Create a space <ArrowUpRight size={17} />
                </button>
              </div>
              <div className="orbit-art" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="orbit orbit-three" />
                <div className="orbit-core">
                  <Sparkles strokeWidth={1.3} />
                </div>
                <span className="art-label art-label-one">
                  <MessageCircle size={17} /> good company
                </span>
                <span className="art-label art-label-two">
                  <Headphones size={16} /> on your wavelength
                </span>
                <span className="orbit-dot" />
              </div>
            </section>
            <div className="quick-actions">
              <button onClick={() => openDMHome("friends")}>
                <span className="action-icon peach">
                  <Users size={19} />
                </span>
                <span>
                  Find your people<small>Friends & conversations</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
              <button onClick={onJoin}>
                <span className="action-icon lilac">
                  <Compass size={19} />
                </span>
                <span>
                  Join a space<small>An invite is all you need</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            </div>
            <section>
              <div className="section-heading">
                <h2>
                  Your spaces{" "}
                  <span className="count-chip">{servers.length}</span>
                </h2>
                <button onClick={onCreate}>
                  <Plus size={15} /> New space
                </button>
              </div>
              <div className="space-grid">
                {servers.map((server, i) => (
                  <button
                    className="space-card"
                    key={server.id}
                    onClick={() => selectServer(server)}
                  >
                    <div className={`space-cover cover-${i % 4}`}>
                      <div className="cover-sculpture" />
                      <span className="space-cover-label">
                        A SPACE TO BELONG
                      </span>
                      <ArrowUpRight size={20} />
                    </div>
                    <div className="space-card-body">
                      <span className={`space-avatar tint-${i % 4}`}>
                        {server.icon_url ? (
                          <img src={server.icon_url} alt="" />
                        ) : (
                          server.name.slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <h3>{server.name}</h3>
                      <p>
                        {server.members?.length || 1} member
                        {server.members?.length === 1 ? "" : "s"}
                        <span>·</span>
                        {server.channels?.length || 0} channels
                      </p>
                    </div>
                  </button>
                ))}
                <button
                  className="space-card create-space-card"
                  onClick={onCreate}
                >
                  <span>
                    <Plus size={25} />
                  </span>
                  <h3>Something of your own.</h3>
                  <p>Bring your favourite people together.</p>
                  <span className="text-link">
                    Create a space <ArrowRight size={15} />
                  </span>
                </button>
              </div>
            </section>
            <section className="recent-section">
              <div className="section-heading">
                <h2>Pick up the conversation</h2>
                <button onClick={() => openDMHome("friends")}>
                  View friends <ArrowRight size={15} />
                </button>
              </div>
              {conversations.length ? (
                <div className="conversation-list">
                  {conversations.slice(0, 4).map((c) => (
                    <button key={c.id} onClick={() => selectDM(c)}>
                      <span className="person-avatar">
                        {c.other_user?.avatar_url ? (
                          <img src={c.other_user.avatar_url} alt="" />
                        ) : (
                          c.other_user?.username?.[0]
                        )}
                      </span>
                      <span>
                        <strong>{c.other_user?.username}</strong>
                        <small>
                          {c.other_user?.status_message ||
                            "Keep the conversation going"}
                        </small>
                      </span>
                      {unreadDMs[c.id] > 0 && (
                        <span className="nav-count">{unreadDMs[c.id]}</span>
                      )}
                      <ArrowUpRight size={17} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="conversation-empty">
                  <MessageCircle size={26} />
                  <div>
                    <h3>Every friendship starts somewhere.</h3>
                    <p>Add a friend to start your first conversation.</p>
                  </div>
                  <button
                    className="alto-button secondary"
                    onClick={() => openDMHome("friends")}
                  >
                    Find a friend <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </section>
          </div>
          <aside className="home-aside">
            <section className="aside-card caught-up">
              <span className="status-orb">
                <Check size={22} />
              </span>
              <h3>
                {unread
                  ? `${unread} new message${unread === 1 ? "" : "s"}`
                  : "Room to breathe."}
              </h3>
              <p>
                {unread
                  ? "Your people have something to say. Jump back in when you’re ready."
                  : "You’re all caught up. Find your people or make a little space for something new."}
              </p>
              <div className="mini-stats">
                <div>
                  <strong>{servers.length}</strong>
                  <span>spaces</span>
                </div>
                <div>
                  <strong>{friends.length}</strong>
                  <span>friends</span>
                </div>
                <div>
                  <strong>{bookmarks.length}</strong>
                  <span>saved</span>
                </div>
              </div>
            </section>
            <section className="aside-card voice-discovery">
              <div className="section-heading">
                <h2>
                  <Headphones size={17} /> Drop in, hang out
                </h2>
              </div>
              <p>No calendar invite needed.</p>
              {rooms.slice(0, 3).map(({ server, channel }) => (
                <button
                  className="room-row"
                  key={channel.id}
                  onClick={() => {
                    selectServer(server);
                    selectChannel(channel);
                  }}
                >
                  <span className="room-icon">
                    <Headphones size={17} />
                  </span>
                  <span>
                    <strong>{channel.name}</strong>
                    <small>{server.name}</small>
                  </span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
              {rooms.length === 0 && (
                <p className="empty-note">
                  Voice rooms will appear here when you join a space.
                </p>
              )}
            </section>
            <section className="aside-card your-id">
              <span className="eyebrow">BETTER WITH FRIENDS</span>
              <h3>Send a little hello.</h3>
              <p>Share your ID so your people can find you.</p>
              <button className="copy-id" onClick={copyId}>
                <span>#{user.public_id || user.id}</span>
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </section>
            <button className="keyboard-tip" onClick={onSearch}>
              <span>
                <Sparkles size={16} /> Take the shortcut
              </span>
              <p>Jump to any space or conversation.</p>
              <kbd>Ctrl</kbd> <kbd>K</kbd>
            </button>
          </aside>
        </div>
        <footer className="home-footer">
          <span>MADE FOR YOUR KIND OF TOGETHER.</span>
          <span>
            Make yourself at home. <span className="accent-dot">✳</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
