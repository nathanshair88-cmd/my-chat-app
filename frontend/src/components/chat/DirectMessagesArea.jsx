import React, { useEffect, useState } from 'react';
import { Calendar, Check, Inbox, MessageSquare, Search, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useServer } from '../../context/ServerContext';
import { friendsAPI } from '../../services/api';
import UserProfileModal from '../modals/UserProfileModal';
import ChatArea from './ChatArea';

const avatarFor = (user) => (
  user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user?.username || 'user')}`
);

const statusColor = (status) => {
  switch (status) {
    case 'online': return 'bg-success';
    case 'idle': return 'bg-warning';
    case 'dnd': return 'bg-danger';
    default: return 'bg-surface-border';
  }
};

const formatDate = (value, fallback = 'Recently') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

function DMProfilePanel({ conversation }) {
  const other = conversation?.other_user;
  const [showProfileModal, setShowProfileModal] = useState(false);

  if (!other) return null;

  return (
    <aside className="hidden 2xl:flex w-80 shrink-0 flex-col border-l border-surface-border bg-surface-panel/80 h-full">
      <div className="h-24 bg-gradient-to-r from-accent-primary to-accent-hover relative">
        <div className="absolute -bottom-10 left-5">
          <div className="relative">
            <img
              src={avatarFor(other)}
              alt={other.username}
              className="w-20 h-20 rounded-full object-cover border-4 border-surface-panel bg-surface-active shadow-lg"
            />
            <span className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-surface-panel ${statusColor(other.status)}`} />
          </div>
        </div>
      </div>

      <div className="px-5 pt-14 pb-5 overflow-y-auto custom-scrollbar">
        <div className="border-b border-surface-border pb-4">
          <h2 className="text-xl font-bold text-text-primary truncate">{other.username}</h2>
          <div className="text-sm text-text-muted font-mono truncate">#{other.public_id || other.id}</div>
          {other.status_message && (
            <p className="mt-3 text-sm text-text-primary leading-relaxed break-words">
              {other.status_message}
            </p>
          )}
        </div>

        <div className="py-4 border-b border-surface-border space-y-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Member Since</div>
            <div className="flex items-center space-x-2 text-sm text-text-primary">
              <Calendar className="w-4 h-4 text-text-muted" />
              <span>{formatDate(other.created_at, 'Member profile')}</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1">Conversation Since</div>
            <div className="flex items-center space-x-2 text-sm text-text-primary">
              <MessageSquare className="w-4 h-4 text-text-muted" />
              <span>{formatDate(conversation.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="py-4">
          <button
            onClick={() => setShowProfileModal(true)}
            className="w-full bg-surface-active hover:bg-surface-hover border border-surface-border text-text-primary rounded-md py-2 text-sm font-semibold transition"
          >
            View Full Profile
          </button>
        </div>
      </div>
      {showProfileModal && (
        <UserProfileModal user={other} onClose={() => setShowProfileModal(false)} />
      )}
    </aside>
  );
}

