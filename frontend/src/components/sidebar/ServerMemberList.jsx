import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import UserContextMenu from '../modals/UserContextMenu';
import { X } from 'lucide-react';

export default function ServerMemberList({ onClose }) {
  const { currentServer, onlineUsers } = useServer();
  const [contextMenu, setContextMenu] = useState(null);

  if (!currentServer) return null;

  const members = currentServer.members || [];

  const rolesById = new Map((currentServer.roles || []).map(role => [role.id, role]));
  const onlineMembers = [];
  const offlineMembers = [];

  members.forEach(member => {
    const isOnline = onlineUsers.has(member.user.id);
    const customRole = member.custom_role_id ? rolesById.get(member.custom_role_id) : null;
    const m = {
      ...member.user,
      role: member.role,
      custom_role_id: member.custom_role_id,
      custom_role: customRole,
    };
    
    if (isOnline) {
      onlineMembers.push(m);
    } else {
      offlineMembers.push(m);
    }
  });

  const renderMember = (user) => {
    const roleColor = user.custom_role ? user.custom_role.color : 'var(--text-primary)';
    const isOnline = onlineUsers.has(user.id);
    const statusColor = isOnline ? 'bg-emerald-500' : 'bg-slate-500';
    const avatarUrl = user.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || 'user'}`;

    return (
      <div 
        key={user.id} 
        className="flex items-center space-x-3 px-2 py-1.5 hover:bg-surface-hover rounded-md cursor-pointer transition-colors group mb-[2px]"
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, user });
        }}
        onClick={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, user });
        }}
      >
        <div className="relative flex-shrink-0">
          <img src={avatarUrl} alt={user.username} className="w-8 h-8 rounded-full object-cover bg-surface-panel transition-all group-hover:opacity-90" />
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-[2.5px] border-surface-active ${statusColor}`} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate" style={{ color: roleColor }}>
            {user.username}
          </span>
          {user.status_message && (
            <span className="text-[11px] text-text-muted truncate leading-tight mt-0.5">
              {user.status_message}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[min(82vw,18rem)] bg-surface-active/95 border-l border-surface-border flex flex-col h-dvh overflow-hidden shrink-0 select-none shadow-2xl lg:relative lg:inset-auto lg:z-auto lg:w-56 xl:w-60 lg:h-full lg:bg-surface-active/30 lg:shadow-none">
      <div className="lg:hidden min-h-12 px-3 border-b border-surface-border bg-surface-panel/95 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-text-primary">Members</span>
        <button
          type="button"
          aria-label="Hide members"
          onClick={onClose}
          className="mobile-touch-target rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 xl:p-4 space-y-6 no-scrollbar responsive-safe-scroll">
        {onlineMembers.length > 0 && (
          <div>
            <h3 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2 px-2">
              Online — {onlineMembers.length}
            </h3>
            <div>
              {onlineMembers.map(renderMember)}
            </div>
          </div>
        )}

        {offlineMembers.length > 0 && (
          <div>
            <h3 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2 px-2">
              Offline — {offlineMembers.length}
            </h3>
            <div className="opacity-60 hover:opacity-100 transition-opacity">
              {offlineMembers.map(renderMember)}
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <UserContextMenu 
          x={contextMenu.x}
          y={contextMenu.y}
          user={contextMenu.user}
          contextType="chat"
          isLocalUser={String(contextMenu.user.id) === String(localStorage.getItem('discoalto_user_id'))}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
