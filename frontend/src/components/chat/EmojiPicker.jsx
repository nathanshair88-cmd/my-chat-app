import React from 'react';

const EMOJI_LIST = ['🔥', '👍', '❤️', '😂', '🎉', '🚀', '👀', '💯', '⚡', '😎', '💩', '🙌', '😍', '🤔', '💀', '✨'];

export default function EmojiPicker({ onSelectEmoji, onClose }) {
  return (
    <div className="absolute bottom-10 right-0 bg-surface-active border border-surface-border rounded-md shadow-2xl p-2.5 z-50 w-[min(16rem,calc(100vw-1rem))] animate-in fade-in zoom-in-95 duration-150">
      <div className="text-[11px] font-bold text-text-muted px-1 mb-2 uppercase tracking-wider">Select Reaction</div>
      <div className="grid grid-cols-6 gap-1.5">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onSelectEmoji(emoji);
              onClose();
            }}
            className="w-9 h-9 flex items-center justify-center text-xl rounded-sm hover:bg-surface-hover transition-transform active:scale-95"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
