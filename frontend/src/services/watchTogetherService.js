/**
 * watchTogetherService.js
 * Singleton service for the Watch Together activity.
 * Mirrors the subscriber pattern used by webrtcVoice.js.
 */

import { getSocket } from './socket';

const initialState = {
  isActive: false,
  videoId: null,
  title: '',
  isPlaying: false,
  currentTime: 0,
  channelId: null,
  setBy: null,
  lastActivity: null,
};

class WatchTogetherService {
  constructor() {
    this._state = { ...initialState };
    this._subscribers = new Set();
    this._socketListenerAttached = false;
    this._activeChannelId = null;
    this._onRemotePlay = null;
    this._onRemotePause = null;
    this._onRemoteSeek = null;
  }

  // ── Subscription ───────────────────────────────────────────────────────────

  subscribe(callback) {
    this._subscribers.add(callback);
    callback({ ...this._state });
    return () => this._subscribers.delete(callback);
  }

  _notify() {
    this._subscribers.forEach(cb => cb({ ...this._state }));
  }

  _setState(patch) {
    this._state = { ...this._state, ...patch };
    this._notify();
  }

  // ── Socket listener ────────────────────────────────────────────────────────

  attachSocketListener(channelId) {
    if (this._socketListenerAttached) return;
    this._socketListenerAttached = true;
    this._activeChannelId = channelId;

    const socket = getSocket();
    if (!socket) return;

    socket.on('watch_sync', (data) => {
      if (data.channel_id !== this._activeChannelId) return;

      switch (data.type) {
        case 'set_video':
        case 'state_sync':
          this._setState({
            isActive: true,
            videoId: data.video_id,
            title: data.title || '',
            isPlaying: data.is_playing || false,
            currentTime: data.current_time || 0,
            channelId: data.channel_id,
            setBy: data.set_by || null,
            lastActivity: data.set_by ? `${data.set_by} set the video` : null,
          });
          break;

        case 'play':
          this._setState({
            isPlaying: true,
            currentTime: data.current_time,
            lastActivity: data.by ? `${data.by} pressed play` : null,
          });
          this._onRemotePlay && this._onRemotePlay(data.current_time);
          break;

        case 'pause':
          this._setState({
            isPlaying: false,
            currentTime: data.current_time,
            lastActivity: data.by ? `${data.by} paused` : null,
          });
          this._onRemotePause && this._onRemotePause(data.current_time);
          break;

        case 'seek':
          this._setState({
            currentTime: data.current_time,
            lastActivity: data.by ? `${data.by} seeked` : null,
          });
          this._onRemoteSeek && this._onRemoteSeek(data.current_time);
          break;

        case 'close':
          this._setState({
            ...initialState,
            lastActivity: data.by ? `${data.by} closed Watch Together` : null,
          });
          break;

        default:
          break;
      }
    });
  }

  setPlayerCallbacks({ onPlay, onPause, onSeek }) {
    this._onRemotePlay = onPlay;
    this._onRemotePause = onPause;
    this._onRemoteSeek = onSeek;
  }

  clearPlayerCallbacks() {
    this._onRemotePlay = null;
    this._onRemotePause = null;
    this._onRemoteSeek = null;
  }

  detachSocketListener() {
    const socket = getSocket();
    if (socket) {
      socket.off('watch_sync');
    }
    this._socketListenerAttached = false;
    this._activeChannelId = null;
    this._setState({ ...initialState });
  }

  // ── YouTube URL parser ─────────────────────────────────────────────────────

  static extractVideoId(input) {
    if (!input) return null;
    input = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

    try {
      const url = new URL(input);
      if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('?')[0];
      const v = url.searchParams.get('v');
      if (v) return v;
      const shorts = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shorts) return shorts[1];
      const embed = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embed) return embed[1];
    } catch (_) {}
    return null;
  }

  // ── Outgoing actions ───────────────────────────────────────────────────────

  setVideo(channelId, videoId, title = '') {
    const socket = getSocket();
    if (!socket || !videoId) return;
    socket.emit('watch_set_video', { channel_id: channelId, video_id: videoId, title });
    this._setState({
      isActive: true,
      videoId,
      title,
      isPlaying: false,
      currentTime: 0,
      channelId,
    });
  }

  play(channelId, currentTime) {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('watch_play', { channel_id: channelId, current_time: currentTime });
    this._setState({ isPlaying: true, currentTime });
  }

  pause(channelId, currentTime) {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('watch_pause', { channel_id: channelId, current_time: currentTime });
    this._setState({ isPlaying: false, currentTime });
  }

  seek(channelId, currentTime) {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('watch_seek', { channel_id: channelId, current_time: currentTime });
    this._setState({ currentTime });
  }

  close(channelId) {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('watch_close', { channel_id: channelId });
    this._setState({ ...initialState });
  }

  getCurrentState() {
    return { ...this._state };
  }
}

export const watchTogetherService = new WatchTogetherService();
