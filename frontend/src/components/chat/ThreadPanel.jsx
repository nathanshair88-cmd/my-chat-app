import React, { useState, useEffect, useRef } from 'react';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { channelAPI } from '../../services/api';
import MessageItem from './MessageItem';
import MessageInput from './MessageInput';
import { X, Hash, MessageSquare } from 'lucide-react';
import { getSocket } from '../../services/socket';

export default function ThreadPanel() {
  const { currentChannel, activeThreadMessage, setActiveThreadMessage } = useServer();
  const { user } = useAuth();
  
  const [threadMessages, setThreadMessages] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const fetchThread = async () => {
      if (!currentChannel || !activeThreadMessage) return;
      try {
        const res = await channelAPI.getThreadMessages(currentChannel.id, activeThreadMessage.id);
        setThreadMessages(res.data);
      } catch (err) {
        console.error("Error fetching thread messages:", err);
      }
    };
    fetchThread();
  }, [currentChannel, activeThreadMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewMessage = (msg) => {
      if (msg.parent_id === activeThreadMessage?.id) {
        setThreadMessages((prev) => [...prev, msg]);
      }
    };

    socket.on('new_message', handleNewMessage);
    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [activeThreadMessage]);

  if (!activeThreadMessage) return null;

  return (
    <div className="w-[400px] border-l border-surface-border bg-surface-panel/30 backdrop-blur-md flex flex-col z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.1)]">
      {/* Header */}
      <div className="h-12 px-4 border-b border-surface-border flex items-center justify-between shadow-sm bg-surface-active/80">
        <div className="flex items-center min-w-0">
          <MessageSquare className="w-5 h-5 text-accent-primary mr-2" />
          <span className="font-bold text-text-primary text-md truncate">Thread</span>
        </div>
        <button
          onClick={() => setActiveThreadMessage(null)}
          className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
        {/* Parent Message Preview */}
        <div className="mb-4 pb-4 border-b border-surface-border">
          <div className="text-xs text-text-muted font-bold uppercase tracking-wider mb-2">Original Message</div>
          <MessageItem message={activeThreadMessage} />
        </div>

        {threadMessages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-surface-panel/50 border-t border-surface-border">
         <MessageInput parentId={activeThreadMessage.id} placeholder={`Reply in thread...`} />
      </div>
    </div>
  );
}
