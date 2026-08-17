import React, { useRef, useEffect, useState } from 'react';
import { useServer } from '../../context/ServerContext';
import MessageItem from './MessageItem';
import MessageInput from './MessageInput';
import { Hash, Volume2, Video, Share2, Search, X, UploadCloud, MessageSquare, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export default function ChatArea({ onOpenP2PModal }) {
  const { viewMode, currentChannel, currentDM, messages, typingUsers, showVoiceGrid, toggleVoiceGrid } = useServer();
  const { isDarkMode, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingUsers]);

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setDroppedFiles(Array.from(e.dataTransfer.files));
      setTimeout(() => setDroppedFiles([]), 500);
    }
  };

  const isDM = viewMode === 'dm';

  if (!isDM && !currentChannel) {
    return (
      <div className="flex-1 bg-surface-base flex flex-col items-center justify-center text-text-muted">
        <div className="w-16 h-16 rounded-full bg-surface-panel flex items-center justify-center mb-4">
          <Hash className="w-8 h-8 text-text-muted" />
        </div>
        <p className="text-lg font-semibold text-text-primary">No Workspace Selected</p>
        <p className="text-sm text-text-muted mt-1">Select a text or voice channel from the sidebar to start collaborating.</p>
      </div>
    );
  }

  if (isDM && !currentDM) {
    return (
      <div className="flex-1 bg-surface-base flex flex-col items-center justify-center text-text-muted">
        <div className="w-16 h-16 rounded-full bg-surface-panel flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 text-accent-primary" />
        </div>
        <p className="text-lg font-semibold text-text-primary">Direct Messages</p>
        <p className="text-sm text-text-muted mt-1">Select a conversation or click + in the sidebar to start a new DM.</p>
      </div>
    );
  }

  const getChannelIcon = (type) => {
    switch (type) {
      case 'voice': return <Volume2 className="w-6 h-6 text-text-muted mr-2" />;
      case 'media': return <Video className="w-6 h-6 text-text-muted mr-2" />;
      default: return <Hash className="w-6 h-6 text-text-muted mr-2" />;
    }
  };

  const typingArray = Array.from(typingUsers.values());

  // Filter messages if search query exists
  const filteredMessages = searchQuery.trim()
    ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const otherUser = currentDM?.other_user;

  return (
    <div 
      className="flex-1 bg-transparent flex flex-col min-w-0 h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-accent-primary/90 flex flex-col items-center justify-center text-text-primary backdrop-blur-sm pointer-events-none animate-fadeIn rounded-md">
          <UploadCloud className="w-20 h-20 mb-3 animate-bounce" />
          <h2 className="text-2xl font-bold">Upload to {isDM ? `@${otherUser?.username}` : `#${currentChannel?.name}`}</h2>
          <p className="text-sm text-text-primary/80 mt-1">Drop files anywhere to attach to your message</p>
        </div>
      )}

      {/* Header Bar */}
      <div className="h-12 px-4 border-b border-surface-border flex items-center justify-between shadow-sm bg-surface-panel/40 backdrop-blur-md z-10">
        <div className="flex items-center min-w-0 pr-2">
          {isDM ? (
            <div className="flex items-center space-x-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-accent-primary flex items-center justify-center text-text-primary font-bold text-xs shadow-sm">
                {otherUser?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="font-bold text-text-primary text-md truncate">@{otherUser?.username}</span>
            </div>
          ) : (
            <div className="flex items-center min-w-0">
              {getChannelIcon(currentChannel.type)}
              <span className="font-bold text-text-primary text-md truncate">{currentChannel.name}</span>
            </div>
          )}
        </div>

        {/* Right Header Toolbar: Search Bar, Video Grid & P2P Button */}
        <div className="flex items-center space-x-3">
          {/* Voice Channel Video Grid Toggle */}
          {currentChannel && (currentChannel.type === 'voice' || currentChannel.type === 'media') && (
            <button
              onClick={toggleVoiceGrid}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition shadow-sm ${
                showVoiceGrid ? 'bg-accent-primary text-text-primary' : 'bg-surface-active text-text-muted hover:text-text-primary hover:bg-surface-hover'
              }`}
              title={showVoiceGrid ? "Switch to Dedicated Text Chat" : "View Voice & Video Grid"}
            >
              <Video className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{showVoiceGrid ? 'Text Chat' : 'Voice Grid'}</span>
            </button>
          )}

          {/* Real-time Message Search Input */}
          <div className="relative flex items-center">

            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-surface-active text-text-primary text-xs px-3 py-1.5 pl-8 pr-7 rounded-md w-36 sm:w-48 focus:w-64 focus:outline-none focus:ring-1 focus:ring-accent-primary transition-all border border-surface-border"
            />
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 pointer-events-none" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-text-muted hover:text-text-primary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={onOpenP2PModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-surface-active hover:bg-surface-hover text-text-primary text-xs font-semibold rounded-md transition-colors border border-surface-border shadow-sm"
          >
            <Share2 className="w-3.5 h-3.5 text-accent-primary" />
            <span className="hidden sm:inline">P2P Transfer</span>
          </button>
          
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md hover:bg-surface-hover hover:text-accent-primary transition-colors border border-surface-border shadow-sm bg-surface-active"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-text-primary" /> : <Moon className="w-4 h-4 text-text-primary" />}
          </button>
        </div>
      </div>

      {/* Messages Scrollable Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar bg-transparent">
        {/* Welcome Banner */}
        <div className="mb-6 pt-4 border-b border-surface-border pb-6">
          {isDM ? (
            <div>
              <div className="w-16 h-16 rounded-full bg-accent-primary flex items-center justify-center text-text-primary text-2xl font-bold mb-3 shadow-md">
                {otherUser?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <h2 className="text-2xl font-bold text-text-primary">@{otherUser?.username}</h2>
              <p className="text-sm text-text-muted mt-1">This is the beginning of your direct message history with @{otherUser?.username}.</p>
            </div>
          ) : (
            <div>
              <div className="w-16 h-16 rounded-full bg-surface-active flex items-center justify-center mb-3 border border-surface-border shadow-sm">
                {getChannelIcon(currentChannel.type)}
              </div>
              <h2 className="text-2xl font-bold text-text-primary">Welcome to #{currentChannel.name}!</h2>
              <p className="text-sm text-text-muted mt-1">This is the start of the #{currentChannel.name} channel.</p>
            </div>
          )}
        </div>

        {/* Search Results Notice */}
        {searchQuery.trim() && (
          <div className="bg-surface-panel p-2.5 rounded-sm border border-accent-primary text-xs text-text-primary flex items-center justify-between mb-4 shadow-sm backdrop-blur-sm">
            <span>
              Showing {filteredMessages.length} message{filteredMessages.length === 1 ? '' : 's'} matching "<strong className="text-accent-primary">{searchQuery}</strong>"
            </span>
            <button onClick={() => setSearchQuery('')} className="text-accent-primary hover:underline font-semibold">
              Clear filter
            </button>
          </div>
        )}

        {filteredMessages.map((msg) => (
          <MessageItem key={msg.id} message={msg} searchQuery={searchQuery} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator Bar */}
      {typingArray.length > 0 && !isDM && (
        <div className="px-4 py-1 text-xs text-text-muted italic flex items-center space-x-1.5 bg-transparent backdrop-blur-sm">
          <span className="flex space-x-1">
            <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          <span>{typingArray.join(', ')} {typingArray.length === 1 ? 'is' : 'are'} typing...</span>
        </div>
      )}

      {/* Message Input */}
      <MessageInput onOpenP2PModal={onOpenP2PModal} droppedFiles={droppedFiles} />
    </div>
  );
}
