import React, { useEffect, useState } from "react";
import { MessageCircle, Search, X, ArrowRight } from "lucide-react";
import { useServer } from "../../context/ServerContext";
import { dmAPI } from "../../services/api";
import useDialog from "../../hooks/useDialog";

export default function NewMessageModal({ onClose }) {
  const { friendships, startDM } = useServer();
  const dialogRef = useDialog(onClose);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    setResults([]);
    if (!query.trim()) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await dmAPI.searchUsers(query.trim());
        if (active) setResults(response.data);
      } catch {
        if (active) setError("Search is unavailable. Please try again.");
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  const people = query.trim()
    ? results
    : friendships
        .filter((f) => f.status === "accepted")
        .map((f) => f.friend_user)
        .filter(Boolean);
  const message = async (person) => {
    setStarting(person.id);
    setError("");
    try {
      await startDM({ target_user_id: person.id });
      onClose();
    } catch {
      setError("Could not open the conversation. Please try again.");
    } finally {
      setStarting(null);
    }
  };
  return (
    <div
      className="navigation-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-message-title"
        tabIndex={-1}
        className="new-message-modal"
      >
        <header>
          <div>
            <h2 id="new-message-title">New message</h2>
            <p>Find someone by name or their Alto ID.</p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close new message"
          >
            <X size={20} />
          </button>
        </header>
        <label className="inbox-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Find a person"
            placeholder="Name or #ID"
            autoComplete="off"
          />
        </label>
        <div className="people-search-results" aria-live="polite">
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {searching ? (
            <p className="empty-note">Searching…</p>
          ) : (
            <>
              <h3>{query.trim() ? "Search results" : "Your friends"}</h3>
              {people.map((person) => (
                <button
                  key={person.id}
                  className="person-result"
                  disabled={starting !== null}
                  onClick={() => message(person)}
                >
                  <img
                    src={person.avatar_url || "/avatars/willow.svg"}
                    alt=""
                  />
                  <span>
                    <strong>{person.username}</strong>
                    <small>#{person.public_id || person.id}</small>
                  </span>
                  <span className="result-action">
                    {starting === person.id ? "Opening…" : "Message"}
                    <ArrowRight size={16} />
                  </span>
                </button>
              ))}
              {!people.length && (
                <div className="search-empty">
                  <MessageCircle size={28} />
                  <p>
                    {query.trim()
                      ? "No one found. Try their exact Alto ID."
                      : "Search for anyone on Alto to start a conversation."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
