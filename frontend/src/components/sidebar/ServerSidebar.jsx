import React from 'react';
import { useServer } from '../../context/ServerContext';
import { Plus, Compass, LogOut, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ServerSidebar({ onOpenCreateServer, onOpenJoinServer }) {
  const { servers, currentServer, selectServer, viewMode, setViewMode, unreadDMs } = useServer();
  const { logout } = useAuth();

  const totalUnreadDMs = Object.values(unreadDMs || {}).reduce((sum, count) => sum + count, 0);

  return (
    <div className="w-[72px] bg-surface-panel/40 backdrop-blur-md flex flex-col items-center py-3 space-y-2 select-none z-20 border-r border-surface-border/50">
      {/* App Logo / Direct Messages Home Icon */}
      <button 
        onClick={() => setViewMode('dm')}
        className="relative group flex items-center justify-center"
      >
        <div className={`absolute left-0 w-1 bg-accent-primary rounded-r-full transition-all duration-200 ${viewMode === 'dm' ? 'h-10' : 'h-0 group-hover:h-5'}`} />
        <div className={`w-12 h-12 rounded-[24px] group-hover:rounded-[16px] flex items-center justify-center transition-all duration-200 shadow-md overflow-hidden ${
          viewMode === 'dm' ? 'rounded-[16px] bg-accent-primary text-text-primary' : 'bg-surface-hover text-text-primary hover:bg-accent-primary hover:text-text-primary'
        }`}>
          <img src="/disco_alto_logo.jpg" alt="Disco Alto" className="w-full h-full object-cover" />
        </div>

        {totalUnreadDMs > 0 && (
          <div className="absolute -bottom-1 -right-1 bg-danger text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-[3px] border-surface-base shadow-sm z-10">
            {totalUnreadDMs > 99 ? '99+' : totalUnreadDMs}
          </div>
        )}

        <div className="absolute left-[78px] bg-surface-active text-text-primary border border-surface-border text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
          Direct Messages
        </div>
      </button>

      <div className="w-8 h-[2px] bg-surface-border rounded my-1" />

      {/* Servers List */}
      <div className="flex-1 w-full overflow-y-auto space-y-2 no-scrollbar px-3">
        {servers.map((server) => {
          const isActive = currentServer && currentServer.id === server.id;
          const initials = server.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

          return (
            <button
              key={server.id}
              onClick={() => selectServer(server)}
              className="relative group flex items-center justify-center w-full"
            >
              {/* Active / Hover Pill Indicator */}
              <div className={`absolute left-[-12px] w-1 bg-accent-primary rounded-r-full transition-all duration-200 ${isActive ? 'h-10' : 'h-0 group-hover:h-5'}`} />
              
              <div className={`w-12 h-12 rounded-[24px] group-hover:rounded-[16px] transition-all duration-200 flex items-center justify-center font-semibold text-text-primary shadow-sm overflow-hidden ${
                isActive ? 'rounded-[16px] bg-accent-primary' : 'bg-surface-hover text-text-primary hover:bg-accent-primary hover:text-text-primary'
              }`}>
                {server.icon_url ? (
                  <img src={server.icon_url} alt={server.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              {/* Tooltip */}
              <div className="absolute left-[78px] bg-surface-active text-text-primary border border-surface-border text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                {server.name}
              </div>
            </button>
          );
        })}

        {/* Add Server Button */}
        <button
          onClick={onOpenCreateServer}
          className="group flex items-center justify-center w-full relative"
        >
          <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-surface-hover hover:bg-success flex items-center justify-center transition-all duration-200 text-success hover:text-text-primary">
            <Plus className="w-6 h-6" />
          </div>
          <div className="absolute left-[78px] bg-surface-active text-text-primary border border-surface-border text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
            Add a Server
          </div>
        </button>

        {/* Join Server via Invite Button */}
        <button
          onClick={onOpenJoinServer}
          className="group flex items-center justify-center w-full relative"
        >
          <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-surface-hover hover:bg-accent-primary flex items-center justify-center transition-all duration-200 text-text-muted hover:text-text-primary">
            <Compass className="w-6 h-6" />
          </div>
          <div className="absolute left-[78px] bg-surface-active text-text-primary border border-surface-border text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
            Explore / Join Server
          </div>
        </button>
      </div>

      {/* Logout Button */}
      <button
        onClick={logout}
        className="group flex items-center justify-center w-full relative mt-auto pt-2"
      >
        <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-surface-hover hover:bg-danger flex items-center justify-center transition-all duration-200 text-text-muted hover:text-text-primary">
          <LogOut className="w-5 h-5" />
        </div>
        <div className="absolute left-[78px] bg-surface-active text-text-primary border border-surface-border text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
          Log Out
        </div>
      </button>
    </div>
  );
}
