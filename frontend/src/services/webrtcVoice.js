import { getSocket } from './socket';
import { notificationService } from './NotificationService';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.services.mozilla.com' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp'
    ],
    username: 'openrelay',
    credential: 'openrelay'
  }
];



class WebRTCVoiceManager {
  constructor() {
    this.currentChannelId = null;
    this.localAudioStream = null;
    this.localScreenStream = null;
    this.peerConnections = new Map(); // target_user_id -> RTCPeerConnection
    this.remoteStreams = new Map(); // target_user_id -> MediaStream
    this.audioAnalysers = new Map(); // user_id -> AnalyserNode
    this.userGainNodes = new Map(); // user_id -> GainNode
    this.speakingUsers = new Set();
    this.userVolumes = new Map(); // user_id -> volume level (0 to 200)
    this.pendingIceCandidates = new Map(); // target_user_id -> candidate array
    this.remoteParticipantsMeta = new Map(); // user_id -> { username, avatar_url }
    this.allVoiceRooms = new Map(); // channel_id -> [user, ...] — tracks ALL channels for sidebar display
    this._voiceRoomUpdateHandler = null; // Named ref so we only remove our own listener


    this.isMuted = false;
    this.isDeafened = false;
    this.isScreenSharing = false;
    this.isCameraOn = false;
    this.audioContext = null;

    // PiP Composite Engine
    this.compositeStream = null;
    this.animationFrameId = null;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.screenVideoEl = document.createElement('video');
    this.camVideoEl = document.createElement('video');
    this.screenVideoEl.muted = true;
    this.screenVideoEl.playsInline = true;
    this.camVideoEl.muted = true;
    this.camVideoEl.playsInline = true;

    // Advanced Voice Settings
    this.inputMode = localStorage.getItem('discord_input_mode') || 'vad'; // 'vad' | 'ptt'
    this.pttKey = localStorage.getItem('discord_ptt_key') || 'ControlLeft';
    this.pttActive = false;
    this.echoCancellation = localStorage.getItem('discord_echo_cancellation') !== 'false';
    this.noiseSuppression = localStorage.getItem('discord_noise_suppression') !== 'false';
    this.autoGainControl = localStorage.getItem('discord_auto_gain') !== 'false';
    this.vadSensitivity = Number(localStorage.getItem('discord_vad_sensitivity')) || 20;

    this.listeners = new Set();

    this._setupGlobalKeyboardListeners();
  }

  _setupGlobalKeyboardListeners() {
    const resumeAudio = () => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
    };
    window.addEventListener('click', resumeAudio);
    window.addEventListener('pointerdown', resumeAudio);

