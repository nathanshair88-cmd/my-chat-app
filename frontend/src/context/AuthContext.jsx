import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import { initSocket, disconnectSocket } from '../services/socket';
import { p2pEngine } from '../services/webrtcP2PFile';
import { loadSettings } from '../services/settingsService';
import { voiceManager } from '../services/webrtcVoice';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMe = async () => {
      const token = localStorage.getItem('discoalto_token');
      if (token) {
        try {
          const res = await authAPI.getMe();
          setUser(res.data);
          localStorage.setItem('discoalto_user_id', res.data.id);
          localStorage.setItem('discoalto_public_id', res.data.public_id);
          localStorage.setItem('discoalto_username', res.data.username);
          if (res.data.avatar_url) localStorage.setItem('discoalto_avatar_url', res.data.avatar_url);
          initSocket(token);
          voiceManager.setupGlobalRoomListener();
          p2pEngine.initSocketListeners();
          loadSettings();
        } catch (err) {
          console.error("Token verification failed:", err);
          localStorage.removeItem('discoalto_token');
          localStorage.removeItem('discoalto_user_id');
          localStorage.removeItem('discoalto_public_id');
          localStorage.removeItem('discoalto_username');
          localStorage.removeItem('discoalto_avatar_url');
        }
      }
      setLoading(false);
    };
    fetchMe();
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { access_token, user: userData } = res.data;
    localStorage.setItem('discoalto_token', access_token);
    localStorage.setItem('discoalto_user_id', userData.id);
    localStorage.setItem('discoalto_public_id', userData.public_id);
    localStorage.setItem('discoalto_username', userData.username);
    if (userData.avatar_url) localStorage.setItem('discoalto_avatar_url', userData.avatar_url);
    setUser(userData);
    initSocket(access_token);
    p2pEngine.initSocketListeners();
    loadSettings();
    return userData;
  };

  const register = async (username, email, password, avatar_url) => {
    const res = await authAPI.register({ username, email, password, avatar_url });
    const { access_token, user: userData } = res.data;
    localStorage.setItem('discoalto_token', access_token);
    localStorage.setItem('discoalto_user_id', userData.id);
    localStorage.setItem('discoalto_public_id', userData.public_id);
    localStorage.setItem('discoalto_username', userData.username);
    if (userData.avatar_url) localStorage.setItem('discoalto_avatar_url', userData.avatar_url);
    setUser(userData);
    initSocket(access_token);
    voiceManager.setupGlobalRoomListener();
    p2pEngine.initSocketListeners();
    loadSettings();
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('discoalto_token');
    localStorage.removeItem('discoalto_user_id');
    localStorage.removeItem('discoalto_public_id');
    localStorage.removeItem('discoalto_username');
    localStorage.removeItem('discoalto_avatar_url');
    disconnectSocket();
    setUser(null);
  };

  const updateStatus = async (status, status_message) => {
    const res = await authAPI.updateStatus({ status, status_message });
    setUser(res.data);
  };

  const updateProfile = async (profileData) => {
    const res = await authAPI.updateProfile(profileData);
    const updated = res.data;
    setUser(updated);
    if (updated.username) localStorage.setItem('discoalto_username', updated.username);
    if (updated.public_id) localStorage.setItem('discoalto_public_id', updated.public_id);
    if (updated.avatar_url) localStorage.setItem('discoalto_avatar_url', updated.avatar_url);
    return updated;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateStatus, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
