import React, { useRef, useEffect, useState } from 'react';
import { useServer } from '../../context/ServerContext';
import MessageItem from './MessageItem';
import MessageInput from './MessageInput';
import { Hash, Volume2, Video, Share2, Search, X, UploadCloud, MessageSquare } from 'lucide-react';

export default function ChatArea({ onOpenP2PModal }) {
  const { viewMode, currentChannel, currentDM, messages, typingUsers, showVoiceGrid, toggleVoiceGrid } = useServer();
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
      <div className="flex-1 bg-[#313338] flex flex-col items-center justify-center text-[#949ba4]">
        <div className="w-16 h-16 rounded-full bg-[#2b2d31] flex items-center justify-center mb-4">
          <Hash className="w-8 h-8 text-[#80848e]" />
        </div>
        <p className="text-lg font-semibold text-white">No Channel Selected</p>
        <p className="text-sm text-[#949ba4] mt-1">Select a text or voice channel from the sidebar to start chatting.</p>
      </div>
    );
  }

  if (isDM && !currentDM) {
    return (
      <div className="flex-1 bg-[#313338] flex flex-col items-center justify-center text-[#949ba4]">
        <div className="w-16 h-16 rounded-full bg-[#2b2d31] flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 text-[#5865f2]" />
        </div>
        <p className="text-lg font-semibold text-white">Direct Messages</p>
        <p className="text-sm text-[#949ba4] mt-1">Select a conversation or click + in the sidebar to start a new DM.</p>
      </div>
    );
  }

  const getChannelIcon = (type) => {
    switch (type) {
      case 'voice': return <Volume2 className="w-6 h-6 text-[#949ba4] mr-2" />;
      case 'media': return <Video className="w-6 h-6 text-[#949ba4] mr-2" />;
      default: return <Hash className="w-6 h-6 text-[#949ba4] mr-2" />;
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
      className="flex-1 bg-[#313338] flex flex-col min-w-0 h-full relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-[#5865f2]/90 flex flex-col items-center justify-center text-white backdrop-blur-sm pointer-events-none animate-fadeIn">
          <UploadCloud className="w-20 h-20 mb-3 animate-bounce" />
          <h2 className="text-2xl font-bold">Upload to {isDM ? `@${otherUser?.username}` : `#${currentChannel?.name}`}</h2>
          <p className="text-sm text-white/80 mt-1">Drop files anywhere to attach to your message</p>
        </div>
      )}

      {/* Header Bar */}
      <div className="h-12 px-4 border-b border-[#1f2023] flex items-center justify-between shadow-sm bg-[#313338] z-10">
        <div className="flex items-center min-w-0 pr-2">
          {isDM ? (
            <div className="flex items-center space-x-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#5865f2] flex items-center justify-center text-white font-bold text-xs">
                {otherUser?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="font-bold text-white text-md truncate">@{otherUser?.username}</span>
            </div>
          ) : (
            <div className="flex items-center min-w-0">
              {getChannelIcon(currentChannel.type)}
              <span className="font-bold text-white text-md truncate">{currentChannel.name}</span>
            </div>
          )}
        </div>

        {/* Right Header Toolbar: Search Bar, Video Grid & P2P Button */}
        <div className="flex items-center space-x-3">
          {/* Voice Channel Video Grid Toggle */}
          {currentChannel && (currentChannel.type === 'voice' || currentChannel.type === 'media') && (
            <button
              onClick={toggleVoiceGrid}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition ${
                showVoiceGrid ? 'bg-[#5865f2] text-white' : 'bg-[#1e1f22] text-[#949ba4] hover:text-white hover:bg-[#35373c]'
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
              className="bg-[#1e1f22] text-white text-xs px-3 py-1.5 pl-8 pr-7 rounded-md w-36 sm:w-48 focus:w-64 focus:outline-none focus:ring-1 focus:ring-[#5865f2] transition-all"
            />
            <Search className="w-3.5 h-3.5 text-[#949ba4] absolute left-2.5 pointer-events-none" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-[#949ba4] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={onOpenP2PModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#2b2d31] hover:bg-[#35373c] text-[#dbdee1] text-xs font-semibold rounded-md transition-colors border border-[#3f4147]"
          >
            <Share2 className="w-3.5 h-3.5 text-[#5865f2]" />
            <span className="hidden sm:inline">P2P Transfer</span>
          </button>
        </div>
      </div>

      {/* Messages Scrollable Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
        {/* Welcome Banner */}
        <div className="mb-6 pt-4 border-b border-[#35373c] pb-6">
          {isDM ? (
            <div>
              <div className="w-16 h-16 rounded-full bg-[#5865f2] flex items-center justify-center text-white text-2xl font-bold mb-3">
                {otherUser?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <h2 className="text-2xl font-bold text-white">@{otherUser?.username}</h2>
              <p className="text-sm text-[#949ba4] mt-1">This is the beginning of your direct message history with @{otherUser?.username}.</p>
            </div>
          ) : (
            <div>
              <div className="w-16 h-16 rounded-full bg-[#404249] flex items-center justify-center mb-3">
                {getChannelIcon(currentChannel.type)}
              </div>
              <h2 className="text-2xl font-bold text-white">Welcome to #{currentChannel.name}!</h2>
              <p className="text-sm text-[#949ba4] mt-1">This is the start of the #{currentChannel.name} channel.</p>
            </div>
          )}
        </div>

        {/* Search Results Notice */}
        {searchQuery.trim() && (
          <div className="bg-[#2b2d31] p-2.5 rounded-lg border border-[#5865f2] text-xs text-[#dbdee1] flex items-center justify-between mb-4">
            <span>
              Showing {filteredMessages.length} message{filteredMessages.length === 1 ? '' : 's'} matching "<strong className="text-white">{searchQuery}</strong>"
            </span>
            <button onClick={() => setSearchQuery('')} className="text-[#5865f2] hover:underline font-semibold">
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
        <div className="px-4 py-1 text-xs text-[#949ba4] italic flex items-center space-x-1.5 bg-[#313338]">
          <span className="flex space-x-1">
            <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-[#949ba4] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          <span>{typingArray.join(', ')} {typingArray.length === 1 ? 'is' : 'are'} typing...</span>
        </div>
      )}

      {/* Message Input */}
      <MessageInput onOpenP2PModal={onOpenP2PModal} droppedFiles={droppedFiles} />
    </div>
  );
}
