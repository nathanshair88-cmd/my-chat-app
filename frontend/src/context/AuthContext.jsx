import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import { initSocket, disconnectSocket } from '../services/socket';
import { p2pEngine } from '../services/webrtcP2PFile';
import { loadSettings } from '../services/settingsService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMe = async () => {
      const token = localStorage.getItem('discord_token');
      if (token) {
        try {
          const res = await authAPI.getMe();
          setUser(res.data);
          localStorage.setItem('discord_user_id', res.data.id);
          localStorage.setItem('discord_username', res.data.username);
          if (res.data.avatar_url) localStorage.setItem('discord_avatar_url', res.data.avatar_url);
          const socket = initSocket(token);
          p2pEngine.initSocketListeners();
          loadSettings(); // Restore saved preferences from server
        } catch (err) {
          console.error("Token verification failed:", err);
          localStorage.removeItem('discord_token');
          localStorage.removeItem('discord_user_id');
          localStorage.removeItem('discord_username');
          localStorage.removeItem('discord_avatar_url');
        }
      }
      setLoading(false);
    };
    fetchMe();
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { access_token, user: userData } = res.data;
    localStorage.setItem('discord_token', access_token);
    localStorage.setItem('discord_user_id', userData.id);
    localStorage.setItem('discord_username', userData.username);
    if (userData.avatar_url) localStorage.setItem('discord_avatar_url', userData.avatar_url);
    setUser(userData);
    initSocket(access_token);
    p2pEngine.initSocketListeners();
    loadSettings(); // Restore saved preferences from server
    return userData;
  };

  const register = async (username, email, password, avatar_url) => {
    const res = await authAPI.register({ username, email, password, avatar_url });
    const { access_token, user: userData } = res.data;
    localStorage.setItem('discord_token', access_token);
    localStorage.setItem('discord_user_id', userData.id);
    localStorage.setItem('discord_username', userData.username);
    if (userData.avatar_url) localStorage.setItem('discord_avatar_url', userData.avatar_url);
    setUser(userData);
    initSocket(access_token);
    p2pEngine.initSocketListeners();
    loadSettings(); // Restore saved preferences from server
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('discord_token');
    localStorage.removeItem('discord_user_id');
    localStorage.removeItem('discord_username');
    localStorage.removeItem('discord_avatar_url');
    disconnectSocket();
    setUser(null);
  };


  const updateStatus = async (status, status_message) => {
    const res = await authAPI.updateStatus({ status, status_message });
    setUser(res.data);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
