import React, { useState, useEffect, useRef } from 'react';
import { voiceManager } from '../../services/webrtcVoice';

export default function GlobalVoiceAudioPlayer() {
  const [voiceState, setVoiceState] = useState({
    channel_id: null,
    streams: []
  });

  useEffect(() => {
    return voiceManager.subscribe(setVoiceState);
  }, []);

  if (!voiceState.channel_id) {
    return null;
  }

  // Filter remote audio streams (user_id !== 'local')
  const remoteAudioStreams = voiceState.streams.filter(item => item.user_id !== 'local');

  return (
    <div className="hidden" aria-hidden="true">
      {remoteAudioStreams.map((item) => (
        <RemoteAudioTrack key={item.user_id} item={item} />
      ))}
    </div>
  );
}

function RemoteAudioTrack({ item }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current && item.stream) {
      audioRef.current.srcObject = item.stream;
      const vol = item.volume !== undefined ? Math.max(0, Math.min(1, item.volume / 100)) : 1.0;
      audioRef.current.volume = vol;
      audioRef.current.play().catch((err) => {
        console.warn("Autoplay background audio error:", err);
      });
    }
  }, [item.stream, item.volume]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
    />
  );
}
