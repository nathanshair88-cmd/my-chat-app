import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { dmAPI } from '../../services/api';
import UserWidget from './UserWidget';
import UserContextMenu from '../modals/UserContextMenu';
import { MessageSquare, Plus, Volume2, VolumeX, User, Search, Check, Circle } from 'lucide-react';


export default function DMSidebar({ onOpenSettings }) {
  const { user } = useAuth();
  const { conversations, currentDM, selectDM, startDM, unreadDMs } = useServer();


  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  const handleSearch = async (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await dmAPI.searchUsers(q);
      setSearchResults(res.data);
    } catch (err) {
      console.error("Error searching users:", err);
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
    } catch (err) {
      console.error("Failed to start DM:", err);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'idle': return 'bg-yellow-500';
      case 'dnd': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="w-60 bg-surface-panel flex flex-col h-full border-r border-surface-border select-none">
      {/* Search / Header */}
      <div className="p-3 border-b border-surface-border shadow-sm flex items-center justify-between">
        <button
          onClick={() => setShowSearchModal(true)}
          className="w-full bg-surface-active text-text-muted text-sm px-3 py-1.5 rounded flex items-center justify-between hover:bg-surface-hover transition"
        >
          <span className="flex items-center space-x-2">
            <Search className="w-4 h-4" />
            <span>Find or start a DM</span>
          </span>
        </button>
      </div>

      {/* Direct Messages List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 custom-scrollbar">
        <div className="px-2 mb-2 flex items-center justify-between text-xs font-semibold text-text-muted uppercase tracking-wider">
          <span>Direct Messages</span>
          <button
            onClick={() => setShowSearchModal(true)}
            className="hover:text-text-primary transition"
            title="Start Direct Message"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {conversations.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-text-muted">
            No direct messages yet.<br />Click + above to find a friend!
          </div>
        ) : (
          conversations.map((conv) => {
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
                  isSelected ? 'bg-surface-hover text-text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <div className="relative flex-shrink-0">
                  {other?.avatar_url ? (
                    <img src={other.avatar_url} alt={other.username} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center text-text-primary font-semibold text-xs">
                      {other?.username?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface-border ${getStatusColor(other?.status)}`} />
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium truncate flex items-center justify-between">
                    <span className="truncate">{other?.username || 'Unknown'}</span>
                    {unreadCount > 0 && (
                      <span className="ml-2 bg-danger text-text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  {other?.status_message && (
                    <div className="text-[11px] text-text-muted truncate">{other.status_message}</div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      <UserWidget onOpenSettings={onOpenSettings} />

      {/* User Context Menu */}
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

      {/* Search Users Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface-base w-full max-w-md rounded-sm p-5 shadow-2xl border border-surface-border">
            <h3 className="text-lg font-bold text-text-primary mb-3 flex items-center justify-between">
              <span>Start a Direct Message</span>
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-text-muted hover:text-text-primary text-sm"
              >
                ✕
              </button>
            </h3>

            <div className="relative mb-4">
              <input
                type="text"
                autoFocus
                placeholder="Type a username to search..."
                value={searchQuery}
                onChange={handleSearch}
                className="w-full bg-surface-active text-text-primary text-sm px-4 py-2.5 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
              <Search className="w-4 h-4 text-text-muted absolute right-3 top-3" />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
              {searching ? (
                <div className="py-4 text-center text-xs text-text-muted">Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="py-4 text-center text-xs text-text-muted">
                  {searchQuery ? 'No users found matching query' : 'Type above to search registered users'}
                </div>
              ) : (
                searchResults.map(u => (
                  <button
                    key={u.id}
                    onClick={() => handleStartDM(u)}
                    className="w-full flex items-center justify-between p-2 rounded-md hover:bg-surface-hover text-text-primary text-left transition"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center text-text-primary font-bold text-xs">
                        {u.username[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{u.username}</div>
                        <div className="text-xs text-text-muted">{u.email}</div>
                      </div>
                    </div>
                    <span className="bg-accent-primary text-text-primary text-xs px-2.5 py-1 rounded hover:bg-accent-hover">
                      Message
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
