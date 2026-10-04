import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useServer } from "../../context/ServerContext";
import { voiceManager } from "../../services/webrtcVoice";
import { notify } from "../../services/localWorkspace";
import {
  Mic,
  MicOff,
  Headphones,
  VolumeX,
  Settings,
  Check,
  Radio,
  PhoneOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  ArrowUpRight,
  LogOut,
} from "lucide-react";

export default function UserWidget({ onOpenSettings }) {
  const { user, updateStatus, logout } = useAuth();
  const { servers, selectServer, selectChannel, setShowVoiceGrid } =
    useServer();
  const [voice, setVoice] = useState(() => voiceManager.getCurrentState());
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const panel = useRef(null);
  useEffect(() => voiceManager.subscribe(setVoice), []);
  useEffect(() => {
    if (!showStatusMenu) return;
    const close = (e) => {
      if (!panel.current?.contains(e.target)) setShowStatusMenu(false);
    };
    const key = (e) => {
      if (e.key === "Escape") setShowStatusMenu(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [showStatusMenu]);
  if (!user) return null;
  const server = servers.find((s) =>
    s.channels?.some((c) => c.id === voice.channel_id),
  );
  const channel = server?.channels?.find((c) => c.id === voice.channel_id);
  const statuses = [
    { id: "online", label: "Online", color: "var(--success)" },
    { id: "idle", label: "Away", color: "#e9c27b" },
    { id: "dnd", label: "Do not disturb", color: "var(--danger)" },
    { id: "offline", label: "Invisible", color: "var(--text-muted)" },
  ];
  const currentStatus =
    statuses.find((s) => s.id === user.status) || statuses[0];
  const openRoom = async () => {
    if (!channel) {
      notify("Open the space containing your active call to view this room.");
      return;
    }
    selectServer(server);
    await selectChannel(channel, false);
    setShowVoiceGrid(true);
  };
  const mediaAction = async (action) => {
    try {
      await action();
    } catch {
      notify(
        "That device couldn’t start. Check its permission in Voice & Video settings.",
      );
    }
  };
  return (
    <div
      className="account-dock"
      ref={panel}
      aria-label="Your account and voice controls"
    >
      {voice.channel_id && (
        <section className="voice-dock" aria-label="Active voice connection">
          <div className="voice-dock-heading">
            <Radio size={18} />
            <button onClick={openRoom} title="Open active voice room">
              <strong>Voice connected</strong>
              <small>
                {channel?.name || "Active room"}
                {server ? ` / ${server.name}` : ""}
              </small>
            </button>
            <button
              className="icon-button disconnect-button"
              title="Disconnect voice"
              aria-label="Disconnect voice"
              onClick={() => voiceManager.leaveVoiceChannel()}
            >
              <PhoneOff size={17} />
            </button>
          </div>
          <div className="voice-dock-actions">
            <button
              title={voice.isCameraOn ? "Turn off camera" : "Turn on camera"}
              aria-label={
                voice.isCameraOn ? "Turn off camera" : "Turn on camera"
              }
              onClick={() => mediaAction(() => voiceManager.toggleCamera())}
            >
              {voice.isCameraOn ? <Video size={17} /> : <VideoOff size={17} />}
            </button>
            <button
              title={
                voice.isScreenSharing ? "Stop sharing screen" : "Share screen"
              }
              aria-label={
                voice.isScreenSharing ? "Stop sharing screen" : "Share screen"
              }
              onClick={() =>
                mediaAction(() =>
                  voice.isScreenSharing
                    ? voiceManager.stopScreenShare()
                    : voiceManager.startScreenShare(),
                )
              }
            >
              {voice.isScreenSharing ? (
                <MonitorOff size={17} />
              ) : (
                <Monitor size={17} />
              )}
            </button>
            <button
              title="Open voice room"
              aria-label="Open voice room"
              onClick={openRoom}
            >
              <ArrowUpRight size={17} />
            </button>
          </div>
        </section>
      )}
      <div className="account-row">
        <button
          className="account-identity"
          aria-label="Your profile and status"
          aria-expanded={showStatusMenu}
          title="Your profile and status"
          onClick={() => setShowStatusMenu((v) => !v)}
        >
          <span className="person-avatar">
            <img src={user.avatar_url || "/avatars/willow.svg"} alt="" />
            <i style={{ background: currentStatus.color }} />
          </span>
          <span>
            <strong>{user.username}</strong>
            <small>{user.status_message || currentStatus.label}</small>
          </span>
        </button>
        <div className="account-controls">
          <button
            className={`icon-button ${voice.isMuted ? "control-muted" : ""}`}
            aria-pressed={voice.isMuted}
            title={voice.isMuted ? "Unmute mic" : "Mute mic"}
            aria-label={voice.isMuted ? "Unmute mic" : "Mute mic"}
            onClick={() => voiceManager.toggleMute()}
          >
            {voice.isMuted ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button
            className={`icon-button ${voice.isDeafened ? "control-muted" : ""}`}
            aria-pressed={voice.isDeafened}
            title={voice.isDeafened ? "Undeafen audio" : "Deafen audio"}
            aria-label={voice.isDeafened ? "Undeafen audio" : "Deafen audio"}
            onClick={() => voiceManager.toggleDeafen()}
          >
            {voice.isDeafened ? (
              <VolumeX size={16} />
            ) : (
              <Headphones size={16} />
            )}
          </button>
          <button
            className="icon-button"
            title="Settings"
            aria-label="Settings"
            onClick={onOpenSettings}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
      {showStatusMenu && (
        <div className="status-popover">
          <header>
            <strong>{user.username}</strong>
            <small>#{user.public_id || user.id}</small>
          </header>
          <div className="eyebrow">SET YOUR STATUS</div>
          {statuses.map((status) => (
            <button
              key={status.id}
              onClick={async () => {
                try {
                  await updateStatus(status.id, user.status_message);
                  setShowStatusMenu(false);
                } catch {
                  notify("Could not update your status. Please try again.");
                }
              }}
            >
              <span
                className="status-indicator"
                style={{ background: status.color }}
              />
              {status.label}
              {user.status === status.id && <Check size={14} />}
            </button>
          ))}
          <div className="status-menu-divider" />
          <button
            onClick={() => {
              onOpenSettings();
              setShowStatusMenu(false);
            }}
          >
            <Settings size={15} /> Account & preferences
          </button>
          <button onClick={logout}>
            <LogOut size={15} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
