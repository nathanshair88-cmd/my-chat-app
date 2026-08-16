import React from 'react';

const EMOJI_LIST = ['🔥', '👍', '❤️', '😂', '🎉', '🚀', '👀', '💯', '⚡', '😎', '💩', '🙌', '😍', '🤔', '💀', '✨'];

export default function EmojiPicker({ onSelectEmoji, onClose }) {
  return (
    <div className="absolute bottom-10 right-0 bg-[#111214] border border-[#2b2d31] rounded-xl shadow-2xl p-2.5 z-50 w-64 animate-in fade-in zoom-in-95 duration-150">
      <div className="text-[11px] font-bold text-[#949ba4] px-1 mb-2 uppercase tracking-wider">Select Reaction</div>
      <div className="grid grid-cols-6 gap-1.5">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onSelectEmoji(emoji);
              onClose();
            }}
            className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-[#35373c] transition-transform active:scale-95"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
