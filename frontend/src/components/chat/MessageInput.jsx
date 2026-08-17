import React, { useState, useRef, useEffect } from 'react';
import { getSocket } from '../../services/socket';
import { useServer } from '../../context/ServerContext';
import { Send, Bold, Code, Italic, Paperclip, Share2, X, Image as ImageIcon, FileText } from 'lucide-react';

export default function MessageInput({ onOpenP2PModal, droppedFiles = [] }) {
  const { viewMode, currentChannel, currentDM } = useServer();
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  const socket = getSocket();

  const inputRef = useRef(null);

  // Append dropped files if passed from parent ChatArea drag-and-drop
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      handleFilesSelected(droppedFiles);
    }
  }, [droppedFiles]);

  // Listen for @mention and reply events
  useEffect(() => {
    const handleMentionEvent = (e) => {
      const { username } = e.detail;
      setContent(prev => `${prev}@${username} `);
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleReplyEvent = (e) => {
      const { message } = e.detail;
      setReplyingTo(message);
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    window.addEventListener('mention-user', handleMentionEvent);
    window.addEventListener('reply-message', handleReplyEvent);
    return () => {
      window.removeEventListener('mention-user', handleMentionEvent);
      window.removeEventListener('reply-message', handleReplyEvent);
    };
  }, []);


  const handleFilesSelected = (files) => {
    Array.from(files).forEach(file => {
      // Prevent very large files from crashing the browser tab by freezing the main thread during base64 encoding
      // and maxing out the WebSocket payload limit.
      if (file.size > 5 * 1024 * 1024) {
        alert(`File "${file.name}" is too large (>${(file.size / 1024 / 1024).toFixed(1)}MB). Please use the "P2P File Transfer" button for large files!`);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setAttachments(prev => [
          ...prev,
          {
            name: file.name,
            size: file.size,
            type: file.type,
            url: e.target.result
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
      e.target.value = '';
    }
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleTextChange = (e) => {
    const val = e.target.value;
    setContent(val);

    if (!socket || viewMode !== 'server' || !currentChannel) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('typing_start', { channel_id: currentChannel.id });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit('typing_stop', { channel_id: currentChannel.id });
    }, 2000);
  };

  const handleSendMessage = () => {
    const trimmed = content.trim();
    if ((!trimmed && attachments.length === 0) || !socket) return;

    let finalContent = trimmed;
    if (replyingTo) {
      const author = replyingTo.author || replyingTo.sender;
      const quote = replyingTo.content.split('\n').map(line => `> ${line}`).join('\n');
      finalContent = `> **@${author?.username || 'user'}**\n${quote}\n\n${finalContent}`;
    }

    const attachments_json = attachments.length > 0 ? JSON.stringify(attachments) : null;

    if (viewMode === 'dm' && currentDM) {
      socket.emit('send_dm_message', {
        conversation_id: currentDM.id,
        content: finalContent || (attachments.length > 0 ? '[Attachment]' : ''),
        attachments_json
      });
    } else if (viewMode === 'server' && currentChannel) {
      socket.emit('send_message', {
        channel_id: currentChannel.id,
        content: finalContent || (attachments.length > 0 ? '[Attachment]' : ''),
        attachments_json
      });

      if (isTypingRef.current) {
        isTypingRef.current = false;
        socket.emit('typing_stop', { channel_id: currentChannel.id });
      }
    }

    setContent('');
    setAttachments([]);
    setReplyingTo(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const insertFormatting = (prefix, suffix = prefix) => {
    setContent(prev => `${prev}${prefix}text${suffix}`);
  };

  const placeholderText = viewMode === 'dm' 
    ? `Message @${currentDM?.other_user?.username || 'user'}`
    : `Message #${currentChannel ? currentChannel.name : 'channel'}`;

  return (
    <div className="px-4 pb-4 bg-transparent">
      <div className="bg-surface-panel/40 backdrop-blur-md rounded-md border border-surface-border p-2 flex flex-col space-y-2 shadow-lg">
        {/* Reply Preview Bar */}
        {replyingTo && (
          <div className="flex items-center justify-between bg-surface-active/50 rounded-sm px-3 py-1.5 border border-surface-border mb-1 text-xs text-text-muted">
            <div className="flex items-center space-x-2 truncate">
              <span className="font-bold">Replying to @{(replyingTo.author || replyingTo.sender)?.username || 'user'}:</span>
              <span className="truncate">{replyingTo.content}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="hover:text-text-primary p-0.5 rounded transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Attachment Previews Chip Bar */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2 bg-surface-active/50 rounded-sm border border-surface-border">
            {attachments.map((att, idx) => {
              const isImage = att.type?.startsWith('image/');
              return (
                <div key={idx} className="relative group flex items-center space-x-2 bg-surface-panel px-3 py-1.5 rounded-md border border-surface-border shadow-sm">
                  {isImage ? (
                    <img src={att.url} alt={att.name} className="w-6 h-6 object-cover rounded" />
                  ) : (
                    <FileText className="w-5 h-5 text-accent-primary" />
                  )}
                  <span className="text-xs text-text-primary max-w-[120px] truncate">{att.name}</span>
                  <button
                    onClick={() => removeAttachment(idx)}
                    className="text-text-muted hover:text-danger p-0.5 rounded transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Formatting & Action Bar */}
        <div className="flex items-center justify-between border-b border-surface-border pb-1.5 px-1 text-text-muted">
          <div className="flex items-center space-x-1">
            <button 
              onClick={() => insertFormatting('**')} 
              className="p-1 hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
              title="Bold (**text**)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button 
              onClick={() => insertFormatting('*')} 
              className="p-1 hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
              title="Italic (*text*)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button 
              onClick={() => insertFormatting('```\n', '\n```')} 
              className="p-1 hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
              title="Code Block (```code```)"
            >
              <Code className="w-4 h-4" />
            </button>
            
            {/* File Attachment Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1 hover:text-accent-hover hover:bg-surface-hover rounded transition-colors text-accent-primary"
              title="Attach File / Image"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />
          </div>

          <div className="flex items-center space-x-2">
            {/* P2P WebRTC DataChannel Share Button */}
            <button
              onClick={onOpenP2PModal}
              className="flex items-center space-x-1 px-2.5 py-1 bg-accent-primary hover:bg-accent-hover text-text-primary text-xs font-semibold rounded-md shadow transition-colors"
              title="Send Direct P2P File (Unlimited GBs, Zero Server Storage)"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>P2P File Transfer</span>
            </button>
          </div>
        </div>

        {/* Input Text Area */}
        <div className="flex items-end space-x-2">
          <textarea
            ref={inputRef}
            value={content}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            rows={1}
            className="w-full bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none resize-none no-scrollbar px-1 py-1 max-h-32"
          />

          <button
            onClick={handleSendMessage}
            disabled={!content.trim() && attachments.length === 0}
            className={`p-2 rounded-sm transition-colors flex-shrink-0 shadow-sm ${
              content.trim() || attachments.length > 0 ? 'bg-accent-primary text-text-primary hover:bg-accent-hover' : 'bg-surface-active text-text-muted cursor-not-allowed border border-surface-border'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
