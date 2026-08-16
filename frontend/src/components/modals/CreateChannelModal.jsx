import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import { X, Hash, Volume2, Video } from 'lucide-react';

export default function CreateChannelModal({ onClose }) {
  const { addChannel } = useServer();
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState('text');
  const [category, setCategory] = useState('General');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!channelName.trim()) return;
    setLoading(true);
    try {
      await addChannel(channelName.trim(), channelType, category.trim());
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const channelTypes = [
    { id: 'text', title: 'Text Channel', desc: 'Post messages, images, code snippets, and files', icon: Hash },
    { id: 'voice', title: 'Voice Channel', desc: 'Hang out together with crystal-clear voice and screen share', icon: Volume2 },
    { id: 'media', title: 'Media Room', desc: 'WebRTC P2P multi-stream camera and video sharing space', icon: Video },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-200">
      <div className="bg-[#313338] border border-[#2b2d31] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 flex items-center justify-between border-b border-[#2b2d31]">
          <h2 className="text-xl font-bold text-white">Create Channel</h2>
          <button onClick={onClose} className="text-[#949ba4] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#b5bac1] uppercase tracking-wider mb-2">
              Channel Type
            </label>
            <div className="space-y-2">
              {channelTypes.map((t) => {
                const Icon = t.icon;
                const isSelected = channelType === t.id;

                return (
                  <div
                    key={t.id}
                    onClick={() => setChannelType(t.id)}
                    className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#404249] border-[#5865f2]' : 'bg-[#2b2d31] border-transparent hover:bg-[#35373c]'
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${isSelected ? 'text-[#5865f2]' : 'text-[#949ba4]'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white leading-tight">{t.title}</div>
                      <div className="text-xs text-[#949ba4] leading-tight mt-0.5">{t.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#b5bac1] uppercase tracking-wider mb-1">
              Channel Name
            </label>
            <input
              type="text"
              required
              value={channelName}
              onChange={(e) => setChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              placeholder="new-channel"
              className="w-full bg-[#1e1f22] text-white text-sm rounded-lg px-3 py-2.5 border border-[#2b2d31] focus:outline-none focus:border-[#5865f2]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#b5bac1] uppercase tracking-wider mb-1">
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Text Channels"
              className="w-full bg-[#1e1f22] text-white text-sm rounded-lg px-3 py-2.5 border border-[#2b2d31] focus:outline-none focus:border-[#5865f2]"
            />
          </div>

          <div className="bg-[#2b2d31] -mx-6 -mb-6 p-4 flex items-center justify-between mt-6">
            <button type="button" onClick={onClose} className="text-xs font-semibold text-white hover:underline">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white font-bold text-sm rounded-lg transition-colors"
            >
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
