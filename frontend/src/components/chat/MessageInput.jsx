import React, { useState, useRef, useEffect } from 'react';
import { getSocket } from '../../services/socket';
import { useServer } from '../../context/ServerContext';
import { Send, Bold, Code, Italic, Paperclip, Share2, X, Image as ImageIcon, FileText } from 'lucide-react';

export default function MessageInput({ onOpenP2PModal, droppedFiles = [] }) {
  const { viewMode, currentChannel, currentDM } = useServer();
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  const socket = getSocket();

  // Append dropped files if passed from parent ChatArea drag-and-drop
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      handleFilesSelected(droppedFiles);
    }
  }, [droppedFiles]);

  const handleFilesSelected = (files) => {
    Array.from(files).forEach(file => {
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

    const attachments_json = attachments.length > 0 ? JSON.stringify(attachments) : null;

    if (viewMode === 'dm' && currentDM) {
      socket.emit('send_dm_message', {
        conversation_id: currentDM.id,
        content: trimmed || (attachments.length > 0 ? '[Attachment]' : ''),
        attachments_json
      });
    } else if (viewMode === 'server' && currentChannel) {
      socket.emit('send_message', {
        channel_id: currentChannel.id,
        content: trimmed || (attachments.length > 0 ? '[Attachment]' : ''),
        attachments_json
      });

      if (isTypingRef.current) {
        isTypingRef.current = false;
        socket.emit('typing_stop', { channel_id: currentChannel.id });
      }
    }

    setContent('');
    setAttachments([]);
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
    <div className="px-4 pb-4 bg-[#313338]">
      <div className="bg-[#383a40] rounded-xl border border-[#2b2d31] p-2 flex flex-col space-y-2">
        {/* Attachment Previews Chip Bar */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-2 bg-[#2b2d31] rounded-lg border border-[#35373c]">
            {attachments.map((att, idx) => {
              const isImage = att.type?.startsWith('image/');
              return (
                <div key={idx} className="relative group flex items-center space-x-2 bg-[#1e1f22] px-3 py-1.5 rounded-md border border-[#35373c]">
                  {isImage ? (
                    <img src={att.url} alt={att.name} className="w-6 h-6 object-cover rounded" />
                  ) : (
                    <FileText className="w-5 h-5 text-[#5865f2]" />
                  )}
                  <span className="text-xs text-white max-w-[120px] truncate">{att.name}</span>
                  <button
                    onClick={() => removeAttachment(idx)}
                    className="text-[#949ba4] hover:text-rose-400 p-0.5 rounded transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Formatting & Action Bar */}
        <div className="flex items-center justify-between border-b border-[#2b2d31] pb-1.5 px-1 text-[#b5bac1]">
          <div className="flex items-center space-x-1">
            <button 
              onClick={() => insertFormatting('**')} 
              className="p-1 hover:text-white hover:bg-[#404249] rounded transition-colors"
              title="Bold (**text**)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button 
              onClick={() => insertFormatting('*')} 
              className="p-1 hover:text-white hover:bg-[#404249] rounded transition-colors"
              title="Italic (*text*)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button 
              onClick={() => insertFormatting('```\n', '\n```')} 
              className="p-1 hover:text-white hover:bg-[#404249] rounded transition-colors"
              title="Code Block (```code```)"
            >
              <Code className="w-4 h-4" />
            </button>
            
            {/* File Attachment Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1 hover:text-white hover:bg-[#404249] rounded transition-colors text-[#5865f2]"
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
              className="flex items-center space-x-1 px-2.5 py-1 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-semibold rounded-md shadow transition-colors"
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
            value={content}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            rows={1}
            className="w-full bg-transparent text-sm text-[#dbdee1] placeholder-[#80848e] focus:outline-none resize-none no-scrollbar px-1 py-1 max-h-32"
          />

          <button
            onClick={handleSendMessage}
            disabled={!content.trim() && attachments.length === 0}
            className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
              content.trim() || attachments.length > 0 ? 'bg-[#5865f2] text-white hover:bg-[#4752c4]' : 'bg-[#404249] text-[#80848e] cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
