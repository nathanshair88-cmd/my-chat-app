import React, { useState, lazy, Suspense } from 'react';
const MarkdownContent = lazy(() => import('./MarkdownContent'));
import EmojiPicker from './EmojiPicker';
import MediaLightboxModal from '../modals/MediaLightboxModal';
import UserContextMenu from '../modals/UserContextMenu';
import MessageContextMenu from '../modals/MessageContextMenu';
import { Smile, FileText, Download, CheckCheck, Bookmark, Reply, MoreHorizontal } from 'lucide-react';
import { useLocalCollection, savedKey, messageKey, notify } from '../../services/localWorkspace';
import { getSocket } from '../../services/socket';
import { useAuth } from '../../context/AuthContext';
import { useServer } from '../../context/ServerContext';

export default function MessageItem({ message, searchQuery }) {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useLocalCollection(savedKey(user?.id));
  const isSaved = bookmarks.some(b => b.key === messageKey(message));
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeMediaPreview, setActiveMediaPreview] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [msgContextMenu, setMsgContextMenu] = useState(null);

  const socket = getSocket();

  const author = message.author || message.sender;
  const isOwnMessage = author?.id === user?.id;

  const { viewMode, currentServer, currentChannel, currentDM, setActiveThreadMessage } = useServer();
  const toggleSaved = () => {
    const next = isSaved ? bookmarks.filter(b => b.key !== messageKey(message)) : [{ key: messageKey(message), content: message.content, author: author?.username || 'Someone', created_at: message.created_at, location: message.conversation_id ? `@${currentDM?.other_user?.username || 'Direct message'}` : `#${currentChannel?.name || 'channel'} · ${currentServer?.name || 'Space'}` }, ...bookmarks];
    if (setBookmarks(next)) notify(isSaved ? 'Removed from your saved messages.' : 'Saved. A little something to come back to.');
    else notify('Your browser storage is full. This message could not be saved.');
  };
  let roleColor = null;
  if (currentServer && author) {
    const member = currentServer.members?.find(m => m.user_id === author.id);
    if (member && member.custom_role_id) {
      const role = currentServer.roles?.find(r => r.id === member.custom_role_id);
      if (role) roleColor = role.color;
    }
  }

  const handleToggleReaction = (emoji) => {
    if (!socket) return;
    const userReacted = (message.reactions || []).some(r => r.emoji === emoji && r.user_id === user?.id);
    if (userReacted) {
      socket.emit('remove_reaction', {
        message_id: message.id,
        emoji,
        channel_id: message.channel_id
      });
    } else {
      socket.emit('add_reaction', {
        message_id: message.id,
        emoji,
        channel_id: message.channel_id
      });
    }
  };

  // Group reactions by emoji
  const reactionCounts = {};
  (message.reactions || []).forEach(r => {
    if (!reactionCounts[r.emoji]) {
      reactionCounts[r.emoji] = { count: 0, users: [], hasUserReacted: false };
    }
    reactionCounts[r.emoji].count += 1;
    reactionCounts[r.emoji].users.push(r.user_id);
    if (r.user_id === user?.id) {
      reactionCounts[r.emoji].hasUserReacted = true;
    }
  });

  const formattedDate = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let attachments = [];
  if (message.attachments_json) {
    try {
      attachments = JSON.parse(message.attachments_json);
    } catch {
      attachments = [];
    }
  }

  // Highlight search query in text content
  const renderContent = (content) => {
    if (!searchQuery || !searchQuery.trim()) return content;
    const parts = content.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === searchQuery.toLowerCase() ? (
            <mark key={i} className="bg-amber-500/40 text-amber-200 px-0.5 rounded font-bold">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  const isBot = message.webhook_id != null;
  const displayName = isBot ? (message.custom_username || author?.username || 'Bot') : (author?.username || 'Unknown User');
  const displayAvatar = isBot 
    ? (message.custom_avatar_url || author?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${displayName}`)
    : (author?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${displayName}`);

  return (
    <div className={`message-row group relative flex space-x-3 sm:space-x-4 px-2 sm:px-4 py-2 hover:bg-surface-hover transition-colors rounded-sm my-0.5 ${isBot ? 'bg-surface-active/30' : ''}`}>
      {/* Author Avatar — right-click for context menu */}
      <img
        src={displayAvatar}
        alt={displayName}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
        onClick={(e) => { if (e.button === 0) {} }}
        onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${displayName}`; }}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-surface-panel object-cover flex-shrink-0 mt-0.5 border border-surface-border shadow-sm cursor-pointer hover:ring-2 hover:ring-accent-primary/50 transition-all"
      />

      <div className="flex-1 min-w-0">
        {/* Header line */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span
              className="font-semibold text-sm hover:underline cursor-pointer truncate"
              style={roleColor && !isBot ? { color: roleColor } : { color: 'var(--text-primary, #ffffff)' }}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
            >
              {displayName}
            </span>
            {isBot && (
              <span className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 rounded-sm flex items-center h-4 uppercase translate-y-[1px] shadow-sm tracking-wider">
                <CheckCheck className="w-3 h-3 mr-0.5" /> BOT
              </span>
            )}
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-[11px] text-text-muted font-medium">{formattedDate}</span>
            {viewMode === 'dm' && isOwnMessage && message.is_read && (
              <CheckCheck className="w-3.5 h-3.5 text-accent-primary" title="Read" />
            )}
          </div>
        </div>

        {/* Markdown Content Body */}
        <div 
          className="message-body text-sm text-text-primary mt-1 leading-relaxed break-words space-y-1"
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMsgContextMenu({ x: e.clientX, y: e.clientY }); }}
        >
          {searchQuery ? (
            <div className="whitespace-pre-wrap">{renderContent(message.content)}</div>
          ) : (
            <Suspense fallback={<p>{message.content}</p>}><MarkdownContent content={message.content} /></Suspense>
          )}
        </div>

        {/* Attachments rendering */}
        {attachments.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {attachments.map((att, idx) => {
              const isImage = att.type?.startsWith('image/') || att.url?.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i);
              const isVideo = att.type?.startsWith('video/') || att.url?.match(/\.(mp4|webm|ogg)$/i);

              if (isImage && att.url) {
                return (
                  <div key={idx} className="relative group/att max-w-full sm:max-w-sm rounded-sm overflow-hidden border border-surface-border bg-surface-panel shadow-sm">
                    <img 
                      src={att.url} 
                      alt={att.name || 'Attachment'}
                      onClick={() => setActiveMediaPreview(att)}
                      className="max-h-60 max-w-full w-auto object-cover cursor-pointer hover:opacity-90 transition" 
                    />
                    <div className="p-1.5 bg-surface-active/80 backdrop-blur-sm text-[11px] text-text-primary flex items-center justify-between border-t border-surface-border">
                      <span className="truncate max-w-[min(12rem,60vw)]">{att.name}</span>
                      <button
                        onClick={() => setActiveMediaPreview(att)}
                        className="text-accent-primary hover:underline font-semibold"
                      >
                        Expand
                      </button>
                    </div>
                  </div>
                );
              }

              if (isVideo && att.url) {
                return (
                  <div key={idx} className="max-w-full sm:max-w-sm rounded-sm overflow-hidden border border-surface-border bg-surface-panel shadow-sm">
                    <video 
                      src={att.url} 
                      controls 
                      className="max-h-60 w-full object-cover" 
                    />
                    <div className="p-1.5 bg-surface-active/80 backdrop-blur-sm text-[11px] text-text-primary flex items-center justify-between border-t border-surface-border">
                      <span className="truncate max-w-[min(12rem,60vw)]">{att.name}</span>
                      <button
                        onClick={() => setActiveMediaPreview(att)}
                        className="text-accent-primary hover:underline font-semibold"
                      >
                        Fullscreen
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={idx} className="flex items-center space-x-3 bg-surface-panel p-2.5 rounded-sm border border-surface-border max-w-full sm:max-w-xs shadow-sm">
                  <FileText className="w-8 h-8 text-accent-primary flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-text-primary truncate">{att.name}</div>
                    <div className="text-[11px] text-text-muted">
                      {att.size ? `${(att.size / 1024).toFixed(1)} KB` : 'File'}
                    </div>
                  </div>
                  {att.url && (
                    <a
                      href={att.url}
                      download={att.name}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 hover:bg-surface-hover text-text-muted hover:text-text-primary rounded transition"
                      title="Download File"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Reaction Pills List */}
        {Object.keys(reactionCounts).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(reactionCounts).map(([emoji, data]) => (
              <button
                key={emoji}
                onClick={() => handleToggleReaction(emoji)}
                className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-md border text-xs font-semibold transition-all shadow-sm ${
                  data.hasUserReacted
                    ? 'bg-accent-primary/20 border-accent-primary text-accent-primary'
                    : 'bg-surface-panel border-surface-border text-text-muted hover:bg-surface-hover'
                }`}
              >
                <span>{emoji}</span>
                <span>{data.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Hover Toolbar */}
      {(message.channel_id || message.conversation_id) && (
        <div className="message-actions absolute right-4 -top-3 items-center bg-surface-active/90 backdrop-blur-sm border border-surface-border rounded-md shadow-lg p-0.5 z-10 space-x-1">
          <button className="icon-button" onClick={toggleSaved} title={isSaved ? 'Unsave message' : 'Save message'} aria-label={isSaved ? 'Unsave message' : 'Save message'} aria-pressed={isSaved}><Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} /></button>
          <button className="icon-button" title="Reply to message" aria-label="Reply to message" onClick={() => window.dispatchEvent(new CustomEvent('reply-message', { detail: { message } }))}><Reply size={16}/></button>
          <button className="icon-button" title="More message actions" aria-label="More message actions" onClick={e => { const box = e.currentTarget.getBoundingClientRect(); setMsgContextMenu({ x: box.right - 192, y: box.bottom + 5 }); }}><MoreHorizontal size={16}/></button>
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
            title="Add Reaction"
          >
            <Smile className="w-4 h-4" />
          </button>

          {showEmojiPicker && (
            <EmojiPicker
              onSelectEmoji={handleToggleReaction}
              onClose={() => setShowEmojiPicker(false)}
            />
          )}
        </div>
      )}

      {/* Lightbox Modal */}
      {activeMediaPreview && (
        <MediaLightboxModal
          media={activeMediaPreview}
          onClose={() => setActiveMediaPreview(null)}
        />
      )}

      {/* User Context Menu */}
      {contextMenu && (
        <UserContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          user={author}
          contextType="chat"
          isLocalUser={isOwnMessage}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Message Context Menu */}
      {msgContextMenu && (
        <MessageContextMenu
          x={msgContextMenu.x}
          y={msgContextMenu.y}
          message={message}
          isOwnMessage={isOwnMessage}
          onClose={() => setMsgContextMenu(null)}
          onAddReaction={() => setShowEmojiPicker(true)}
          onSave={toggleSaved}
          isSaved={isSaved}
          onReply={() => window.dispatchEvent(new CustomEvent('reply-message', { detail: { message } }))}
          onReplyThread={() => {
            setActiveThreadMessage(message);
          }}
          onEdit={() => window.dispatchEvent(new CustomEvent('edit-message', { detail: { message } }))}
        />
      )}
    </div>
  );
}
