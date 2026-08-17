import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import EmojiPicker from './EmojiPicker';
import MediaLightboxModal from '../modals/MediaLightboxModal';
import UserContextMenu from '../modals/UserContextMenu';
import MessageContextMenu from '../modals/MessageContextMenu';
import { Smile, FileText, Download, Play, Image as ImageIcon } from 'lucide-react';
import { getSocket } from '../../services/socket';
import { useAuth } from '../../context/AuthContext';
import { useServer } from '../../context/ServerContext';

export default function MessageItem({ message, searchQuery }) {
  const { user } = useAuth();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeMediaPreview, setActiveMediaPreview] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [msgContextMenu, setMsgContextMenu] = useState(null);

  const socket = getSocket();

  const author = message.author || message.sender;
  const isOwnMessage = author?.id === user?.id;

  const { currentServer, setActiveThreadMessage } = useServer();
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
    } catch (e) {
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

  return (
    <div className="group relative flex space-x-4 px-4 py-2 hover:bg-surface-hover transition-colors rounded-sm my-0.5">
      {/* Author Avatar — right-click for context menu */}
      <img
        src={author?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${author?.username || 'User'}`}
        alt={author?.username}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
        onClick={(e) => { if (e.button === 0) {} }}
        className="w-10 h-10 rounded-full bg-surface-panel object-cover flex-shrink-0 mt-0.5 border border-surface-border shadow-sm cursor-pointer hover:ring-2 hover:ring-accent-primary/50 transition-all"
      />

      <div className="flex-1 min-w-0">
        {/* Header line */}
        <div className="flex items-baseline space-x-2">
          <span
            className="font-semibold text-sm hover:underline cursor-pointer"
            style={roleColor ? { color: roleColor } : { color: 'var(--text-primary, #ffffff)' }}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
          >
            {author?.username || 'Unknown User'}
          </span>
          <span className="text-[11px] text-text-muted font-medium">{formattedDate}</span>
        </div>

        {/* Markdown Content Body */}
        <div 
          className="text-sm text-text-primary mt-1 leading-relaxed break-words space-y-1"
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMsgContextMenu({ x: e.clientX, y: e.clientY }); }}
        >
          {searchQuery ? (
            <div className="whitespace-pre-wrap">{renderContent(message.content)}</div>
          ) : (
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }) {
                  return inline ? (
                    <code className="bg-surface-active text-danger px-1.5 py-0.5 rounded font-mono text-xs border border-surface-border" {...props}>
                      {children}
                    </code>
                  ) : (
                    <pre className="bg-surface-active p-3 rounded-sm border border-surface-border font-mono text-xs text-accent-primary overflow-x-auto my-2 shadow-inner">
                      <code {...props}>{children}</code>
                    </pre>
                  );
                },
                a({ href, children }) {
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline">
                      {children}
                    </a>
                  );
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
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
                  <div key={idx} className="relative group/att max-w-sm rounded-sm overflow-hidden border border-surface-border bg-surface-panel shadow-sm">
                    <img 
                      src={att.url} 
                      alt={att.name || 'Attachment'}
                      onClick={() => setActiveMediaPreview(att)}
                      className="max-h-60 w-auto object-cover cursor-pointer hover:opacity-90 transition" 
                    />
                    <div className="p-1.5 bg-surface-active/80 backdrop-blur-sm text-[11px] text-text-primary flex items-center justify-between border-t border-surface-border">
                      <span className="truncate max-w-[200px]">{att.name}</span>
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
                  <div key={idx} className="max-w-sm rounded-sm overflow-hidden border border-surface-border bg-surface-panel shadow-sm">
                    <video 
                      src={att.url} 
                      controls 
                      className="max-h-60 w-full object-cover" 
                    />
                    <div className="p-1.5 bg-surface-active/80 backdrop-blur-sm text-[11px] text-text-primary flex items-center justify-between border-t border-surface-border">
                      <span className="truncate max-w-[200px]">{att.name}</span>
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
                <div key={idx} className="flex items-center space-x-3 bg-surface-panel p-2.5 rounded-sm border border-surface-border max-w-xs shadow-sm">
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
        <div className="absolute right-4 -top-3 hidden group-hover:flex items-center bg-surface-active/90 backdrop-blur-sm border border-surface-border rounded-md shadow-lg p-0.5 z-10 space-x-1">
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