function DirectMessagesHome() {
  const { user } = useAuth();
  const {
    dmHomeTab,
    fetchFriendships,
    friendships,
    markFriendRequestsRead,
    openDMHome,
    startDM
  } = useServer();
  const [searchQuery, setSearchQuery] = useState('');
  const [addTarget, setAddTarget] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (dmHomeTab === 'requests') {
      markFriendRequestsRead();
    }
  }, [dmHomeTab, markFriendRequestsRead]);

  const runFriendAction = async (action, successMessage) => {
    setActionMessage('');
    setActionError('');
    try {
      await action();
      await fetchFriendships();
      setActionMessage(successMessage);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Friend action failed');
    }
  };

  const handleAddFriend = async (e) => {
    e.preventDefault();
    const target = addTarget.trim();
    if (!target) return;

    await runFriendAction(
      async () => friendsAPI.sendRequest(target),
      'Friend request sent'
    );
    setAddTarget('');
  };

  const handleMessage = async (targetUserId) => {
    try {
      await startDM({ target_user_id: targetUserId });
    } catch (err) {
      console.error('Error starting DM:', err);
    }
  };

  const handleAccept = async (id) => {
    await runFriendAction(
      async () => friendsAPI.acceptRequest(id),
      'Friend request accepted'
    );
  };

  const handleDecline = async (id) => {
    await runFriendAction(
      async () => friendsAPI.declineRequest(id),
      'Friend request declined'
    );
  };

  const handleCancel = async (id) => {
    await runFriendAction(
      async () => friendsAPI.cancelRequest(id),
      'Friend request cancelled'
    );
  };

  const handleRemove = async (id) => {
    await runFriendAction(
      async () => friendsAPI.removeFriend(id),
      'Friend removed'
    );
  };

  const acceptedFriends = friendships.filter(item => item.status === 'accepted');
  const outgoingRequests = friendships.filter(item => item.status === 'pending' && item.direction === 'outgoing');
  const incomingRequests = friendships.filter(item => item.status === 'pending' && item.direction === 'incoming');
  const source = dmHomeTab === 'requests'
    ? incomingRequests
    : dmHomeTab === 'pending'
      ? outgoingRequests
      : acceptedFriends;
  const rows = source.filter(item => {
    const other = item.friend_user;
    if (!other) return false;
    return !searchQuery.trim() || other.username.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const title = dmHomeTab === 'requests' ? 'Requests' : dmHomeTab === 'pending' ? 'Pending' : 'Friends';
  const Icon = dmHomeTab === 'requests' ? Inbox : dmHomeTab === 'pending' ? MessageSquare : Users;

  const tabs = [
    { id: 'friends', label: 'Friends', count: acceptedFriends.length },
    { id: 'pending', label: 'Pending', count: outgoingRequests.length },
    { id: 'requests', label: 'Requests', count: incomingRequests.length },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-base min-w-0">
      <div className="min-h-12 border-b border-surface-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pl-16 pr-4 sm:px-4 py-2 sm:py-0 shrink-0 shadow-sm bg-surface-panel/40">
        <div className="flex items-center min-w-0">
          <Icon className="w-5 h-5 mr-2 text-text-muted shrink-0" />
          <span className="font-bold text-text-primary truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto max-w-full no-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => openDMHome(tab.id)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition shrink-0 ${
                dmHomeTab === tab.id
                  ? 'bg-surface-active text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              {tab.label}
              {tab.count > 0 && <span className="ml-1.5 text-[10px] text-text-muted">{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 custom-scrollbar responsive-safe-scroll">
        <div className="max-w-4xl mx-auto lg:mx-0">
          {dmHomeTab === 'friends' && (
            <form onSubmit={handleAddFriend} className="mb-5 bg-surface-panel border border-surface-border rounded-md p-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={addTarget}
                  onChange={(e) => setAddTarget(e.target.value)}
                  placeholder="Add friend by username or #ID"
                  className="flex-1 bg-surface-active border border-surface-border text-text-primary rounded-md px-3 py-2 focus:outline-none focus:border-accent-primary text-sm"
                />
                <button
                  type="submit"
                  disabled={!addTarget.trim()}
                  className="px-4 py-2 rounded-md bg-accent-primary hover:bg-accent-hover disabled:opacity-50 text-text-primary text-sm font-semibold transition flex items-center justify-center space-x-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Friend</span>
                </button>
              </div>
              {(actionMessage || actionError) && (
                <div className={`mt-2 text-xs ${actionError ? 'text-danger' : 'text-success'}`}>
                  {actionError || actionMessage}
                </div>
              )}
            </form>
          )}

          <div className="relative mb-5">
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-panel border border-surface-border text-text-primary rounded-md px-3 py-2 pr-10 focus:outline-none focus:border-accent-primary text-sm transition-colors"
            />
            <Search className="w-4 h-4 text-text-muted absolute right-3 top-2.5" />
          </div>

          <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3 border-b border-surface-border pb-2">
            {title} - {rows.length}
          </div>
          {dmHomeTab !== 'friends' && (actionMessage || actionError) && (
            <div className={`mb-3 text-xs ${actionError ? 'text-danger' : 'text-success'}`}>
              {actionError || actionMessage}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center mt-20 text-text-muted">
              {dmHomeTab === 'requests' ? (
                <Inbox className="w-16 h-16 mb-4 opacity-50" />
              ) : dmHomeTab === 'pending' ? (
                <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
              ) : (
                <UserPlus className="w-16 h-16 mb-4 opacity-50" />
              )}
              <p className="text-sm">
                {dmHomeTab === 'requests'
                  ? 'No incoming friend requests.'
                  : dmHomeTab === 'pending'
                    ? 'No outgoing friend requests.'
                    : 'No friends to show.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {rows.map(item => {
                const other = item.friend_user;
                const isIncoming = item.status === 'pending' && item.friend_id === user?.id;
                const isOutgoing = item.status === 'pending' && item.user_id === user?.id;

                return (
                  <div
                    key={item.id}
                    className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-md hover:bg-surface-hover border-t border-transparent hover:border-surface-border transition-all"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={avatarFor(other)}
                          alt={other.username}
                          className="w-9 h-9 rounded-full object-cover bg-surface-panel"
                        />
                        {item.status === 'accepted' && (
                          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-base ${statusColor(other.status)}`} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-text-primary truncate">{other.username}</div>
                        <div className="text-xs text-text-muted truncate">
                          {item.status === 'accepted'
                            ? (other.status_message || (other.public_id ? `#${other.public_id}` : other.status))
                            : isIncoming ? 'Incoming friend request' : 'Outgoing friend request'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end space-x-2 sm:ml-3 w-full sm:w-auto">
                      {item.status === 'accepted' && (
                        <>
                          <button
                            onClick={() => handleMessage(other.id)}
                            className="p-2 rounded-md bg-surface-active hover:bg-accent-primary text-text-muted hover:text-text-primary shadow-sm transition"
                            title="Message"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemove(item.id)}
                            className="p-2 rounded-md bg-danger/20 hover:bg-danger text-danger hover:text-white shadow-sm transition"
                            title="Remove Friend"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {isIncoming && (
                        <>
                          <button
                            onClick={() => handleAccept(item.id)}
                            className="p-2 rounded-md bg-success/20 hover:bg-success text-success hover:text-white shadow-sm transition"
                            title="Accept"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDecline(item.id)}
                            className="p-2 rounded-md bg-danger/20 hover:bg-danger text-danger hover:text-white shadow-sm transition"
                            title="Decline"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {isOutgoing && (
                        <button
                          onClick={() => handleCancel(item.id)}
                          className="p-2 rounded-md bg-danger/20 hover:bg-danger text-danger hover:text-white shadow-sm transition"
                          title="Cancel Request"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DirectMessagesArea({ onOpenP2PModal }) {
  const { currentDM } = useServer();

  if (!currentDM) {
    return <DirectMessagesHome />;
  }

  return (
    <div className="flex-1 flex min-w-0 h-full bg-surface-base/30">
      <ChatArea onOpenP2PModal={onOpenP2PModal} />
      <DMProfilePanel conversation={currentDM} />
    </div>
  );
}
