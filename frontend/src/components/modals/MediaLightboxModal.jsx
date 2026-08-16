import React from 'react';
import { X, Download, ExternalLink } from 'lucide-react';

export default function MediaLightboxModal({ media, onClose }) {
  if (!media) return null;

  const isVideo = media.type?.startsWith('video/') || media.url?.match(/\.(mp4|webm|ogg)$/i);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 select-none backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      {/* Top Controls */}
      <div className="absolute top-4 right-4 flex items-center space-x-3 z-50" onClick={e => e.stopPropagation()}>
        <a
          href={media.url}
          download={media.name || 'attachment'}
          target="_blank"
          rel="noreferrer"
          className="p-2 bg-[#2b2d31]/80 hover:bg-[#35373c] text-white rounded-full transition shadow-lg flex items-center justify-center"
          title="Download original"
        >
          <Download className="w-5 h-5" />
        </a>
        <button
          onClick={onClose}
          className="p-2 bg-[#2b2d31]/80 hover:bg-rose-600 text-white rounded-full transition shadow-lg flex items-center justify-center"
          title="Close preview"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Media Content Box */}
      <div 
        className="max-w-5xl max-h-[85vh] flex flex-col items-center justify-center relative"
        onClick={e => e.stopPropagation()}
      >
        {isVideo ? (
          <video 
            src={media.url} 
            controls 
            autoPlay 
            className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain border border-[#2b2d31]"
          />
        ) : (
          <img 
            src={media.url} 
            alt={media.name || 'Preview'} 
            className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain border border-[#2b2d31]"
          />
        )}

        {media.name && (
          <div className="mt-3 text-xs font-semibold text-[#dbdee1] bg-[#111214]/80 px-4 py-1.5 rounded-full border border-[#2b2d31]">
            {media.name} {media.size ? `(${(media.size / 1024).toFixed(1)} KB)` : ''}
          </div>
        )}
      </div>
    </div>
  );
}
