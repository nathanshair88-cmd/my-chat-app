import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { serverAPI, channelAPI, dmAPI } from '../services/api';
import { getSocket } from '../services/socket';
import { useAuth } from './AuthContext';
import { notificationService } from '../services/NotificationService';

import { voiceManager } from '../services/webrtcVoice';

const ServerContext = createContext();

export const ServerProvider = ({ children }) => {
  const { user } = useAuth();

  // App View Mode: 'server' | 'dm'
  const [viewMode, setViewMode] = useState('server');

  // Server state
  const [servers, setServers] = useState([]);
  const [currentServer, setCurrentServer] = useState(null);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [voiceState, setVoiceState] = useState({ channel_id: null });

  // Subscribe to WebRTC Voice state
  useEffect(() => {
    return voiceManager.subscribe(setVoiceState);
  }, []);


  // DM state
  const [conversations, setConversations] = useState([]);
  const [currentDM, setCurrentDM] = useState(null);

  // Unified chat state & unread state
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [unreadChannels, setUnreadChannels] = useState({});
  const [unreadDMs, setUnreadDMs] = useState({});
  const [voiceRoomState, setVoiceRoomState] = useState({});

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
      setConversations(res.data);
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
      selectChannel(defaultChannel);
    } else {
      setCurrentChannel(null);
      setMessages([]);
    }
  };

  const [showVoiceGrid, setShowVoiceGrid] = useState(false);

  const toggleVoiceGrid = () => {
    setShowVoiceGrid(prev => !prev);
  };

  const selectChannel = async (channel) => {
    setViewMode('server');
    setCurrentDM(null);
    if (!channel) return;

    const socket = getSocket();

    if (currentChannel && socket) {
      socket.emit('leave_channel', { channel_id: currentChannel.id });
    }

    // Connect WebRTC audio if it's a voice/media channel
    if (channel.type === 'voice' || channel.type === 'media') {
      if (voiceState.channel_id !== channel.id) {
        voiceManager.joinVoiceChannel(channel.id, user);
      }
    }

    setShowVoiceGrid(false); // Default to dedicated text chat view!
    setCurrentChannel(channel);
    setMessages([]);
    setTypingUsers(new Map());

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
        return exists ? prev : [newConv, ...prev];
      });
      selectDM(newConv);
      return newConv;
    } catch (err) {
      console.error("Error starting DM:", err);
      throw err;
    }
  };

  // Socket event listeners for messages, reactions, typing, and DMs
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewMessage = (msg) => {
      if (viewMode === 'server' && currentChannel && msg.channel_id === currentChannel.id) {
        setMessages(prev => [...prev, msg]);
      } else {
        // Increment unread count & play chime
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
      if (viewMode === 'dm' && currentDM && msg.conversation_id === currentDM.id) {
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
      setMessages(prev => prev.map(m => {
        if (m.id === message_id) {
          return { ...m, reactions };
        }
        return m;
      }));
    };

    const handleUserTyping = (data) => {
      if (viewMode === 'server' && currentChannel && data.channel_id === currentChannel.id) {
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

    const handleVoiceRoomUpdate = (data) => {
      if (data && data.channel_id) {
        setVoiceRoomState(prev => {
          const prevList = prev[data.channel_id] || [];
          const newList = data.users || [];

          if (newList.length > prevList.length && prevList.length > 0) {
            notificationService.playVoiceConnectChime();
          } else if (newList.length < prevList.length) {
            notificationService.playVoiceDisconnectChime();
          }

          return {
            ...prev,
            [data.channel_id]: newList
          };
        });
      }
    };


    socket.on('new_message', handleNewMessage);
    socket.on('new_dm_message', handleNewDMMessage);
    socket.on('new_dm_notification', handleNewDMNotification);
    socket.on('reaction_updated', handleReactionUpdated);
    socket.on('user_typing', handleUserTyping);
    socket.on('voice_room_update', handleVoiceRoomUpdate);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('new_dm_message', handleNewDMMessage);
      socket.off('new_dm_notification', handleNewDMNotification);
      socket.off('reaction_updated', handleReactionUpdated);
      socket.off('user_typing', handleUserTyping);
      socket.off('voice_room_update', handleVoiceRoomUpdate);
    };

  }, [viewMode, currentChannel, currentDM, user, fetchConversations]);

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
      voiceRoomState,
      showVoiceGrid,
      setShowVoiceGrid,
      toggleVoiceGrid,
      soundEnabled,


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
