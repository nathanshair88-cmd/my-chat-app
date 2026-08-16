import React from 'react';
import { useServer } from '../../context/ServerContext';
import { Plus, Compass, LogOut, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ServerSidebar({ onOpenCreateServer, onOpenJoinServer }) {
  const { servers, currentServer, selectServer, viewMode, setViewMode } = useServer();
  const { logout } = useAuth();

  return (
    <div className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 space-y-2 select-none z-20 border-r border-[#2b2d31]">
      {/* App Logo / Direct Messages Home Icon */}
      <button 
        onClick={() => setViewMode('dm')}
        className="relative group flex items-center justify-center"
      >
        <div className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${viewMode === 'dm' ? 'h-10' : 'h-0 group-hover:h-5'}`} />
        <div className={`w-12 h-12 rounded-[24px] group-hover:rounded-[16px] flex items-center justify-center transition-all duration-200 shadow-md ${
          viewMode === 'dm' ? 'rounded-[16px] bg-[#5865f2] text-white' : 'bg-[#313338] text-[#dbdee1] hover:bg-[#5865f2] hover:text-white'
        }`}>
          <MessageSquare className="w-6 h-6" />
        </div>
        <div className="absolute left-[78px] bg-[#111214] text-white text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
          Direct Messages
        </div>
      </button>

      <div className="w-8 h-[2px] bg-[#35363c] rounded my-1" />

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
              <div className={`absolute left-[-12px] w-1 bg-white rounded-r-full transition-all duration-200 ${isActive ? 'h-10' : 'h-0 group-hover:h-5'}`} />
              
              <div className={`w-12 h-12 rounded-[24px] group-hover:rounded-[16px] transition-all duration-200 flex items-center justify-center font-semibold text-white shadow-sm overflow-hidden ${
                isActive ? 'rounded-[16px] bg-[#5865f2]' : 'bg-[#313338] hover:bg-[#5865f2]'
              }`}>
                {server.icon_url ? (
                  <img src={server.icon_url} alt={server.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              {/* Tooltip */}
              <div className="absolute left-[78px] bg-[#111214] text-white text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
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
          <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-[#313338] hover:bg-[#23a55a] flex items-center justify-center transition-all duration-200 text-[#23a55a] hover:text-white">
            <Plus className="w-6 h-6" />
          </div>
          <div className="absolute left-[78px] bg-[#111214] text-white text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
            Add a Server
          </div>
        </button>

        {/* Join Server via Invite Button */}
        <button
          onClick={onOpenJoinServer}
          className="group flex items-center justify-center w-full relative"
        >
          <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-[#313338] hover:bg-[#5865f2] flex items-center justify-center transition-all duration-200 text-[#b5bac1] hover:text-white">
            <Compass className="w-6 h-6" />
          </div>
          <div className="absolute left-[78px] bg-[#111214] text-white text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
            Explore / Join Server
          </div>
        </button>
      </div>

      {/* Logout Button */}
      <button
        onClick={logout}
        className="group flex items-center justify-center w-full relative mt-auto pt-2"
      >
        <div className="w-12 h-12 rounded-[24px] group-hover:rounded-[16px] bg-[#313338] hover:bg-[#da373c] flex items-center justify-center transition-all duration-200 text-[#b5bac1] hover:text-white">
          <LogOut className="w-5 h-5" />
        </div>
        <div className="absolute left-[78px] bg-[#111214] text-white text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
          Log Out
        </div>
      </button>
    </div>
  );
}
