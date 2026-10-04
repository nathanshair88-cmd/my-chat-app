import React, { useState, useRef, useEffect } from 'react';
import { getSocket } from '../../services/socket';
import { useServer } from '../../context/ServerContext';
import { Send, Bold, Code, Italic, Paperclip, Share2, X, FileText, PlaySquare } from 'lucide-react';
import GifPicker from './GifPicker';
import { readLocal, writeLocal } from '../../services/localWorkspace';
import { useAuth } from '../../context/AuthContext';

export default function MessageInput({ onOpenP2PModal, droppedFiles = [], parentId = null, compact = false }) {
  const { viewMode, currentChannel, currentDM } = useServer();
  const { user } = useAuth();
  const draftKey = `alto:draft:${user?.id}:${viewMode}:${currentDM?.id || currentChannel?.id}:${parentId || 'main'}`;
  const [content, setContent] = useState(() => readLocal(draftKey, ''));
  const [attachments, setAttachments] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [sendError, setSendError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  const inputRef = useRef(null);
  const draftRef = useRef({ key: draftKey, content, editing: false });
  useEffect(() => {
    draftRef.current = { key: draftKey, content, editing: Boolean(editingMessage) };
    if (!editingMessage) setDraftSaveFailed(!writeLocal(draftKey, content));
  }, [draftKey, content, editingMessage]);
  useEffect(() => () => {
    const draft = draftRef.current;
    if (!draft.editing) writeLocal(draft.key, draft.content);
    clearTimeout(typingTimeoutRef.current);
  }, []);
  useEffect(() => {
    if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`; }
  }, [content]);

  const clearComposer = () => {
    writeLocal(draftKey, '');
    draftRef.current.content = '';
    setContent('');
    setAttachments([]);
    setReplyingTo(null);
    setEditingMessage(null);
    setSendError('');
  };

  const formatSendError = (response, fallback) => (
    response?.exception ||
    response?.error ||
    fallback
  );

  const emitWithAck = (eventName, payload, onSuccess) => {
    const activeSocket = getSocket();
    if (!activeSocket?.connected) {
      setSendError('Realtime connection is disconnected. Please wait a moment and try again.');
      return;
    }

    setIsSending(true);
    setSendError('');
    activeSocket.timeout(7000).emit(eventName, payload, (err, response) => {
      setIsSending(false);
      if (err) {
        setSendError('Message send timed out. Please try again.');
        console.error(`${eventName} timed out`, err);
        return;
      }
      if (!response?.ok) {
        setSendError(formatSendError(response, 'Message failed to send.'));
        console.error(`${eventName} failed`, response);
        return;
      }
      onSuccess?.(activeSocket, response);
    });
  };

  // Append dropped files if passed from parent ChatArea drag-and-drop
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      handleFilesSelected(droppedFiles);
    }
  }, [droppedFiles]);

  // Listen for @mention and reply events
  useEffect(() => {
    const handleMentionEvent = (e) => {
      if (parentId) return;
      const { username } = e.detail;
      setContent(prev => `${prev}@${username} `);
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleReplyEvent = (e) => {
      const { message } = e.detail;
      if ((message.parent_id || null) !== parentId) return;
      setReplyingTo(message);
      setEditingMessage(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleEditEvent = (e) => {
      const { message } = e.detail;
      if ((message.parent_id || null) !== parentId) return;
      setEditingMessage(message);
      setReplyingTo(null);
      setAttachments([]);
      setContent(message.content || '');
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    window.addEventListener('mention-user', handleMentionEvent);
    window.addEventListener('reply-message', handleReplyEvent);
    window.addEventListener('edit-message', handleEditEvent);
    return () => {
      window.removeEventListener('mention-user', handleMentionEvent);
      window.removeEventListener('reply-message', handleReplyEvent);
      window.removeEventListener('edit-message', handleEditEvent);
    };
  }, [parentId]);


  const handleFilesSelected = (files) => {
    Array.from(files).forEach(file => {
      // Prevent very large files from crashing the browser tab by freezing the main thread during base64 encoding
      // and maxing out the WebSocket payload limit.
      if (file.size > 5 * 1024 * 1024) {
        setSendError(`“${file.name}” is larger than 5 MB. Use Direct transfer for larger files.`);
        return;
      }
      
      const reader = new FileReader();
      reader.onerror = () => setSendError(`Could not read “${file.name}”. Please try a different file.`);
      reader.onload = (e) => {
        setAttachments(prev => {
          if (prev.reduce((sum, attachment) => sum + (attachment.size || 0), 0) + file.size > 5 * 1024 * 1024) {
            setSendError('Attachments can total up to 5 MB per message. Use Direct transfer for larger files.');
            return prev;
          }
          return [
          ...prev,
          {
            name: file.name,
            size: file.size,
            type: file.type,
            url: e.target.result
          }
        ]; });
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

    const activeSocket = getSocket();
    if (!activeSocket || viewMode !== 'server' || !currentChannel) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      activeSocket.emit('typing_start', { channel_id: currentChannel.id });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      activeSocket.emit('typing_stop', { channel_id: currentChannel.id });
    }, 2000);
  };

  const handleSendMessage = () => {
    const trimmed = content.trim();
    if ((!trimmed && attachments.length === 0) || isSending) return;

    let finalContent = trimmed;
    if (editingMessage) {
      if (!finalContent) return;
      const activeSocket = getSocket();
      if (!activeSocket?.connected) {
        setSendError('Realtime connection is disconnected. Please wait a moment and try again.');
        return;
      }
      emitWithAck('edit_message', {
        message_id: editingMessage.id,
        content: finalContent,
        channel_id: editingMessage.channel_id,
        conversation_id: editingMessage.conversation_id
      }, clearComposer);
      return;
    }

    if (replyingTo) {
      const author = replyingTo.author || replyingTo.sender;
      const quote = replyingTo.content.split('\n').map(line => `> ${line}`).join('\n');
      finalContent = `> **@${author?.username || 'user'}**\n${quote}\n\n${finalContent}`;
    }

    const attachments_json = attachments.length > 0 ? JSON.stringify(attachments) : null;

    if (viewMode === 'dm' && currentDM) {
      emitWithAck('send_dm_message', {
        conversation_id: currentDM.id,
        content: finalContent || (attachments.length > 0 ? '[Attachment]' : ''),
        attachments_json
      }, clearComposer);
    } else if (viewMode === 'server' && currentChannel) {
      emitWithAck('send_message', {
        channel_id: currentChannel.id,
        content: finalContent || (attachments.length > 0 ? '[Attachment]' : ''),
        attachments_json,
        parent_id: parentId
      }, (activeSocket) => {
        if (isTypingRef.current) {
          isTypingRef.current = false;
          activeSocket.emit('typing_stop', { channel_id: currentChannel.id });
        }
        clearComposer();
      });
    }
  };

  const handleSendGif = (gifUrl) => {
    if (isSending) return;
    const gifAttachment = [{
      name: "gif",
      type: "image/gif",
      url: gifUrl,
      size: 0
    }];
    const attachments_json = JSON.stringify(gifAttachment);

    if (viewMode === 'dm' && currentDM) {
      emitWithAck('send_dm_message', {
        conversation_id: currentDM.id,
        content: '[GIF]',
        attachments_json
      }, () => {
        setShowGifPicker(false);
        setSendError('');
      });
    } else if (viewMode === 'server' && currentChannel) {
      emitWithAck('send_message', {
        channel_id: currentChannel.id,
        content: '[GIF]',
        attachments_json,
        parent_id: parentId
      }, () => {
        setShowGifPicker(false);
        setSendError('');
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const insertFormatting = (prefix, suffix = prefix) => {
    const start = inputRef.current?.selectionStart ?? content.length;
    const end = inputRef.current?.selectionEnd ?? start;
    const selected = content.slice(start, end) || 'text';
    setContent(`${content.slice(0, start)}${prefix}${selected}${suffix}${content.slice(end)}`);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(start + prefix.length, start + prefix.length + selected.length); });
  };

  const placeholderText = viewMode === 'dm' 
    ? `Message @${currentDM?.other_user?.username || 'user'}`
    : `Message #${currentChannel ? currentChannel.name : 'channel'}`;

  return (
    <div className={`message-composer ${compact ? 'px-2 pb-2' : 'px-2 sm:px-4 pb-2 sm:pb-4'} bg-transparent`}>
      <div className="bg-surface-panel/40 backdrop-blur-md rounded-md border border-surface-border p-2 flex flex-col space-y-2 shadow-lg">
        {/* Reply Preview Bar */}
        {replyingTo && (
          <div className="flex items-center justify-between bg-surface-active/50 rounded-sm px-3 py-1.5 border border-surface-border mb-1 text-xs text-text-muted gap-2">
            <div className="flex items-center space-x-2 min-w-0">
              <span className="font-bold">Replying to @{(replyingTo.author || replyingTo.sender)?.username || 'user'}:</span>
              <span className="truncate">{replyingTo.content}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="hover:text-text-primary p-0.5 rounded transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {editingMessage && (
          <div className="flex items-center justify-between bg-surface-active/50 rounded-sm px-3 py-1.5 border border-surface-border mb-1 text-xs text-text-muted gap-2">
            <div className="flex items-center space-x-2 min-w-0">
              <span className="font-bold">Editing message</span>
              <span className="truncate">{editingMessage.content}</span>
            </div>
            <button onClick={() => { setEditingMessage(null); setContent(''); }} className="hover:text-text-primary p-0.5 rounded transition">
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
                <div key={idx} className="relative group flex items-center space-x-2 bg-surface-panel px-3 py-1.5 rounded-md border border-surface-border shadow-sm max-w-full">
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

        {sendError && (
          <div className="px-3 py-2 text-xs font-semibold text-danger bg-danger/10 border border-danger/40 rounded-sm">
            {sendError}
          </div>
        )}

        {/* Formatting & Action Bar */}
        <div className="composer-toolbar flex flex-wrap items-center justify-between gap-2 border-b border-surface-border pb-1.5 px-1 text-text-muted">
          <div className="flex items-center gap-1 min-w-0">
            <button 
              onClick={() => insertFormatting('**')} 
              className="p-2 sm:p-1 hover:text-text-primary hover:bg-surface-hover rounded transition-colors mobile-touch-target sm:min-w-0 sm:min-h-0"
              title="Bold (**text**)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button 
              onClick={() => insertFormatting('*')} 
              className="p-2 sm:p-1 hover:text-text-primary hover:bg-surface-hover rounded transition-colors mobile-touch-target sm:min-w-0 sm:min-h-0"
              title="Italic (*text*)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button 
              onClick={() => insertFormatting('```\n', '\n```')} 
              className="p-2 sm:p-1 hover:text-text-primary hover:bg-surface-hover rounded transition-colors mobile-touch-target sm:min-w-0 sm:min-h-0"
              title="Code Block (```code```)"
            >
              <Code className="w-4 h-4" />
            </button>
            
            {/* GIF Button */}
            <div className="relative">
              <button 
                onClick={() => setShowGifPicker(!showGifPicker)} 
                className="p-2 sm:p-1 hover:text-text-primary hover:bg-surface-hover rounded transition-colors mobile-touch-target sm:min-w-0 sm:min-h-0"
                title="Send a GIF"
              >
                <PlaySquare className="w-4 h-4" />
              </button>
              {showGifPicker && (
                <GifPicker 
                  onSelectGif={handleSendGif} 
                  onClose={() => setShowGifPicker(false)} 
                />
              )}
            </div>

            {/* File Attachment Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 sm:p-1 hover:text-accent-hover hover:bg-surface-hover rounded transition-colors text-accent-primary mobile-touch-target sm:min-w-0 sm:min-h-0"
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

          <div className="flex items-center gap-2 shrink-0">
            {/* P2P WebRTC DataChannel Share Button */}
            {onOpenP2PModal && <button
              onClick={onOpenP2PModal}
              className="flex items-center space-x-1 px-2.5 py-2 sm:py-1 bg-accent-primary hover:bg-accent-hover text-text-primary text-xs font-semibold rounded-md shadow transition-colors mobile-touch-target sm:min-w-0 sm:min-h-0"
              title="Direct transfer for large files"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className={compact ? 'hidden' : 'hidden sm:inline'}>Direct transfer</span>
            </button>}
          </div>
        </div>

        {/* Input Text Area */}
        <div className="composer-field flex items-end space-x-2">
          <textarea
            aria-label={parentId ? 'Reply in thread' : placeholderText}
            ref={inputRef}
            value={content}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            rows={1}
            className="w-full bg-transparent text-base sm:text-sm text-text-primary placeholder-text-muted focus:outline-none resize-none no-scrollbar px-1 py-2 sm:py-1 max-h-32"
          />

          <button
            aria-label={editingMessage ? 'Save edit' : 'Send message'}
            onClick={handleSendMessage}
            disabled={isSending || (!content.trim() && attachments.length === 0)}
            className={`p-2.5 sm:p-2 rounded-sm transition-colors flex-shrink-0 shadow-sm mobile-touch-target sm:min-w-0 sm:min-h-0 ${
              !isSending && (content.trim() || attachments.length > 0) ? 'bg-accent-primary text-text-primary hover:bg-accent-hover' : 'bg-surface-active text-text-muted cursor-not-allowed border border-surface-border'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
      <footer className="composer-hint"><span>Enter to send · Shift + Enter for a new line</span><span>{draftSaveFailed ? 'Browser storage full — draft not saved' : content && !editingMessage ? 'Draft saved on this device' : 'A little hello goes a long way.'}</span></footer>
    </div>
  );
}