    window.addEventListener('keydown', (e) => {
      resumeAudio();
      if (this.inputMode === 'ptt' && (e.code === this.pttKey || e.key === this.pttKey) && !this.pttActive) {
        this.pttActive = true;
        this._applyMicState();
        this.notify();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.inputMode === 'ptt' && (e.code === this.pttKey || e.key === this.pttKey) && this.pttActive) {
        this.pttActive = false;
        this._applyMicState();
        this.notify();
      }
    });
  }

  _applyMicState() {
    if (!this.localAudioStream) return;
    let enabled = !this.isMuted;
    if (this.inputMode === 'ptt') {
      enabled = enabled && this.pttActive;
    }
    this.localAudioStream.getAudioTracks().forEach(t => {
      t.enabled = enabled;
    });
  }

  setInputMode(mode) {
    this.inputMode = mode;
    localStorage.setItem('discord_input_mode', mode);
    this._applyMicState();
    this.notify();
  }

  setPttKey(key) {
    this.pttKey = key;
    localStorage.setItem('discord_ptt_key', key);
    this.notify();
  }

  setAudioProcessing({ echoCancellation, noiseSuppression, autoGainControl, vadSensitivity }) {
    if (echoCancellation !== undefined) {
      this.echoCancellation = echoCancellation;
      localStorage.setItem('discord_echo_cancellation', echoCancellation);
    }
    if (noiseSuppression !== undefined) {
      this.noiseSuppression = noiseSuppression;
      localStorage.setItem('discord_noise_suppression', noiseSuppression);
    }
    if (autoGainControl !== undefined) {
      this.autoGainControl = autoGainControl;
      localStorage.setItem('discord_auto_gain', autoGainControl);
    }
    if (vadSensitivity !== undefined) {
      this.vadSensitivity = vadSensitivity;
      localStorage.setItem('discord_vad_sensitivity', vadSensitivity);
    }

    if (this.currentChannelId) {
      // Re-initialize local microphone stream with updated processing constraints
      this._reinitLocalMicStream();
    }
  }

  setUserVolume(userId, volume) {
    this.userVolumes.set(userId, volume);
    const gainNode = this.userGainNodes.get(userId);
    if (gainNode) {
      gainNode.gain.value = volume / 100;
    }
    this.notify();
  }

  getUserVolume(userId) {
    return this.userVolumes.get(userId) !== undefined ? this.userVolumes.get(userId) : 100;
  }

  getCurrentState() {
    const streamsList = [];

    // Local stream representation
    if (this.localAudioStream || this.localScreenStream || this.localCameraStream) {
      const localUsername = this.currentUser?.username || localStorage.getItem('discord_username') || 'You';
      const localAvatar = this.currentUser?.avatar_url || localStorage.getItem('discord_avatar_url') || null;
      const localUserId = this.currentUser?.id || Number(localStorage.getItem('discord_user_id')) || 'local';

      streamsList.push({
        user_id: 'local',
        username: localUsername,
        avatar_url: localAvatar,
        stream: this.compositeStream && this.isScreenSharing && this.isCameraOn ? this.compositeStream : (this.localScreenStream || this.localCameraStream || this.localAudioStream),
        isScreenShare: !!this.localScreenStream,
        isMuted: this.isMuted || (this.inputMode === 'ptt' && !this.pttActive),
        isSpeaking: this.speakingUsers.has('local') || this.speakingUsers.has(localUserId),
        volume: 100
      });
    }

    // Remote streams
    for (const [userId, stream] of this.remoteStreams.entries()) {
      const participantInfo = this.remoteParticipantsMeta?.get(String(userId)) || {};
      streamsList.push({
        user_id: userId,
        username: participantInfo.username || `User ${userId}`,
        avatar_url: participantInfo.avatar_url || null,
        stream,
        isScreenShare: stream.getVideoTracks().length > 0,
        isMuted: false,
        isSpeaking: this.speakingUsers.has(userId),
        volume: this.getUserVolume(userId)
      });
    }

    return {
      channel_id: this.currentChannelId,
      isMuted: this.isMuted,
      isDeafened: this.isDeafened,
      isScreenSharing: this.isScreenSharing,
      isCameraOn: this.isCameraOn,
      inputMode: this.inputMode,
      pttKey: this.pttKey,
      pttActive: this.pttActive,
      echoCancellation: this.echoCancellation,
      noiseSuppression: this.noiseSuppression,
      autoGainControl: this.autoGainControl,
      vadSensitivity: this.vadSensitivity,
      streams: streamsList,
      speakingUsers: Array.from(this.speakingUsers).map(id => String(id)),
      allVoiceRooms: Object.fromEntries(this.allVoiceRooms)
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    // Immediately emit current state to newly subscribed listener
    try {
      listener(this.getCurrentState());
    } catch (err) {
      console.warn("Error notifying new subscriber:", err);
    }
    return () => this.listeners.delete(listener);
  }

  notify() {
    const state = this.getCurrentState();
    this.listeners.forEach(fn => {
      try {
        fn(state);
      } catch (err) {
        console.warn("Subscriber notification error:", err);
      }
    });
  }

  async _reinitLocalMicStream() {
    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach(t => t.stop());
    }

    try {
      const savedAudioInput = localStorage.getItem('discord_audio_input');
      const audioConstraints = {
        echoCancellation: this.echoCancellation,
        noiseSuppression: this.noiseSuppression,
        autoGainControl: this.autoGainControl,
      };
      if (savedAudioInput && savedAudioInput !== 'default') {
        audioConstraints.deviceId = { exact: savedAudioInput };
      }

      this.localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      this._applyMicState();
      this._setupAudioAnalyser('local', this.localAudioStream);

      // Replace audio track in all peer connections
      const newAudioTrack = this.localAudioStream.getAudioTracks()[0];
      if (newAudioTrack) {
        for (const pc of this.peerConnections.values()) {
          const senders = pc.getSenders();
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            audioSender.replaceTrack(newAudioTrack);
          }
        }
      }
    } catch (err) {
      console.warn("Re-init local mic error:", err);
    }
  }

  async joinVoiceChannel(channel_id, currentUser) {
    const socket = getSocket();
    if (!socket) return;

    if (currentUser) {
      this.currentUser = currentUser;
    }

    if (this.currentChannelId === channel_id) return;
    if (this.currentChannelId) {
      this.leaveVoiceChannel();
    }


    this.currentChannelId = channel_id;
    this._setupSocketListeners();

    try {
      const savedAudioInput = localStorage.getItem('discord_audio_input');
      const audioConstraints = {
        echoCancellation: this.echoCancellation,
        noiseSuppression: this.noiseSuppression,
        autoGainControl: this.autoGainControl,
      };
      if (savedAudioInput && savedAudioInput !== 'default') {
        audioConstraints.deviceId = { exact: savedAudioInput };
      }

      this.localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      this._applyMicState();
      this._setupAudioAnalyser('local', this.localAudioStream);
      this._startMediaRecorder();
    } catch (err) {
      console.warn("No microphone accessible or permission denied:", err);
      this.localAudioStream = new MediaStream();
    }

    socket.emit('join_voice', { channel_id });
    notificationService.playVoiceConnectChime();
    this.notify();
  }

  _startMediaRecorder() {
    if (this.mediaRecorder) {
      try { this.mediaRecorder.stop(); } catch (e) {}
      this.mediaRecorder = null;
    }
    if (!this.localAudioStream || !this.localAudioStream.getAudioTracks().length) return;

    try {
      const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');

      const options = mimeType ? { mimeType, audioBitsPerSecond: 48000 } : { audioBitsPerSecond: 48000 };
      this.mediaRecorder = new MediaRecorder(this.localAudioStream, options);

      this.mediaRecorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0 && this.currentChannelId) {
          const isMutedState = this.isMuted || (this.inputMode === 'ptt' && !this.pttActive);
          if (isMutedState) return;

          const buffer = await e.data.arrayBuffer();
          const socket = getSocket();
          if (socket) {
            socket.emit('voice_audio_chunk', {
              channel_id: this.currentChannelId,
              chunk: buffer
            });
          }
        }
      };
      this.mediaRecorder.start(120); // Stream chunk every 120ms
    } catch (err) {
      console.warn("MediaRecorder voice streaming setup warning:", err);
    }
  }

  leaveVoiceChannel() {
    const socket = getSocket();
    if (socket && this.currentChannelId) {
      socket.emit('leave_voice', { channel_id: this.currentChannelId });
    }

    notificationService.playVoiceDisconnectChime();

    if (this.mediaRecorder) {
      try { this.mediaRecorder.stop(); } catch (e) {}
      this.mediaRecorder = null;
    }

    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach(t => t.stop());
      this.localAudioStream = null;
    }


    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach(t => t.stop());
      this.localScreenStream = null;
    }

    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.audioAnalysers.clear();
    this.userGainNodes.clear();
    this.remoteParticipantsMeta.clear();
    this.speakingUsers.clear();
    this.currentChannelId = null;
    this.isScreenSharing = false;
    this.isCameraOn = false;

    this.notify();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this._applyMicState();
    this.notify();
  }

  toggleDeafen() {
    this.isDeafened = !this.isDeafened;
    this.remoteStreams.forEach(stream => {
      stream.getAudioTracks().forEach(t => {
        t.enabled = !this.isDeafened;
      });
    });
    this.notify();
  }

  async startScreenShare() {
    if (this.isScreenSharing) return;

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 60, max: 60 },
        },
        audio: true,
      });

      this.localScreenStream = screenStream;
      this.isScreenSharing = true;

      const videoTrack = screenStream.getVideoTracks()[0];
      videoTrack.onended = () => {
        this.stopScreenShare();
      };

      await this._updateActiveVideoTrack();

      const audioTrack = screenStream.getAudioTracks()[0];
      if (audioTrack) {
        for (const [targetUserId, pc] of this.peerConnections.entries()) {
          pc.addTrack(audioTrack, screenStream);
        }
      }

      const socket = getSocket();
      if (socket) {
        socket.emit('toggle_screen_share', { channel_id: this.currentChannelId, is_sharing: true });
      }

      this.notify();
    } catch (err) {
      console.error("Screen share error:", err);
    }
  }

  async stopScreenShare() {
    if (!this.isScreenSharing) return;

    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach(t => t.stop());
      this.localScreenStream = null;
    }

    this.isScreenSharing = false;
    
    await this._updateActiveVideoTrack();

    const socket = getSocket();
    if (socket) {
      socket.emit('toggle_screen_share', { channel_id: this.currentChannelId, is_sharing: false });
    }

    this.notify();
  }


  // --- WebRTC Camera (Webcam) ---

  async toggleCamera() {
    if (this.isCameraOn) {
      this.stopCamera();
    } else {
      this.startCamera();
    }
  }

  async startCamera() {
    if (this.isCameraOn || !this.currentChannelId) return;

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
        },
      });

      this.localCameraStream = camStream;
      this.isCameraOn = true;

      const videoTrack = camStream.getVideoTracks()[0];
      videoTrack.onended = () => {
        this.stopCamera();
      };

      await this._updateActiveVideoTrack();

      const socket = getSocket();
      if (socket) {
        socket.emit('toggle_camera', { channel_id: this.currentChannelId, is_on: true });
      }

      this.notify();
    } catch (err) {
      console.error("Camera start error:", err);
    }
  }

  async stopCamera() {
    if (!this.isCameraOn) return;

    if (this.localCameraStream) {
      this.localCameraStream.getTracks().forEach(t => t.stop());
      this.localCameraStream = null;
    }

    this.isCameraOn = false;
    
    await this._updateActiveVideoTrack();

    const socket = getSocket();
    if (socket) {
      socket.emit('toggle_camera', { channel_id: this.currentChannelId, is_on: false });
    }

    this.notify();
  }

  // --- PiP Compositor ---

  _startCompositeLoop() {
    if (this.animationFrameId) return;

    this.screenVideoEl.srcObject = this.localScreenStream;
    this.camVideoEl.srcObject = this.localCameraStream;
    
    this.screenVideoEl.play().catch(()=>{});
    this.camVideoEl.play().catch(()=>{});

    this.canvas.width = 1920;
    this.canvas.height = 1080;

    if (!this.compositeStream) {
      this.compositeStream = this.canvas.captureStream(30);
    }

    const drawLoop = () => {
      // Draw screen share background
      if (this.screenVideoEl.readyState >= 2) {
        this.ctx.drawImage(this.screenVideoEl, 0, 0, this.canvas.width, this.canvas.height);
      } else {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }

      // Draw camera PiP in bottom right
      if (this.camVideoEl.readyState >= 2) {
        const camW = 480;
        const camH = 270;
        const padding = 40;
        const x = this.canvas.width - camW - padding;
        const y = this.canvas.height - camH - padding;

        this.ctx.save();
        this.ctx.beginPath();
        if (this.ctx.roundRect) {
          this.ctx.roundRect(x, y, camW, camH, 16);
          this.ctx.clip();
        } else {
          // Fallback for older browsers
          this.ctx.rect(x, y, camW, camH);
          this.ctx.clip();
        }
        
        this.ctx.drawImage(this.camVideoEl, x, y, camW, camH);
        
        this.ctx.lineWidth = 6;
        this.ctx.strokeStyle = '#5865f2';
        this.ctx.stroke();
        this.ctx.restore();
      }

      this.animationFrameId = requestAnimationFrame(drawLoop);
    };

    drawLoop();
  }

  _stopCompositeLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.screenVideoEl.srcObject = null;
    this.camVideoEl.srcObject = null;
  }

  async _updateActiveVideoTrack() {
    let activeVideoTrack = null;
    let baseStream = null;

    if (this.isScreenSharing && this.isCameraOn && this.localScreenStream && this.localCameraStream) {
      this._startCompositeLoop();
      activeVideoTrack = this.compositeStream.getVideoTracks()[0];
      baseStream = this.compositeStream;
    } else {
      this._stopCompositeLoop();
      if (this.isScreenSharing && this.localScreenStream) {
        activeVideoTrack = this.localScreenStream.getVideoTracks()[0];
        baseStream = this.localScreenStream;
      } else if (this.isCameraOn && this.localCameraStream) {
        activeVideoTrack = this.localCameraStream.getVideoTracks()[0];
        baseStream = this.localCameraStream;
      }
    }

    for (const [targetUserId, pc] of this.peerConnections.entries()) {
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');

      if (activeVideoTrack) {
        if (videoSender) {
          await videoSender.replaceTrack(activeVideoTrack).catch(err => console.warn("Failed to replace video track:", err));
        } else {
          pc.addTrack(activeVideoTrack, baseStream);
        }
      } else {
        if (videoSender) {
          pc.removeTrack(videoSender);
        }
      }
    }
  }

  // Private peer mesh handlers

  _setupSocketListeners() {
    const socket = getSocket();
    if (!socket) return;

    // Remove only OUR own handlers — use named refs so we don't nuke other listeners
    if (this._voiceRoomUpdateHandler) {
      socket.off('voice_room_update', this._voiceRoomUpdateHandler);
    }
    socket.off('voice_offer');
    socket.off('voice_answer');
    socket.off('voice_ice_candidate');

    // Build and store named handler for voice_room_update
    this._voiceRoomUpdateHandler = async (data) => {
      // Always update allVoiceRooms for ALL channels (sidebar display)
      if (data && data.channel_id) {
        if (data.users && data.users.length > 0) {
          this.allVoiceRooms.set(String(data.channel_id), data.users);
        } else {
          this.allVoiceRooms.delete(String(data.channel_id));
        }
        this.notify();
      }

      // Only do WebRTC peer mesh management for the channel we're currently in
      if (data.channel_id !== this.currentChannelId) return;

      const currentUserId = this.currentUser?.id || Number(localStorage.getItem('discord_user_id'));
      const activeUsers = data.users.filter(u => Number(u.id) !== Number(currentUserId));

      for (const u of activeUsers) {
        this.remoteParticipantsMeta.set(String(u.id), { username: u.username, avatar_url: u.avatar_url });
        if (!this.peerConnections.has(u.id)) {
          // Use ID comparison to ensure only ONE peer creates the initial offer (glare prevention)
          const isInitiator = String(currentUserId) > String(u.id);
          await this._createPeerConnection(u.id, isInitiator);
        }
      }

      for (const [userId, pc] of Array.from(this.peerConnections.entries())) {
        if (!activeUsers.some(u => Number(u.id) === Number(userId))) {
          pc.close();
          this.peerConnections.delete(userId);
          this.remoteStreams.delete(userId);
          this.userGainNodes.delete(userId);
          this.remoteParticipantsMeta.delete(String(userId));
        }
      }
      this.notify();
    };

    socket.on('voice_room_update', this._voiceRoomUpdateHandler);

    socket.on('voice_offer', async (data) => {
      const { sender_id, offer } = data;
      let pc = this.peerConnections.get(sender_id);
      if (!pc) {
        pc = await this._createPeerConnection(sender_id, false);
      }
      
      try {
        const currentUserId = this.currentUser?.id || Number(localStorage.getItem('discord_user_id'));
        const isPolite = String(currentUserId) < String(sender_id);
        const offerCollision = pc.signalingState !== 'stable';
        
        if (offerCollision) {
          if (!isPolite) return; // Ignore offer, we are the dominant peer
          await pc.setLocalDescription({ type: 'rollback' }); // Rollback our own offer to accept theirs
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await this._flushIceCandidates(sender_id, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('voice_answer', {
          target_user_id: sender_id,
          answer,
          channel_id: this.currentChannelId,
        });
      } catch (err) {
        console.warn("Error handling voice offer:", err);
      }
    });

    socket.on('voice_answer', async (data) => {
      const { sender_id, answer } = data;
      const pc = this.peerConnections.get(sender_id);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await this._flushIceCandidates(sender_id, pc);
      }
    });

    socket.on('voice_ice_candidate', async (data) => {
      const { sender_id, candidate } = data;
      const pc = this.peerConnections.get(sender_id);
      if (pc && candidate) {
        try {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            if (!this.pendingIceCandidates.has(sender_id)) {
              this.pendingIceCandidates.set(sender_id, []);
            }
            this.pendingIceCandidates.get(sender_id).push(candidate);
          }
        } catch (e) {
          console.error("Voice ICE error:", e);
        }
      }
    });

    socket.on('voice_audio_chunk', async (data) => {
      const { user_id, username, avatar_url, channel_id, chunk } = data;
      if (channel_id !== this.currentChannelId) return;

      const currentUserId = this.currentUser?.id || Number(localStorage.getItem('discord_user_id'));
      if (Number(user_id) === Number(currentUserId)) return;

      this.remoteParticipantsMeta.set(String(user_id), { username, avatar_url });

      try {
        if (!this.audioContext) {
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }

        const audioBuffer = await this.audioContext.decodeAudioData(chunk.slice(0));
        const sourceNode = this.audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;

        let gainNode = this.userGainNodes.get(user_id);
        if (!gainNode) {
          gainNode = this.audioContext.createGain();
          const userVol = this.getUserVolume(user_id);
          gainNode.gain.value = userVol / 100;
          this.userGainNodes.set(user_id, gainNode);
          gainNode.connect(this.audioContext.destination);
        }

        sourceNode.connect(gainNode);
        sourceNode.start(0);

        if (!this.speakingUsers.has(user_id)) {
          this.speakingUsers.add(user_id);
          this.notify();
        }

        if (!this.remoteChunkTimeouts) this.remoteChunkTimeouts = new Map();
        if (this.remoteChunkTimeouts.has(user_id)) {
          clearTimeout(this.remoteChunkTimeouts.get(user_id));
        }

        const t = setTimeout(() => {
          this.speakingUsers.delete(user_id);
          this.remoteChunkTimeouts.delete(user_id);
          this.notify();
        }, 400);
        this.remoteChunkTimeouts.set(user_id, t);
      } catch (err) {
        // Silently catch decoding errors
      }
    });
  }

  async _flushIceCandidates(targetUserId, pc) {
    const list = this.pendingIceCandidates.get(targetUserId) || [];
    while (list.length > 0) {
      const cand = list.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn("Flushing ICE candidate error:", e);
      }
    }
  }

  async _createPeerConnection(targetUserId, isInitiator) {

    const socket = getSocket();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(targetUserId, pc);

    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localAudioStream);
      });
    }

    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localScreenStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('voice_ice_candidate', {
          target_user_id: targetUserId,
          candidate: event.candidate,
          channel_id: this.currentChannelId,
        });
      }
    };

    // Renegotiate when tracks are added or removed (e.g. Screen Sharing)
    let makingOffer = false;
    pc.onnegotiationneeded = async () => {
      try {
        makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        socket.emit('voice_offer', {
          target_user_id: targetUserId,
          offer,
          channel_id: this.currentChannelId,
        });
      } catch (err) {
        console.warn("Renegotiation offer error:", err);
      } finally {
        makingOffer = false;
      }
    };

    // Accumulate all tracks (audio & video) into a single composite stream per peer
    pc.ontrack = (event) => {
      let existingStream = this.remoteStreams.get(targetUserId);
      if (!existingStream) {
        existingStream = new MediaStream();
      }
      
      // Add track if not already in stream
      if (!existingStream.getTracks().some(t => t.id === event.track.id)) {
        existingStream.addTrack(event.track);
      }

      // Create a fresh MediaStream wrapper object so React state detects reference changes
      const updatedStream = new MediaStream(existingStream.getTracks());
      this.remoteStreams.set(targetUserId, updatedStream);

      this._setupAudioAnalyser(targetUserId, updatedStream);
      this.notify();
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice_offer', {
        target_user_id: targetUserId,
        offer,
        channel_id: this.currentChannelId,
      });
    }

    return pc;
  }

  _setupAudioAnalyser(userId, stream) {
    if (!stream || !stream.getAudioTracks().length) return;
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      if (!this.processedAudioTracks) {
        this.processedAudioTracks = new Set();
      }

      stream.getAudioTracks().forEach(track => {
        if (this.processedAudioTracks.has(track.id)) return;
        this.processedAudioTracks.add(track.id);

        const singleTrackStream = new MediaStream([track]);
        const source = this.audioContext.createMediaStreamSource(singleTrackStream);
        
        let gainNode = this.userGainNodes.get(userId);
        let analyser = this.audioAnalysers.get(userId);

        // First time setting up this user's WebAudio nodes
        if (!gainNode) {
          gainNode = this.audioContext.createGain();
          const userVol = this.getUserVolume(userId);
          gainNode.gain.value = userVol / 100;
          this.userGainNodes.set(userId, gainNode);

          analyser = this.audioContext.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.4;
          this.audioAnalysers.set(userId, analyser);

          gainNode.connect(analyser);

          if (userId === 'local') {
            const silentGain = this.audioContext.createGain();
            silentGain.gain.value = 0;
            analyser.connect(silentGain);
            silentGain.connect(this.audioContext.destination);
          } else {
            analyser.connect(this.audioContext.destination);
          }

          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          let releaseTimeout = null;

          const checkAudioLevel = () => {
            if (!this.currentChannelId) return;

            if (this.audioContext && this.audioContext.state === 'suspended') {
              this.audioContext.resume().catch(() => {});
            }

            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i];
            }
            const average = sum / bufferLength;

            if (average > 10) {
              if (releaseTimeout) {
                clearTimeout(releaseTimeout);
                releaseTimeout = null;
              }
              if (!this.speakingUsers.has(userId)) {
                this.speakingUsers.add(userId);
                this.notify();
              }
            } else {
              if (!releaseTimeout && this.speakingUsers.has(userId)) {
                releaseTimeout = setTimeout(() => {
                  this.speakingUsers.delete(userId);
                  this.notify();
                  releaseTimeout = null;
                }, 400);
              }
            }

            requestAnimationFrame(checkAudioLevel);
          };

          checkAudioLevel();
        }

        // Connect the new track's source to the existing gainNode
        source.connect(gainNode);
      });
    } catch (err) {
      console.warn("Audio analyser error:", err);
    }
  }
}


export const voiceManager = new WebRTCVoiceManager();
