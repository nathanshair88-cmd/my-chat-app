import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, X } from 'lucide-react';

const GIPHY_API_KEY = 'dc6zaTOxFJmzC'; // Public beta key

export default function GifPicker({ onSelectGif, onClose }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    const fetchGifs = async () => {
      setLoading(true);
      try {
        const endpoint = query.trim() 
          ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20`;
        
        const res = await fetch(endpoint);
        const data = await res.json();
        setGifs(data.data || []);
      } catch (err) {
        console.error("Error fetching GIFs:", err);
      } finally {
        setLoading(false);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchGifs();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div 
      ref={pickerRef}
      className="absolute bottom-full mb-2 left-0 w-[300px] sm:w-[350px] bg-surface-active border border-surface-border rounded-lg shadow-2xl overflow-hidden animate-fadeIn z-50 flex flex-col h-[400px]"
    >
      {/* Header / Search */}
      <div className="p-2 border-b border-surface-border bg-surface-panel/50">
        <div className="relative">
          <input
            type="text"
            placeholder="Search Tenor/Giphy..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-surface-base text-text-primary text-sm px-3 py-1.5 pl-8 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-primary border border-surface-border"
            autoFocus
          />
          <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-2.5" />
          <button 
            onClick={onClose}
            className="absolute right-2 top-2 text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2 no-scrollbar bg-surface-base">
        {loading && gifs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-muted">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((gif) => (
              <img
                key={gif.id}
                src={gif.images.fixed_height_small.url}
                alt={gif.title}
                className="w-full h-24 object-cover rounded cursor-pointer hover:ring-2 hover:ring-accent-primary transition-all"
                onClick={() => {
                  onSelectGif(gif.images.original.url);
                  onClose();
                }}
              />
            ))}
          </div>
        )}
        {!loading && gifs.length === 0 && (
          <div className="text-center text-text-muted mt-8 text-sm">
            No GIFs found.
          </div>
        )}
      </div>
    </div>
  );
}
