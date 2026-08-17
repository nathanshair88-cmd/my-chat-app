import React, { useEffect, useState } from 'react';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { dmAPI, friendsAPI } from '../../services/api';
import UserWidget from './UserWidget';
import UserContextMenu from '../modals/UserContextMenu';
import { Inbox, MessageCircle, Plus, Search, Users, X } from 'lucide-react';

const getStatusColor = (status) => {
  switch (status) {
    case 'online': return 'bg-green-500';
    case 'idle': return 'bg-yellow-500';
    case 'dnd': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
};

const avatarFor = (user) => (
  user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user?.username || 'user')}`
);

export default function DMSidebar({ onOpenSettings }) {
  const {
    conversations,
    currentDM,
    dmHomeTab,
    openDMHome,
    selectDM,
    startDM,
    unreadDMs
  } = useServer();
  const { user } = useAuth();

  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [friendships, setFriendships] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);

  const conversationList = conversations || [];
  const incomingRequestCount = friendships.filter(
    item => item.status === 'pending' && item.friend_id === user?.id
  ).length;

  useEffect(() => {
    let cancelled = false;

    const fetchFriendships = async () => {
      try {
        const res = await friendsAPI.getFriends();
        if (!cancelled) {
          setFriendships(Array.isArray(res.data) ? res.data : []);
        }
      } catch (err) {
        console.error('Error fetching friend requests:', err);
        if (!cancelled) setFriendships([]);
      }
    };

    fetchFriendships();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      setSearchError('');
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const res = await dmAPI.searchUsers(q);
      setSearchResults(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error searching users:', err);
      setSearchResults([]);
      setSearchError(err.response?.data?.detail || 'Could not search users');
    } finally {
      setSearching(false);
    }
  };

  const handleStartDM = async (targetUser) => {
    try {
      await startDM({ target_user_id: targetUser.id });
      setShowSearchModal(false);
      setSearchQuery('');
      setSearchResults([]);
      setSearchError('');
    } catch (err) {
      console.error('Failed to start DM:', err);
    }
  };

  const closeSearch = () => {
    setShowSearchModal(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
  };

  return (
    <div className="w-64 bg-surface-panel flex flex-col h-full border-r border-surface-border select-none">
      <div className="p-3 border-b border-surface-border shadow-sm">
        <button
          onClick={() => setShowSearchModal(true)}
          className="w-full h-9 bg-surface-active text-text-muted text-sm px-3 rounded-md flex items-center justify-between hover:bg-surface-hover transition border border-surface-border"
        >
          <span className="flex items-center space-x-2 min-w-0">
            <Search className="w-4 h-4 shrink-0" />
            <span className="truncate">Find or start a conversation</span>
          </span>
        </button>
      </div>

      <div className="px-2 py-2 space-y-1">
        <button
          onClick={() => openDMHome('friends')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-md group transition ${
            !currentDM && dmHomeTab === 'friends'
              ? 'bg-surface-active text-text-primary shadow-sm'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          <span className="flex items-center space-x-3 min-w-0">
            <Users className="w-5 h-5 shrink-0" />
            <span className="font-semibold text-sm truncate">Friends</span>
          </span>
        </button>

        <button
          onClick={() => openDMHome('requests')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-md group transition ${
            !currentDM && dmHomeTab === 'requests'
              ? 'bg-surface-active text-text-primary shadow-sm'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          <span className="flex items-center space-x-3 min-w-0">
            <Inbox className="w-5 h-5 shrink-0" />
            <span className="font-semibold text-sm truncate">Requests</span>
          </span>
          {incomingRequestCount > 0 && (
            <span className="ml-2 bg-danger text-text-primary text-[10px] font-bold min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full">
              {incomingRequestCount > 99 ? '99+' : incomingRequestCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 custom-scrollbar border-t border-surface-border">
        <div className="px-2 mb-2 flex items-center justify-between text-xs font-semibold text-text-muted uppercase tracking-wider">
          <span>Direct Messages</span>
          <button
            onClick={() => setShowSearchModal(true)}
            className="p-1 rounded hover:bg-surface-hover hover:text-text-primary transition"
            title="Start Direct Message"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {conversationList.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-text-muted">
            No direct messages yet.
          </div>
        ) : (
          conversationList.map((conv) => {
            const isSelected = currentDM && currentDM.id === conv.id;
            const unreadCount = unreadDMs[conv.id] || 0;
            const other = conv.other_user;

            return (
              <button
                key={conv.id}
                onClick={() => selectDM(conv)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, user: other });
                }}
                className={`w-full flex items-center space-x-3 px-2 py-2 rounded-md group transition ${
                  isSelected
                    ? 'bg-surface-hover text-text-primary'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <img
                    src={avatarFor(other)}
                    alt={other?.username || 'User'}
                    className="w-8 h-8 rounded-full object-cover bg-surface-active"
                    onError={(e) => { e.currentTarget.src = avatarFor({ username: other?.username || 'user' }); }}
                  />
                  <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface-border ${getStatusColor(other?.status)}`} />
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium truncate flex items-center justify-between">
                    <span className="truncate">{other?.username || 'Unknown'}</span>
                    {unreadCount > 0 && (
                      <span className="ml-2 bg-danger text-text-primary text-[10px] font-bold min-w-5 h-5 px-1.5 flex items-center justify-center rounded-full">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-text-muted truncate">
                    {other?.status_message || (other?.public_id ? `#${other.public_id}` : other?.status || 'Offline')}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <UserWidget onOpenSettings={onOpenSettings} />

      {contextMenu && (
        <UserContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          user={contextMenu.user}
          contextType="dm"
          isLocalUser={false}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showSearchModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface-base w-full max-w-md rounded-md p-5 shadow-2xl border border-surface-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-text-primary">Start a Direct Message</h3>
              <button
                onClick={closeSearch}
                className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative mb-4">
              <input
                type="text"
                autoFocus
                placeholder="Type a username or #ID to search..."
                value={searchQuery}
                onChange={handleSearch}
                className="w-full bg-surface-active text-text-primary text-sm px-4 py-2.5 pr-10 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-primary border border-surface-border"
              />
              <Search className="w-4 h-4 text-text-muted absolute right-3 top-3" />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
              {searching ? (
                <div className="py-4 text-center text-xs text-text-muted">Searching...</div>
              ) : searchError ? (
                <div className="py-4 text-center text-xs text-danger">{searchError}</div>
              ) : searchResults.length === 0 ? (
                <div className="py-4 text-center text-xs text-text-muted">
                  {searchQuery ? 'No users found matching query' : 'Type above to search registered users'}
                </div>
              ) : (
                searchResults.map(result => (
                  <button
                    key={result.id}
                    onClick={() => handleStartDM(result)}
                    className="w-full flex items-center justify-between p-2 rounded-md hover:bg-surface-hover text-text-primary text-left transition"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <img
                        src={avatarFor(result)}
                        alt={result.username}
                        className="w-8 h-8 rounded-full object-cover bg-surface-active shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{result.username}</div>
                        <div className="text-xs text-text-muted font-mono truncate">#{result.public_id || result.id}</div>
                      </div>
                    </div>
                    <span className="ml-3 bg-accent-primary text-text-primary text-xs px-2.5 py-1 rounded-md hover:bg-accent-hover flex items-center space-x-1.5">
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Message</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
