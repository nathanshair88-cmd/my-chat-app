import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { serverAPI, channelAPI, dmAPI } from '../services/api';
import { getSocket } from '../services/socket';
import { useAuth } from './AuthContext';
import { notificationService } from '../services/NotificationService';

import { voiceManager } from '../services/webrtcVoice';

const ServerContext = createContext();

const dedupeConversations = (items = []) => {
  const seen = new Set();
  return items.filter(conv => {
    if (!conv || seen.has(conv.id)) return false;
    seen.add(conv.id);
    return true;
  });
};

export const ServerProvider = ({ children }) => {
  const { user } = useAuth();

  // App View Mode: 'server' | 'dm'
  const [viewMode, setViewMode] = useState('server');

  // Server state
  const [servers, setServers] = useState([]);
  const [currentServer, setCurrentServer] = useState(null);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [voiceState, setVoiceState] = useState({ channel_id: null });

  // Refs to avoid stale closures in socket event handlers
  const currentChannelRef = React.useRef(currentChannel);
  const currentDMRef = React.useRef(null);
  const viewModeRef = React.useRef('server');

  // Keep refs in sync with state
  useEffect(() => { currentChannelRef.current = currentChannel; }, [currentChannel]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  // Subscribe to WebRTC Voice state
  useEffect(() => {
    return voiceManager.subscribe(setVoiceState);
  }, []);


  // DM state
  const [conversations, setConversations] = useState([]);
  const [currentDM, setCurrentDM] = useState(null);
  useEffect(() => { currentDMRef.current = currentDM; }, [currentDM]);

  // Unified chat state & unread state
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [unreadChannels, setUnreadChannels] = useState({});
  const [unreadDMs, setUnreadDMs] = useState({});

  // Active Thread Message state
  const [activeThreadMessage, setActiveThreadMessage] = useState(null);

  // Online users tracking
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // Sound preference
  const [soundEnabled, setSoundEnabledState] = useState(true);


  const toggleSoundEnabled = () => {
    setSoundEnabledState(prev => {
      const next = !prev;
      notificationService.setSoundEnabled(next);
      return next;
    });
  };

  // Fetch servers
  const fetchServers = useCallback(async () => {
    if (!user) return;
    try {
      const res = await serverAPI.getServers();
      setServers(res.data);
      if (res.data.length > 0 && !currentServer) {
        selectServer(res.data[0]);
      }
    } catch (err) {
      console.error("Error fetching servers:", err);
    }
  }, [user]);

  // Fetch DM Conversations
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    try {
      const res = await dmAPI.getConversations();
      setConversations(dedupeConversations(res.data));
    } catch (err) {
      console.error("Error fetching DM conversations:", err);
    }
  }, [user]);

  useEffect(() => {
    fetchServers();
    fetchConversations();
  }, [fetchServers, fetchConversations]);

  const selectServer = (server) => {
    setViewMode('server');
    setCurrentDM(null);
    setCurrentServer(server);
    if (server && server.channels && server.channels.length > 0) {
      const defaultChannel = server.channels.find(c => c.type === 'text') || server.channels[0];
      selectChannelInternal(defaultChannel);
    } else {
      setCurrentChannel(null);
      setMessages([]);
    }
  };

  const [showVoiceGrid, setShowVoiceGrid] = useState(false);

  const toggleVoiceGrid = () => {
    setShowVoiceGrid(prev => !prev);
  };

  const selectChannel = async (channel, userInitiated = true) => {
    setViewMode('server');
    setCurrentDM(null);
    if (!channel) return;

    const socket = getSocket();

    if (currentChannel && socket) {
      socket.emit('leave_channel', { channel_id: currentChannel.id });
    }

    // Connect WebRTC audio if it's a voice/media channel and user explicitly clicked it
    if ((channel.type === 'voice' || channel.type === 'media') && userInitiated) {
      if (voiceState.channel_id !== channel.id) {
        voiceManager.joinVoiceChannel(channel.id, user);
      }
    }

    setShowVoiceGrid(false); // Default to dedicated text chat view!
    setCurrentChannel(channel);
    setMessages([]);
    setTypingUsers(new Map());
    setActiveThreadMessage(null); // Close thread when switching channel

    // Clear unread badge for this channel
    setUnreadChannels(prev => ({ ...prev, [channel.id]: 0 }));
    if (socket) {
      socket.emit('join_channel', { channel_id: channel.id });
    }

    try {
      const res = await channelAPI.getMessages(channel.id);
      setMessages(res.data);
    } catch (err) {
      console.error("Error fetching channel messages:", err);
    }
  };

  // Internal: select channel without auto-joining voice (used on server load)
  const selectChannelInternal = (channel) => selectChannel(channel, false);





  const selectDM = async (conversation) => {
    setViewMode('dm');
    const socket = getSocket();

    if (currentChannel && socket) {
      socket.emit('leave_channel', { channel_id: currentChannel.id });
    }
    if (currentDM && socket) {
      socket.emit('leave_dm', { conversation_id: currentDM.id });
    }

    setCurrentDM(conversation);
    setCurrentChannel(null);
    setMessages([]);
    setTypingUsers(new Map());

    if (conversation) {
      setUnreadDMs(prev => ({ ...prev, [conversation.id]: 0 }));
      if (socket) {
        socket.emit('join_dm', { conversation_id: conversation.id });
        socket.emit('mark_dms_read', { conversation_id: conversation.id });
      }

      try {
        const res = await dmAPI.getDMMessages(conversation.id);
        setMessages(res.data);
      } catch (err) {
        console.error("Error fetching DM messages:", err);
      }
    }
  };

  const startDM = async (target) => {
    try {
      const res = await dmAPI.startConversation(target);
      const newConv = res.data;
      setConversations(prev => {
        const exists = prev.find(c => c.id === newConv.id);
        return exists ? prev : dedupeConversations([newConv, ...prev]);
      });
      await selectDM(newConv);
      return newConv;
    } catch (err) {
      console.error("Error starting DM:", err);
      throw err;
    }
  };

  // Socket event listeners for messages, reactions, typing, voice, and DMs
  // We use a stable effect that registers on both the live socket AND the connect event
  // so listeners are never missed even if the socket isn't ready yet.
  useEffect(() => {
    // Poll for socket up to ~2 seconds in case initSocket hasn't fired yet
    let attempts = 0;
    let registered = false;
    let cleanupFns = [];

    const setupListeners = () => {
      const socket = getSocket();
      if (!socket) return false;

      const handleNewMessage = (msg) => {
        if (viewModeRef.current === 'server' && currentChannelRef.current && msg.channel_id === currentChannelRef.current.id) {
          setMessages(prev => [...prev, msg]);
        } else {
          setUnreadChannels(prev => ({
            ...prev,
            [msg.channel_id]: (prev[msg.channel_id] || 0) + 1
          }));
          if (msg.user_id !== user?.id) {
            notificationService.playNotificationChime();
          }
        }
      };

      const handleNewDMMessage = (msg) => {
        if (viewModeRef.current === 'dm' && currentDMRef.current && msg.conversation_id === currentDMRef.current.id) {
          setMessages(prev => [...prev, msg]);
        } else {
          setUnreadDMs(prev => ({
            ...prev,
            [msg.conversation_id]: (prev[msg.conversation_id] || 0) + 1
          }));
          if (msg.sender_id !== user?.id) {
            notificationService.playNotificationChime();
          }
        }
      };

      const handleNewDMNotification = (msg) => {
        fetchConversations();
        if (msg.sender_id !== user?.id) {
          notificationService.playNotificationChime();
        }
      };

      const handleReactionUpdated = (data) => {
        const { message_id, reactions } = data;
        setMessages(prev => prev.map(m => m.id === message_id ? { ...m, reactions } : m));
      };

      const handleMessageEdited = (data) => {
        const { message_id, content } = data;
        setMessages(prev => prev.map(m => m.id === message_id ? { ...m, content } : m));
      };

      const handleMessageDeleted = (data) => {
        const { message_id } = data;
        setMessages(prev => prev.filter(m => m.id !== message_id));
      };

      const handleDMsReadReceipt = (data) => {
        const { conversation_id, read_by } = data;
        if (viewModeRef.current === 'dm' && currentDMRef.current && currentDMRef.current.id === conversation_id) {
          setMessages(prev => prev.map(m => {
            if (m.sender_id !== read_by && !m.is_read) {
              return { ...m, is_read: true };
            }
            return m;
          }));
        }
      };

      const handleUserConnected = (user_data) => {
        setOnlineUsers(prev => new Set(prev).add(user_data.id));
      };

      const handleUserDisconnected = ({ user_id }) => {
        setOnlineUsers(prev => {
          const next = new Set(prev);
          next.delete(user_id);
          return next;
        });
      };

      const handleUserTyping = (data) => {
        if (viewModeRef.current === 'server' && currentChannelRef.current && data.channel_id === currentChannelRef.current.id) {
          setTypingUsers(prev => {
            const next = new Map(prev);
            if (data.is_typing) {
              next.set(data.user_id, data.username);
            } else {
              next.delete(data.user_id);
            }
            return next;
          });
        }
      };

      const handleConnect = () => {
        if (viewModeRef.current === 'server' && currentChannelRef.current) {
          socket.emit('join_channel', { channel_id: currentChannelRef.current.id });
        } else if (viewModeRef.current === 'dm' && currentDMRef.current) {
          socket.emit('join_dm', { conversation_id: currentDMRef.current.id });
        }
      };

      socket.on('connect', handleConnect);
      socket.on('new_message', handleNewMessage);
      socket.on('new_dm_message', handleNewDMMessage);
      socket.on('new_dm_notification', handleNewDMNotification);
      socket.on('reaction_updated', handleReactionUpdated);
      socket.on('message_edited', handleMessageEdited);
      socket.on('message_deleted', handleMessageDeleted);
      socket.on('user_typing', handleUserTyping);
      socket.on('dms_read_receipt', handleDMsReadReceipt);
      socket.on('user_connected', handleUserConnected);
      socket.on('user_disconnected', handleUserDisconnected);

      cleanupFns.push(() => {
        socket.off('connect', handleConnect);
        socket.off('new_message', handleNewMessage);
        socket.off('new_dm_message', handleNewDMMessage);
        socket.off('new_dm_notification', handleNewDMNotification);
        socket.off('reaction_updated', handleReactionUpdated);
        socket.off('message_edited', handleMessageEdited);
        socket.off('message_deleted', handleMessageDeleted);
        socket.off('user_typing', handleUserTyping);
        socket.off('dms_read_receipt', handleDMsReadReceipt);
        socket.off('user_connected', handleUserConnected);
        socket.off('user_disconnected', handleUserDisconnected);
      });

      return true;
    };

    // Try immediately - works if socket is already available
    registered = setupListeners();

    // If socket wasn't ready, poll every 100ms until it is (up to 20 attempts = 2s)
    let intervalId = null;
    if (!registered) {
      intervalId = setInterval(() => {
        attempts++;
        if (setupListeners()) {
          registered = true;
          clearInterval(intervalId);
        } else if (attempts >= 20) {
          clearInterval(intervalId);
        }
      }, 100);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      cleanupFns.forEach(fn => fn());
    };

  }, [user, fetchConversations]);

  const addServer = async (name, icon_url) => {
    const res = await serverAPI.createServer({ name, icon_url });
    await fetchServers();
    selectServer(res.data);
    return res.data;
  };

  const joinServer = async (invite_code) => {
    const res = await serverAPI.joinServer(invite_code);
    await fetchServers();
    selectServer(res.data);
    return res.data;
  };

  const addChannel = async (name, type, category) => {
    if (!currentServer) return;
    const res = await serverAPI.createChannel(currentServer.id, { name, type, category });
    const updatedChannels = [...(currentServer.channels || []), res.data];
    const updatedServer = { ...currentServer, channels: updatedChannels };
    setCurrentServer(updatedServer);
    setServers(prev => prev.map(s => s.id === updatedServer.id ? updatedServer : s));
    selectChannel(res.data);
    return res.data;
  };

  return (
    <ServerContext.Provider value={{
      viewMode,
      setViewMode,
      servers,
      currentServer,
      currentChannel,
      conversations,
      currentDM,
      messages,
      typingUsers,
      unreadChannels,
      unreadDMs,
      showVoiceGrid,
      setShowVoiceGrid,
      toggleVoiceGrid,
      soundEnabled,
      activeThreadMessage,
      setActiveThreadMessage,
      onlineUsers,

      toggleSoundEnabled,
      selectServer,
      selectChannel,
      selectDM,
      startDM,
      addServer,
      joinServer,
      addChannel,
      fetchServers,
      fetchConversations
    }}>
      {children}
    </ServerContext.Provider>
  );
};

export const useServer = () => useContext(ServerContext);
