import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useServer } from '../../context/ServerContext';
import { notificationService } from '../../services/NotificationService';
import { voiceManager } from '../../services/webrtcVoice';
import { scheduleSave } from '../../services/settingsService';
import { 
  X, Mic, Volume2, Camera, User, Settings, VolumeX, 
  Check, Play, Radio, Shield, Palette, Bell, LogOut, Lock, Key, 
  ShieldAlert, RefreshCw, Eye, EyeOff
} from 'lucide-react';

export default function UserSettingsModal({ onClose }) {
  const { user, updateProfile, logout } = useAuth();
  const { soundEnabled, toggleSoundEnabled } = useServer();

  const [activeTab, setActiveTab] = useState('voice'); // 'account' | 'voice' | 'appearance'

  // Device lists & permission status
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [videoInputDevices, setVideoInputDevices] = useState([]);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionError, setPermissionError] = useState('');

  // Selected device IDs
  const [selectedInputDevice, setSelectedInputDevice] = useState(localStorage.getItem('discord_audio_input') || 'default');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState(localStorage.getItem('discord_audio_output') || 'default');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState(localStorage.getItem('discord_video_input') || 'default');

  // Volume sliders
  const [inputVolume, setInputVolume] = useState(Number(localStorage.getItem('discord_input_volume')) || 100);
  const [outputVolume, setOutputVolume] = useState(Number(localStorage.getItem('discord_output_volume')) || 100);

  // Mic test state
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [hearSelf, setHearSelf] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const micAudioCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const micGainNodeRef = useRef(null);

  // Camera preview state
  const [isPreviewingCamera, setIsPreviewingCamera] = useState(false);
  const videoPreviewRef = useRef(null);
  const videoStreamRef = useRef(null);

  // Profile Form state
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [statusMessage, setStatusMessage] = useState(user?.status_message || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');

  // Helper to format clean, non-duplicate device options
  const getDeviceOptions = (devices, kindPrefix) => {
    const seen = new Set();
    const options = [];

    devices.forEach((d, i) => {
      const id = d.deviceId;
      if (id && !seen.has(id)) {
        seen.add(id);
        let label = d.label;
        if (!label || !label.trim()) {
          if (id === 'default') label = `Default ${kindPrefix}`;
          else if (id === 'communications') label = `Communications ${kindPrefix}`;
          else label = `${kindPrefix} ${i + 1} (${id.substring(0, 8)}...)`;
        }
        options.push({ id, label });
      }
    });

    if (!options.some(o => o.id === 'default')) {
      options.unshift({ id: 'default', label: `Default ${kindPrefix}` });
    }

    return options;
  };


  // Function to enumerate devices
  const enumerateAllDevices = async (activeStream = null) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        setPermissionError("Media devices API is not supported or blocked by your browser environment.");
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      const videos = devices.filter(d => d.kind === 'videoinput');

      setAudioInputDevices(inputs);
      setAudioOutputDevices(outputs);
      setVideoInputDevices(videos);

      const hasLabels = inputs.some(d => d.label && d.label.length > 0);
      if (hasLabels) {
        setPermissionGranted(true);
      }
    } catch (err) {
      console.warn("Could not enumerate media devices:", err);
      setPermissionError(`Device enumeration error: ${err.message || err.name}`);
    }
  };

  // Request browser permissions explicitly
  const requestMediaPermissions = async () => {
    setPermissionLoading(true);
    setPermissionError('');

    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      setPermissionError("Browser Security Warning: Accessing via non-localhost HTTP IP prevents media permissions. Please open http://localhost:5173/ in your browser.");
      setPermissionLoading(false);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionError("navigator.mediaDevices is unavailable. Ensure you are using http://localhost:5173/");
      setPermissionLoading(false);
      return;
    }

    try {
      // 1. Try requesting both audio and video
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      // Enumerate WHILE stream tracks are active
      await enumerateAllDevices(stream);
      // Now stop tracks
      stream.getTracks().forEach(t => t.stop());
      setPermissionGranted(true);
    } catch (err) {
      console.warn("Full mic+camera permission attempt failed:", err);
      try {
        // 2. Try audio only
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await enumerateAllDevices(audioStream);
        audioStream.getTracks().forEach(t => t.stop());
        setPermissionGranted(true);
      } catch (err2) {
        console.error("Audio getUserMedia permission error:", err2);
        const errName = err2.name || err.name || 'PermissionError';
        const errMsg = err2.message || err.message || 'Access denied or no media hardware found';
        setPermissionError(`Browser Permission Prompt Result (${errName}): ${errMsg}. Please click the lock/camera icon in your browser address bar to Allow Microphone & Camera.`);
      }
    } finally {
      setPermissionLoading(false);
    }
  };

  // On mount, attempt enumeration and setup devicechange listener
  useEffect(() => {
    enumerateAllDevices();
    requestMediaPermissions();

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', enumerateAllDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', enumerateAllDevices);
      };
    }
  }, []);


  // Handle device selection saves
  const handleSelectInputDevice = (id) => {
    setSelectedInputDevice(id);
    localStorage.setItem('discord_audio_input', id);
    scheduleSave();
    if (isTestingMic) {
      stopMicTest();
      setTimeout(startMicTest, 100);
    }
  };

  const handleSelectOutputDevice = (id) => {
    setSelectedOutputDevice(id);
    localStorage.setItem('discord_audio_output', id);
    scheduleSave();
  };

  const handleSelectVideoDevice = (id) => {
    setSelectedVideoDevice(id);
    localStorage.setItem('discord_video_input', id);
    scheduleSave();
    if (isPreviewingCamera) {
      stopCameraPreview();
      setTimeout(startCameraPreview, 100);
    }
  };

  const handleInputVolumeChange = (v) => {
    setInputVolume(v);
    localStorage.setItem('discord_input_volume', v);
    scheduleSave();
    if (micGainNodeRef.current) {
      micGainNodeRef.current.gain.value = v / 100;
    }
  };

  const handleOutputVolumeChange = (v) => {
    setOutputVolume(v);
    localStorage.setItem('discord_output_volume', v);
    scheduleSave();
  };

  // Mic test logic using Web Audio API
  const startMicTest = async () => {
    try {
      const constraints = {
        audio: selectedInputDevice !== 'default' && selectedInputDevice ? { deviceId: { exact: selectedInputDevice } } : true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      micAudioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = inputVolume / 100;
      micGainNodeRef.current = gainNode;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      source.connect(gainNode);
      gainNode.connect(analyser);

      if (hearSelf) {
        analyser.connect(ctx.destination);
      }

      const bufferLen = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLen);
      setIsTestingMic(true);

      let smoothedLevel = 0;

      const updateLevel = () => {
        if (!micAudioCtxRef.current) return;
        analyser.getByteFrequencyData(dataArray);

        // Sum vocal bins 1 through 25 (80Hz to 4kHz)
        let vocalSum = 0;
        const maxBin = Math.min(25, bufferLen);
        for (let i = 1; i < maxBin; i++) {
          vocalSum += dataArray[i];
        }
        const rawAvg = vocalSum / (maxBin - 1);
        const targetPercent = Math.min(100, Math.round((rawAvg / 120) * 100));

        // Smooth decay/rise for fluid meter response
        smoothedLevel = smoothedLevel * 0.7 + targetPercent * 0.3;
        setMicLevel(Math.round(smoothedLevel));

        requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      console.error("Mic test error:", err);
      setIsTestingMic(false);
    }
  };


  const stopMicTest = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (micAudioCtxRef.current) {
      micAudioCtxRef.current.close();
      micAudioCtxRef.current = null;
    }
    micGainNodeRef.current = null;
    setIsTestingMic(false);
    setMicLevel(0);
  };

  const toggleMicTest = () => {
    if (isTestingMic) {
      stopMicTest();
    } else {
      startMicTest();
    }
  };

  // Toggle Hear Self (Loopback)
  const toggleHearSelf = () => {
    const next = !hearSelf;
    setHearSelf(next);
    if (isTestingMic) {
      stopMicTest();
      setTimeout(startMicTest, 100);
    }
  };

  // Advanced Voice Controls State
  const [inputMode, setInputModeState] = useState(voiceManager.inputMode);
  const [pttKey, setPttKeyState] = useState(voiceManager.pttKey);
  const [isRecordingKey, setIsRecordingKey] = useState(false);
  const [echoCancellation, setEchoCancellation] = useState(voiceManager.echoCancellation);
  const [noiseSuppression, setNoiseSuppression] = useState(voiceManager.noiseSuppression);
  const [autoGainControl, setAutoGainControl] = useState(voiceManager.autoGainControl);
  const [vadSensitivity, setVadSensitivityState] = useState(voiceManager.vadSensitivity);
  const [audioBitrate, setAudioBitrate] = useState(localStorage.getItem('discord_audio_bitrate') || '128');

  const handleInputModeChange = (mode) => {
    setInputModeState(mode);
    voiceManager.setInputMode(mode);
    scheduleSave();
  };

  const handlePttKeyRecord = (e) => {
    e.preventDefault();
    const keyName = e.code || e.key;
    setPttKeyState(keyName);
    voiceManager.setPttKey(keyName);
    setIsRecordingKey(false);
    scheduleSave();
  };

  const handleToggleEchoCancellation = () => {
    const next = !echoCancellation;
    setEchoCancellation(next);
    voiceManager.setAudioProcessing({ echoCancellation: next });
    scheduleSave();
  };

  const handleToggleNoiseSuppression = () => {
    const next = !noiseSuppression;
    setNoiseSuppression(next);
    voiceManager.setAudioProcessing({ noiseSuppression: next });
    scheduleSave();
  };

  const handleToggleAutoGainControl = () => {
    const next = !autoGainControl;
    setAutoGainControl(next);
    voiceManager.setAudioProcessing({ autoGainControl: next });
    scheduleSave();
  };

  const handleVadSensitivityChange = (val) => {
    setVadSensitivityState(val);
    voiceManager.setAudioProcessing({ vadSensitivity: val });
    scheduleSave();
  };

  const handleBitrateChange = (val) => {
    setAudioBitrate(val);
    localStorage.setItem('discord_audio_bitrate', val);
    scheduleSave();
  };

  const startCameraPreview = async () => {
    try {
      const constraints = {
        video: selectedVideoDevice !== 'default' && selectedVideoDevice ? { deviceId: { exact: selectedVideoDevice } } : true,
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoStreamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      setIsPreviewingCamera(true);
    } catch (err) {
      console.error("Camera preview error:", err);
      setIsPreviewingCamera(false);
    }
  };

  const stopCameraPreview = () => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    setIsPreviewingCamera(false);
  };

  const toggleCameraPreview = () => {
    if (isPreviewingCamera) {
      stopCameraPreview();
    } else {
      startCameraPreview();
    }
  };

  // Sound Output Test
  const playTestSound = async () => {
    notificationService.playNotificationChime();
  };

  useEffect(() => {
    return () => {
      stopMicTest();
      stopCameraPreview();
    };
  }, []);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileError('');
    try {
      await updateProfile({
        username,
        email,
        avatar_url: avatarUrl,
        status_message: statusMessage,
        current_password: currentPassword || undefined,
        new_password: newPassword || undefined,
      });
      setProfileMsg("Profile updated successfully!");
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setProfileError(err.response?.data?.detail || "Failed to update profile");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface-active flex select-none overflow-hidden animate-fadeIn">
      {/* Left Sidebar Navigation */}
      <div className="w-60 bg-surface-panel flex flex-col justify-between p-6 border-r border-surface-border">
        <div className="space-y-6">
          <div className="text-xs font-bold text-text-muted uppercase tracking-wider px-2">
            User Settings
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('voice')}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-semibold transition ${
                activeTab === 'voice' ? 'bg-surface-hover text-text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <Mic className="w-4 h-4 text-accent-primary" />
              <span>Voice & Video</span>
            </button>

            <button
              onClick={() => setActiveTab('account')}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-semibold transition ${
                activeTab === 'account' ? 'bg-surface-hover text-text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <User className="w-4 h-4 text-success" />
              <span>My Account</span>
            </button>

            <button
              onClick={() => setActiveTab('appearance')}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-semibold transition ${
                activeTab === 'appearance' ? 'bg-surface-hover text-text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <Palette className="w-4 h-4 text-amber-400" />
              <span>App Appearance</span>
            </button>
          </nav>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-semibold text-rose-400 hover:bg-rose-500/10 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>
      </div>

      {/* Main Right Content Panel */}
      <div className="flex-1 bg-surface-base flex flex-col h-full overflow-y-auto p-8 relative custom-scrollbar">
        {/* Close Button Top Right */}
        <div className="absolute top-6 right-8 flex items-center space-x-2">
          <button
            onClick={onClose}
            className="flex items-center space-x-1 p-2 bg-surface-panel hover:bg-surface-hover text-text-muted hover:text-text-primary rounded-full transition border border-surface-border"
            title="Close Settings (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab 1: Voice & Video Settings */}
        {activeTab === 'voice' && (
          <div className="max-w-2xl space-y-8 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold text-text-primary mb-1">Voice & Video Settings</h2>
              <p className="text-xs text-text-muted">Configure microphone input, speaker output, and video camera preview.</p>
            </div>

            {/* Permission Prompt Banner */}
            {(!permissionGranted || permissionError) && (
              <div className="bg-accent-primary/10 border border-accent-primary/40 p-4 rounded-md flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <ShieldAlert className="w-6 h-6 text-accent-primary flex-shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-text-primary">Browser Media Permissions Required</div>
                    <div className="text-xs text-text-muted">
                      {permissionError || "Grant permission to unlock hardware microphone, speaker & webcam labels."}
                    </div>
                  </div>
                </div>

                <button
                  onClick={requestMediaPermissions}
                  disabled={permissionLoading}
                  className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-text-primary text-xs font-bold rounded-sm shadow flex items-center space-x-2 transition"
                >
                  {permissionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                  <span>{permissionLoading ? 'Requesting...' : 'Grant Permissions'}</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

              {/* Input Device */}
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-2 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <Mic className="w-4 h-4 text-accent-primary" />
                    <span>Input Device (Microphone)</span>
                  </span>
                  <span className="text-[10px] text-text-muted lowercase">({audioInputDevices.length} found)</span>
                </label>
                <select
                  value={selectedInputDevice}
                  onChange={(e) => handleSelectInputDevice(e.target.value)}
                  className="w-full bg-surface-active border border-surface-border text-text-primary text-sm rounded-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-accent-primary"
                >
                  {getDeviceOptions(audioInputDevices, 'Microphone').map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Output Device */}
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-2 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <Volume2 className="w-4 h-4 text-success" />
                    <span>Output Device (Speakers)</span>
                  </span>
                  <span className="text-[10px] text-text-muted lowercase">({audioOutputDevices.length} found)</span>
                </label>
                <select
                  value={selectedOutputDevice}
                  onChange={(e) => handleSelectOutputDevice(e.target.value)}
                  className="w-full bg-surface-active border border-surface-border text-text-primary text-sm rounded-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-accent-primary"
                >
                  {getDeviceOptions(audioOutputDevices, 'Speakers').map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* Input Mode (Voice Activity vs Push to Talk) */}
            <div className="bg-surface-panel p-5 rounded-md border border-surface-border space-y-4">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Input Mode</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label 
                  onClick={() => handleInputModeChange('vad')}
                  className={`flex items-center space-x-3 p-3 rounded-sm border cursor-pointer transition ${
                    inputMode === 'vad' ? 'bg-accent-primary/20 border-accent-primary text-text-primary' : 'bg-surface-active border-surface-border text-text-muted hover:bg-surface-hover'
                  }`}
                >
                  <input type="radio" name="input_mode" checked={inputMode === 'vad'} onChange={() => {}} className="accent-accent-primary" />
                  <div>
                    <div className="text-xs font-bold text-text-primary">Voice Activity</div>
                    <div className="text-[10px] text-text-muted">Automatically transmits when speaking</div>
                  </div>
                </label>

                <label 
                  onClick={() => handleInputModeChange('ptt')}
                  className={`flex items-center space-x-3 p-3 rounded-sm border cursor-pointer transition ${
                    inputMode === 'ptt' ? 'bg-accent-primary/20 border-accent-primary text-text-primary' : 'bg-surface-active border-surface-border text-text-muted hover:bg-surface-hover'
                  }`}
                >
                  <input type="radio" name="input_mode" checked={inputMode === 'ptt'} onChange={() => {}} className="accent-accent-primary" />
                  <div>
                    <div className="text-xs font-bold text-text-primary">Push-to-Talk</div>
                    <div className="text-[10px] text-text-muted">Hold assigned key to transmit mic</div>
                  </div>
                </label>
              </div>

              {/* Push-to-Talk Keybinder */}
              {inputMode === 'ptt' && (
                <div className="bg-surface-active p-4 rounded-sm border border-surface-border flex items-center justify-between animate-fadeIn">
                  <div>
                    <div className="text-xs font-bold text-text-primary">Push-to-Talk Key Shortcut</div>
                    <div className="text-[10px] text-text-muted">Click below and press your preferred PTT key</div>
                  </div>

                  <button
                    onKeyDown={isRecordingKey ? handlePttKeyRecord : undefined}
                    onClick={() => setIsRecordingKey(true)}
                    className={`px-4 py-2 text-xs font-mono font-bold rounded-sm border transition ${
                      isRecordingKey ? 'bg-amber-500/20 border-amber-500 text-amber-300 animate-pulse' : 'bg-surface-panel border-surface-border text-text-primary hover:bg-surface-hover'
                    }`}
                  >
                    {isRecordingKey ? 'Press any key now...' : `Shortcut: [ ${pttKey} ]`}
                  </button>
                </div>
              )}

              {/* VAD Sensitivity Threshold Slider */}
              {inputMode === 'vad' && (
                <div className="bg-surface-active p-4 rounded-sm border border-surface-border space-y-2 animate-fadeIn">
                  <div className="flex justify-between text-xs font-semibold text-text-muted">
                    <span>Voice Activity Sensitivity Threshold</span>
                    <span className="font-mono text-text-primary">{vadSensitivity} dB</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    value={vadSensitivity}
                    onChange={(e) => handleVadSensitivityChange(Number(e.target.value))}
                    className="w-full accent-accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted">
                    <span>High Sensitivity (05 dB)</span>
                    <span>Low Sensitivity (60 dB)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Advanced Audio Processing DSP Toggles */}
            <div className="bg-surface-panel p-5 rounded-md border border-surface-border space-y-4">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Advanced Voice Processing</h3>

              <div className="space-y-3">
                {/* Echo Cancellation */}
                <div className="flex items-center justify-between bg-surface-active p-3 rounded-sm border border-surface-border">
                  <div>
                    <div className="text-xs font-bold text-text-primary">Echo Cancellation</div>
                    <div className="text-[10px] text-text-muted">Prevents speaker audio feedback into your mic</div>
                  </div>
                  <button
                    onClick={handleToggleEchoCancellation}
                    className={`w-10 h-5 rounded-full transition-colors p-0.5 flex items-center ${
                      echoCancellation ? 'bg-success justify-end' : 'bg-surface-hover justify-start'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-white shadow" />
                  </button>
                </div>

                {/* Noise Suppression */}
                <div className="flex items-center justify-between bg-surface-active p-3 rounded-sm border border-surface-border">
                  <div>
                    <div className="text-xs font-bold text-text-primary">Noise Suppression</div>
                    <div className="text-[10px] text-text-muted">Filters background fan, typing, and room noise</div>
                  </div>
                  <button
                    onClick={handleToggleNoiseSuppression}
                    className={`w-10 h-5 rounded-full transition-colors p-0.5 flex items-center ${
                      noiseSuppression ? 'bg-success justify-end' : 'bg-surface-hover justify-start'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-white shadow" />
                  </button>
                </div>

                {/* Automatic Gain Control */}
                <div className="flex items-center justify-between bg-surface-active p-3 rounded-sm border border-surface-border">
                  <div>
                    <div className="text-xs font-bold text-text-primary">Automatic Gain Control (AGC)</div>
                    <div className="text-[10px] text-text-muted">Automatically balances quiet and loud voice levels</div>
                  </div>
                  <button
                    onClick={handleToggleAutoGainControl}
                    className={`w-10 h-5 rounded-full transition-colors p-0.5 flex items-center ${
                      autoGainControl ? 'bg-success justify-end' : 'bg-surface-hover justify-start'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-white shadow" />
                  </button>
                </div>
              </div>

              {/* Audio Bitrate Selector */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-text-muted uppercase mb-1.5">Audio Quality & Bitrate</label>
                <select
                  value={audioBitrate}
                  onChange={(e) => handleBitrateChange(e.target.value)}
                  className="w-full bg-surface-active border border-surface-border text-text-primary text-xs rounded-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-accent-primary"
                >
                  <option value="64">Standard Voice (64 kbps)</option>
                  <option value="128">High-Fidelity Audio (128 kbps)</option>
                  <option value="256">Studio Music Quality (256 kbps)</option>
                </select>
              </div>
            </div>

            {/* Volume Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-surface-panel p-5 rounded-md border border-surface-border">
              <div>
                <div className="flex justify-between text-xs font-semibold text-text-muted mb-2">
                  <span>Input Volume Gain</span>
                  <span className="font-mono text-text-primary">{inputVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={inputVolume}
                  onChange={(e) => handleInputVolumeChange(Number(e.target.value))}
                  className="w-full accent-accent-primary"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-text-muted mb-2">
                  <span>Output Volume</span>
                  <span className="font-mono text-text-primary">{outputVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={outputVolume}
                  onChange={(e) => handleOutputVolumeChange(Number(e.target.value))}
                  className="w-full accent-success"
                />
              </div>
            </div>

            {/* Mic Testing Box with Hear Self Loopback */}
            <div className="bg-surface-panel p-5 rounded-md border border-surface-border space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-text-primary flex items-center space-x-2">
                    <span>Mic Test</span>
                    {isTestingMic && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />}
                  </h3>
                  <p className="text-xs text-text-muted">Test your mic level in real-time as you speak into your microphone.</p>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={playTestSound}
                    className="px-3 py-1.5 bg-surface-active hover:bg-surface-hover text-xs font-semibold text-text-primary rounded-md border border-surface-border flex items-center space-x-1.5 transition"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Play Test Sound</span>
                  </button>

                  <button
                    onClick={toggleMicTest}
                    className={`px-4 py-1.5 text-xs font-bold text-text-primary rounded-md transition shadow ${
                      isTestingMic ? 'bg-rose-600 hover:bg-rose-700' : 'bg-accent-primary hover:bg-accent-hover'
                    }`}
                  >
                    {isTestingMic ? 'Stop Testing' : 'Let\'s Check'}
                  </button>
                </div>
              </div>

              {/* Hear Self Toggle */}
              <div className="flex items-center justify-between bg-surface-active px-3 py-2 rounded-sm border border-surface-border">
                <span className="text-xs text-text-primary">Hear Yourself (Audio Loopback Test)</span>
                <button
                  onClick={toggleHearSelf}
                  className={`w-10 h-5 rounded-full transition-colors p-0.5 flex items-center ${
                    hearSelf ? 'bg-success justify-end' : 'bg-surface-hover justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow" />
                </button>
              </div>

              {/* Volume Meter Bar */}
              <div className="w-full bg-surface-active h-4 rounded-full overflow-hidden p-0.5 border border-surface-border relative">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 rounded-full transition-all duration-75"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
            </div>

            {/* Video Camera Preview Section */}
            <div className="bg-surface-panel p-5 rounded-md border border-surface-border space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase flex items-center space-x-1.5">
                    <Camera className="w-4 h-4 text-amber-400" />
                    <span>Video Camera</span>
                  </label>
                  <p className="text-xs text-text-muted mt-0.5">Select a camera and test live webcam preview.</p>
                </div>

                <button
                  onClick={toggleCameraPreview}
                  className={`px-4 py-1.5 text-xs font-bold text-text-primary rounded-md transition shadow flex items-center space-x-1.5 ${
                    isPreviewingCamera ? 'bg-rose-600 hover:bg-rose-700' : 'bg-success hover:bg-success/80'
                  }`}
                >
                  {isPreviewingCamera ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>{isPreviewingCamera ? 'Stop Preview' : 'Test Camera'}</span>
                </button>
              </div>

              <select
                value={selectedVideoDevice}
                onChange={(e) => handleSelectVideoDevice(e.target.value)}
                className="w-full bg-surface-active border border-surface-border text-text-primary text-sm rounded-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                {getDeviceOptions(videoInputDevices, 'Camera').map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>


              {/* Live Camera Feed Tile */}
              <div className="relative w-full h-64 bg-surface-active rounded-sm overflow-hidden border border-surface-border flex items-center justify-center">
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isPreviewingCamera ? 'block' : 'hidden'}`}
                />
                {!isPreviewingCamera && (
                  <div className="flex flex-col items-center text-text-muted space-y-2">
                    <Camera className="w-12 h-12 text-text-muted" />
                    <span className="text-xs">Click "Test Camera" above to enable live video preview</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: My Account & Profile */}
        {activeTab === 'account' && (
          <div className="max-w-2xl space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold text-text-primary mb-1">My Account</h2>
              <p className="text-xs text-text-muted">Update your profile picture, username, email, and security credentials.</p>
            </div>

            {profileMsg && (
              <div className="bg-emerald-500/20 border border-emerald-500 text-emerald-400 p-3 rounded-sm text-xs font-semibold">
                {profileMsg}
              </div>
            )}
            {profileError && (
              <div className="bg-rose-500/20 border border-rose-500 text-rose-400 p-3 rounded-sm text-xs font-semibold">
                {profileError}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4 bg-surface-panel p-6 rounded-md border border-surface-border">
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-surface-active border border-surface-border text-text-primary text-sm rounded-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-surface-active border border-surface-border text-text-primary text-sm rounded-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-1">Avatar Image URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full bg-surface-active border border-surface-border text-text-primary text-sm rounded-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-1">Custom Status Message</label>
                <input
                  type="text"
                  placeholder="Coding high-performance WebRTC app..."
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
                  className="w-full bg-surface-active border border-surface-border text-text-primary text-sm rounded-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
              </div>

              <div className="pt-4 border-t border-surface-border grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">Current Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full bg-surface-active border border-surface-border text-text-primary text-sm rounded-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">New Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-surface-active border border-surface-border text-text-primary text-sm rounded-sm p-2.5 focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-accent-primary hover:bg-accent-hover text-text-primary text-sm font-bold rounded-sm transition shadow-lg"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 3: Appearance & Notifications */}
        {activeTab === 'appearance' && (
          <div className="max-w-2xl space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold text-text-primary mb-1">App Appearance & Sounds</h2>
              <p className="text-xs text-text-muted">Customize notifications, sound chimes, and theme styling.</p>
            </div>

            <div className="bg-surface-panel p-6 rounded-md border border-surface-border space-y-6">
              {/* Notification Chime Switch */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Bell className="w-5 h-5 text-accent-primary" />
                  <div>
                    <div className="text-sm font-bold text-text-primary">Incoming Message Notification Chimes</div>
                    <div className="text-xs text-text-muted">Play dynamic Web Audio API chord chime when receiving messages.</div>
                  </div>
                </div>

                <button
                  onClick={toggleSoundEnabled}
                  className={`w-12 h-6 rounded-full transition-colors p-1 flex items-center ${
                    soundEnabled ? 'bg-success justify-end' : 'bg-surface-hover justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md" />
                </button>
              </div>

              {/* Theme Selector */}
              <div className="border-t border-surface-border pt-6">
                <h3 className="text-sm font-bold text-text-primary mb-3">Theme Theme Palette</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-surface-base border-2 border-accent-primary rounded-md text-center cursor-pointer">
                    <div className="text-xs font-bold text-text-primary">Discord Dark</div>
                    <div className="text-[10px] text-text-muted">Classic Slate</div>
                  </div>
                  <div className="p-3 bg-surface-active border border-surface-border rounded-md text-center opacity-60 cursor-not-allowed">
                    <div className="text-xs font-bold text-text-primary">Midnight AMOLED</div>
                    <div className="text-[10px] text-text-muted">Pure Pitch Black</div>
                  </div>
                  <div className="p-3 bg-surface-panel border border-surface-border rounded-md text-center opacity-60 cursor-not-allowed">
                    <div className="text-xs font-bold text-text-primary">Ashen Grey</div>
                    <div className="text-[10px] text-text-muted">Subtle Contrast</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
