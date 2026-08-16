import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import { X, Plus, Compass } from 'lucide-react';

export default function CreateServerModal({ mode = 'create', onClose }) {
  const { addServer, joinServer } = useServer();
  const [serverName, setServerName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'create') {
        if (!serverName.trim()) return;
        await addServer(serverName.trim(), iconUrl.trim() || null);
      } else {
        if (!inviteCode.trim()) return;
        await joinServer(inviteCode.trim());
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-200">
      <div className="bg-[#313338] border border-[#2b2d31] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 text-center space-y-2 relative">
          <button onClick={onClose} className="absolute right-4 top-4 text-[#949ba4] hover:text-white">
            <X className="w-5 h-5" />
          </button>
          
          <div className="w-12 h-12 rounded-2xl bg-[#5865f2] flex items-center justify-center mx-auto mb-2">
            {mode === 'create' ? <Plus className="w-6 h-6 text-white" /> : <Compass className="w-6 h-6 text-white" />}
          </div>

          <h2 className="text-2xl font-bold text-white">
            {mode === 'create' ? 'Customize Your Server' : 'Join a Server'}
          </h2>
          <p className="text-xs text-[#949ba4]">
            {mode === 'create'
              ? 'Give your new server a personality with a name and icon.'
              : 'Enter an invite code below to join an existing server.'}
          </p>
        </div>

        {error && (
          <div className="px-6 text-xs text-rose-400 font-semibold text-center">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-4">
          {mode === 'create' ? (
            <>
              <div>
                <label className="block text-xs font-bold text-[#b5bac1] uppercase tracking-wider mb-1">
                  Server Name
                </label>
                <input
                  type="text"
                  required
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="My Gaming Hangout"
                  className="w-full bg-[#1e1f22] text-white text-sm rounded-lg px-3 py-2.5 border border-[#2b2d31] focus:outline-none focus:border-[#5865f2]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#b5bac1] uppercase tracking-wider mb-1">
                  Server Icon URL (Optional)
                </label>
                <input
                  type="url"
                  value={iconUrl}
                  onChange={(e) => setIconUrl(e.target.value)}
                  placeholder="https://example.com/icon.png"
                  className="w-full bg-[#1e1f22] text-white text-sm rounded-lg px-3 py-2.5 border border-[#2b2d31] focus:outline-none focus:border-[#5865f2]"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-bold text-[#b5bac1] uppercase tracking-wider mb-1">
                Invite Code
              </label>
              <input
                type="text"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="e.g. h8K2pL9q"
                className="w-full bg-[#1e1f22] text-white text-sm rounded-lg px-3 py-2.5 border border-[#2b2d31] focus:outline-none focus:border-[#5865f2]"
              />
            </div>
          )}

          <div className="bg-[#2b2d31] -mx-6 -mb-6 p-4 flex items-center justify-between mt-6">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-white hover:underline"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white font-bold text-sm rounded-lg transition-colors"
            >
              {loading ? 'Working...' : mode === 'create' ? 'Create Server' : 'Join Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
