import React, { useState, useEffect, useRef } from 'react';
import { getSocket } from '../../services/socket';
import { Copy, CornerUpLeft, Edit2, Trash2, Smile, AlertTriangle, Check } from 'lucide-react';

export default function MessageContextMenu({
  x, y,
  message,
  isOwnMessage = false,
  onClose,
  onReply,
  onEdit,
  onAddReaction
}) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: y, left: x });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      setPos({
        top: y + rect.height > window.innerHeight ? Math.max(0, y - rect.height) : y,
        left: x + rect.width > window.innerWidth ? Math.max(0, x - rect.width) : x
      });
    }
  }, [x, y]);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).catch(() => {});
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      onClose();
    }, 1000);
  };

  const handleReply = () => {
    if (onReply) onReply();
    onClose();
  };

  const handleEdit = () => {
    if (onEdit) onEdit();
    onClose();
  };

  const handleDelete = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('delete_message', { message_id: message.id, channel_id: message.channel_id, conversation_id: message.conversation_id });
    }
    onClose();
  };

  const handleReaction = () => {
    if (onAddReaction) onAddReaction();
    onClose();
  };

  const handleReport = () => {
    // Placeholder for reporting logic
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-48 bg-surface-active border border-surface-border rounded-lg shadow-2xl overflow-hidden animate-fadeIn text-[13px] p-1 space-y-0.5"
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem 
        icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />} 
        label={copied ? 'Copied!' : 'Copy Message'} 
        onClick={handleCopy} 
      />
      <MenuItem icon={<CornerUpLeft className="w-3.5 h-3.5" />} label="Reply" onClick={handleReply} />
      <MenuItem icon={<Smile className="w-3.5 h-3.5" />} label="Add Reaction" onClick={handleReaction} />
      
      {isOwnMessage && (
        <>
          <Divider />
          <MenuItem icon={<Edit2 className="w-3.5 h-3.5" />} label="Edit Message" onClick={handleEdit} />
          <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete Message" onClick={handleDelete} danger />
        </>
      )}

      {!isOwnMessage && (
        <>
          <Divider />
          <MenuItem icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Report Message" onClick={handleReport} danger />
        </>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-2.5 px-2 py-1.5 rounded-md transition-colors text-left ${
        danger
          ? 'text-danger hover:bg-danger hover:text-white'
          : 'text-text-primary hover:bg-accent-primary hover:text-white'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function Divider() {
  return <div className="my-1 border-t border-surface-border mx-1" />;
}
