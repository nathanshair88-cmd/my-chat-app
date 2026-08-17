import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useServer } from '../../context/ServerContext';
import { friendsAPI } from '../../services/api';
import { Users, UserPlus, Check, X, MessageSquare, UserMinus, Search } from 'lucide-react';
import UserContextMenu from '../modals/UserContextMenu';

export default function FriendsArea() {
  const { user } = useAuth();
  const { startDM } = useServer();
  const [activeTab, setActiveTab] = useState('online');
  const [friends, setFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Add Friend state
  const [addUsername, setAddUsername] = useState('');
  const [addStatus, setAddStatus] = useState(null); // { type: 'success'|'error', msg: '' }

  // Context Menu
  const [contextMenu, setContextMenu] = useState(null);

  const fetchFriends = async () => {
    try {
      const res = await friendsAPI.getFriends();
      setFriends(res.data);
    } catch (err) {
      console.error("Error fetching friends:", err);
    }
  };

  useEffect(() => {
    fetchFriends();
  }, []);

  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (!addUsername.trim()) return;
    try {
      await friendsAPI.sendRequest(addUsername.trim());
      setAddStatus({ type: 'success', msg: `Friend request sent to ${addUsername}` });
      setAddUsername('');
      fetchFriends();
    } catch (err) {
      setAddStatus({ type: 'error', msg: err.response?.data?.detail || 'Failed to send request' });
    }
  };

  const handleAccept = async (id) => {
    try {
      await friendsAPI.acceptRequest(id);
      fetchFriends();
    } catch (err) {
      console.error("Error accepting request:", err);
    }
  };

  const handleRemove = async (id) => {
    try {
      await friendsAPI.removeFriend(id);
      fetchFriends();
    } catch (err) {
      console.error("Error removing friend:", err);
    }
  };

  const handleMessage = async (targetUserId) => {
    try {
      await startDM({ target_user_id: targetUserId });
    } catch (err) {
      console.error("Error starting DM:", err);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-success';
      case 'idle': return 'bg-warning';
      case 'dnd': return 'bg-danger';
      default: return 'bg-surface-border';
    }
  };

  const filteredFriends = friends.filter(f => {
    const friendData = f.friend_user;
    if (!friendData) return false;
    
    // Global text search
    if (searchQuery && !friendData.username.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    if (activeTab === 'online') {
      return f.status === 'accepted' && (friendData.status === 'online' || friendData.status === 'idle' || friendData.status === 'dnd');
    }
    if (activeTab === 'all') {
      return f.status === 'accepted';
    }
    if (activeTab === 'pending') {
      return f.status === 'pending';
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-surface-base">
      
      {/* Top Header / Tabs */}
      <div className="h-12 border-b border-surface-border flex items-center px-4 shrink-0 shadow-sm z-10">
        <div className="flex items-center text-text-primary mr-6">
          <Users className="w-5 h-5 mr-2 text-text-muted" />
          <span className="font-bold">Friends</span>
        </div>
        
        <div className="h-6 w-px bg-surface-border mx-2" />
        
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setActiveTab('online')}
            className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
              activeTab === 'online' ? 'bg-surface-active text-text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            Online
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
              activeTab === 'all' ? 'bg-surface-active text-text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
              activeTab === 'pending' ? 'bg-surface-active text-text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            Pending
            {friends.filter(f => f.status === 'pending' && f.friend_id === user?.id).length > 0 && (
              <span className="ml-1.5 bg-danger text-text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {friends.filter(f => f.status === 'pending' && f.friend_id === user?.id).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
              activeTab === 'add' ? 'bg-success text-white' : 'bg-success/20 text-success hover:bg-success/30'
            }`}
          >
            Add Friend
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar relative">
        
        {activeTab === 'add' ? (
          <div className="max-w-2xl">
            <h2 className="text-text-primary font-bold mb-2 text-lg uppercase tracking-wider">Add Friend</h2>
            <p className="text-text-muted text-sm mb-4">
              You can add friends with their Disco Alto username or #ID.
            </p>
            <form onSubmit={handleAddFriend} className="relative mb-4">
              <input 
                type="text" 
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                placeholder="Username or #ID"
                className={`w-full bg-surface-panel border ${addStatus?.type === 'success' ? 'border-success' : addStatus?.type === 'error' ? 'border-danger' : 'border-surface-border'} text-text-primary rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-accent-primary transition-colors pr-32`}
              />
              <button 
                type="submit"
                disabled={!addUsername.trim()}
                className="absolute right-2 top-2 bottom-2 bg-accent-primary hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent-primary text-white text-sm font-semibold px-4 rounded transition-colors"
              >
                Send Friend Request
              </button>
            </form>
            {addStatus && (
              <div className={`text-sm ${addStatus.type === 'success' ? 'text-success' : 'text-danger'} animate-fadeIn`}>
                {addStatus.msg}
              </div>
            )}
            
            <div className="mt-16 flex flex-col items-center justify-center text-text-muted border-t border-surface-border pt-8 opacity-50">
              <UserPlus className="w-24 h-24 mb-4" />
              <p>Wumpus is waiting on friends. You don't have to though!</p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl">
            {/* Search Bar for friends list */}
            <div className="relative mb-6">
              <input 
                type="text" 
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-panel border border-surface-border text-text-primary rounded px-3 py-1.5 focus:outline-none focus:border-accent-primary text-sm transition-colors"
              />
              <Search className="w-4 h-4 text-text-muted absolute right-3 top-2" />
            </div>

            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-4 border-b border-surface-border pb-2">
              {activeTab === 'pending' ? 'Pending' : activeTab === 'online' ? 'Online' : 'All Friends'} — {filteredFriends.length}
            </h3>
            
            {filteredFriends.length === 0 ? (
              <div className="flex flex-col items-center justify-center mt-20 text-text-muted opacity-50">
                <Users className="w-20 h-20 mb-4" />
                <p>No one's around to play with Wumpus.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredFriends.map(f => {
                  const friendUser = f.friend_user;
                  const isIncomingRequest = f.status === 'pending' && f.friend_id === user?.id;
                  const isOutgoingRequest = f.status === 'pending' && f.user_id === user?.id;
                  
                  return (
                    <div 
                      key={f.id} 
                      className="group flex items-center justify-between p-3 rounded-md hover:bg-surface-hover hover:shadow-sm border-t border-transparent hover:border-surface-border transition-all cursor-pointer"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, user: friendUser });
                      }}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <img 
                            src={friendUser.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${friendUser.username}`} 
                            alt={friendUser.username} 
                            className="w-8 h-8 rounded-full object-cover"
                          />
                          {f.status === 'accepted' && (
                            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-base ${getStatusColor(friendUser.status)}`} />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-text-primary flex items-center space-x-2">
                            <span>{friendUser.username}</span>
                          </div>
                          <div className="text-xs text-text-muted truncate max-w-[200px]">
                            {f.status === 'accepted' ? (friendUser.status_message || (friendUser.public_id ? `#${friendUser.public_id}` : friendUser.status)) :
                             isIncomingRequest ? 'Incoming Friend Request' : 'Outgoing Friend Request'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {f.status === 'accepted' && (
                          <>
                            <button 
                              onClick={() => handleMessage(friendUser.id)}
                              className="p-2 rounded-full bg-surface-active hover:bg-surface-panel text-text-muted hover:text-text-primary shadow-sm"
                              title="Message"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleRemove(f.id)}
                              className="p-2 rounded-full bg-surface-active hover:bg-danger/20 text-text-muted hover:text-danger shadow-sm"
                              title="Remove Friend"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        
                        {isIncomingRequest && (
                          <>
                            <button 
                              onClick={() => handleAccept(f.id)}
                              className="p-2 rounded-full bg-success/20 hover:bg-success text-success hover:text-white shadow-sm"
                              title="Accept"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleRemove(f.id)}
                              className="p-2 rounded-full bg-danger/20 hover:bg-danger text-danger hover:text-white shadow-sm"
                              title="Ignore"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        
                        {isOutgoingRequest && (
                          <button 
                            onClick={() => handleRemove(f.id)}
                            className="p-2 rounded-full bg-danger/20 hover:bg-danger text-danger hover:text-white shadow-sm"
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
        )}

      </div>
      
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
    </div>
  );
}
