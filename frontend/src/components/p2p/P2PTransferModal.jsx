import React, { useState, useEffect } from 'react';
import { p2pEngine } from '../../services/webrtcP2PFile';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { X, Share2, Upload, Download, Play, Pause, AlertCircle, CheckCircle2, Zap } from 'lucide-react';

export default function P2PTransferModal({ onClose }) {
  const { currentServer } = useServer();
  const { user } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    return p2pEngine.subscribe(setTransfers);
  }, []);

  const members = (currentServer?.members || []).filter(m => m.user.id !== user?.id);

  const handleStartSend = async () => {
    if (!selectedFile || !selectedPeer) return;
    await p2pEngine.sendFile(selectedFile, selectedPeer.user);
    setSelectedFile(null);
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200 select-none">
      <div className="bg-[#313338] border border-[#2b2d31] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="bg-[#2b2d31] px-6 py-4 flex items-center justify-between border-b border-[#1f2023]">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-[#5865f2] flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-none">Unrestricted P2P File Share</h2>
              <p className="text-xs text-[#949ba4] mt-0.5">Direct browser-to-browser WebRTC DataChannel (No file size caps)</p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 text-[#949ba4] hover:text-white rounded-lg hover:bg-[#35373c] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto no-scrollbar flex-1">
          {/* Send File Section */}
          <div className="bg-[#2b2d31] p-4 rounded-xl border border-[#3f4147] space-y-4">
            <h3 className="text-xs font-bold text-[#949ba4] uppercase tracking-wider">Initiate New Transfer</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Select Recipient Peer */}
              <div>
                <label className="block text-xs font-semibold text-[#dbdee1] mb-1">Select Peer</label>
                <select
                  onChange={(e) => {
                    const m = members.find(mem => mem.user.id === Number(e.target.value));
                    setSelectedPeer(m);
                  }}
                  className="w-full bg-[#1e1f22] text-white text-xs rounded-lg p-2.5 border border-[#3f4147] focus:outline-none focus:border-[#5865f2]"
                >
                  <option value="">-- Choose Server Member --</option>
                  {members.map(m => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.username} ({m.user.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Choose File */}
              <div>
                <label className="block text-xs font-semibold text-[#dbdee1] mb-1">Select File (Any GBs+)</label>
                <input
                  key={selectedFile ? selectedFile.name : 'empty'}
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  className="w-full bg-[#1e1f22] text-white text-xs rounded-lg p-2 border border-[#3f4147] focus:outline-none file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#5865f2] file:text-white hover:file:bg-[#4752c4]"
                />
              </div>
            </div>

            {selectedFile && selectedPeer && (
              <button
                onClick={handleStartSend}
                className="w-full py-2.5 bg-[#23a55a] hover:bg-[#1db853] text-white font-bold rounded-lg transition-colors flex items-center justify-center space-x-2 text-sm"
              >
                <Upload className="w-4 h-4" />
                <span>Start Direct P2P Transfer ({formatBytes(selectedFile.size)})</span>
              </button>
            )}
          </div>

          {/* Active Transfers Progress Stream */}
          <div>
            <h3 className="text-xs font-bold text-[#949ba4] uppercase tracking-wider mb-3">Live Active P2P Transfers</h3>

            {transfers.length === 0 ? (
              <div className="text-center py-8 text-[#949ba4] text-xs bg-[#2b2d31]/50 rounded-xl border border-dashed border-[#3f4147]">
                No active or recent transfers. Select a file above to begin.
              </div>
            ) : (
              <div className="space-y-3">
                {transfers.map((t) => (
                  <div key={t.transfer_id} className="bg-[#1e1f22] p-4 rounded-xl border border-[#2b2d31] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0 pr-2">
                        {t.role === 'sender' ? <Upload className="w-4 h-4 text-[#5865f2] flex-shrink-0" /> : <Download className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                        <span className="text-xs font-bold text-white truncate">{t.file_name}</span>
                        <span className="text-[11px] text-[#949ba4]">({formatBytes(t.file_size)})</span>
                      </div>

                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded capitalize ${
                        t.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                        t.status === 'transferring' ? 'bg-[#5865f2]/20 text-[#5865f2]' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {t.status}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-[#2b2d31] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#5865f2] h-full transition-all duration-150"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>

                    {/* Metrics Line: Progress %, Transfer Speed MB/s, Controls */}
                    <div className="flex items-center justify-between text-[11px] text-[#949ba4]">
                      <div>
                        <span>{t.progress}%</span>
                        {t.speedMBps > 0 && <span className="ml-2 font-mono text-white font-semibold">{t.speedMBps} MB/s</span>}
                        {t.etaSeconds > 0 && <span className="ml-2">({t.etaSeconds}s remaining)</span>}
                      </div>

                      <div className="flex items-center space-x-2">
                        {t.status === 'pending' && t.role === 'receiver' && (
                          <button
                            onClick={() => p2pEngine.acceptTransfer(t.transfer_id)}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded text-[10px]"
                          >
                            Accept Download
                          </button>
                        )}

                        {t.role === 'sender' && t.status === 'transferring' && (
                          <button
                            onClick={() => p2pEngine.pauseTransfer(t.transfer_id)}
                            className="p-1 hover:text-white transition-colors"
                            title="Pause"
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {t.role === 'sender' && t.status === 'paused' && (
                          <button
                            onClick={() => p2pEngine.resumeTransfer(t.transfer_id)}
                            className="p-1 hover:text-white transition-colors"
                            title="Resume"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => p2pEngine.cancelTransfer(t.transfer_id)}
                          className="p-1 hover:text-rose-400 transition-colors"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
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
