import React, { useState, useEffect } from 'react';
import { p2pEngine } from '../../services/webrtcP2PFile';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { X, Upload, Download, Play, Pause, Zap } from 'lucide-react';
import useDialog from '../../hooks/useDialog';

export default function P2PTransferModal({ onClose }) {
  const dialogRef = useDialog(onClose);
  const { currentServer, conversations, friendships } = useServer();
  const { user } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    return p2pEngine.subscribe(setTransfers);
  }, []);

  const peers = new Map();
  (currentServer?.members || []).forEach(m => peers.set(m.user.id, m));
  conversations.forEach(c => { if (c.other_user) peers.set(c.other_user.id, { user: c.other_user }); });
  friendships.filter(f => f.status === 'accepted').forEach(f => { if (f.friend_user) peers.set(f.friend_user.id, { user: f.friend_user }); });
  const members = [...peers.values()].filter(m => m.user.id !== user?.id);

  const handleStartSend = async () => {
    if (!selectedFile || !selectedPeer) return;
    setError('');
    try { await p2pEngine.sendFile(selectedFile, selectedPeer.user); setSelectedFile(null); }
    catch { setError('Could not start the transfer. Make sure you are both online and try again.'); }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Direct file transfers" tabIndex={-1} className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200 select-none">
      <div className="bg-surface-base border border-surface-border rounded-md modal-width-2xl max-w-2xl shadow-2xl overflow-hidden flex flex-col responsive-modal-panel">
        {/* Modal Header */}
        <div className="bg-surface-panel px-4 sm:px-6 py-4 flex items-start sm:items-center justify-between gap-3 border-b border-surface-border">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="w-8 h-8 rounded-sm bg-accent-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-text-primary" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-text-primary leading-tight">Direct file transfers</h2>
              <p className="text-xs text-text-muted mt-0.5">A direct connection for the things you want to share.</p>
            </div>
          </div>

          <button aria-label="Close transfers" onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary rounded-sm hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto no-scrollbar flex-1 responsive-safe-scroll">
          <p className="text-xs text-text-muted">Keep Alto open on both devices. Files use a direct connection when possible, with a relay if needed. Speed depends on both connections; transfer size also depends on available device memory.</p>
          {error && <div className="inline-error" role="alert">{error}</div>}
          {/* Send File Section */}
          <div className="bg-surface-panel p-4 rounded-md border border-surface-border space-y-4">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">Send something good</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Select Recipient Peer */}
              <div>
                <label htmlFor="transfer-recipient" className="block text-xs font-semibold text-text-primary mb-1">Send to</label>
                <select
                  id="transfer-recipient"
                  onChange={(e) => {
                    const m = members.find(mem => mem.user.id === Number(e.target.value));
                    setSelectedPeer(m);
                  }}
                  className="w-full bg-surface-active text-text-primary text-xs rounded-sm p-2.5 border border-surface-border focus:outline-none focus:border-accent-primary"
                >
                  <option value="">Choose a friend or space member</option>
                  {members.map(m => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.username} ({m.user.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Choose File */}
              <div>
                <label htmlFor="transfer-file" className="block text-xs font-semibold text-text-primary mb-1">Choose a file</label>
                <input
                  id="transfer-file"
                  key={selectedFile ? selectedFile.name : 'empty'}
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  className="w-full bg-surface-active text-text-primary text-xs rounded-sm p-2 border border-surface-border focus:outline-none file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-accent-primary file:text-text-primary hover:file:bg-accent-hover"
                />
              </div>
            </div>

            {selectedFile && selectedPeer && (
              <button
                onClick={handleStartSend}
                className="w-full py-2.5 bg-success hover:bg-success/80 text-text-primary font-bold rounded-sm transition-colors flex items-center justify-center space-x-2 text-sm"
              >
                <Upload className="w-4 h-4" />
                <span>Send file directly ({formatBytes(selectedFile.size)})</span>
              </button>
            )}
          </div>

          {/* Active Transfers Progress Stream */}
          <div>
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Your transfers</h3>

            {transfers.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-xs bg-surface-panel/50 rounded-md border border-dashed border-surface-border">
                No active or recent transfers. Select a file above to begin.
              </div>
            ) : (
              <div className="space-y-3">
                {transfers.map((t) => (
                  <div key={t.transfer_id} className="bg-surface-active p-4 rounded-md border border-surface-border space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center space-x-2 min-w-0 pr-2">
                        {t.role === 'sender' ? <Upload className="w-4 h-4 text-accent-primary flex-shrink-0" /> : <Download className="w-4 h-4 text-success flex-shrink-0" />}
                        <span className="text-xs font-bold text-text-primary truncate">{t.file_name}</span>
                        <span className="text-[11px] text-text-muted">({formatBytes(t.file_size)})</span>
                      </div>

                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded capitalize ${
                        t.status === 'completed' ? 'bg-success/20 text-success' :
                        t.status === 'transferring' ? 'bg-accent-primary/20 text-accent-primary' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {t.status}
                      </span>
                    </div>

                    {t.error && <p className="text-xs text-danger" role="alert">{t.error}</p>}

                    {/* Progress Bar */}
                    <div className="w-full bg-surface-panel h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-accent-primary h-full transition-all duration-150"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>

                    {/* Metrics Line: Progress %, Transfer Speed MB/s, Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-text-muted">
                      <div>
                        <span>{t.progress}%</span>
                        {t.connectionType && <span className="ml-2">{t.connectionType === 'relay' ? 'Relayed connection' : 'Direct connection'}</span>}
                        {t.speedMBps > 0 && <span className="ml-2 font-mono text-text-primary font-semibold">{t.speedMBps} MB/s</span>}
                        {t.etaSeconds > 0 && <span className="ml-2">({t.etaSeconds}s remaining)</span>}
                      </div>

                      <div className="flex items-center space-x-2">
                        {t.status === 'pending' && t.role === 'receiver' && (
                          <button
                            onClick={() => p2pEngine.acceptTransfer(t.transfer_id)}
                            className="px-2 py-1 bg-success hover:bg-success/80 text-text-primary font-semibold rounded text-[10px]"
                          >
                            Accept Download
                          </button>
                        )}

                        {t.role === 'sender' && t.status === 'transferring' && (
                          <button
                            onClick={() => p2pEngine.pauseTransfer(t.transfer_id)}
                            className="p-1 hover:text-text-primary transition-colors"
                            title="Pause"
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {t.role === 'sender' && t.status === 'paused' && (
                          <button
                            onClick={() => p2pEngine.resumeTransfer(t.transfer_id)}
                            className="p-1 hover:text-text-primary transition-colors"
                            title="Resume"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {!['completed', 'cancelled', 'rejected', 'failed'].includes(t.status) && <button
                          onClick={() => p2pEngine.cancelTransfer(t.transfer_id)}
                          className="p-1 hover:text-danger transition-colors"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
