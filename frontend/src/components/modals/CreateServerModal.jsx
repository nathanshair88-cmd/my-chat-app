import useDialog from '../../hooks/useDialog';
import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import { X, Plus, Compass } from 'lucide-react';

export default function CreateServerModal({ mode = 'create', onClose }) {
  const dialogRef = useDialog(onClose);
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
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Your space" tabIndex={-1} className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 select-none animate-in fade-in duration-200">
      <div className="bg-surface-base border border-surface-border rounded-md modal-width-md max-w-md shadow-2xl overflow-hidden responsive-modal-panel overflow-y-auto responsive-safe-scroll">
        <div className="p-4 sm:p-6 text-center space-y-2 relative">
          <button aria-label="Close dialog" onClick={onClose} className="absolute right-4 top-4 text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
          
          <div className="w-12 h-12 rounded-md bg-accent-primary flex items-center justify-center mx-auto mb-2">
            {mode === 'create' ? <Plus className="w-6 h-6 text-text-primary" /> : <Compass className="w-6 h-6 text-text-primary" />}
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-text-primary">
            {mode === 'create' ? 'Make a space of your own' : 'Find your people'}
          </h2>
          <p className="text-xs text-text-muted">
            {mode === 'create'
              ? 'A home for your friends, your ideas, and everything in between.'
              : 'An invite is all you need. Paste your code to get started.'}
          </p>
        </div>

        {error && (
          <div className="px-6 text-xs text-rose-400 font-semibold text-center">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-4">
          {mode === 'create' ? (
            <>
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                  Space name
                </label>
                <input
                  type="text"
                  aria-label="Space name"
                  maxLength={100}
                  required
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="My Gaming Hangout"
                  className="w-full bg-surface-active text-text-primary text-sm rounded-sm px-3 py-2.5 border border-surface-border focus:outline-none focus:border-accent-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                  Space icon URL (optional)
                </label>
                <input
                  type="url"
                  aria-label="Space icon URL"
                  value={iconUrl}
                  onChange={(e) => setIconUrl(e.target.value)}
                  placeholder="https://example.com/icon.png"
                  className="w-full bg-surface-active text-text-primary text-sm rounded-sm px-3 py-2.5 border border-surface-border focus:outline-none focus:border-accent-primary"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                Invite Code
              </label>
              <input
                type="text"
                aria-label="Invite code"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="e.g. h8K2pL9q"
                className="w-full bg-surface-active text-text-primary text-sm rounded-sm px-3 py-2.5 border border-surface-border focus:outline-none focus:border-accent-primary"
              />
            </div>
          )}

          <div className="bg-surface-panel -mx-6 -mb-6 p-4 flex items-center justify-between gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-text-primary hover:underline"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 sm:px-6 py-2 bg-accent-primary hover:bg-accent-hover text-text-primary font-bold text-sm rounded-sm transition-colors"
            >
              {loading ? 'Working...' : mode === 'create' ? 'Create space' : 'Join space'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
